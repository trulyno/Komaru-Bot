import assert from 'node:assert';
import { commandRegistry } from '../src/commandRegistry';
import gregTowerModule from '../src/modules/gregTower';
import {
    buildGregTowerLeaderboardEmbed,
    buildLobbyActionRow,
    buildLobbyEmbed,
    buildLoginActionRow,
    buildLoginEmbed,
    createGregTowerLobby,
    fetchGregTowerLeaderboard,
    GregTowerApiError,
    issueLoginCode,
    resetGregTowerApiConfig,
    setGregTowerApiConfigForTesting,
} from '../src/services/gregTowerService';
import { runTestCase } from './testHarness';

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

function createMockInteraction(overrides: {
    userId?: string;
    username?: string;
    strings?: Record<string, string>;
    booleans?: Record<string, boolean>;
    integers?: Record<string, number>;
}) {
    let replyPayload: any = null;
    let deferOptions: any = null;
    let editReplyPayload: any = null;

    const interaction = {
        user: {
            id: overrides.userId ?? '123456789012345678',
            username: overrides.username ?? 'trulyno',
        },
        options: {
            getString: (name: string) => overrides.strings?.[name] ?? null,
            getBoolean: (name: string) => overrides.booleans?.[name] ?? null,
            getInteger: (name: string) => overrides.integers?.[name] ?? null,
        },
        reply: async (payload: any) => {
            replyPayload = payload;
        },
        deferReply: async (opts?: any) => {
            deferOptions = opts ?? {};
        },
        editReply: async (payload: any) => {
            editReplyPayload = payload;
        },
    };

    return {
        interaction,
        getReply: () => replyPayload,
        getDeferOptions: () => deferOptions,
        getEditReply: () => editReplyPayload,
    };
}

async function runSuite(): Promise<void> {
    try {
        await runTestCase('module registers /login and /gregtower commands', async () => {
            await gregTowerModule.register({});

            assert.ok(commandRegistry.get('login'), 'login command should be registered');
            assert.ok(commandRegistry.get('gregtower'), 'gregtower command should be registered');
        });

        await runTestCase('issueLoginCode posts to /bot/auth/code with Bearer token', async () => {
            let capturedUrl = '';
            let capturedAuth: string | undefined;
            let capturedBody: any;

            setGregTowerApiConfigForTesting({
                baseUrl: 'https://games.trulyno.dev/api/v1',
                apiKey: 'secret-bot-key',
                loginTtlSeconds: 600,
                fetchImpl: createMockFetch((url, init) => {
                    capturedUrl = url;
                    const headers = init?.headers as Record<string, string> | undefined;
                    capturedAuth = headers?.Authorization;
                    capturedBody = init?.body ? JSON.parse(String(init.body)) : null;
                    return {
                        status: 201,
                        body: {
                            code: 'A7K9M2P4Q8',
                            username: 'trulyno',
                            externalId: '123456789012345678',
                            expiresAt: '2026-11-26T12:40:00.000Z',
                            loginUrl: 'https://games.trulyno.dev/gregtower?loginCode=A7K9M2P4Q8',
                        },
                    };
                }),
            });

            const res = await issueLoginCode({
                username: 'trulyno',
                externalId: '123456789012345678',
            });

            assert.strictEqual(capturedUrl, 'https://games.trulyno.dev/api/v1/bot/auth/code');
            assert.strictEqual(capturedAuth, 'Bearer secret-bot-key');
            assert.strictEqual(capturedBody.username, 'trulyno');
            assert.strictEqual(capturedBody.externalId, '123456789012345678');
            assert.strictEqual(capturedBody.ttlSeconds, 600);
            assert.strictEqual(res.code, 'A7K9M2P4Q8');
            assert.strictEqual(
                res.loginUrl,
                'https://games.trulyno.dev/gregtower?loginCode=A7K9M2P4Q8',
            );

            const embed = buildLoginEmbed(res);
            assert.strictEqual(embed.data.title, 'GregTower Login Code');
            assert.ok(embed.data.fields?.some((f) => f.value.includes('A7K9M2P4Q8')));

            const row = buildLoginActionRow(res.loginUrl);
            assert.strictEqual(row.components.length, 1);
        });

        await runTestCase('/login handler replies ephemerally with code and link', async () => {
            setGregTowerApiConfigForTesting({
                baseUrl: 'https://games.trulyno.dev/api/v1',
                apiKey: 'secret-bot-key',
                fetchImpl: createMockFetch(() => ({
                    status: 201,
                    body: {
                        code: 'B8L3N5Q7R2',
                        username: 'trulyno',
                        externalId: '123456789012345678',
                        expiresAt: '2026-11-26T12:40:00.000Z',
                        loginUrl: 'https://games.trulyno.dev/gregtower?loginCode=B8L3N5Q7R2',
                    },
                })),
            });

            const cmd = commandRegistry.get('login');
            assert.ok(cmd);

            const mock = createMockInteraction({});
            await cmd.handler(mock.interaction);

            assert.strictEqual(mock.getDeferOptions()?.ephemeral, true);
            const reply = mock.getEditReply();
            assert.ok(reply?.embeds?.length === 1);
            assert.ok(reply?.components?.length === 1);
        });

        await runTestCase('/login returns clear ephemeral error when API key missing', async () => {
            setGregTowerApiConfigForTesting({
                baseUrl: 'https://games.trulyno.dev/api/v1',
                apiKey: '',
            });

            const cmd = commandRegistry.get('login');
            assert.ok(cmd);

            const mock = createMockInteraction({});
            await cmd.handler(mock.interaction);

            const reply = mock.getReply();
            assert.strictEqual(reply?.ephemeral, true);
            assert.ok(String(reply?.content).includes('API key is not configured'));
        });

        await runTestCase('issueLoginCode throws GregTowerApiError on HTTP 403', async () => {
            setGregTowerApiConfigForTesting({
                baseUrl: 'https://games.trulyno.dev/api/v1',
                apiKey: 'wrong-key',
                fetchImpl: createMockFetch(() => ({
                    status: 403,
                    body: { error: 'Invalid token' },
                })),
            });

            await assert.rejects(
                () =>
                    issueLoginCode({
                        username: 'trulyno',
                        externalId: '123456789012345678',
                    }),
                (err: unknown) =>
                    err instanceof GregTowerApiError &&
                    err.status === 403 &&
                    err.message === 'Invalid token',
            );
        });

        await runTestCase('createGregTowerLobby and /gregtower lobby action work', async () => {
            let capturedBody: any;
            setGregTowerApiConfigForTesting({
                baseUrl: 'https://games.trulyno.dev/api/v1',
                apiKey: 'secret-bot-key',
                fetchImpl: createMockFetch((url, init) => {
                    assert.strictEqual(
                        url,
                        'https://games.trulyno.dev/api/v1/bot/gregtower/lobbies',
                    );
                    capturedBody = init?.body ? JSON.parse(String(init.body)) : null;
                    return {
                        status: 201,
                        body: {
                            lobbyId: 'K9M2P4',
                            name: 'ZPM Raid Squad',
                            isPrivate: true,
                            joinPath: '/gregtower/K9M2P4',
                            joinUrl: 'https://games.trulyno.dev/gregtower/K9M2P4',
                            createdAt: '2026-11-26T12:30:00.000Z',
                        },
                    };
                }),
            });

            const lobby = await createGregTowerLobby({
                name: 'ZPM Raid Squad',
                isPrivate: true,
            });
            assert.strictEqual(capturedBody.name, 'ZPM Raid Squad');
            assert.strictEqual(capturedBody.isPrivate, true);
            assert.strictEqual(lobby.lobbyId, 'K9M2P4');

            const embed = buildLobbyEmbed(lobby, 'trulyno');
            assert.ok(embed.data.title?.includes('ZPM Raid Squad'));
            assert.strictEqual(buildLobbyActionRow(lobby.joinUrl).components.length, 1);

            const cmd = commandRegistry.get('gregtower');
            assert.ok(cmd);
            const mock = createMockInteraction({
                strings: { action: 'lobby', name: 'ZPM Raid Squad' },
                booleans: { private: true },
            });
            await cmd.handler(mock.interaction);
            assert.strictEqual(mock.getDeferOptions()?.ephemeral, true);
            assert.ok(mock.getEditReply()?.embeds?.length === 1);
        });

        await runTestCase('fetchGregTowerLeaderboard and embed formatting work', async () => {
            setGregTowerApiConfigForTesting({
                baseUrl: 'https://games.trulyno.dev/api/v1',
                apiKey: '',
                fetchImpl: createMockFetch((url, init) => {
                    assert.strictEqual(
                        url,
                        'https://games.trulyno.dev/api/v1/gregtower/leaderboard',
                    );
                    const headers = init?.headers as Record<string, string> | undefined;
                    assert.strictEqual(headers?.Authorization, undefined);
                    return {
                        status: 200,
                        body: {
                            leaderboard: [
                                { username: 'trulyno', floor: 42, score: 9001 },
                                { players: ['Alice', 'Bob'], floor: 30, durationSeconds: 615 },
                            ],
                        },
                    };
                }),
            });

            const entries = await fetchGregTowerLeaderboard();
            assert.strictEqual(entries.length, 2);

            const embed = buildGregTowerLeaderboardEmbed(entries, 10);
            assert.strictEqual(embed.data.title, 'GregTower Hall of Fame');
            assert.ok(embed.data.description?.includes('trulyno'));
            assert.ok(embed.data.description?.includes('Floor 42'));
            assert.ok(embed.data.description?.includes('Alice, Bob'));
            assert.ok(embed.data.description?.includes('10m 15s'));
        });
    } finally {
        resetGregTowerApiConfig();
    }
}

runSuite().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
