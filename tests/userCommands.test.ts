import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { ConfigStore } from '../src/userCommands/configStore';
import { evaluateCalc, interpolateString } from '../src/userCommands/evaluator';
import { parseUserCommand } from '../src/userCommands/parser';
import { QuotaManager } from '../src/userCommands/quotaManager';
import { UserCommandStorage } from '../src/userCommands/storage';
import { TriggerPool } from '../src/userCommands/triggerPool';
import { commandRegistry } from '../src/commandRegistry';
import { runTestCase } from './testHarness';

async function runTests() {
    runTestCase('user command evaluator math', () => {
        assert.strictEqual(evaluateCalc('1 + 1'), 2);
        assert.strictEqual(evaluateCalc('10 - 3 * 2'), 4);
        assert.strictEqual(evaluateCalc('(5 + 5) / 2'), 5);
        assert.strictEqual(evaluateCalc('10 % 3'), 1);

        assert.strictEqual(evaluateCalc('remember [0] + 5', [10]), 15);
        assert.strictEqual(evaluateCalc('remember [test] * 2', [0, 6], { test: 1 }), 12);
    });

    runTestCase('user command interpolation', () => {
        const ctx = {
            userMention: '<@12345>',
            username: 'TestUser',
            userId: '12345',
            variables: ['hello', 42],
            varAliases: { foo: 0, bar: 1 },
        };

        assert.strictEqual(interpolateString('Hello {user}!', ctx), 'Hello <@12345>!');
        assert.strictEqual(interpolateString('Var 0: {remember [0]}', ctx), 'Var 0: hello');
        assert.strictEqual(interpolateString('Alias bar: {remember [bar]}', ctx), 'Alias bar: 42');
        assert.strictEqual(interpolateString('Calc: {calc {10 + 20}}', ctx), 'Calc: 30');
    });

    runTestCase('user command parser 8ball', () => {
        const raw8Ball = `
name "8Ball"
description "Asks the bot a question and it will answer with a random answer"
when someone says "/8ball"
you reply {choice {"Without a doubt", "It is certain", "Yes"}}
`;
        const parsed8Ball = parseUserCommand(raw8Ball, 'user_123');
        assert.strictEqual(parsed8Ball.metadata.name, '8Ball');
        assert.strictEqual(
            parsed8Ball.metadata.description,
            'Asks the bot a question and it will answer with a random answer',
        );
        assert.strictEqual(parsed8Ball.trigger.type, 'string');
        assert.strictEqual(parsed8Ball.trigger.value, '/8ball');
        assert.strictEqual(parsed8Ball.trigger.scope, 'everyone');
        assert.strictEqual(parsed8Ball.actions.length, 1);
        assert.strictEqual(parsed8Ball.actions[0].type, 'reply');
        assert.strictEqual((parsed8Ball.actions[0].value as any).type, 'choice');
        assert.deepStrictEqual((parsed8Ball.actions[0].value as any).value, [
            'Without a doubt',
            'It is certain',
            'Yes',
        ]);
    });

    runTestCase('user command parser regex and variables', () => {
        const rawComplex = `
name "pingpong"
vars {
    0 - greeting
}
when I say /(ping|pong)/
memorize [greeting] {"Hello"}
you say "{remember [greeting]} {user}!"
`;
        const parsedComplex = parseUserCommand(rawComplex, 'user_456');
        assert.strictEqual(parsedComplex.metadata.name, 'pingpong');
        assert.strictEqual(parsedComplex.trigger.type, 'regex');
        assert.strictEqual(parsedComplex.trigger.value, '(ping|pong)');
        assert.strictEqual(parsedComplex.trigger.scope, 'author');
        assert.strictEqual(parsedComplex.actions.length, 2);
        assert.strictEqual(parsedComplex.actions[0].type, 'memorize');
        assert.strictEqual(parsedComplex.actions[0].targetSlot, 0);
    });

    runTestCase('user command storage and trigger pool', async () => {
        const testDir = path.resolve(__dirname, '../data/test_user_commands');
        const configDir = path.resolve(__dirname, '../data/test_user_commands_config');

        if (fs.existsSync(testDir)) {
            fs.rmSync(testDir, { recursive: true, force: true });
        }
        if (fs.existsSync(configDir)) {
            fs.rmSync(configDir, { recursive: true, force: true });
        }

        const storage = new UserCommandStorage(testDir);
        const raw8Ball = `
name "8Ball"
description "Asks the bot a question and it will answer with a random answer"
when someone says "/8ball"
you reply {choice {"Without a doubt", "It is certain", "Yes"}}
`;
        const parsed8Ball = parseUserCommand(raw8Ball, 'user_123');
        storage.saveCommand(parsed8Ball, raw8Ball);

        const loadedCmds = storage.loadAllCommands();
        assert.strictEqual(loadedCmds.length, 1);
        assert.strictEqual(loadedCmds[0].metadata.name, '8Ball');

        const triggerPool = new TriggerPool(storage);
        triggerPool.loadFromStorage();

        let repliedContent = '';
        const mockMessage = {
            content: '/8ball',
            author: { id: 'user_999', username: 'Tester' },
            channel: {
                send: async (msg: string) => {
                    repliedContent = msg;
                },
            },
            reply: async (msg: string) => {
                repliedContent = msg;
            },
        };

        const handled = await triggerPool.handleMessage(mockMessage);
        assert.strictEqual(handled, true);
        assert.ok(['Without a doubt', 'It is certain', 'Yes'].includes(repliedContent));
    });

    runTestCase('user command config and quotas', () => {
        const testDir = path.resolve(__dirname, '../data/test_user_commands');
        const configDir = path.resolve(__dirname, '../data/test_user_commands_config');
        const storage = new UserCommandStorage(testDir);
        const configStore = new ConfigStore(configDir);
        configStore.setRoleQuota('vip', 10);
        configStore.restrictUser('user_bad');

        const quotaManager = new QuotaManager(configStore, storage);
        assert.strictEqual(quotaManager.isUserRestricted('user_bad'), true);
        assert.strictEqual(quotaManager.isUserRestricted('user_good'), false);

        const mockMemberVip = {
            roles: {
                cache: new Map([['role1', { name: 'vip', id: '123' }]]),
            },
        };

        const maxBytesVip = quotaManager.getUserMaxStorageBytes(mockMemberVip);
        assert.strictEqual(maxBytesVip, 15 * 1024 * 1024);

        const report = configStore.addReport('8Ball', 'reporter_1', 'Inappropriate response');
        assert.strictEqual(report.commandName, '8Ball');
        assert.strictEqual(configStore.getReports('open').length, 1);
        configStore.dismissReport(report.id);
        assert.strictEqual(configStore.getReports('open').length, 0);

        const wipedCount = storage.wipeUserCommands('user_123');
        assert.strictEqual(wipedCount, 1);
        assert.strictEqual(storage.getCommandsByAuthor('user_123').length, 0);
    });

    runTestCase('user command registry serialization', () => {
        commandRegistry.register({
            name: 'test_opt_cmd',
            description: 'Test command with options',
            options: [{ name: 'role', description: 'Role name', type: 3, required: true }],
            handler: async () => {},
        });
        const slashData = commandRegistry.toSlashCommandData();
        const testCmdData = slashData.find((c: any) => c.name === 'test_opt_cmd');
        assert.ok(testCmdData);
        assert.strictEqual(testCmdData.options?.length, 1);
        assert.strictEqual(testCmdData.options[0].name, 'role');
    });

    fs.rmSync(path.resolve(__dirname, '../data/test_user_commands'), {
        recursive: true,
        force: true,
    });
    fs.rmSync(path.resolve(__dirname, '../data/test_user_commands_config'), {
        recursive: true,
        force: true,
    });
}

runTests().catch((err) => {
    console.error('Test failed:', err);
    process.exit(1);
});
