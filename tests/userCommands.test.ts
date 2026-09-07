import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { commandRegistry } from '../src/commandRegistry';
import { ConfigStore } from '../src/userCommands/configStore';
import {
    evaluateBooleanExpr,
    evaluateCalc,
    EvaluationContext,
    executePipeline,
    interpolateString,
} from '../src/userCommands/evaluator';
import { parseUserCommand } from '../src/userCommands/parser';
import { QuotaManager } from '../src/userCommands/quotaManager';
import { UserCommandStorage } from '../src/userCommands/storage';
import { TriggerPool } from '../src/userCommands/triggerPool';
import { getHelpTopicEmbed } from '../src/userCommands/helpProvider';
import { PipelineData } from '../src/userCommands/types';
import { runTestCase } from './testHarness';

async function runTests() {
    console.log('--- Starting User Commands Unit Tests (Ver 0.2) ---');

    runTestCase('user command evaluator math', () => {
        assert.strictEqual(evaluateCalc('1 + 1'), 2);
        assert.strictEqual(evaluateCalc('10 - 3 * 2'), 4);
        assert.strictEqual(evaluateCalc('(5 + 5) / 2'), 5);
        assert.strictEqual(evaluateCalc('10 % 3'), 1);

        assert.strictEqual(evaluateCalc('remember [0] + 5', [10]), 15);
        assert.strictEqual(evaluateCalc('remember [test] * 2', [0, 6], { test: 1 }), 12);
    });

    runTestCase('user command interpolation & non-ping nickname', () => {
        const ctx: EvaluationContext = {
            userMention: 'TestUserNickname', // Non-pinging nickname
            username: 'TestUser',
            userId: '12345',
            channelName: 'general',
            serverName: 'KomaruServer',
            timeStr: '12:00:00',
            dateStr: '2026-08-19',
            input: '!rps rock',
            matchGroups: ['!rps rock', 'rock'],
            variables: ['hello', 42],
            varAliases: { foo: 0, bar: 1 },
        };

        // Test non-pinging nickname
        assert.strictEqual(interpolateString('Hello {user}!', ctx), 'Hello TestUserNickname!');
        // Test system context variables
        assert.strictEqual(
            interpolateString('Channel: {channel}, Server: {server}', ctx),
            'Channel: general, Server: KomaruServer',
        );
        // Test {input}
        assert.strictEqual(interpolateString('Input was {input}', ctx), 'Input was !rps rock');
        // Test {match [1]}
        assert.strictEqual(interpolateString('Group 1: {match [1]}', ctx), 'Group 1: rock');
        // Test remember & calc
        assert.strictEqual(interpolateString('Var 0: {remember [0]}', ctx), 'Var 0: hello');
        assert.strictEqual(interpolateString('Calc: {calc {10 + 20}}', ctx), 'Calc: 30');
    });

    runTestCase('quick command creation (qt)', () => {
        const rawQt = `qt "ping"\nThis is quick text response!`;
        const parsed = parseUserCommand(rawQt, 'user_qt');
        assert.strictEqual(parsed.trigger.type, 'string');
        assert.strictEqual(parsed.trigger.value, 'ping');
        assert.strictEqual(parsed.trigger.scope, 'everyone');
        assert.strictEqual(parsed.actions.length, 1);
        assert.strictEqual(parsed.actions[0].type, 'reply');
        assert.strictEqual(parsed.actions[0].value, 'This is quick text response!');
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
    });

    runTestCase(
        'user command parser (Regex, Vars, Aliases, Meta, Embed, Ponder, Scratch Pole)',
        () => {
            const rawComplex = `
name "pingpong"
alias "p", "pong"
coauthor "user_789"
meta cooldown 10
meta roles vip, admin
meta channels general
meta enabled true
vars {
    0 - greeting
}
when I say /(ping|pong)/
memorize [greeting] {"Hello"}
you embed {
    title "Ping Pong Title"
    description "{user} played"
}
ponder {(input is "ping")} {
    you say "Pong!"
}
otherwise {
    you say "Ping!"
}
scratch pole {input}
|> split on " "
|> trim
|> upper
|> save [0]
`;
            const parsedComplex = parseUserCommand(rawComplex, 'user_456');
            assert.strictEqual(parsedComplex.metadata.name, 'pingpong');
            assert.strictEqual(parsedComplex.metadata.cooldown, 10);
            assert.deepStrictEqual(parsedComplex.metadata.roles, ['vip', 'admin']);
            assert.deepStrictEqual(parsedComplex.metadata.channels, ['general']);
            assert.strictEqual(parsedComplex.metadata.enabled, true);
            assert.deepStrictEqual(parsedComplex.aliases, ['p', 'pong']);
            assert.deepStrictEqual(parsedComplex.coauthors, ['user_789']);

            assert.strictEqual(parsedComplex.actions[0].type, 'memorize');
            assert.strictEqual(parsedComplex.actions[1].type, 'embed');
            assert.strictEqual(parsedComplex.actions[2].type, 'ponder');
            assert.strictEqual(parsedComplex.actions[3].type, 'pipeline');
        },
    );

    runTestCase('user command boolean expressions', () => {
        const ctx: EvaluationContext = {
            userMention: 'Tester',
            username: 'Tester',
            userId: '1',
            channelName: 'gen',
            serverName: 'srv',
            timeStr: '00:00:00',
            dateStr: '2026-01-01',
            input: 'rock',
            matchGroups: [],
            variables: ['rock'],
        };

        assert.strictEqual(evaluateBooleanExpr('input is "rock"', ctx), true);
        assert.strictEqual(evaluateBooleanExpr('input is not "paper"', ctx), true);
        assert.strictEqual(
            evaluateBooleanExpr('(input is "rock") and not (input is "paper")', ctx),
            true,
        );

        // Test match [1] evaluation
        const matchCtx: EvaluationContext = {
            ...ctx,
            matchGroups: ['!pick rock', 'rock'],
        };
        assert.strictEqual(evaluateBooleanExpr('match [1] is "rock"', matchCtx), true);
        assert.strictEqual(evaluateBooleanExpr('(match [1] is "rock")', matchCtx), true);
        assert.strictEqual(evaluateBooleanExpr('match [1] is "paper"', matchCtx), false);
    });

    runTestCase('user command scratch pole pipeline', () => {
        const ctx: EvaluationContext = {
            userMention: 'Tester',
            username: 'Tester',
            userId: '1',
            channelName: 'gen',
            serverName: 'srv',
            timeStr: '00:00:00',
            dateStr: '2026-01-01',
            input: 'hello world foo bar',
            matchGroups: [],
            variables: new Array(10),
        };

        const pipeData: PipelineData = {
            source: '{input}',
            steps: [
                { type: 'split', arg: '" "' },
                { type: 'upper' },
                { type: 'join', arg: '", "' },
                { type: 'save', varSlot: 0 },
            ],
        };

        const res = executePipeline(pipeData, ctx);
        assert.strictEqual(res, 'HELLO, WORLD, FOO, BAR');
        assert.strictEqual(ctx.variables[0], 'HELLO, WORLD, FOO, BAR');
    });

    runTestCase('storage, triggerPool & non-ping allowedMentions', async () => {
        const testDir = path.resolve(__dirname, '../data/test_user_commands_v2');
        const configDir = path.resolve(__dirname, '../data/test_user_commands_config_v2');

        if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
        if (fs.existsSync(configDir)) fs.rmSync(configDir, { recursive: true, force: true });

        const storage = new UserCommandStorage(testDir);
        const rawCmd = `
name "nonping"
when someone says "!hello"
you reply "Hello {user}!"
`;
        const parsed = parseUserCommand(rawCmd, 'user_1');
        storage.saveCommand(parsed, rawCmd);

        const triggerPool = new TriggerPool(storage);
        triggerPool.loadFromStorage();

        let replyPayload: any = null;
        const mockMsg = {
            content: '!hello',
            author: { id: 'user_1', username: 'TestUser' },
            member: { displayName: 'CoolNickName' },
            channel: { name: 'general' },
            reply: async (payload: any) => {
                replyPayload = payload;
            },
        };

        const handled = await triggerPool.handleMessage(mockMsg);
        assert.strictEqual(handled, true);
        assert.ok(replyPayload);
        // Verify non-pinging nickname display
        assert.strictEqual(replyPayload.content, 'Hello CoolNickName!');
        // Verify allowedMentions parse [] to guarantee zero pings
        assert.deepStrictEqual(replyPayload.allowedMentions, { parse: [] });

        // Test trigger collision detection
        const duplicateCmd = parseUserCommand(
            `name "nonping2"\nwhen someone says "!hello"\nyou reply "Duplicate!"`,
            'user_2',
        );
        const conflict = triggerPool.findConflictingCommand(
            duplicateCmd.trigger,
            duplicateCmd.aliases,
            duplicateCmd.metadata.name,
        );
        assert.ok(conflict);
        assert.strictEqual(conflict.metadata.name, 'nonping');

        // Test adding an alias post-registration
        const aliasAdded = storage.addAliasToCommand('nonping', '!helloalias');
        assert.strictEqual(aliasAdded, true);
        triggerPool.loadFromStorage();
        const nonpingCmd = triggerPool.getCommand('nonping');
        assert.ok(nonpingCmd?.aliases?.includes('!helloalias'));

        // Test ConfigStore allowPublicAliases toggle
        const configStore = new ConfigStore(configDir);
        assert.strictEqual(configStore.getAllowPublicAliases(), true);
        configStore.setAllowPublicAliases(false);
        assert.strictEqual(configStore.getAllowPublicAliases(), false);

        // Test help topic embed generation
        const helpEmbed = getHelpTopicEmbed('ponder');
        assert.strictEqual(helpEmbed.title, '🔀 User Command System: Conditionals (ponder)');
        assert.ok(helpEmbed.fields.length > 0);

        fs.rmSync(testDir, { recursive: true, force: true });
        fs.rmSync(configDir, { recursive: true, force: true });
    });

    runTestCase('user command mention prevention & display name replacement', async () => {
        const testDir = path.resolve(__dirname, '../data/test_user_commands_mention_v2');
        if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });

        const storage = new UserCommandStorage(testDir);
        const rawCmd = `
name "mentionTest"
when someone says /!testmention(.*)/
you say "Direct ping <@999> and nickname ping <@!888> and input was {input} and role <@&777> and @everyone and @here"
`;
        const parsed = parseUserCommand(rawCmd, 'author_1');
        storage.saveCommand(parsed, rawCmd);

        const triggerPool = new TriggerPool(storage);
        triggerPool.loadFromStorage();

        let sentPayload: any = null;
        const mockMsg = {
            content: '!testmention <@999>',
            author: { id: 'author_1', username: 'AuthorUser' },
            member: { displayName: 'AuthorNick' },
            channel: {
                name: 'general',
                send: async (payload: any) => {
                    sentPayload = payload;
                },
            },
            guild: {
                name: 'TestGuild',
                members: {
                    cache: new Map([
                        ['999', { displayName: 'TargetNineNineNine' }],
                        ['888', { displayName: 'TargetEightEightEight' }],
                    ]),
                },
                roles: {
                    cache: new Map([['777', { name: 'AdminRole' }]]),
                },
            },
        };

        const handled = await triggerPool.handleMessage(mockMsg);
        assert.strictEqual(handled, true);
        assert.ok(sentPayload);
        assert.deepStrictEqual(sentPayload.allowedMentions, { parse: [] });

        // Ensure user mentions replaced with display names
        assert.ok(!sentPayload.content.includes('<@999>'), 'Should not contain raw <@999>');
        assert.ok(!sentPayload.content.includes('<@!888>'), 'Should not contain raw <@!888>');
        assert.ok(sentPayload.content.includes('Direct ping TargetNineNineNine'));
        assert.ok(sentPayload.content.includes('nickname ping TargetEightEightEight'));
        assert.ok(sentPayload.content.includes('input was !testmention TargetNineNineNine'));
        assert.ok(sentPayload.content.includes('role AdminRole'));
        assert.ok(!sentPayload.content.includes('@everyone'), 'Should sanitize @everyone');
        assert.ok(sentPayload.content.includes('@\u200beveryone'));

        // Test embed mention prevention
        const embedCmdRaw = `
name "embedMentionTest"
when someone says "!embedmention"
you embed {
    title "Ping <@999>"
    description "Desc for <@!888>"
    field "Target" - "<@999>"
}
`;
        const embedParsed = parseUserCommand(embedCmdRaw, 'author_1');
        storage.saveCommand(embedParsed, embedCmdRaw);
        triggerPool.loadFromStorage();

        let embedSentPayload: any = null;
        const embedMockMsg = {
            ...mockMsg,
            content: '!embedmention',
            channel: {
                ...mockMsg.channel,
                send: async (payload: any) => {
                    embedSentPayload = payload;
                },
            },
        };

        const embedHandled = await triggerPool.handleMessage(embedMockMsg);
        assert.strictEqual(embedHandled, true);
        assert.ok(embedSentPayload);
        assert.deepStrictEqual(embedSentPayload.allowedMentions, { parse: [] });
        const embed = embedSentPayload.embeds[0];
        assert.strictEqual(embed.title, 'Ping TargetNineNineNine');
        assert.strictEqual(embed.description, 'Desc for TargetEightEightEight');
        assert.strictEqual(embed.fields[0].value, 'TargetNineNineNine');

        fs.rmSync(testDir, { recursive: true, force: true });
    });

    runTestCase('user command registry options serialization', () => {
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
}

runTests().catch((err) => {
    console.error('Test failed:', err);
    process.exit(1);
});
