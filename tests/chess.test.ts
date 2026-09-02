import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { commandRegistry } from '../src/commandRegistry';
import chessModule from '../src/modules/chess';
import {
    acceptChallenge,
    analyzeNotationError,
    buildActiveGameActionRow,
    buildChallengeActionRow,
    buildChessBoardEmbed,
    buildDrawOfferActionRow,
    buildLeaderboardEmbed,
    buildLegalMovesEmbed,
    buildPlayerStatsEmbed,
    calculateEloDelta,
    cancelChallenge,
    createGameChallenge,
    declineChallenge,
    declineDraw,
    executeMove,
    getCapturedPiecesSummary,
    getChessLeaderboard,
    getLegalMovesList,
    getNotationGuideEmbed,
    getPlayerStats,
    normalizeNotationInput,
    offerDraw,
    recordGameOutcome,
    renderAsciiBoard,
    resetChessDataDir,
    resignGame,
    setChessDataDirForTesting,
} from '../src/services/chessService';
import { runTestCase } from './testHarness';
import { Chess } from 'chess.js';

const testDataDir = path.resolve(__dirname, '../data/test_chess');

async function runSuite(): Promise<void> {
    if (fs.existsSync(testDataDir)) {
        fs.rmSync(testDataDir, { recursive: true, force: true });
    }
    setChessDataDirForTesting(testDataDir);

    try {
        await runTestCase('module registers /chess command', async () => {
            const mockClient = {
                on: () => {},
            };
            await chessModule.register(mockClient);
            const chessCmd = commandRegistry.get('chess');
            assert.ok(chessCmd, 'chess command should be registered');
            assert.strictEqual(chessCmd.name, 'chess');
            assert.ok(chessCmd.options && chessCmd.options.length >= 3);
        });

        await runTestCase('challenge creation, color selection, and acceptance', async () => {
            const player1 = { id: 'u1', username: 'alice', displayName: 'Alice' };
            const player2 = { id: 'u2', username: 'bob', displayName: 'Bob' };

            // Reject self-challenge
            const selfRes = createGameChallenge('g1', 'c1', player1, player1);
            assert.strictEqual(selfRes.success, false);

            // Create challenge with white preference
            const challengeRes = createGameChallenge('g1', 'c1', player1, player2, 'white');
            assert.strictEqual(challengeRes.success, true);
            assert.ok(challengeRes.game);
            assert.strictEqual(challengeRes.game.whitePlayer.id, 'u1');
            assert.strictEqual(challengeRes.game.blackPlayer.id, 'u2');
            assert.strictEqual(challengeRes.game.status, 'pending');

            // Duplicate challenge in same channel should be rejected
            const dupRes = createGameChallenge('g1', 'c1', player1, player2);
            assert.strictEqual(dupRes.success, false);

            // Non-opponent cannot accept
            const wrongAccept = acceptChallenge(challengeRes.game.id, 'u3');
            assert.strictEqual(wrongAccept.success, false);

            // Opponent accepts
            const acceptRes = acceptChallenge(challengeRes.game.id, 'u2');
            assert.strictEqual(acceptRes.success, true);
            assert.strictEqual(acceptRes.game?.status, 'active');
            assert.strictEqual(acceptRes.game?.turn, 'w');
        });

        await runTestCase('move execution and turn enforcement', async () => {
            const player1 = { id: 'u10', username: 'white_player' };
            const player2 = { id: 'u20', username: 'black_player' };

            const c = createGameChallenge('g2', 'c2', player1, player2, 'white');
            assert.ok(c.game);
            acceptChallenge(c.game.id, 'u20');

            // Black tries to move when it's White's turn
            const wrongTurn = executeMove(c.game.id, 'u20', 'e5');
            assert.strictEqual(wrongTurn.success, false);
            assert.ok(wrongTurn.error?.includes('not your turn'));

            // White makes valid move e4
            const move1 = executeMove(c.game.id, 'u10', 'e4');
            assert.strictEqual(move1.success, true);
            assert.strictEqual(move1.move?.san, 'e4');
            assert.strictEqual(move1.game?.turn, 'b');

            // Black replies with e5
            const move2 = executeMove(c.game.id, 'u20', 'e5');
            assert.strictEqual(move2.success, true);
            assert.strictEqual(move2.move?.san, 'e5');
            assert.strictEqual(move2.game?.turn, 'w');
        });

        await runTestCase("checkmate detection (Scholar's Mate)", async () => {
            const white = { id: 'w1', username: 'white' };
            const black = { id: 'b1', username: 'black' };

            const res = createGameChallenge('g3', 'c3', white, black, 'white');
            const gameId = res.game!.id;
            acceptChallenge(gameId, 'b1');

            // 1. e4 e5
            executeMove(gameId, 'w1', 'e4');
            executeMove(gameId, 'b1', 'e5');

            // 2. Bc4 Nc6
            executeMove(gameId, 'w1', 'Bc4');
            executeMove(gameId, 'b1', 'Nc6');

            // 3. Qh5 Nf6??
            executeMove(gameId, 'w1', 'Qh5');
            executeMove(gameId, 'b1', 'Nf6');

            // 4. Qxf7# (Checkmate!)
            const mateMove = executeMove(gameId, 'w1', 'Qxf7#');
            assert.strictEqual(mateMove.success, true);
            assert.strictEqual(mateMove.game?.status, 'completed');
            assert.strictEqual(mateMove.game?.result?.winner, 'white');
            assert.strictEqual(mateMove.game?.result?.reason, 'checkmate');

            // Verify embed formats winner correctly
            const embed = buildChessBoardEmbed(mateMove.game!);
            assert.ok(embed.data.title?.includes('Checkmate'));
        });

        await runTestCase('castling validation (kingside and queenside)', async () => {
            const white = { id: 'cw', username: 'castler_white' };
            const black = { id: 'cb', username: 'castler_black' };

            const res = createGameChallenge('g4', 'c4', white, black, 'white');
            const gameId = res.game!.id;
            acceptChallenge(gameId, 'cb');

            // Attempt early castle when path blocked -> should fail
            const earlyCastle = executeMove(gameId, 'cw', 'O-O');
            assert.strictEqual(earlyCastle.success, false);
            assert.ok(
                earlyCastle.diagnostic?.includes('blocked') ||
                    earlyCastle.diagnostic?.includes('not a legal move'),
            );

            // Clear kingside path: 1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5
            executeMove(gameId, 'cw', 'e4');
            executeMove(gameId, 'cb', 'e5');
            executeMove(gameId, 'cw', 'Nf3');
            executeMove(gameId, 'cb', 'Nc6');
            executeMove(gameId, 'cw', 'Bc4');
            executeMove(gameId, 'cb', 'Bc5');

            // White castles kingside: 4. O-O
            const castleMove = executeMove(gameId, 'cw', 'O-O');
            assert.strictEqual(castleMove.success, true);
            assert.strictEqual(castleMove.move?.san, 'O-O');
            assert.strictEqual(castleMove.move?.flags.includes('k'), true);

            // Shorthand normalization: lowercase o-o or 0-0
            assert.strictEqual(normalizeNotationInput('0-0'), 'O-O');
            assert.strictEqual(normalizeNotationInput('o-o'), 'O-O');
            assert.strictEqual(normalizeNotationInput('0-0-0'), 'O-O-O');
        });

        await runTestCase('en passant validation', async () => {
            const white = { id: 'ep_w', username: 'ep_white' };
            const black = { id: 'ep_b', username: 'ep_black' };

            const res = createGameChallenge('g5', 'c5', white, black, 'white');
            const gameId = res.game!.id;
            acceptChallenge(gameId, 'ep_b');

            // 1. e4 a6
            executeMove(gameId, 'ep_w', 'e4');
            executeMove(gameId, 'ep_b', 'a6');

            // 2. e5 d5 (Black moves pawn 2 squares adjacent to White pawn on e5)
            executeMove(gameId, 'ep_w', 'e5');
            executeMove(gameId, 'ep_b', 'd5');

            // White captures en passant: 3. exd6
            const epMove = executeMove(gameId, 'ep_w', 'exd6');
            assert.strictEqual(epMove.success, true);
            assert.strictEqual(epMove.move?.san, 'exd6');
            assert.strictEqual(epMove.move?.flags.includes('e'), true);
            assert.strictEqual(epMove.move?.captured, 'p');

            // Verify black pawn on d5 was removed
            const c = new Chess(epMove.game!.fen);
            assert.strictEqual(c.get('d5'), undefined);
            assert.strictEqual(c.get('d6')?.type, 'p');
            assert.strictEqual(c.get('d6')?.color, 'w');
        });

        await runTestCase('resignation and draw workflow', async () => {
            const white = { id: 'rw', username: 'resigner' };
            const black = { id: 'rb', username: 'winner' };

            const res = createGameChallenge('g6', 'c6', white, black, 'white');
            const gameId = res.game!.id;
            acceptChallenge(gameId, 'rb');

            // Offer draw from white
            const draw1 = offerDraw(gameId, 'rw');
            assert.strictEqual(draw1.success, true);
            assert.strictEqual(draw1.accepted, false);

            // Decline draw from black
            const declineDrawRes = declineDraw(gameId, 'rb');
            assert.strictEqual(declineDrawRes.success, true);

            // Offer draw again, black accepts
            offerDraw(gameId, 'rw');
            const drawAccept = offerDraw(gameId, 'rb');
            assert.strictEqual(drawAccept.success, true);
            assert.strictEqual(drawAccept.accepted, true);
            assert.strictEqual(drawAccept.game?.status, 'completed');
            assert.strictEqual(drawAccept.game?.result?.reason, 'mutual_draw');

            // Resignation in new match
            const res2 = createGameChallenge('g7', 'c7', white, black, 'white');
            const game2Id = res2.game!.id;
            acceptChallenge(game2Id, 'rb');

            const resignRes = resignGame(game2Id, 'rw');
            assert.strictEqual(resignRes.success, true);
            assert.strictEqual(resignRes.game?.status, 'completed');
            assert.strictEqual(resignRes.game?.result?.winner, 'black');
            assert.strictEqual(resignRes.game?.result?.reason, 'resignation');
        });

        await runTestCase('notation error diagnostic assistant', async () => {
            const chess = new Chess();

            // 1. User enters coordinate notation e2e4 instead of e4
            const diagUci = analyzeNotationError('e2e4', chess, 'w');
            assert.ok(diagUci.includes('coordinate notation'));
            assert.ok(diagUci.includes('e4'));

            // 2. User writes "castle"
            const diagCastle = analyzeNotationError('castle', chess, 'w');
            assert.ok(diagCastle.includes('O-O'));

            // 3. User uses K for knight (Kf3 instead of Nf3)
            const diagK = analyzeNotationError('Kf3', chess, 'w');
            assert.ok(diagK.includes('Nf3'));
            assert.ok(diagK.includes('Knight'));

            // 4. User types words "knight to f3"
            const diagWords = analyzeNotationError('knight to f3', chess, 'w');
            assert.ok(diagWords.includes('Nf3'));

            // 5. User types invalid pawn capture "xd5"
            const diagPawnCap = analyzeNotationError('xd5', chess, 'w');
            assert.ok(
                diagPawnCap.includes('departure file') || diagPawnCap.includes('Pawn captures'),
            );
        });

        await runTestCase('board rendering, captured pieces, and UI builders', async () => {
            const chess = new Chess();
            const boardStr = renderAsciiBoard(chess);
            assert.ok(boardStr.includes('♜'));
            assert.ok(boardStr.includes('♖'));
            assert.ok(boardStr.includes('a  b  c  d  e  f  g  h'));

            // Material summary on opening board
            const captured = getCapturedPiecesSummary(chess);
            assert.strictEqual(captured.materialDiff, 0);
            assert.strictEqual(captured.whiteCaptured, 'None');
            assert.strictEqual(captured.blackCaptured, 'None');

            // Legal moves list
            const legalMoves = getLegalMovesList(chess);
            assert.strictEqual(legalMoves.length, 20); // 16 pawn + 4 knight moves in opening
            const e2Moves = getLegalMovesList(chess, 'e2');
            assert.deepStrictEqual(e2Moves.sort(), ['e3', 'e4']);

            // Guide embed
            const guideEmbed = getNotationGuideEmbed();
            assert.ok(guideEmbed.data.title?.includes('Standard Algebraic Notation'));

            // Action row builders
            const challengeRow = buildChallengeActionRow('test_id');
            assert.strictEqual(challengeRow.components.length, 3);

            const activeRow = buildActiveGameActionRow('test_id');
            assert.strictEqual(activeRow.components.length, 4);

            const drawRow = buildDrawOfferActionRow('test_id');
            assert.strictEqual(drawRow.components.length, 2);

            const gameDummy = {
                id: 't_dummy',
                guildId: 'g',
                channelId: 'c',
                challengerId: 'u1',
                opponentId: 'u2',
                whitePlayer: { id: 'u1', username: 'u1' },
                blackPlayer: { id: 'u2', username: 'u2' },
                status: 'active' as const,
                turn: 'w' as const,
                fen: chess.fen(),
                pgn: '',
                history: [],
                createdAt: Date.now(),
                updatedAt: Date.now(),
            };
            const movesEmbed = buildLegalMovesEmbed(gameDummy);
            assert.ok(movesEmbed.data.description?.includes('20'));
        });

        await runTestCase('challenge decline and cancellation', async () => {
            const p1 = { id: 'p1', username: 'p1' };
            const p2 = { id: 'p2', username: 'p2' };

            const c1 = createGameChallenge('g8', 'c8', p1, p2);
            assert.ok(c1.game);

            // Challenger cancels
            const cancelRes = cancelChallenge(c1.game.id, 'p1');
            assert.strictEqual(cancelRes.success, true);
            assert.strictEqual(cancelRes.game?.status, 'completed');

            // Opponent declines
            const c2 = createGameChallenge('g9', 'c9', p1, p2);
            assert.ok(c2.game);
            const declineRes = declineChallenge(c2.game.id, 'p2');
            assert.strictEqual(declineRes.success, true);
            assert.strictEqual(declineRes.game?.status, 'completed');
        });

        await runTestCase('elo rating calculations and delta math', async () => {
            // Equal rating (1200 vs 1200) -> win gets +16, loss gets -16, draw gets 0
            const winDelta = calculateEloDelta(1200, 1200, 1);
            const lossDelta = calculateEloDelta(1200, 1200, 0);
            const drawDelta = calculateEloDelta(1200, 1200, 0.5);

            assert.strictEqual(winDelta, 16);
            assert.strictEqual(lossDelta, -16);
            assert.strictEqual(drawDelta, 0);

            // Strong player (1600) beats weaker player (1200) -> small gain
            const strongWin = calculateEloDelta(1600, 1200, 1);
            assert.ok(strongWin < 16 && strongWin > 0);

            // Upset: weaker player (1200) beats strong player (1600) -> large gain
            const upsetWin = calculateEloDelta(1200, 1600, 1);
            assert.ok(upsetWin > 16);
        });

        await runTestCase('match outcome records player stats, ratings, and streaks', async () => {
            const p1 = { id: 'stat_p1', username: 'player_one', displayName: 'Player One' };
            const p2 = { id: 'stat_p2', username: 'player_two', displayName: 'Player Two' };

            // Before any match
            const initialP1 = getPlayerStats('stat_p1', 'player_one');
            assert.strictEqual(initialP1.rating, 1200);
            assert.strictEqual(initialP1.gamesPlayed, 0);
            assert.strictEqual(initialP1.wins, 0);

            // Game 1: P1 wins as White by resignation
            const challenge = createGameChallenge('g_stat', 'c_stat', p1, p2, 'white');
            acceptChallenge(challenge.game!.id, 'stat_p2');
            resignGame(challenge.game!.id, 'stat_p2');

            const afterP1 = getPlayerStats('stat_p1');
            const afterP2 = getPlayerStats('stat_p2');

            assert.strictEqual(afterP1.gamesPlayed, 1);
            assert.strictEqual(afterP1.wins, 1);
            assert.strictEqual(afterP1.winsAsWhite, 1);
            assert.strictEqual(afterP1.rating, 1216);
            assert.strictEqual(afterP1.highestRating, 1216);
            assert.strictEqual(afterP1.currentStreak, 1);
            assert.strictEqual(afterP1.highestStreak, 1);

            assert.strictEqual(afterP2.gamesPlayed, 1);
            assert.strictEqual(afterP2.losses, 1);
            assert.strictEqual(afterP2.rating, 1184);
            assert.strictEqual(afterP2.currentStreak, -1);

            // Verify stats embed
            const embed = buildPlayerStatsEmbed(afterP1);
            assert.ok(embed.data.title?.includes('Player One'));
            assert.ok(embed.data.description?.includes('stat_p1'));
            assert.ok(
                embed.data.fields?.some(
                    (f) => f.name.includes('Rating') && f.value.includes('1216'),
                ),
            );
        });

        await runTestCase('chess leaderboard ranking and formatting', async () => {
            const leaderboard = getChessLeaderboard();
            assert.ok(leaderboard.length >= 2);
            assert.ok(leaderboard.some((p) => p.userId === 'stat_p1' && p.rating === 1216));
            assert.ok(leaderboard.some((p) => p.userId === 'stat_p2' && p.rating === 1184));

            const lbEmbed = buildLeaderboardEmbed('Test Guild');
            assert.ok(lbEmbed.data.title?.includes('Test Guild'));
            assert.ok(lbEmbed.data.description?.includes('🥇'));
            assert.ok(lbEmbed.data.description?.includes('1216'));
        });

        await runTestCase(
            'registration of /chess_stats and /chess_leaderboard commands',
            async () => {
                const statsCmd = commandRegistry.get('chess_stats');
                const lbCmd = commandRegistry.get('chess_leaderboard');

                assert.ok(statsCmd, 'chess_stats command should be registered');
                assert.ok(lbCmd, 'chess_leaderboard command should be registered');
                assert.strictEqual(statsCmd.name, 'chess_stats');
                assert.strictEqual(lbCmd.name, 'chess_leaderboard');
            },
        );
    } finally {
        resetChessDataDir();
        if (fs.existsSync(testDataDir)) {
            fs.rmSync(testDataDir, { recursive: true, force: true });
        }
    }
}

runSuite().catch((err) => {
    console.error(err);
    process.exit(1);
});
