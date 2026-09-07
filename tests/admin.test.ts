import assert from 'node:assert';
import path from 'node:path';
import adminModule from '../src/modules/admin';
import { commandRegistry } from '../src/commandRegistry';
import { cleanAndSyncCommands } from '../src/commandHandlers';
import { config } from '../src/config';
import { moduleLoader } from '../src/moduleLoader';
import { runTestCase } from './testHarness';

async function runAdminTests(): Promise<void> {
    await moduleLoader.loadAll();

    await runTestCase('admin module command registration', async () => {
        const mockClient = { user: { id: 'mock_client_123' } };
        await adminModule.register(mockClient, moduleLoader.createContext(mockClient));

        const cleanCmd = commandRegistry.get('cleancommands');
        assert.ok(cleanCmd, 'cleancommands should be registered in commandRegistry');
        assert.strictEqual(cleanCmd.name, 'cleancommands');

        const syncCmd = commandRegistry.get('synccommands');
        assert.ok(syncCmd, 'synccommands should be registered');

        const enableCmd = commandRegistry.get('module_enable');
        assert.ok(enableCmd, 'module_enable should be registered');

        const disableCmd = commandRegistry.get('module_disable');
        assert.ok(disableCmd, 'module_disable should be registered');

        const channelDisableCmd = commandRegistry.get('module_channel_disable');
        assert.ok(channelDisableCmd, 'module_channel_disable should be registered');

        const channelEnableCmd = commandRegistry.get('module_channel_enable');
        assert.ok(channelEnableCmd, 'module_channel_enable should be registered');

        const statusCmd = commandRegistry.get('module_status');
        assert.ok(statusCmd, 'module_status should be registered');

        const listCmd = commandRegistry.get('module_list');
        assert.ok(listCmd, 'module_list should be registered');
    });

    await runTestCase('admin module_enable and module_disable execution', async () => {
        const disableCmd = commandRegistry.get('module_disable');
        const enableCmd = commandRegistry.get('module_enable');
        assert.ok(disableCmd && enableCmd);

        let replyMessage = '';
        const mockAdminInteraction = {
            guildId: 'guild_admin_test',
            channelId: 'chan_admin_test',
            user: { id: 'admin_user_1' },
            memberPermissions: {
                has: (perm: string) => perm === 'Administrator',
            },
            options: {
                getString: (name: string) => 'chess',
            },
            reply: async (payload: any) => {
                replyMessage = payload.content || '';
            },
        };

        // Disable chess
        await disableCmd.handler(mockAdminInteraction);
        assert.ok(replyMessage.includes('disabled'));
        assert.strictEqual(config.modules.isModuleEnabled('chess', 'guild_admin_test'), false);

        // Try disabling admin (should be blocked)
        mockAdminInteraction.options.getString = () => 'admin';
        await disableCmd.handler(mockAdminInteraction);
        assert.ok(replyMessage.includes('cannot be disabled'));

        // Re-enable chess
        mockAdminInteraction.options.getString = () => 'chess';
        await enableCmd.handler(mockAdminInteraction);
        assert.ok(replyMessage.includes('enabled'));
        assert.strictEqual(config.modules.isModuleEnabled('chess', 'guild_admin_test'), true);
    });

    await runTestCase('admin channel disable and enable execution', async () => {
        const channelDisableCmd = commandRegistry.get('module_channel_disable');
        const channelEnableCmd = commandRegistry.get('module_channel_enable');
        assert.ok(channelDisableCmd && channelEnableCmd);

        let replyMessage = '';
        const mockAdminInteraction = {
            guildId: 'guild_admin_test',
            channelId: 'chan_admin_test',
            user: { id: 'admin_user_1' },
            memberPermissions: {
                has: (perm: string) => perm === 'Administrator',
            },
            options: {
                getString: (name: string) => 'calculator',
                getChannel: (name: string) => ({ id: 'chan_special', name: 'special-channel' }),
            },
            reply: async (payload: any) => {
                replyMessage = payload.content || '';
            },
        };

        // Disable in channel
        await channelDisableCmd.handler(mockAdminInteraction);
        assert.ok(replyMessage.includes('disabled'));
        assert.strictEqual(
            config.modules.isModuleEnabled('calculator', 'guild_admin_test', 'chan_special'),
            false,
        );
        assert.strictEqual(
            config.modules.isModuleEnabled('calculator', 'guild_admin_test', 'chan_other'),
            true,
        );

        // Re-enable in channel
        await channelEnableCmd.handler(mockAdminInteraction);
        assert.ok(replyMessage.includes('re-enabled'));
        assert.strictEqual(
            config.modules.isModuleEnabled('calculator', 'guild_admin_test', 'chan_special'),
            true,
        );
    });

    await runTestCase('admin permission check blocks non-admins', async () => {
        const disableCmd = commandRegistry.get('module_disable');
        assert.ok(disableCmd);

        let replyMessage = '';
        const mockNonAdminInteraction = {
            guildId: 'guild_admin_test',
            channelId: 'chan_admin_test',
            user: { id: 'regular_user' },
            memberPermissions: {
                has: () => false,
            },
            options: {
                getString: (name: string) => 'chess',
            },
            reply: async (payload: any) => {
                replyMessage = payload.content || '';
            },
        };

        await disableCmd.handler(mockNonAdminInteraction);
        assert.ok(replyMessage.includes('do not have permission'));
    });

    await runTestCase('cleanAndSyncCommands execution with mocked REST API', async () => {
        const puts: Array<{ route: string; body: any }> = [];

        const discordJs = require('discord.js');
        const originalPut = discordJs.REST.prototype.put;
        const originalSetToken = discordJs.REST.prototype.setToken;

        discordJs.REST.prototype.setToken = function () {
            return this;
        };
        discordJs.REST.prototype.put = async function (route: string, options: { body: any }) {
            puts.push({ route, body: options.body });
            return Promise.resolve();
        };

        try {
            await cleanAndSyncCommands('mock_token', '123456789', '987654321');

            assert.strictEqual(puts.length, 3);
            assert.deepStrictEqual(puts[0].body, []);
            assert.deepStrictEqual(puts[1].body, []);
            assert.ok(Array.isArray(puts[2].body));
            assert.strictEqual(puts[2].body.length, commandRegistry.getAll().length);
        } finally {
            discordJs.REST.prototype.put = originalPut;
            discordJs.REST.prototype.setToken = originalSetToken;
        }
    });

    await runTestCase('cleanAndSyncCommands without guildId', async () => {
        const puts: Array<{ route: string; body: any }> = [];

        const discordJs = require('discord.js');
        const originalPut = discordJs.REST.prototype.put;
        const originalSetToken = discordJs.REST.prototype.setToken;

        discordJs.REST.prototype.setToken = function () {
            return this;
        };
        discordJs.REST.prototype.put = async function (route: string, options: { body: any }) {
            puts.push({ route, body: options.body });
            return Promise.resolve();
        };

        try {
            await cleanAndSyncCommands('mock_token', '123456789');

            assert.strictEqual(puts.length, 2);
            assert.deepStrictEqual(puts[0].body, []);
            assert.ok(Array.isArray(puts[1].body));
            assert.strictEqual(puts[1].body.length, commandRegistry.getAll().length);
        } finally {
            discordJs.REST.prototype.put = originalPut;
            discordJs.REST.prototype.setToken = originalSetToken;
        }
    });
}

runAdminTests().catch((err) => {
    console.error(err);
    process.exit(1);
});
