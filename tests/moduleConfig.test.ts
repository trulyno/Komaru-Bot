import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { ModuleConfigService, UNBLOCKABLE_MODULES } from '../src/services/moduleConfigService';
import { config } from '../src/config';
import { runTestCase } from './testHarness';

const testConfigDir = path.resolve(__dirname, '../data/test_modules_config');
const testConfigFile = path.join(testConfigDir, 'modules_config.json');

function cleanupTestConfig(): void {
    if (fs.existsSync(testConfigFile)) {
        fs.unlinkSync(testConfigFile);
    }
    if (fs.existsSync(testConfigDir)) {
        fs.rmdirSync(testConfigDir, { recursive: true });
    }
}

async function runModuleConfigTests(): Promise<void> {
    await runTestCase('ModuleConfigService default enabled state', async () => {
        cleanupTestConfig();
        const service = new ModuleConfigService(testConfigFile);

        assert.strictEqual(service.isModuleEnabled('chess', 'guild123', 'chan456'), true);
        assert.strictEqual(service.isModuleEnabled('calculator', 'guild123'), true);
        assert.strictEqual(service.isModuleEnabled('admin', 'guild123'), true);
        assert.strictEqual(service.isModuleEnabled('help', 'guild123'), true);
    });

    await runTestCase('ModuleConfigService guild disable and enable', async () => {
        cleanupTestConfig();
        const service = new ModuleConfigService(testConfigFile);

        // Disable module in guild1
        const disabled = service.disableModuleInGuild('guild1', 'chess');
        assert.strictEqual(disabled, true);
        assert.strictEqual(service.isModuleEnabled('chess', 'guild1'), false);
        assert.strictEqual(service.isModuleEnabled('chess', 'guild1', 'chan1'), false);

        // Other guilds should remain enabled
        assert.strictEqual(service.isModuleEnabled('chess', 'guild2'), true);

        // Re-disabling returns false
        assert.strictEqual(service.disableModuleInGuild('guild1', 'chess'), false);

        // Re-enable module in guild1
        const enabled = service.enableModuleInGuild('guild1', 'chess');
        assert.strictEqual(enabled, true);
        assert.strictEqual(service.isModuleEnabled('chess', 'guild1'), true);
        assert.strictEqual(service.isModuleEnabled('chess', 'guild1', 'chan1'), true);

        // Re-enabling already enabled module returns false
        assert.strictEqual(service.enableModuleInGuild('guild1', 'chess'), false);
    });

    await runTestCase('ModuleConfigService channel disable and enable', async () => {
        cleanupTestConfig();
        const service = new ModuleConfigService(testConfigFile);

        // Disable module in chanA of guild1
        const disabled = service.disableModuleInChannel('guild1', 'chanA', 'calculator');
        assert.strictEqual(disabled, true);

        // Disabled in chanA
        assert.strictEqual(service.isModuleEnabled('calculator', 'guild1', 'chanA'), false);
        // Enabled in guild1 overall and in chanB
        assert.strictEqual(service.isModuleEnabled('calculator', 'guild1'), true);
        assert.strictEqual(service.isModuleEnabled('calculator', 'guild1', 'chanB'), true);

        // Re-enable in chanA
        const enabled = service.enableModuleInChannel('guild1', 'chanA', 'calculator');
        assert.strictEqual(enabled, true);
        assert.strictEqual(service.isModuleEnabled('calculator', 'guild1', 'chanA'), true);
    });

    await runTestCase('ModuleConfigService protects UNBLOCKABLE_MODULES', async () => {
        cleanupTestConfig();
        const service = new ModuleConfigService(testConfigFile);

        for (const mod of UNBLOCKABLE_MODULES) {
            assert.strictEqual(service.disableModuleInGuild('guild1', mod), false);
            assert.strictEqual(service.disableModuleInChannel('guild1', 'chan1', mod), false);
            assert.strictEqual(service.isModuleEnabled(mod, 'guild1', 'chan1'), true);
        }
    });

    await runTestCase('ModuleConfigService persistence and reload', async () => {
        cleanupTestConfig();
        const service1 = new ModuleConfigService(testConfigFile);
        service1.disableModuleInGuild('guild1', 'larpJar');
        service1.disableModuleInChannel('guild1', 'chanX', 'passTheTuna');

        // New service instance reading from disk
        const service2 = new ModuleConfigService(testConfigFile);
        assert.strictEqual(service2.isModuleEnabled('larpJar', 'guild1'), false);
        assert.strictEqual(service2.isModuleEnabled('passTheTuna', 'guild1', 'chanX'), false);
        assert.strictEqual(service2.isModuleEnabled('passTheTuna', 'guild1', 'chanY'), true);

        // Test reload method
        service1.enableModuleInGuild('guild1', 'larpJar');
        service2.reload();
        assert.strictEqual(service2.isModuleEnabled('larpJar', 'guild1'), true);
    });

    await runTestCase('ModuleConfigService guild config summaries', async () => {
        cleanupTestConfig();
        const service = new ModuleConfigService(testConfigFile);
        service.disableModuleInGuild('guild1', 'chess');
        service.disableModuleInGuild('guild1', 'calculator');
        service.disableModuleInChannel('guild1', 'chan1', 'tickets');

        const disabledGuild = service.getDisabledModulesForGuild('guild1');
        assert.deepStrictEqual(disabledGuild.sort(), ['calculator', 'chess']);

        const disabledChan = service.getDisabledModulesForChannel('guild1', 'chan1');
        assert.deepStrictEqual(disabledChan, ['tickets']);

        const fullConfig = service.getGuildConfig('guild1');
        assert.deepStrictEqual(fullConfig.disabledModules.sort(), ['calculator', 'chess']);
        assert.deepStrictEqual(fullConfig.channelDisabledModules, { chan1: ['tickets'] });

        service.resetGuildConfig('guild1');
        assert.strictEqual(service.isModuleEnabled('chess', 'guild1'), true);
    });

    await runTestCase('config.modules integration and reload', async () => {
        assert.ok(config.modules instanceof ModuleConfigService);
        config.reload();
        assert.ok(config.modules instanceof ModuleConfigService);
    });

    cleanupTestConfig();
}

runModuleConfigTests().catch((err) => {
    console.error(err);
    cleanupTestConfig();
    process.exit(1);
});
