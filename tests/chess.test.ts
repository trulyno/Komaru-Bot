import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { commandRegistry } from '../src/commandRegistry';
import chessModule from '../src/modules/chess';
import {
    acceptPendingChallenge,
    buildActiveMatchesEmbed,
    buildChallengeActionRow,
    buildChallengeEmbed,
    buildGameActionRow,
    buildGameStartedEmbed,
    buildLeaderboardEmbed,
    buildMatchEndedEmbed,
    buildMatchStatusEmbed,
    buildPlayerStatsEmbed,
    cancelPendingChallenge,
    clearChannelChallenges,
    createPendingChallenge,
    declinePendingChallenge,
    fetchLeaderboard,
    fetchMatchStatus,
    fetchPlayerStats,
    getLatestMatchForUser,
    getPendingChallengeForUser,
    getPlayerCodeForMatch,
    getTrackedMatchById,
    pollAndAnnounceEndedMatches,
    resetChessApiConfig,
    resetChessDataDir,
    resolveMatchResult,
    setChessApiConfigForTesting,
    setChessDataDirForTesting,
} from '../src/services/chessService';
import { runTestCase } from './testHarness';

const testDataDir = path.resolve(__dirname, '../data/test_chess');

function createMockFetch(
    handler: (url: string, init?: RequestInit) => { status?: number; body: unknown },
): typeof fetch {
    return (async (input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        const res = handler(url, init);
        const status = res.status ?? 200;
        return new Response(JSON.stringify(res.body), {
            status,
            headers: { 'Content-Type': 'application/json' },
        });
    }) as typeof fetch;
}

async function runSuite(): Promise<void> {
    if (fs.existsSync(testDataDir)) {
        fs.rmSync(testDataDir, { recursive: true, force: true });
    }
    setChessDataDirForTesting(testDataDir);

    try {
        await runTestCase(
            'module registers /challenge, /accept, /chess, /chess_mod, stats & leaderboard',
            async () => {
                const mockClient = {
                    on: () => {},
                };
                await chessModule.register(mockClient);

                assert.ok(
                    commandRegistry.get('challenge'),
                    'challenge command should be registered',
                );
                assert.ok(commandRegistry.get('accept'), 'accept command should be registered');
                assert.ok(commandRegistry.get('chess'), 'chess command should be registered');
                assert.ok(
                    commandRegistry.get('chess_stats'),
                    'chess_stats command should be registered',
                );
                assert.ok(
                    commandRegistry.get('chess_leaderboard'),
                    'chess_leaderboard command should be registered',
                );
                assert.ok(
                    commandRegistry.get('chess_mod'),
                    'chess_mod command should be registered',
                );
            },
        );

        await runTestCase('challenge creation, decline, cancel, and clear', async () => {
            const alice = { id: 'u1', username: 'alice', displayName: 'Alice' };
            const bob = { id: 'u2', username: 'bob', displayName: 'Bob' };

            const selfRes = createPendingChallenge('g1', 'c1', alice, alice);
            assert.strictEqual(selfRes.success, false);

            const created = createPendingChallenge('g1', 'c1', alice, bob, 'white');
            assert.strictEqual(created.success, true);
            assert.ok(created.challenge);

            const dup = createPendingChallenge('g1', 'c1', alice, bob);
            assert.strictEqual(dup.success, false);

            const found = getPendingChallengeForUser('c1', 'u2');
            assert.strictEqual(found?.id, created.challenge.id);

            const embed = buildChallengeEmbed(created.challenge);
            const row = buildChallengeActionRow(created.challenge.id);
            assert.ok(embed.data.title?.includes('Chess Challenge'));
            assert.strictEqual(row.components.length, 3);

            // Wrong user cannot decline
            const wrongDecline = declinePendingChallenge(created.challenge.id, 'u1');
            assert.strictEqual(wrongDecline.success, false);

            // Opponent declines
            const declined = declinePendingChallenge(created.challenge.id, 'u2');
            assert.strictEqual(declined.success, true);

            // Create again and challenger cancels
            const created2 = createPendingChallenge('g1', 'c1', alice, bob, 'random');
            assert.ok(created2.challenge);
            const wrongCancel = cancelPendingChallenge(created2.challenge.id, 'u2');
            assert.strictEqual(wrongCancel.success, false);
            const cancelled = cancelPendingChallenge(created2.challenge.id, 'u1');
            assert.strictEqual(cancelled.success, true);

            // Clear channel
            createPendingChallenge('g1', 'c1', alice, bob);
            assert.strictEqual(clearChannelChallenges('c1'), 1);
        });

        await runTestCase(
            'accepting challenge calls POST /games/start and distributes codes',
            async () => {
                let capturedAuth: string | undefined;
                let capturedBody: any;

                setChessApiConfigForTesting({
                    baseUrl: 'https://games.trulyno.dev/api/v1',
                    apiKey: 'test-secret-key',
                    fetchImpl: createMockFetch((url, init) => {
                        if (url.endsWith('/games/start')) {
                            const headers = init?.headers as Record<string, string>;
                            capturedAuth = headers?.Authorization;
                            capturedBody = JSON.parse(String(init?.body || '{}'));
                            return {
                                status: 201,
                                body: {
                                    matchId: 'k9Xp2_mQ8vR1aB4c',
                                    game: 'chess',
                                    status: 'waiting',
                                    gameUrl:
                                        'https://games.trulyno.dev/game/chess/k9Xp2_mQ8vR1aB4c',
                                    spectateUrl:
                                        'https://games.trulyno.dev/spectate/chess/k9Xp2_mQ8vR1aB4c',
                                    players: {
                                        white: {
                                            playerId: 'A7K9M2P4Q8R3',
                                            code: 'A7K9M2P4Q8R3',
                                            username: 'alice',
                                            elo: 1200,
                                            url: 'https://games.trulyno.dev/play/chess/k9Xp2_mQ8vR1aB4c/A7K9M2P4Q8R3',
                                        },
                                        black: {
                                            playerId: 'B4N6P8T2W5Y9',
                                            code: 'B4N6P8T2W5Y9',
                                            username: 'bob',
                                            elo: 1220,
                                            url: 'https://games.trulyno.dev/play/chess/k9Xp2_mQ8vR1aB4c/B4N6P8T2W5Y9',
                                        },
                                    },
                                    createdAt: '2026-11-20T12:00:00.000Z',
                                },
                            };
                        }
                        return { status: 404, body: { error: 'Not found' } };
                    }),
                });

                const alice = { id: 'u10', username: 'alice', displayName: 'Alice' };
                const bob = { id: 'u20', username: 'bob', displayName: 'Bob' };
                const c = createPendingChallenge('g2', 'c2', alice, bob, 'white');
                assert.ok(c.challenge);

                const accepted = await acceptPendingChallenge(c.challenge.id, 'u20');
                assert.strictEqual(accepted.success, true);
                assert.strictEqual(capturedAuth, 'Bearer test-secret-key');
                assert.strictEqual(capturedBody.assignColors, 'ordered');
                assert.strictEqual(accepted.match?.matchId, 'k9Xp2_mQ8vR1aB4c');
                assert.strictEqual(accepted.match?.white.userId, 'u10');
                assert.strictEqual(accepted.match?.black.userId, 'u20');

                // Both players can retrieve their own auth codes
                const whiteCode = await getPlayerCodeForMatch('k9Xp2_mQ8vR1aB4c', 'u10');
                assert.strictEqual(whiteCode.success, true);
                assert.strictEqual(whiteCode.side, 'white');
                assert.strictEqual(whiteCode.code, 'A7K9M2P4Q8R3');

                const blackCode = await getPlayerCodeForMatch('k9Xp2_mQ8vR1aB4c', 'u20');
                assert.strictEqual(blackCode.success, true);
                assert.strictEqual(blackCode.side, 'black');
                assert.strictEqual(blackCode.code, 'B4N6P8T2W5Y9');

                // Non-player cannot retrieve code
                const outsider = await getPlayerCodeForMatch('k9Xp2_mQ8vR1aB4c', 'u99');
                assert.strictEqual(outsider.success, false);

                // Latest match lookup
                const latest = getLatestMatchForUser('g2', 'u10', 'c2');
                assert.strictEqual(latest?.matchId, 'k9Xp2_mQ8vR1aB4c');

                const startedEmbed = buildGameStartedEmbed(accepted.match!, accepted.startResponse);
                const actionRow = buildGameActionRow(
                    accepted.match!.matchId,
                    accepted.match!.gameUrl,
                    accepted.match!.spectateUrl,
                );
                assert.ok(startedEmbed.data.url?.includes('k9Xp2_mQ8vR1aB4c'));
                assert.strictEqual(actionRow.components.length, 3);
            },
        );

        await runTestCase(
            'polling detects finished match, announces once, and skips thereafter',
            async () => {
                const sentMessages: any[] = [];
                const mockClient = {
                    channels: {
                        fetch: async (_channelId: string) => ({
                            send: async (payload: any) => {
                                sentMessages.push(payload);
                            },
                        }),
                    },
                };

                setChessApiConfigForTesting({
                    baseUrl: 'https://games.trulyno.dev/api/v1',
                    apiKey: 'test-secret-key',
                    fetchImpl: createMockFetch((url) => {
                        if (url.includes('/bot/matches')) {
                            return {
                                status: 200,
                                body: {
                                    matches: [
                                        {
                                            matchId: 'k9Xp2_mQ8vR1aB4c',
                                            game: 'chess',
                                            status: 'finished',
                                            players: {
                                                white: {
                                                    username: 'alice',
                                                    eloBefore: 1200,
                                                    eloAfter: 1216,
                                                },
                                                black: {
                                                    username: 'bob',
                                                    eloBefore: 1220,
                                                    eloAfter: 1204,
                                                },
                                            },
                                            state: { moveCount: 34 },
                                            result: { winner: 'white', reason: 'checkmate' },
                                            gameUrl:
                                                'https://games.trulyno.dev/game/chess/k9Xp2_mQ8vR1aB4c',
                                            spectateUrl:
                                                'https://games.trulyno.dev/spectate/chess/k9Xp2_mQ8vR1aB4c',
                                            createdAt: '2026-11-20T12:00:00.000Z',
                                            endedAt: '2026-11-20T12:25:00.000Z',
                                        },
                                    ],
                                },
                            };
                        }
                        return { status: 404, body: { error: 'Not found' } };
                    }),
                });

                const announced1 = await pollAndAnnounceEndedMatches(mockClient);
                assert.strictEqual(announced1, 1);
                assert.strictEqual(sentMessages.length, 1);
                assert.ok(sentMessages[0].content.includes('k9Xp2_mQ8vR1aB4c'));

                const tracked = getTrackedMatchById('k9Xp2_mQ8vR1aB4c');
                assert.strictEqual(tracked?.status, 'finished');
                assert.strictEqual(tracked?.announcedEnd, true);

                // Second poll should not re-announce
                const announced2 = await pollAndAnnounceEndedMatches(mockClient);
                assert.strictEqual(announced2, 0);
                assert.strictEqual(sentMessages.length, 1);
            },
        );

        await runTestCase(
            'querying match status, leaderboard, stats, and moderation result',
            async () => {
                let postedResultBody: any;

                setChessApiConfigForTesting({
                    baseUrl: 'https://games.trulyno.dev/api/v1',
                    apiKey: 'test-secret-key',
                    fetchImpl: createMockFetch((url, init) => {
                        if (url.endsWith('/games/match_mod_1/result')) {
                            postedResultBody = JSON.parse(String(init?.body || '{}'));
                            return {
                                status: 200,
                                body: {
                                    matchId: 'match_mod_1',
                                    game: 'chess',
                                    status: 'aborted',
                                    players: {
                                        white: {
                                            username: 'alice',
                                            eloBefore: 1200,
                                            eloAfter: 1200,
                                        },
                                        black: { username: 'bob', eloBefore: 1200, eloAfter: 1200 },
                                    },
                                    result: { winner: 'abort', reason: 'timeout' },
                                    gameUrl: 'https://games.trulyno.dev/game/chess/match_mod_1',
                                    spectateUrl:
                                        'https://games.trulyno.dev/spectate/chess/match_mod_1',
                                    createdAt: '2026-11-20T12:00:00.000Z',
                                    endedAt: '2026-11-20T12:10:00.000Z',
                                },
                            };
                        }
                        if (url.endsWith('/games/k9Xp2_mQ8vR1aB4c')) {
                            return {
                                status: 200,
                                body: {
                                    matchId: 'k9Xp2_mQ8vR1aB4c',
                                    game: 'chess',
                                    status: 'active',
                                    players: {
                                        white: { username: 'alice', elo: 1200 },
                                        black: { username: 'bob', elo: 1220 },
                                    },
                                    state: {
                                        pgn: '1. e4 e5',
                                        moveCount: 2,
                                        turn: 'w',
                                        inCheck: false,
                                        lastMove: {
                                            from: 'e7',
                                            to: 'e5',
                                            san: 'e5',
                                            piece: 'p',
                                            color: 'b',
                                        },
                                    },
                                    gameUrl:
                                        'https://games.trulyno.dev/game/chess/k9Xp2_mQ8vR1aB4c',
                                    spectateUrl:
                                        'https://games.trulyno.dev/spectate/chess/k9Xp2_mQ8vR1aB4c',
                                    createdAt: '2026-11-20T12:00:00.000Z',
                                },
                            };
                        }
                        if (url.includes('/games/chess/leaderboard')) {
                            return {
                                status: 200,
                                body: {
                                    leaderboard: [
                                        {
                                            username: 'alice',
                                            elo: 1250,
                                            wins: 5,
                                            losses: 1,
                                            draws: 0,
                                        },
                                        {
                                            username: 'bob',
                                            elo: 1180,
                                            wins: 2,
                                            losses: 4,
                                            draws: 1,
                                        },
                                    ],
                                },
                            };
                        }
                        if (url.includes('/games/chess/players/alice/stats')) {
                            return {
                                status: 200,
                                body: {
                                    username: 'alice',
                                    elo: 1250,
                                    peakElo: 1265,
                                    gamesPlayed: 6,
                                    wins: 5,
                                    losses: 1,
                                    draws: 0,
                                    currentStreak: 3,
                                    bestStreak: 4,
                                },
                            };
                        }
                        return { status: 404, body: { error: 'Not found' } };
                    }),
                });

                const status = await fetchMatchStatus('k9Xp2_mQ8vR1aB4c');
                const statusEmbed = buildMatchStatusEmbed(status);
                assert.ok(statusEmbed.data.title?.includes('k9Xp2_mQ8vR1aB4c'));

                const lb = await fetchLeaderboard(5);
                assert.strictEqual(lb.length, 2);
                const lbEmbed = buildLeaderboardEmbed(lb);
                assert.ok(lbEmbed.data.description?.includes('alice'));

                const stats = await fetchPlayerStats('alice');
                const statsEmbed = buildPlayerStatsEmbed(stats);
                assert.ok(statsEmbed.data.title?.includes('alice'));

                const activeEmbed = buildActiveMatchesEmbed([status]);
                assert.ok(activeEmbed.data.description?.includes('k9Xp2_mQ8vR1aB4c'));

                const modRes = await resolveMatchResult('match_mod_1', {
                    winner: 'abort',
                    reason: 'timeout',
                });
                assert.strictEqual(postedResultBody.winner, 'abort');
                assert.strictEqual(postedResultBody.reason, 'timeout');
                const endedEmbed = buildMatchEndedEmbed(modRes);
                assert.ok(endedEmbed.data.title?.includes('Aborted'));
            },
        );
    } finally {
        resetChessApiConfig();
        resetChessDataDir();
        if (fs.existsSync(testDataDir)) {
            fs.rmSync(testDataDir, { recursive: true, force: true });
        }
    }
}

runSuite()
    .then(() => {
        console.log('Chess test suite completed successfully.');
    })
    .catch((err) => {
        console.error('Chess test suite failed:', err);
        process.exit(1);
    });
