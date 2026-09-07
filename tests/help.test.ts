import assert from 'node:assert';
import path from 'node:path';
import { moduleLoader, ModuleHelp } from '../src/moduleLoader';
import { commandRegistry } from '../src/commandRegistry';
import helpModule from '../src/modules/help';
import { config } from '../src/config';
import { runTestCase } from './testHarness';

async function runHelpTests(): Promise<void> {
    await moduleLoader.loadAll();

    await runTestCase('moduleLoader discovers all modules with help metadata', async () => {
        const modules = moduleLoader.getAllModules();
        assert.ok(modules.length >= 10, 'Should discover all modules');

        const chess = moduleLoader.getModule('chess');
        assert.ok(chess, 'chess module should exist');
        assert.ok(chess.help, 'chess module should have help metadata');

        const calc = moduleLoader.getModule('calculator');
        assert.ok(calc, 'calculator module should exist');
        assert.ok(calc.help, 'calculator module should have help metadata');
    });

    await runTestCase('getModuleHelp returns structured help object', async () => {
        const chessHelp = (await moduleLoader.getModuleHelp('chess')) as ModuleHelp;
        assert.ok(chessHelp, 'Chess help should exist');
        assert.ok(chessHelp.summary, 'Should have summary');
        assert.ok(chessHelp.commands && chessHelp.commands.length > 0, 'Should list commands');
        assert.ok(chessHelp.examples && chessHelp.examples.length > 0, 'Should list examples');

        const foundCmd = chessHelp.commands?.find((c) => c.name === 'chess');
        assert.ok(foundCmd, 'Should include /chess command in help');
    });

    await runTestCase('help module registration and interaction handling', async () => {
        await helpModule.register({} as any, moduleLoader.createContext({} as any));

        const helpCmd = commandRegistry.get('help');
        assert.ok(helpCmd, 'help command should be registered');
        assert.strictEqual(helpCmd.name, 'help');
        assert.strictEqual(helpCmd.options?.[0]?.name, 'module');

        let repliedPayload: any = null;
        const mockInteractionGeneral = {
            guildId: 'guild_help_test',
            channelId: 'chan_help_test',
            options: {
                getString: (name: string) => null,
            },
            reply: async (payload: any) => {
                repliedPayload = payload;
            },
        };

        await helpCmd.handler(mockInteractionGeneral);
        assert.ok(repliedPayload, 'Should reply to general help');
        assert.ok(repliedPayload.embeds && repliedPayload.embeds.length > 0);
        const embedData = repliedPayload.embeds[0].data;
        assert.strictEqual(embedData.title, 'Komaru the Cat — Modules & Help');
        const allFieldValues = embedData.fields.map((f: any) => f.value).join('\n');
        assert.ok(allFieldValues.includes('chess'));
        assert.ok(allFieldValues.includes('calculator'));
    });

    await runTestCase('help command with specific module argument', async () => {
        const helpCmd = commandRegistry.get('help');
        assert.ok(helpCmd);

        let repliedPayload: any = null;
        const mockInteractionSpecific = {
            guildId: 'guild_help_test',
            channelId: 'chan_help_test',
            options: {
                getString: (name: string) => 'chess',
            },
            reply: async (payload: any) => {
                repliedPayload = payload;
            },
        };

        await helpCmd.handler(mockInteractionSpecific);
        assert.ok(repliedPayload);
        const embedData = repliedPayload.embeds[0].data;
        assert.strictEqual(embedData.title, 'Module Help: chess');
        assert.ok(embedData.description.includes('🟢 Enabled'));

        // Test with disabled module
        config.modules.disableModuleInGuild('guild_help_test', 'chess');
        await helpCmd.handler(mockInteractionSpecific);
        const embedDataDisabled = repliedPayload.embeds[0].data;
        assert.ok(embedDataDisabled.description.includes('🔴 Disabled (Server-wide)'));

        // Cleanup
        config.modules.enableModuleInGuild('guild_help_test', 'chess');
    });

    await runTestCase('help command with non-existent module argument', async () => {
        const helpCmd = commandRegistry.get('help');
        assert.ok(helpCmd);

        let repliedPayload: any = null;
        const mockInteractionUnknown = {
            guildId: 'guild_help_test',
            channelId: 'chan_help_test',
            options: {
                getString: (name: string) => 'nonexistent_module_xyz',
            },
            reply: async (payload: any) => {
                repliedPayload = payload;
            },
        };

        await helpCmd.handler(mockInteractionUnknown);
        assert.ok(repliedPayload);
        assert.strictEqual(repliedPayload.ephemeral, true);
        assert.ok(repliedPayload.content.includes('nonexistent_module_xyz'));
        assert.ok(repliedPayload.content.includes('Available modules:'));
    });
}

runHelpTests().catch((err) => {
    console.error(err);
    process.exit(1);
});
