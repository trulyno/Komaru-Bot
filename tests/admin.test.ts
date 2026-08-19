import assert from 'node:assert';
import adminModule from '../src/modules/admin';
import { commandRegistry } from '../src/commandRegistry';
import { cleanAndSyncCommands } from '../src/commandHandlers';
import { runTestCase } from './testHarness';

async function runAdminTests(): Promise<void> {
    runTestCase('admin module command registration', async () => {
        const mockClient = { user: { id: 'mock_client_123' } };
        await adminModule.register(mockClient);

        const cleanCmd = commandRegistry.get('cleancommands');
        assert.ok(cleanCmd, 'cleancommands should be registered in commandRegistry');
        assert.strictEqual(cleanCmd.name, 'cleancommands');
        assert.strictEqual(
            cleanCmd.description,
            'Clean all slash commands and re-register from command registry',
        );

        const syncCmd = commandRegistry.get('synccommands');
        assert.ok(syncCmd, 'synccommands should be registered');
    });

    runTestCase('cleanAndSyncCommands execution with mocked REST API', async () => {
        const puts: Array<{ route: string; body: any }> = [];

        const discordJs = require('discord.js');
        const OriginalREST = discordJs.REST;

        discordJs.REST = class MockREST {
            setToken() {
                return this;
            }
            async put(route: string, options: { body: any }) {
                puts.push({ route, body: options.body });
                return Promise.resolve();
            }
        };

        try {
            await cleanAndSyncCommands('mock_token', '123456789', '987654321');

            assert.strictEqual(puts.length, 3);
            assert.deepStrictEqual(puts[0].body, []);
            assert.deepStrictEqual(puts[1].body, []);
            assert.ok(Array.isArray(puts[2].body));
            assert.strictEqual(puts[2].body.length, commandRegistry.getAll().length);
        } finally {
            discordJs.REST = OriginalREST;
        }
    });

    runTestCase('cleanAndSyncCommands without guildId', async () => {
        const puts: Array<{ route: string; body: any }> = [];

        const discordJs = require('discord.js');
        const OriginalREST = discordJs.REST;

        discordJs.REST = class MockREST {
            setToken() {
                return this;
            }
            async put(route: string, options: { body: any }) {
                puts.push({ route, body: options.body });
                return Promise.resolve();
            }
        };

        try {
            await cleanAndSyncCommands('mock_token', '123456789');

            assert.strictEqual(puts.length, 2);
            assert.deepStrictEqual(puts[0].body, []);
            assert.ok(Array.isArray(puts[1].body));
            assert.strictEqual(puts[1].body.length, commandRegistry.getAll().length);
        } finally {
            discordJs.REST = OriginalREST;
        }
    });
}

runAdminTests().catch((err) => {
    console.error(err);
    process.exit(1);
});
