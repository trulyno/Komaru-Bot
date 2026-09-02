import fs from 'node:fs';
import path from 'node:path';
import { Chess, Move, Square } from 'chess.js';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, Colors, EmbedBuilder } from 'discord.js';
import { logger } from '../logger';

export interface ChessPlayer {
    id: string;
    username: string;
    displayName?: string;
}

export interface ChessMoveRecord {
    san: string;
    from: string;
    to: string;
    piece: string;
    captured?: string;
    color: 'w' | 'b';
    timestamp: number;
}

export type ChessGameStatus = 'pending' | 'active' | 'completed';

export interface ChessGameResult {
    winner?: 'white' | 'black' | 'draw';
    reason:
        | 'checkmate'
        | 'resignation'
        | 'stalemate'
        | 'threefold_repetition'
        | 'insufficient_material'
        | 'fifty_moves'
        | 'mutual_draw'
        | 'cancelled';
}

export interface ChessGame {
    id: string;
    guildId: string;
    channelId: string;
    challengerId: string;
    opponentId: string;
    whitePlayer: ChessPlayer;
    blackPlayer: ChessPlayer;
    status: ChessGameStatus;
    turn: 'w' | 'b';
    fen: string;
    pgn: string;
    history: ChessMoveRecord[];
    result?: ChessGameResult;
    drawOfferedBy?: string;
    statsRecorded?: boolean;
    ratingChanges?: { whiteDelta: number; blackDelta: number };
    createdAt: number;
    updatedAt: number;
}

export interface ChessPlayerStats {
    userId: string;
    username: string;
    displayName: string;
    rating: number;
    highestRating: number;
    gamesPlayed: number;
    wins: number;
    losses: number;
    draws: number;
    currentStreak: number;
    highestStreak: number;
    winsAsWhite: number;
    winsAsBlack: number;
    lastPlayedAt: number;
}

export interface ChessStore {
    games: ChessGame[];
}

const DEFAULT_DATA_DIR = path.resolve(__dirname, '../../data/chess');
const DEFAULT_GAMES_FILE = path.join(DEFAULT_DATA_DIR, 'games.json');
const DEFAULT_STATS_FILE = path.join(DEFAULT_DATA_DIR, 'stats.json');

let chessDataDir = DEFAULT_DATA_DIR;
let chessGamesFile = DEFAULT_GAMES_FILE;
let chessStatsFile = DEFAULT_STATS_FILE;

export function setChessDataDirForTesting(customDir: string): void {
    chessDataDir = customDir;
    chessGamesFile = path.join(customDir, 'games.json');
    chessStatsFile = path.join(customDir, 'stats.json');
    if (!fs.existsSync(chessDataDir)) {
        fs.mkdirSync(chessDataDir, { recursive: true });
    }
}

export function resetChessDataDir(): void {
    chessDataDir = DEFAULT_DATA_DIR;
    chessGamesFile = DEFAULT_GAMES_FILE;
    chessStatsFile = DEFAULT_STATS_FILE;
    if (!fs.existsSync(chessDataDir)) {
        fs.mkdirSync(chessDataDir, { recursive: true });
    }
}

export function loadChessStore(): ChessStore {
    try {
        if (!fs.existsSync(chessDataDir)) {
            fs.mkdirSync(chessDataDir, { recursive: true });
        }
        if (!fs.existsSync(chessGamesFile)) {
            const initialStore: ChessStore = { games: [] };
            fs.writeFileSync(chessGamesFile, JSON.stringify(initialStore, null, 2), 'utf-8');
            return initialStore;
        }
        const data = fs.readFileSync(chessGamesFile, 'utf-8');
        return JSON.parse(data) as ChessStore;
    } catch (error) {
        logger.error(`Failed to load chess games store: ${error}`);
        return { games: [] };
    }
}

export function saveChessStore(store: ChessStore): void {
    try {
        if (!fs.existsSync(chessDataDir)) {
            fs.mkdirSync(chessDataDir, { recursive: true });
        }
        fs.writeFileSync(chessGamesFile, JSON.stringify(store, null, 2), 'utf-8');
    } catch (error) {
        logger.error(`Failed to save chess games store: ${error}`);
    }
}

export function loadChessStats(): Record<string, ChessPlayerStats> {
    try {
        if (!fs.existsSync(chessDataDir)) {
            fs.mkdirSync(chessDataDir, { recursive: true });
        }
        if (!fs.existsSync(chessStatsFile)) {
            const initial: Record<string, ChessPlayerStats> = {};
            fs.writeFileSync(chessStatsFile, JSON.stringify(initial, null, 2), 'utf-8');
            return initial;
        }
        const data = fs.readFileSync(chessStatsFile, 'utf-8');
        return JSON.parse(data) as Record<string, ChessPlayerStats>;
    } catch (error) {
        logger.error(`Failed to load chess stats: ${error}`);
        return {};
    }
}

export function saveChessStats(stats: Record<string, ChessPlayerStats>): void {
    try {
        if (!fs.existsSync(chessDataDir)) {
            fs.mkdirSync(chessDataDir, { recursive: true });
        }
        fs.writeFileSync(chessStatsFile, JSON.stringify(stats, null, 2), 'utf-8');
    } catch (error) {
        logger.error(`Failed to save chess stats: ${error}`);
    }
}

export function getOrCreatePlayerStats(
    statsMap: Record<string, ChessPlayerStats>,
    player: ChessPlayer,
): ChessPlayerStats {
    if (!statsMap[player.id]) {
        statsMap[player.id] = {
            userId: player.id,
            username: player.username,
            displayName: player.displayName || player.username,
            rating: 1200,
            highestRating: 1200,
            gamesPlayed: 0,
            wins: 0,
            losses: 0,
            draws: 0,
            currentStreak: 0,
            highestStreak: 0,
            winsAsWhite: 0,
            winsAsBlack: 0,
            lastPlayedAt: 0,
        };
    } else {
        if (player.username && player.username !== 'Player') {
            statsMap[player.id].username = player.username;
        }
        if (player.displayName) {
            statsMap[player.id].displayName = player.displayName;
        }
    }
    return statsMap[player.id];
}

export function getPlayerStats(
    userId: string,
    username?: string,
    displayName?: string,
): ChessPlayerStats {
    const statsMap = loadChessStats();
    return getOrCreatePlayerStats(statsMap, {
        id: userId,
        username: username || 'Player',
        displayName: displayName,
    });
}

export function calculateEloDelta(
    ratingA: number,
    ratingB: number,
    scoreA: number,
    kFactor = 32,
): number {
    const expectedA = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
    return Math.round(kFactor * (scoreA - expectedA));
}

export function recordGameOutcome(game: ChessGame): {
    whiteDelta: number;
    blackDelta: number;
    whiteStats: ChessPlayerStats;
    blackStats: ChessPlayerStats;
} | null {
    if (game.status !== 'completed' || !game.result || game.result.reason === 'cancelled') {
        return null;
    }
    if (game.statsRecorded) {
        return null;
    }

    const allStats = loadChessStats();
    const whiteStats = getOrCreatePlayerStats(allStats, game.whitePlayer);
    const blackStats = getOrCreatePlayerStats(allStats, game.blackPlayer);

    let whiteScore = 0.5;
    if (game.result.winner === 'white') {
        whiteScore = 1;
    } else if (game.result.winner === 'black') {
        whiteScore = 0;
    }

    const whiteDelta = calculateEloDelta(whiteStats.rating, blackStats.rating, whiteScore);
    const blackDelta = -whiteDelta;

    whiteStats.rating = Math.max(100, whiteStats.rating + whiteDelta);
    blackStats.rating = Math.max(100, blackStats.rating + blackDelta);

    if (whiteStats.rating > whiteStats.highestRating) {
        whiteStats.highestRating = whiteStats.rating;
    }
    if (blackStats.rating > blackStats.highestRating) {
        blackStats.highestRating = blackStats.rating;
    }

    whiteStats.gamesPlayed += 1;
    blackStats.gamesPlayed += 1;
    whiteStats.lastPlayedAt = Date.now();
    blackStats.lastPlayedAt = Date.now();

    if (whiteScore === 1) {
        whiteStats.wins += 1;
        whiteStats.winsAsWhite += 1;
        whiteStats.currentStreak = whiteStats.currentStreak > 0 ? whiteStats.currentStreak + 1 : 1;
        if (whiteStats.currentStreak > whiteStats.highestStreak) {
            whiteStats.highestStreak = whiteStats.currentStreak;
        }

        blackStats.losses += 1;
        blackStats.currentStreak = blackStats.currentStreak < 0 ? blackStats.currentStreak - 1 : -1;
    } else if (whiteScore === 0) {
        blackStats.wins += 1;
        blackStats.winsAsBlack += 1;
        blackStats.currentStreak = blackStats.currentStreak > 0 ? blackStats.currentStreak + 1 : 1;
        if (blackStats.currentStreak > blackStats.highestStreak) {
            blackStats.highestStreak = blackStats.currentStreak;
        }

        whiteStats.losses += 1;
        whiteStats.currentStreak = whiteStats.currentStreak < 0 ? whiteStats.currentStreak - 1 : -1;
    } else {
        whiteStats.draws += 1;
        blackStats.draws += 1;
        whiteStats.currentStreak = 0;
        blackStats.currentStreak = 0;
    }

    allStats[whiteStats.userId] = whiteStats;
    allStats[blackStats.userId] = blackStats;
    saveChessStats(allStats);

    game.statsRecorded = true;
    game.ratingChanges = { whiteDelta, blackDelta };

    return { whiteDelta, blackDelta, whiteStats, blackStats };
}

export function getChessLeaderboard(limit = 10): ChessPlayerStats[] {
    const statsMap = loadChessStats();
    return Object.values(statsMap)
        .filter((s) => s.gamesPlayed > 0)
        .sort((a, b) => {
            if (b.rating !== a.rating) {
                return b.rating - a.rating;
            }
            if (b.wins !== a.wins) {
                return b.wins - a.wins;
            }
            return b.gamesPlayed - a.gamesPlayed;
        })
        .slice(0, Math.max(1, limit));
}

export function buildPlayerStatsEmbed(stats: ChessPlayerStats): EmbedBuilder {
    const winRate = stats.gamesPlayed > 0 ? Math.round((stats.wins / stats.gamesPlayed) * 100) : 0;

    let streakDesc = 'None';
    if (stats.currentStreak > 0) {
        streakDesc = `🔥 ${stats.currentStreak} Win${stats.currentStreak > 1 ? 's' : ''}`;
    } else if (stats.currentStreak < 0) {
        streakDesc = `❄️ ${Math.abs(stats.currentStreak)} Loss${Math.abs(stats.currentStreak) > 1 ? 'es' : ''}`;
    }

    const embed = new EmbedBuilder()
        .setColor(Colors.Gold)
        .setTitle(`♟️ Chess Stats: ${stats.displayName || stats.username}`)
        .setDescription(`Rating and career match records for <@${stats.userId}>.`)
        .addFields([
            {
                name: '🏆 Rating',
                value: `**${stats.rating}** (Peak: **${stats.highestRating}**)`,
                inline: true,
            },
            {
                name: '🎯 Win Rate',
                value: `**${winRate}%**`,
                inline: true,
            },
            {
                name: '🔥 Current Streak',
                value: `${streakDesc} *(Best: ${stats.highestStreak})*`,
                inline: true,
            },
            {
                name: '📊 Match Record',
                value: `• **Total Matches**: ${stats.gamesPlayed}\n• **Wins**: ${stats.wins}\n• **Losses**: ${stats.losses}\n• **Draws**: ${stats.draws}`,
                inline: true,
            },
            {
                name: '⚔️ Color Breakdown',
                value: `• **Wins as White**: ${stats.winsAsWhite}\n• **Wins as Black**: ${stats.winsAsBlack}`,
                inline: true,
            },
        ]);

    if (stats.lastPlayedAt > 0) {
        embed.setFooter({
            text: `Last match played: <t:${Math.floor(stats.lastPlayedAt / 1000)}:R>`,
        });
    }

    return embed;
}

export function buildLeaderboardEmbed(guildName?: string, limit = 10): EmbedBuilder {
    const leaders = getChessLeaderboard(limit);
    const title = guildName ? `🏆 Chess Leaderboard — ${guildName}` : '🏆 Chess Leaderboard';

    const embed = new EmbedBuilder().setColor(Colors.Gold).setTitle(title);

    if (leaders.length === 0) {
        embed.setDescription(
            'No chess matches have been recorded yet!\nStart a match with `/chess challenge` or `/chess_stats` to earn your rating!',
        );
        return embed;
    }

    const medals = ['🥇', '🥈', '🥉'];
    const lines = leaders.map((player, idx) => {
        const rankPrefix = idx < 3 ? medals[idx] : `\`#${idx + 1}\``;
        const winRate =
            player.gamesPlayed > 0 ? Math.round((player.wins / player.gamesPlayed) * 100) : 0;

        return (
            `${rankPrefix} **${player.displayName || player.username}** — **${player.rating}** Elo\n` +
            `└ *${player.wins}W / ${player.losses}L / ${player.draws}D (${winRate}% win rate, ${player.gamesPlayed} games)*`
        );
    });

    embed.setDescription(lines.join('\n\n'));
    embed.setFooter({ text: 'Komaru Bot Chess • Play matches using /chess challenge' });

    return embed;
}

export function getGameById(gameId: string): ChessGame | undefined {
    const store = loadChessStore();
    return store.games.find((g) => g.id === gameId);
}

export function getActiveGameInChannel(channelId: string): ChessGame | undefined {
    const store = loadChessStore();
    return store.games.find((g) => g.channelId === channelId && g.status === 'active');
}

export function getPendingChallengeInChannel(channelId: string): ChessGame | undefined {
    const store = loadChessStore();
    return store.games.find((g) => g.channelId === channelId && g.status === 'pending');
}

export function getUserActiveGame(userId: string): ChessGame | undefined {
    const store = loadChessStore();
    return store.games.find(
        (g) =>
            g.status === 'active' && (g.whitePlayer.id === userId || g.blackPlayer.id === userId),
    );
}

export function createGameChallenge(
    guildId: string,
    channelId: string,
    challenger: ChessPlayer,
    opponent: ChessPlayer,
    preferredColor: 'white' | 'black' | 'random' = 'random',
): { success: boolean; game?: ChessGame; error?: string } {
    if (challenger.id === opponent.id) {
        return { success: false, error: 'You cannot challenge yourself to a chess match!' };
    }

    const store = loadChessStore();

    // Check if there is already an active game or pending challenge in this channel
    const existingActive = store.games.find(
        (g) => g.channelId === channelId && (g.status === 'active' || g.status === 'pending'),
    );
    if (existingActive) {
        if (existingActive.status === 'pending') {
            return {
                success: false,
                error: 'There is already a pending chess challenge in this channel. Wait for it to be accepted, declined, or cancelled.',
            };
        }
        return {
            success: false,
            error: 'There is already an active chess game in this channel! Finish it or resign before starting a new one.',
        };
    }

    let whitePlayer: ChessPlayer;
    let blackPlayer: ChessPlayer;

    if (preferredColor === 'white') {
        whitePlayer = challenger;
        blackPlayer = opponent;
    } else if (preferredColor === 'black') {
        whitePlayer = opponent;
        blackPlayer = challenger;
    } else {
        const isWhite = Math.random() < 0.5;
        whitePlayer = isWhite ? challenger : opponent;
        blackPlayer = isWhite ? opponent : challenger;
    }

    const chess = new Chess();
    const gameId = `chess_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const newGame: ChessGame = {
        id: gameId,
        guildId,
        channelId,
        challengerId: challenger.id,
        opponentId: opponent.id,
        whitePlayer,
        blackPlayer,
        status: 'pending',
        turn: 'w',
        fen: chess.fen(),
        pgn: '',
        history: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
    };

    store.games.push(newGame);
    saveChessStore(store);

    return { success: true, game: newGame };
}

export function acceptChallenge(
    gameId: string,
    userId: string,
): { success: boolean; game?: ChessGame; error?: string } {
    const store = loadChessStore();
    const game = store.games.find((g) => g.id === gameId);

    if (!game) {
        return { success: false, error: 'Challenge not found.' };
    }
    if (game.status !== 'pending') {
        return { success: false, error: 'This challenge is no longer pending.' };
    }
    if (game.opponentId !== userId) {
        return { success: false, error: 'Only the challenged player can accept this invitation!' };
    }

    game.status = 'active';
    game.updatedAt = Date.now();
    saveChessStore(store);

    return { success: true, game };
}

export function declineChallenge(
    gameId: string,
    userId: string,
): { success: boolean; game?: ChessGame; error?: string } {
    const store = loadChessStore();
    const game = store.games.find((g) => g.id === gameId);

    if (!game) {
        return { success: false, error: 'Challenge not found.' };
    }
    if (game.status !== 'pending') {
        return { success: false, error: 'This challenge is no longer pending.' };
    }
    if (game.opponentId !== userId && game.challengerId !== userId) {
        return { success: false, error: 'You are not part of this challenge.' };
    }

    game.status = 'completed';
    game.result = { reason: 'cancelled' };
    game.updatedAt = Date.now();
    saveChessStore(store);

    return { success: true, game };
}

export function cancelChallenge(
    gameId: string,
    userId: string,
): { success: boolean; game?: ChessGame; error?: string } {
    const store = loadChessStore();
    const game = store.games.find((g) => g.id === gameId);

    if (!game) {
        return { success: false, error: 'Challenge not found.' };
    }
    if (game.status !== 'pending') {
        return { success: false, error: 'Only pending challenges can be cancelled.' };
    }
    if (game.challengerId !== userId) {
        return { success: false, error: 'Only the challenger can cancel this invitation.' };
    }

    game.status = 'completed';
    game.result = { reason: 'cancelled' };
    game.updatedAt = Date.now();
    saveChessStore(store);

    return { success: true, game };
}

export function resignGame(
    gameId: string,
    userId: string,
): { success: boolean; game?: ChessGame; error?: string } {
    const store = loadChessStore();
    const game = store.games.find((g) => g.id === gameId);

    if (!game) {
        return { success: false, error: 'Game not found.' };
    }
    if (game.status !== 'active') {
        return { success: false, error: 'This game is not currently active.' };
    }

    if (game.whitePlayer.id !== userId && game.blackPlayer.id !== userId) {
        return { success: false, error: 'You are not a player in this chess game!' };
    }

    const isWhite = game.whitePlayer.id === userId;
    game.status = 'completed';
    game.result = {
        winner: isWhite ? 'black' : 'white',
        reason: 'resignation',
    };
    recordGameOutcome(game);
    game.updatedAt = Date.now();
    saveChessStore(store);

    return { success: true, game };
}

export function offerDraw(
    gameId: string,
    userId: string,
): { success: boolean; game?: ChessGame; accepted?: boolean; error?: string } {
    const store = loadChessStore();
    const game = store.games.find((g) => g.id === gameId);

    if (!game) {
        return { success: false, error: 'Game not found.' };
    }
    if (game.status !== 'active') {
        return { success: false, error: 'This game is not currently active.' };
    }
    if (game.whitePlayer.id !== userId && game.blackPlayer.id !== userId) {
        return { success: false, error: 'You are not a player in this game.' };
    }

    // If the opponent already offered a draw, this action accepts it!
    if (game.drawOfferedBy && game.drawOfferedBy !== userId) {
        game.status = 'completed';
        game.result = {
            winner: 'draw',
            reason: 'mutual_draw',
        };
        game.drawOfferedBy = undefined;
        recordGameOutcome(game);
        game.updatedAt = Date.now();
        saveChessStore(store);
        return { success: true, game, accepted: true };
    }

    // Otherwise record new draw offer
    game.drawOfferedBy = userId;
    game.updatedAt = Date.now();
    saveChessStore(store);

    return { success: true, game, accepted: false };
}

export function declineDraw(
    gameId: string,
    userId: string,
): { success: boolean; game?: ChessGame; error?: string } {
    const store = loadChessStore();
    const game = store.games.find((g) => g.id === gameId);

    if (!game) {
        return { success: false, error: 'Game not found.' };
    }
    if (!game.drawOfferedBy) {
        return { success: false, error: 'There is no pending draw offer to decline.' };
    }
    if (game.drawOfferedBy === userId) {
        return { success: false, error: 'You cannot decline your own draw offer.' };
    }

    game.drawOfferedBy = undefined;
    game.updatedAt = Date.now();
    saveChessStore(store);

    return { success: true, game };
}

/**
 * Normalizes user notation input before passing to chess.js.
 * Handles castling shorthand (0-0, o-o), cleans whitespace, etc.
 */
export function normalizeNotationInput(input: string): string {
    let clean = input.trim();
    // Normalize castling
    if (/^(0-0-0|o-o-o)$/i.test(clean)) {
        return 'O-O-O';
    }
    if (/^(0-0|o-o)$/i.test(clean)) {
        return 'O-O';
    }
    // Remove extra spaces in moves like "N f3" or "e 4"
    clean = clean.replace(/\s+/g, '');
    return clean;
}

export interface MakeMoveResult {
    success: boolean;
    game?: ChessGame;
    move?: Move;
    error?: string;
    diagnostic?: string;
}

/**
 * Executes a move using Standard Algebraic Notation (SAN).
 * Validates check, checkmate, castling, en passant, promotion, and draw rules.
 */
export function executeMove(gameId: string, userId: string, rawNotation: string): MakeMoveResult {
    const store = loadChessStore();
    const game = store.games.find((g) => g.id === gameId);

    if (!game) {
        return { success: false, error: 'Chess match not found.' };
    }
    if (game.status !== 'active') {
        return { success: false, error: 'This match is not currently active.' };
    }

    const isWhiteTurn = game.turn === 'w';
    const expectedPlayerId = isWhiteTurn ? game.whitePlayer.id : game.blackPlayer.id;

    if (userId !== expectedPlayerId) {
        const isOtherPlayer = isWhiteTurn
            ? game.blackPlayer.id === userId
            : game.whitePlayer.id === userId;
        if (isOtherPlayer) {
            return {
                success: false,
                error: `It is not your turn! Waiting for ${isWhiteTurn ? 'White (♔)' : 'Black (♚)'} to move.`,
            };
        }
        return { success: false, error: 'You are not a participant in this chess match!' };
    }

    const chess = new Chess(game.fen);
    const normalized = normalizeNotationInput(rawNotation);

    let executedMove: Move | null = null;

    try {
        // Attempt standard SAN move
        executedMove = chess.move(normalized);
    } catch {
        // If direct parse failed, attempt diagnostic analysis to help user with chess notation
        const diagnostic = analyzeNotationError(rawNotation, chess, game.turn);
        return {
            success: false,
            error: `Invalid move: \`${rawNotation}\``,
            diagnostic,
        };
    }

    if (!executedMove) {
        const diagnostic = analyzeNotationError(rawNotation, chess, game.turn);
        return {
            success: false,
            error: `Invalid move: \`${rawNotation}\``,
            diagnostic,
        };
    }

    // Record the move in history
    game.history.push({
        san: executedMove.san,
        from: executedMove.from,
        to: executedMove.to,
        piece: executedMove.piece,
        captured: executedMove.captured,
        color: executedMove.color,
        timestamp: Date.now(),
    });

    game.fen = chess.fen();
    game.pgn = chess.pgn();
    game.turn = chess.turn();
    game.drawOfferedBy = undefined; // Any move cancels previous draw offer
    game.updatedAt = Date.now();

    // Check game termination conditions
    if (chess.isCheckmate()) {
        game.status = 'completed';
        game.result = {
            winner: executedMove.color === 'w' ? 'white' : 'black',
            reason: 'checkmate',
        };
    } else if (chess.isStalemate()) {
        game.status = 'completed';
        game.result = {
            winner: 'draw',
            reason: 'stalemate',
        };
    } else if (chess.isThreefoldRepetition()) {
        game.status = 'completed';
        game.result = {
            winner: 'draw',
            reason: 'threefold_repetition',
        };
    } else if (chess.isInsufficientMaterial()) {
        game.status = 'completed';
        game.result = {
            winner: 'draw',
            reason: 'insufficient_material',
        };
    } else if (chess.isDrawByFiftyMoves()) {
        game.status = 'completed';
        game.result = {
            winner: 'draw',
            reason: 'fifty_moves',
        };
    }

    if (game.status === 'completed') {
        recordGameOutcome(game);
    }

    saveChessStore(store);

    return {
        success: true,
        game,
        move: executedMove,
    };
}

/**
 * Detailed error analysis and educational guidance for invalid chess notation.
 */
export function analyzeNotationError(input: string, chess: Chess, turn: 'w' | 'b'): string {
    const trimmed = input.trim();
    const legalMoves = chess.moves({ verbose: true });
    const legalSanList = chess.moves();

    // 1. Coordinate / UCI format like "e2e4" or "e2-e4"
    const uciMatch = trimmed.match(/^([a-h][1-8])[- ]?([a-h][1-8])([qrbn])?$/i);
    if (uciMatch) {
        const from = uciMatch[1].toLowerCase() as Square;
        const to = uciMatch[2].toLowerCase() as Square;
        const promotion = uciMatch[3]?.toLowerCase();

        // Check if this move is actually legal in UCI
        const matchingLegal = legalMoves.find(
            (m) => m.from === from && m.to === to && (!promotion || m.promotion === promotion),
        );

        if (matchingLegal) {
            return `💡 You entered coordinate notation (\`${trimmed}\`). In **Standard Algebraic Notation (SAN)**, this move is written as **\`${matchingLegal.san}\`**!`;
        }

        const pieceAtFrom = chess.get(from);
        if (!pieceAtFrom) {
            return `Square **${from}** is empty! You can only move your own pieces.`;
        }
        if (pieceAtFrom.color !== turn) {
            return `The piece on **${from}** belongs to your opponent! You can only move your own pieces.`;
        }
        return `A move from **${from}** to **${to}** is not a legal move for that ${getPieceName(pieceAtFrom.type)}.`;
    }

    // 2. Castling with words like "castle" or "castling"
    if (/^castle(s)?$/i.test(trimmed) || /^kingside(\s*castle)?$/i.test(trimmed)) {
        return '💡 To castle **kingside (short castle)**, write **`O-O`** (capital letter O). For **queenside (long castle)**, write **`O-O-O`**.';
    }
    if (/^queenside(\s*castle)?$/i.test(trimmed)) {
        return '💡 To castle **queenside (long castle)**, write **`O-O-O`** (three capital letter Os separated by hyphens).';
    }

    // 3. Castling illegality diagnosis (user typed O-O or O-O-O or 0-0 or 0-0-0)
    if (/^(O-O|0-0)$/i.test(trimmed)) {
        return diagnoseCastlingFailure(chess, turn, 'kingside');
    }
    if (/^(O-O-O|0-0-0)$/i.test(trimmed)) {
        return diagnoseCastlingFailure(chess, turn, 'queenside');
    }

    // 4. Using 'K' for Knight
    if (/^K[a-h][1-8]$/i.test(trimmed)) {
        const dest = trimmed.substring(1).toLowerCase();
        const knightMove = legalMoves.find((m) => m.piece === 'n' && m.to === dest);
        if (knightMove) {
            return `💡 Remember: **\`K\`** stands for **King** ♔, while **\`N\`** is used for **Knight** ♘! To move your knight to ${dest}, type **\`N${dest}\`**.`;
        }
    }

    // 5. Pawn captures missing origin file (e.g. "xd5" or "x-d5")
    if (/^x[a-h][1-8]$/i.test(trimmed)) {
        const dest = trimmed.substring(1).toLowerCase();
        const matchingPawnCaptures = legalMoves.filter(
            (m) => m.piece === 'p' && m.to === dest && m.captured,
        );
        if (matchingPawnCaptures.length > 0) {
            const examples = matchingPawnCaptures.map((m) => `\`${m.san}\``).join(' or ');
            return `💡 Pawn captures must include the starting column (file), for example: ${examples}.`;
        }
        return `Pawn captures must include the departure file (e.g. \`exd5\` means the pawn on the e-file captures on d5).`;
    }

    // 6. Descriptive text input like "knight to f3" or "pawn e4"
    if (/^(knight|bishop|rook|queen|king|pawn)\s*(to\s*)?[a-h][1-8]/i.test(trimmed)) {
        return (
            '💡 In chess notation, do not write full words! Use piece abbreviations:' +
            '\n• **Pawn**: no letter, just the destination square (e.g. `e4`)' +
            '\n• **Knight**: `N` + destination (e.g. `Nf3`)' +
            '\n• **Bishop**: `B` + destination (e.g. `Bc4`)' +
            '\n• **Rook**: `R` + destination (e.g. `Rd1`)' +
            '\n• **Queen**: `Q` + destination (e.g. `Qh5`)' +
            '\n• **King**: `K` + destination (e.g. `Ke2`)'
        );
    }

    // 7. En Passant guidance
    const epSquare = getEnPassantTargetSquare(chess);
    if (epSquare && trimmed.toLowerCase().includes(epSquare)) {
        const legalEp = legalMoves.find((m) => m.flags.includes('e'));
        if (legalEp) {
            return `💡 An **En Passant** capture is available! Write **\`${legalEp.san}\`** to capture the pawn that just moved two squares.`;
        }
    }

    // 8. Pawn Promotion missing
    if (/^[a-h](x[a-h])?[18]$/i.test(trimmed)) {
        return (
            '💡 Pawns reaching the opposite side must be promoted! Append `=Q` for Queen, `=R` for Rook, `=B` for Bishop, or `=N` for Knight.' +
            `\nFor example: \`${trimmed}=Q\``
        );
    }

    // 9. King in check
    if (chess.inCheck()) {
        const legalEscapes = legalSanList
            .slice(0, 5)
            .map((m) => `\`${m}\``)
            .join(', ');
        return `🚨 Your King is currently in **CHECK**! Your move must resolve the check (move the king, block the attack, or capture the checking piece).\nPossible legal moves: ${legalEscapes || 'None'}`;
    }

    // 10. Check if destination exists in legal moves
    const destMatch = trimmed.match(/[a-h][1-8]/i);
    if (destMatch) {
        const dest = destMatch[0].toLowerCase();
        const movesToDest = legalMoves.filter((m) => m.to === dest);
        if (movesToDest.length > 0) {
            const examples = movesToDest.map((m) => `\`${m.san}\``).join(', ');
            return `Did you mean one of these legal moves to **${dest}**: ${examples}?`;
        }
    }

    // Fallback: Show a few sample legal moves
    const sample = legalSanList
        .slice(0, 6)
        .map((m) => `\`${m}\``)
        .join(', ');
    return `Not a valid move in Standard Algebraic Notation (SAN). Example legal moves right now: ${sample || 'None'}. Use \`/chess moves\` to see all options.`;
}

function diagnoseCastlingFailure(
    chess: Chess,
    turn: 'w' | 'b',
    side: 'kingside' | 'queenside',
): string {
    const isWhite = turn === 'w';
    const rank = isWhite ? '1' : '8';
    const castlingRights = chess.getCastlingRights(turn);

    const hasRight = side === 'kingside' ? castlingRights.k : castlingRights.q;
    if (!hasRight) {
        return `❌ Cannot castle ${side}: Your King or that Rook has already moved earlier in the game!`;
    }

    if (chess.inCheck()) {
        return `❌ Cannot castle while your King is in **CHECK**!`;
    }

    // Check intermediate squares for pieces
    const betweenSquares: Square[] =
        side === 'kingside'
            ? ([`f${rank}`, `g${rank}`] as Square[])
            : ([`b${rank}`, `c${rank}`, `d${rank}`] as Square[]);

    for (const sq of betweenSquares) {
        if (chess.get(sq)) {
            return `❌ Cannot castle ${side}: The squares between the King and Rook are blocked by pieces!`;
        }
    }

    // Check if transit squares are attacked
    const transitSquares: Square[] =
        side === 'kingside'
            ? ([`f${rank}`, `g${rank}`] as Square[])
            : ([`c${rank}`, `d${rank}`] as Square[]);

    const opponentColor = isWhite ? 'b' : 'w';
    for (const sq of transitSquares) {
        if (chess.isAttacked(sq, opponentColor)) {
            return `❌ Cannot castle ${side}: The King cannot move through or land on a square under attack (${sq})!`;
        }
    }

    return `Castling ${side} is not legal in this position.`;
}

function getPieceName(pieceType: string): string {
    switch (pieceType.toLowerCase()) {
        case 'p':
            return 'Pawn';
        case 'n':
            return 'Knight';
        case 'b':
            return 'Bishop';
        case 'r':
            return 'Rook';
        case 'q':
            return 'Queen';
        case 'k':
            return 'King';
        default:
            return 'Piece';
    }
}

function getEnPassantTargetSquare(chess: Chess): string | null {
    const fen = chess.fen();
    const parts = fen.split(' ');
    const ep = parts[3];
    return ep !== '-' ? ep : null;
}

/**
 * Returns formatted legal moves for the current player or a specific square.
 */
export function getLegalMovesList(chess: Chess, square?: string): string[] {
    if (square) {
        const sq = square.toLowerCase() as Square;
        return chess.moves({ square: sq });
    }
    return chess.moves();
}

/**
 * Renders an ASCII/Unicode chessboard representation for Discord embeds.
 */
export function renderAsciiBoard(chess: Chess, flip = false): string {
    const board = chess.board(); // 8x8 array: rank 8 is index 0, rank 1 is index 7
    const ranks = flip ? [1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1];
    const files = flip
        ? ['h', 'g', 'f', 'e', 'd', 'c', 'b', 'a']
        : ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

    const pieceSymbols: Record<string, string> = {
        w_p: '♙',
        w_n: '♘',
        w_b: '♗',
        w_r: '♖',
        w_q: '♕',
        w_k: '♔',
        b_p: '♟',
        b_n: '♞',
        b_b: '♝',
        b_r: '♜',
        b_q: '♛',
        b_k: '♚',
    };

    const header = `  ${files.join('  ')}`;
    const lines: string[] = [header];

    for (const rank of ranks) {
        const rankIdx = 8 - rank;
        const row = board[rankIdx];
        const cells: string[] = [];

        for (const file of files) {
            const fileIdx = file.charCodeAt(0) - 'a'.charCodeAt(0);
            const piece = row[fileIdx];
            if (piece) {
                const key = `${piece.color}_${piece.type}`;
                cells.push(pieceSymbols[key] || '?');
            } else {
                // Light and dark square alternate
                cells.push('·');
            }
        }
        lines.push(`${rank} ${cells.join('  ')} ${rank}`);
    }

    lines.push(header);
    return lines.join('\n');
}

/**
 * Calculates captured pieces and material count difference.
 */
export function getCapturedPiecesSummary(chess: Chess): {
    whiteCaptured: string;
    blackCaptured: string;
    materialDiff: number; // positive = White advantage, negative = Black advantage
} {
    const startingPieces: Record<string, number> = {
        p: 8,
        n: 2,
        b: 2,
        r: 2,
        q: 1,
    };

    const pieceValues: Record<string, number> = {
        p: 1,
        n: 3,
        b: 3,
        r: 5,
        q: 9,
    };

    const whiteRemaining: Record<string, number> = { p: 0, n: 0, b: 0, r: 0, q: 0 };
    const blackRemaining: Record<string, number> = { p: 0, n: 0, b: 0, r: 0, q: 0 };

    const board = chess.board();
    for (const row of board) {
        for (const cell of row) {
            if (!cell || cell.type === 'k') continue;
            if (cell.color === 'w') {
                whiteRemaining[cell.type] = (whiteRemaining[cell.type] || 0) + 1;
            } else {
                blackRemaining[cell.type] = (blackRemaining[cell.type] || 0) + 1;
            }
        }
    }

    const whiteCapturedPieces: string[] = []; // Black pieces taken by White
    const blackCapturedPieces: string[] = []; // White pieces taken by Black

    const symbols = {
        b: { q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' },
        w: { q: '♕', r: '♖', b: '♗', n: '♘', p: '♙' },
    };

    let whiteMaterial = 0;
    let blackMaterial = 0;

    for (const type of ['q', 'r', 'b', 'n', 'p'] as const) {
        const whiteLost = (startingPieces[type] || 0) - (whiteRemaining[type] || 0);
        const blackLost = (startingPieces[type] || 0) - (blackRemaining[type] || 0);

        for (let i = 0; i < blackLost; i++) {
            whiteCapturedPieces.push(symbols.b[type]);
        }
        for (let i = 0; i < whiteLost; i++) {
            blackCapturedPieces.push(symbols.w[type]);
        }

        whiteMaterial += (whiteRemaining[type] || 0) * (pieceValues[type] || 0);
        blackMaterial += (blackRemaining[type] || 0) * (pieceValues[type] || 0);
    }

    return {
        whiteCaptured: whiteCapturedPieces.join(' ') || 'None',
        blackCaptured: blackCapturedPieces.join(' ') || 'None',
        materialDiff: whiteMaterial - blackMaterial,
    };
}

/**
 * Builds the primary game state embed.
 */
export function buildChessBoardEmbed(game: ChessGame): EmbedBuilder {
    const chess = new Chess(game.fen);
    const boardAscii = renderAsciiBoard(chess, game.turn === 'b');
    const captured = getCapturedPiecesSummary(chess);

    const isWhiteTurn = game.turn === 'w';
    const activePlayer = isWhiteTurn ? game.whitePlayer : game.blackPlayer;
    const opponentPlayer = isWhiteTurn ? game.blackPlayer : game.whitePlayer;

    const embed = new EmbedBuilder();

    // Check status
    const inCheck = chess.inCheck();
    const isCheckmate = chess.isCheckmate();
    const isDraw = chess.isDraw();

    if (game.status === 'completed') {
        embed.setColor(Colors.DarkGold);
        if (game.result?.reason === 'resignation') {
            const winner = game.result.winner === 'white' ? game.whitePlayer : game.blackPlayer;
            embed.setTitle(`🏳️ ${winner.displayName || winner.username} won by resignation!`);
        } else if (game.result?.winner === 'white') {
            embed.setTitle(
                `🏆 Checkmate! ${game.whitePlayer.displayName || game.whitePlayer.username} (White) Won!`,
            );
        } else if (game.result?.winner === 'black') {
            embed.setTitle(
                `🏆 Checkmate! ${game.blackPlayer.displayName || game.blackPlayer.username} (Black) Won!`,
            );
        } else {
            embed.setTitle(`🤝 Game Ended in a Draw (${formatDrawReason(game.result?.reason)})`);
        }
    } else if (isCheckmate) {
        embed.setColor(Colors.Gold);
        embed.setTitle(
            `🏆 CHECKMATE! ${opponentPlayer.displayName || opponentPlayer.username} wins!`,
        );
    } else if (inCheck) {
        embed.setColor(Colors.Red);
        embed.setTitle(
            `🚨 CHECK! It is ${activePlayer.displayName || activePlayer.username}'s turn (${isWhiteTurn ? 'White ♔' : 'Black ♚'})`,
        );
    } else if (isDraw) {
        embed.setColor(Colors.Grey);
        embed.setTitle(`🤝 DRAW! Match ended.`);
    } else {
        embed.setColor(isWhiteTurn ? Colors.Blue : Colors.DarkPurple);
        embed.setTitle(
            `♟️ Chess Match: ${activePlayer.displayName || activePlayer.username}'s turn (${isWhiteTurn ? 'White ♔' : 'Black ♚'})`,
        );
    }

    // Material evaluation tag
    let evalTag = 'Equal';
    if (captured.materialDiff > 0) {
        evalTag = `White +${captured.materialDiff}`;
    } else if (captured.materialDiff < 0) {
        evalTag = `Black +${Math.abs(captured.materialDiff)}`;
    }

    // Recent move description
    let lastMoveStr = 'None (Opening position)';
    if (game.history.length > 0) {
        const last = game.history[game.history.length - 1];
        const moveNumber = Math.ceil(game.history.length / 2);
        const prefix = last.color === 'w' ? `${moveNumber}.` : `${moveNumber}...`;
        lastMoveStr = `**${prefix} ${last.san}**`;
    }

    let ratingLine = '';
    if (game.ratingChanges) {
        const wSign = game.ratingChanges.whiteDelta >= 0 ? '+' : '';
        const bSign = game.ratingChanges.blackDelta >= 0 ? '+' : '';
        ratingLine = `\n**Rating Changes**: <@${game.whitePlayer.id}> \`${wSign}${game.ratingChanges.whiteDelta}\` • <@${game.blackPlayer.id}> \`${bSign}${game.ratingChanges.blackDelta}\``;
    }

    embed.setDescription(
        `\`\`\`\n${boardAscii}\n\`\`\`\n` +
            `**⚪ White**: <@${game.whitePlayer.id}>\n` +
            `**⚫ Black**: <@${game.blackPlayer.id}>\n` +
            `**Last Move**: ${lastMoveStr}\n` +
            `**Material Balance**: ${evalTag}\n` +
            `Captured by White: ${captured.whiteCaptured}\n` +
            `Captured by Black: ${captured.blackCaptured}` +
            ratingLine,
    );

    if (game.status === 'active') {
        embed.setFooter({
            text: `Type /chess move <notation> or !m <notation> • Click "Notation Guide" for help`,
        });
    }

    return embed;
}

function formatDrawReason(reason?: string): string {
    switch (reason) {
        case 'stalemate':
            return 'Stalemate - no legal moves';
        case 'threefold_repetition':
            return 'Threefold Repetition';
        case 'insufficient_material':
            return 'Insufficient Material';
        case 'fifty_moves':
            return '50-Move Rule';
        case 'mutual_draw':
            return 'Mutual Agreement';
        default:
            return 'Draw';
    }
}

/**
 * Generates an educational embed explaining Standard Algebraic Notation.
 */
export function getNotationGuideEmbed(): EmbedBuilder {
    return new EmbedBuilder()
        .setColor(Colors.Purple)
        .setTitle('📘 Standard Algebraic Notation (SAN) Guide')
        .setDescription(
            'In chess, moves are written using **Standard Algebraic Notation (SAN)**. Here is how to write your moves like a master!',
        )
        .addFields([
            {
                name: '1. Piece Letters',
                value:
                    '• **King**: `K` ♔\n' +
                    '• **Queen**: `Q` ♕\n' +
                    '• **Rook**: `R` ♖\n' +
                    '• **Bishop**: `B` ♗\n' +
                    '• **Knight**: `N` ♘ *(uses `N` because `K` is King!)*\n' +
                    '• **Pawn**: **NO letter!** Only write destination square (e.g. `e4`, `d5`).',
            },
            {
                name: '2. Basic Moves & Captures',
                value:
                    '• **Piece Move**: `<Piece><Square>` → `Nf3`, `Bc4`, `Qh5`\n' +
                    '• **Piece Capture**: `<Piece>x<Square>` → `Bxf7`, `Nxd4`\n' +
                    '• **Pawn Capture**: `<DepartureFile>x<Square>` → `exd5`, `cxd4` *(must state starting column)*',
            },
            {
                name: '3. Special Moves',
                value:
                    '• **Kingside Castle (Short)**: `O-O` *(capital letters O)*\n' +
                    '• **Queenside Castle (Long)**: `O-O-O`\n' +
                    '• **En Passant**: `exd6` *(pawn captures immediately after opponent pawn jumps 2 squares)*\n' +
                    '• **Pawn Promotion**: append `=<Piece>` → `e8=Q`, `a1=N`',
            },
            {
                name: '4. Checks, Checkmates & Disambiguation',
                value:
                    '• **Check**: `+` (e.g. `Qh5+`) *(bot accepts moves with or without `+`)*\n' +
                    '• **Checkmate**: `#` (e.g. `Qxf7#`)\n' +
                    '• **Disambiguation**: When 2 identical pieces can reach the same square, specify the starting file (e.g. `Nbd2`) or rank (e.g. `R1e2`).',
            },
        ])
        .setFooter({
            text: 'Komaru Bot Chess • Play using /chess move <notation> or !m <notation>',
        });
}

export function buildChallengeActionRow(gameId: string): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(`chess_accept_${gameId}`)
            .setLabel('Accept Match')
            .setEmoji('⚔️')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`chess_decline_${gameId}`)
            .setLabel('Decline')
            .setEmoji('🏳️')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('chess_guide')
            .setLabel('Notation Guide')
            .setEmoji('📘')
            .setStyle(ButtonStyle.Primary),
    );
}

export function buildActiveGameActionRow(gameId: string): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId('chess_guide')
            .setLabel('Notation Guide')
            .setEmoji('📘')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(`chess_moves_${gameId}`)
            .setLabel('Legal Moves')
            .setEmoji('💡')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId(`chess_draw_${gameId}`)
            .setLabel('Offer Draw')
            .setEmoji('🤝')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(`chess_resign_${gameId}`)
            .setLabel('Resign')
            .setEmoji('🏳️')
            .setStyle(ButtonStyle.Danger),
    );
}

export function buildDrawOfferActionRow(gameId: string): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(`chess_draw_accept_${gameId}`)
            .setLabel('Accept Draw')
            .setEmoji('🤝')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`chess_draw_decline_${gameId}`)
            .setLabel('Decline Draw')
            .setEmoji('❌')
            .setStyle(ButtonStyle.Secondary),
    );
}

export function buildLegalMovesEmbed(game: ChessGame, square?: string): EmbedBuilder {
    const chess = new Chess(game.fen);
    const moves = getLegalMovesList(chess, square);
    const isWhite = game.turn === 'w';
    const player = isWhite ? game.whitePlayer : game.blackPlayer;

    const embed = new EmbedBuilder()
        .setColor(Colors.Green)
        .setTitle(
            `💡 Legal Moves for ${player.displayName || player.username} (${isWhite ? 'White ♔' : 'Black ♚'})`,
        );

    if (square) {
        embed.setDescription(
            `Legal moves for piece at **${square.toLowerCase()}**:\n` +
                (moves.length > 0
                    ? moves.map((m) => `\`${m}\``).join(', ')
                    : 'No legal moves for this square.'),
        );
    } else {
        embed.setDescription(
            `Total legal moves available: **${moves.length}**\n\n` +
                (moves.length > 0
                    ? moves.map((m) => `\`${m}\``).join(', ')
                    : 'No legal moves available.') +
                `\n\n*Type \`/chess move <notation>\` or \`!m <notation>\` to play!*`,
        );
    }

    return embed;
}
