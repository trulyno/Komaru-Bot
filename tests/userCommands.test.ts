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
import { SessionManager } from '../src/userCommands/sessionManager';
import { runTestCase } from './testHarness';

async function runTests() {
    console.log('--- Starting User Commands Unit Tests (Ver 0.2) ---');

    await runTestCase('user command evaluator math', () => {
        assert.strictEqual(evaluateCalc('1 + 1'), 2);
        assert.strictEqual(evaluateCalc('10 - 3 * 2'), 4);
        assert.strictEqual(evaluateCalc('(5 + 5) / 2'), 5);
        assert.strictEqual(evaluateCalc('10 % 3'), 1);

        assert.strictEqual(evaluateCalc('remember [0] + 5', [10]), 15);
        assert.strictEqual(evaluateCalc('remember [test] * 2', [0, 6], { test: 1 }), 12);
    });

    await runTestCase('user command interpolation & non-ping nickname', () => {
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

    await runTestCase('quick command creation (qt)', () => {
        const rawQt = `qt "ping"\nThis is quick text response!`;
        const parsed = parseUserCommand(rawQt, 'user_qt');
        assert.strictEqual(parsed.trigger.type, 'string');
        assert.strictEqual(parsed.trigger.value, 'ping');
        assert.strictEqual(parsed.trigger.scope, 'everyone');
        assert.strictEqual(parsed.actions.length, 1);
        assert.strictEqual(parsed.actions[0].type, 'reply');
        assert.strictEqual(parsed.actions[0].value, 'This is quick text response!');
    });

    await runTestCase('user command parser 8ball', () => {
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

    await runTestCase(
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
    1 - count
}
when someone says /^!ping(?: +([0-9]+))?$/
you reply "Pong! Count: {match [1]}"
you embed {
    title "Ping Report"
    description "Command executed in {channel}"
    color "#00ff00"
    field "Author" - "{user}"
    field "Server" - "{server}" (inline)
}
ponder {{remember [0] is "hi"}} {
    you reply "Hello back!"
} otherwise {
    you reply "Good day!"
}
scratch pole "{input}" |> split on " " |> join on ", " |> save [0]
`;
            const parsedComplex = parseUserCommand(rawComplex, 'author_123');
            assert.strictEqual(parsedComplex.metadata.name, 'pingpong');
            assert.deepStrictEqual(parsedComplex.aliases, ['p', 'pong']);
            assert.deepStrictEqual(parsedComplex.coauthors, ['user_789']);
            assert.strictEqual(parsedComplex.metadata.cooldown, 10);
            assert.deepStrictEqual(parsedComplex.metadata.roles, ['vip', 'admin']);
            assert.deepStrictEqual(parsedComplex.metadata.channels, ['general']);
            assert.strictEqual(parsedComplex.metadata.enabled, true);
            assert.strictEqual(parsedComplex.varAliases?.greeting, 0);
            assert.strictEqual(parsedComplex.varAliases?.count, 1);
            assert.strictEqual(parsedComplex.trigger.type, 'regex');
            assert.strictEqual(parsedComplex.actions.length, 4);
            assert.strictEqual(parsedComplex.actions[0].type, 'reply');
            assert.strictEqual(parsedComplex.actions[1].type, 'embed');
            assert.strictEqual(parsedComplex.actions[2].type, 'ponder');
            assert.strictEqual(parsedComplex.actions[3].type, 'pipeline');
        },
    );

    await runTestCase('user command boolean expressions', () => {
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

    await runTestCase('user command scratch pole pipeline', () => {
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

    await runTestCase('storage, triggerPool & non-ping allowedMentions', async () => {
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

    await runTestCase('user command mention prevention & display name replacement', async () => {
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

    await runTestCase('user command registry options serialization', () => {
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

    await runTestCase('user command parser category directive and defaults', () => {
        const cmdWithCat = `
name "FunCommand"
category "Fun"
when someone says "!fun"
you say "Having fun!"
`;
        const parsedWithCat = parseUserCommand(cmdWithCat, 'author_cat');
        assert.strictEqual(parsedWithCat.metadata.name, 'FunCommand');
        assert.strictEqual(parsedWithCat.metadata.category, 'Fun');

        const cmdWithMetaCat = `
name "UtilCommand"
meta category Utility
when someone says "!util"
you say "Utility work"
`;
        const parsedWithMetaCat = parseUserCommand(cmdWithMetaCat, 'author_meta_cat');
        assert.strictEqual(parsedWithMetaCat.metadata.name, 'UtilCommand');
        assert.strictEqual(parsedWithMetaCat.metadata.category, 'Utility');

        const cmdDefaultCat = `
name "DefaultCommand"
when someone says "!default"
you say "Default category"
`;
        const parsedDefaultCat = parseUserCommand(cmdDefaultCat, 'author_default');
        assert.strictEqual(parsedDefaultCat.metadata.name, 'DefaultCommand');
        assert.strictEqual(parsedDefaultCat.metadata.category, 'General');
    });

    await runTestCase('ConfigStore governance operations', () => {
        const testDir = path.resolve(__dirname, 'temp_config_test');
        if (fs.existsSync(testDir)) {
            fs.rmSync(testDir, { recursive: true, force: true });
        }
        fs.mkdirSync(testDir, { recursive: true });

        const configStore = new ConfigStore(testDir);

        // Test Approved Creators
        assert.strictEqual(configStore.isApprovedCreator('111222'), false);
        configStore.addApprovedCreator('111222');
        assert.strictEqual(configStore.isApprovedCreator('111222'), true);
        assert.strictEqual(configStore.getApprovedCreators().length, 1);

        const removed = configStore.removeApprovedCreator('111222');
        assert.strictEqual(removed, true);
        assert.strictEqual(configStore.isApprovedCreator('111222'), false);

        // Test Categories
        const initialCats = configStore.getCategories();
        assert.ok(initialCats.some((c) => c.name === 'General'));
        assert.ok(initialCats.some((c) => c.name === 'Fun'));

        assert.strictEqual(configStore.categoryExists('fun'), true);
        assert.strictEqual(configStore.normalizeCategory('fun'), 'Fun');
        assert.strictEqual(configStore.categoryExists('nonexistent'), false);

        // Add category
        const catAdded = configStore.addCategory('Minigames', 'Commands for minigames');
        assert.strictEqual(catAdded, true);
        assert.strictEqual(configStore.categoryExists('minigames'), true);
        assert.strictEqual(configStore.normalizeCategory('minigames'), 'Minigames');

        // Cannot remove General
        assert.strictEqual(configStore.removeCategory('General'), false);

        // Remove created category
        assert.strictEqual(configStore.removeCategory('Minigames'), true);
        assert.strictEqual(configStore.categoryExists('minigames'), false);

        // Test Channel Config
        const defaultChannelCfg = configStore.getChannelConfig('chan_123');
        assert.strictEqual(defaultChannelCfg.timeoutSeconds, undefined);

        configStore.setChannelTimeout('chan_123', 5);
        assert.strictEqual(configStore.getChannelConfig('chan_123').timeoutSeconds, 5);

        configStore.setChannelAllowedCategories('chan_123', ['Utility', 'General']);
        const updatedCfg = configStore.getChannelConfig('chan_123');
        assert.deepStrictEqual(updatedCfg.allowedCategories, ['Utility', 'General']);

        // Clear allowed categories back to all
        configStore.setChannelAllowedCategories('chan_123', []);
        assert.strictEqual(configStore.getChannelConfig('chan_123').allowedCategories, undefined);

        fs.rmSync(testDir, { recursive: true, force: true });
    });

    await runTestCase(
        'SessionManager review flow for unapproved vs approved creators',
        async () => {
            const testDir = path.resolve(__dirname, 'temp_session_test');
            const testConfigDir = path.resolve(__dirname, 'temp_session_config_test');
            if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
            if (fs.existsSync(testConfigDir))
                fs.rmSync(testConfigDir, { recursive: true, force: true });
            fs.mkdirSync(testDir, { recursive: true });
            fs.mkdirSync(testConfigDir, { recursive: true });

            const storage = new UserCommandStorage(testDir);
            const configStore = new ConfigStore(testConfigDir);
            const triggerPool = new TriggerPool(storage, configStore);
            const quotaManager = new QuotaManager(configStore, storage);
            const sessionManager = new SessionManager(storage, triggerPool, quotaManager);

            const botId = 'bot_999';

            // 1. Unapproved user creates a command
            let replyUnapproved = '';
            const unapprovedMsg = {
                author: { id: 'unapproved_user_1', bot: false, tag: 'UnapprovedUser#0001' },
                content: `<@${botId}>\nname "UnapprovedCmd"\nwhen someone says "!unapproved"\nyou say "Pending review"`,
                mentions: { has: (id: string) => id === botId },
                reply: async (msg: string) => {
                    replyUnapproved = msg;
                },
                guild: {
                    id: 'guild_1',
                    name: 'TestGuild',
                    channels: { cache: new Map() },
                },
            };

            const handled1 = await sessionManager.handleMessage(unapprovedMsg, botId);
            assert.strictEqual(handled1, true);
            assert.ok(replyUnapproved.includes('submitted and queued for admin review'));

            const unapprovedCmd = storage.getCommand('unapprovedcmd');
            assert.ok(unapprovedCmd);
            assert.strictEqual(unapprovedCmd.metadata.enabled, false);

            // 2. Approved user creates a command
            configStore.addApprovedCreator('approved_user_2');

            let replyApproved = '';
            const approvedMsg = {
                author: { id: 'approved_user_2', bot: false, tag: 'ApprovedUser#0002' },
                content: `<@${botId}>\nname "ApprovedCmd"\ncategory "Utility"\nwhen someone says "!approved"\nyou say "Active immediately"`,
                mentions: { has: (id: string) => id === botId },
                reply: async (msg: string) => {
                    replyApproved = msg;
                },
                guild: {
                    id: 'guild_1',
                    name: 'TestGuild',
                    channels: { cache: new Map() },
                },
            };

            const handled2 = await sessionManager.handleMessage(approvedMsg, botId);
            assert.strictEqual(handled2, true);
            assert.ok(replyApproved.includes('registered and enabled successfully'));

            const approvedCmd = storage.getCommand('approvedcmd');
            assert.ok(approvedCmd);
            assert.strictEqual(approvedCmd.metadata.enabled, true);
            assert.strictEqual(approvedCmd.metadata.category, 'Utility');

            fs.rmSync(testDir, { recursive: true, force: true });
            fs.rmSync(testConfigDir, { recursive: true, force: true });
        },
    );

    await runTestCase(
        'TriggerPool governance: enabled check, category restrictions, and channel timeouts',
        async () => {
            const testDir = path.resolve(__dirname, 'temp_tp_gov_test');
            const testConfigDir = path.resolve(__dirname, 'temp_tp_gov_config_test');
            if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
            if (fs.existsSync(testConfigDir))
                fs.rmSync(testConfigDir, { recursive: true, force: true });
            fs.mkdirSync(testDir, { recursive: true });
            fs.mkdirSync(testConfigDir, { recursive: true });

            const storage = new UserCommandStorage(testDir);
            const configStore = new ConfigStore(testConfigDir);
            const triggerPool = new TriggerPool(storage, configStore);

            // Create disabled Fun command and enabled Utility command (with 0 cooldown so channel timeouts are tested cleanly)
            const funCmdRaw = `name "FunCmd"\nmeta cooldown 0\ncategory "Fun"\nwhen someone says "!fun"\nyou say "Fun executed"`;
            const funParsed = parseUserCommand(funCmdRaw, 'user_1');
            funParsed.metadata.enabled = false;
            storage.saveCommand(funParsed, funCmdRaw);

            const utilCmdRaw = `name "UtilCmd"\nmeta cooldown 0\ncategory "Utility"\nwhen someone says "!util"\nyou say "Util executed"`;
            const utilParsed = parseUserCommand(utilCmdRaw, 'user_2');
            utilParsed.metadata.enabled = true;
            storage.saveCommand(utilParsed, utilCmdRaw);

            triggerPool.loadFromStorage();

            let sentMsg: any = null;
            const createMockMsg = (content: string, channelId: string) => ({
                content,
                author: { id: 'user_regular', bot: false, username: 'Regular' },
                reply: async (payload: any) => {
                    sentMsg = typeof payload === 'string' ? { content: payload } : payload;
                },
                channel: {
                    id: channelId,
                    name: 'test-channel',
                    send: async (payload: any) => {
                        sentMsg = typeof payload === 'string' ? { content: payload } : payload;
                    },
                },
                guild: {
                    name: 'TestGuild',
                    members: { cache: new Map() },
                    roles: { cache: new Map() },
                },
            });

            // 1. Test disabled command does not execute
            sentMsg = null;
            const disabledHandled = await triggerPool.handleMessage(
                createMockMsg('!fun', 'chan_free'),
            );
            assert.strictEqual(disabledHandled, false);
            assert.strictEqual(sentMsg, null);

            // Enable command and reload
            funParsed.metadata.enabled = true;
            storage.saveCommand(funParsed, funCmdRaw);
            triggerPool.loadFromStorage();

            sentMsg = null;
            const enabledHandled = await triggerPool.handleMessage(
                createMockMsg('!fun', 'chan_free'),
            );
            assert.strictEqual(enabledHandled, true);
            assert.ok(sentMsg && sentMsg.content.includes('Fun executed'));

            // 2. Test Channel Allowed Categories
            // Restrict chan_restricted to only 'Utility'
            configStore.setChannelAllowedCategories('chan_restricted', ['Utility']);

            // FunCmd should NOT execute in chan_restricted
            sentMsg = null;
            const blockedByCat = await triggerPool.handleMessage(
                createMockMsg('!fun', 'chan_restricted'),
            );
            assert.strictEqual(blockedByCat, false);
            assert.strictEqual(sentMsg, null);

            // UtilCmd SHOULD execute in chan_restricted
            sentMsg = null;
            const allowedByCat = await triggerPool.handleMessage(
                createMockMsg('!util', 'chan_restricted'),
            );
            assert.strictEqual(allowedByCat, true);
            assert.ok(sentMsg && sentMsg.content.includes('Util executed'));

            // 3. Test Channel Execution Timeout
            configStore.setChannelTimeout('chan_timed', 10); // 10 second timeout

            sentMsg = null;
            const firstRun = await triggerPool.handleMessage(createMockMsg('!util', 'chan_timed'));
            assert.strictEqual(firstRun, true);
            assert.ok(sentMsg && sentMsg.content.includes('Util executed'));

            // Immediate second command in same channel should trigger channel-wide cooldown
            sentMsg = null;
            const secondRun = await triggerPool.handleMessage(createMockMsg('!fun', 'chan_timed'));
            assert.strictEqual(secondRun, true);
            assert.ok(sentMsg && sentMsg.content.includes('channel-wide cooldown'));

            fs.rmSync(testDir, { recursive: true, force: true });
            fs.rmSync(testConfigDir, { recursive: true, force: true });
        },
    );

    await runTestCase(
        'User Command System - Allowed Creation Channels Configuration & Enforcement',
        async () => {
            const testDir = path.resolve(__dirname, 'test_allowed_chan_storage');
            const testConfigDir = path.resolve(__dirname, 'test_allowed_chan_config');
            if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
            if (fs.existsSync(testConfigDir))
                fs.rmSync(testConfigDir, { recursive: true, force: true });

            const configStore = new ConfigStore(testConfigDir);
            const storage = new UserCommandStorage(testDir);
            const quotaManager = new QuotaManager(configStore, storage);
            const triggerPool = new TriggerPool(storage, configStore);
            const sessionManager = new SessionManager(storage, triggerPool, quotaManager);

            // 1. Initially no restrictions -> any channel is allowed
            assert.strictEqual(configStore.getAllowedCreationChannels().length, 0);
            assert.strictEqual(configStore.formatAllowedCreationChannels(), 'all channels');
            assert.strictEqual(configStore.isCreationAllowedInChannel('12345', 'general'), true);

            // 2. Configure allowed creation channels
            configStore.setAllowedCreationChannels(['12345', 'bot-commands']);
            assert.deepStrictEqual(configStore.getAllowedCreationChannels(), [
                '12345',
                'bot-commands',
            ]);
            assert.strictEqual(
                configStore.formatAllowedCreationChannels(),
                '<#12345>, #bot-commands',
            );

            // Check matching by ID and Name
            assert.strictEqual(configStore.isCreationAllowedInChannel('12345', 'random'), true);
            assert.strictEqual(
                configStore.isCreationAllowedInChannel('99999', 'bot-commands'),
                true,
            );
            assert.strictEqual(
                configStore.isCreationAllowedInChannel('99999', '#bot-commands'),
                true,
            );
            assert.strictEqual(configStore.isCreationAllowedInChannel('99999', 'general'), false);

            // Add and remove channels
            configStore.addAllowedCreationChannel('99999');
            assert.strictEqual(configStore.isCreationAllowedInChannel('99999', 'general'), true);
            configStore.removeAllowedCreationChannel('99999');
            assert.strictEqual(configStore.isCreationAllowedInChannel('99999', 'general'), false);

            // 3. Test SessionManager creation rejection in disallowed channel
            let sentReply: any = null;
            const mockMsgDisallowed = {
                author: { id: 'regular_user_1', bot: false },
                content: '<@bot123> when someone says "hello" -> "world"',
                channel: { id: 'chan_general', name: 'general' },
                mentions: { has: (id: string) => id === 'bot123' },
                member: { permissions: { has: () => false } },
                reply: async (payload: any) => {
                    sentReply = payload;
                },
            };

            const handledDisallowed = await sessionManager.handleMessage(
                mockMsgDisallowed,
                'bot123',
            );
            assert.strictEqual(handledDisallowed, true);
            assert.ok(sentReply && typeof sentReply === 'string');
            assert.ok(
                sentReply.includes(
                    'Creating user commands is only allowed in the following channel',
                ),
            );
            assert.ok(sentReply.includes('<#12345>'));
            assert.ok(sentReply.includes('#bot-commands'));

            // 4. Disallowed channel multi-message continuation rejection
            sentReply = null;
            const mockMsgMultiDisallowed = {
                author: { id: 'regular_user_1', bot: false },
                content: '<@bot123> name "Test" ~~~',
                channel: { id: 'chan_general', name: 'general' },
                mentions: { has: (id: string) => id === 'bot123' },
                member: { permissions: { has: () => false } },
                reply: async (payload: any) => {
                    sentReply = payload;
                },
            };
            const handledMultiDisallowed = await sessionManager.handleMessage(
                mockMsgMultiDisallowed,
                'bot123',
            );
            assert.strictEqual(handledMultiDisallowed, true);
            assert.ok(
                sentReply &&
                    sentReply.includes(
                        'Creating user commands is only allowed in the following channel',
                    ),
            );

            // 5. Allowed channel creation succeeds
            sentReply = null;
            const mockMsgAllowed = {
                author: { id: 'regular_user_1', bot: false },
                content: '<@bot123> when someone says "hi" -> "hello there"',
                channel: { id: '12345', name: 'bot-commands' },
                mentions: { has: (id: string) => id === 'bot123' },
                member: { permissions: { has: () => false } },
                reply: async (payload: any) => {
                    sentReply = payload;
                },
            };
            const handledAllowed = await sessionManager.handleMessage(mockMsgAllowed, 'bot123');
            assert.strictEqual(handledAllowed, true);
            assert.ok(sentReply && typeof sentReply === 'string');
            assert.ok(sentReply.includes('submitted and queued for admin review'));

            // 6. Admin bypasses channel restrictions
            sentReply = null;
            const mockMsgAdmin = {
                author: { id: 'admin_user', bot: false },
                content: '<@bot123> when someone says "adminhi" -> "hello admin"',
                channel: { id: 'chan_general', name: 'general' },
                mentions: { has: (id: string) => id === 'bot123' },
                member: { permissions: { has: (p: string) => p === 'Administrator' } },
                reply: async (payload: any) => {
                    sentReply = payload;
                },
            };
            const handledAdmin = await sessionManager.handleMessage(mockMsgAdmin, 'bot123');
            assert.strictEqual(handledAdmin, true);
            assert.ok(
                sentReply &&
                    typeof sentReply === 'string' &&
                    (sentReply.includes('registered and enabled successfully') ||
                        sentReply.includes('submitted and queued for admin review')),
            );

            // 7. Clear allowed creation channels -> allowed everywhere again
            configStore.clearAllowedCreationChannels();
            assert.strictEqual(
                configStore.isCreationAllowedInChannel('chan_general', 'general'),
                true,
            );

            fs.rmSync(testDir, { recursive: true, force: true });
            fs.rmSync(testConfigDir, { recursive: true, force: true });
        },
    );
}

runTests().catch((err) => {
    console.error('Test failed:', err);
    process.exit(1);
});
