import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { runTestCase } from './testHarness';
import {
    calculatePenaltyForThreshold,
    checkThresholdCrossed,
    containsLarpWord,
    countLarpOccurrences,
    formatTimeRemaining,
    getGuildLeaderboard,
    getLarpUser,
    getNextThreshold,
    getRandomClinkMessage,
    getRandomSilencedAttemptMessage,
    getRandomThresholdMessage,
    isUserSilenced,
    recordLarp,
    setDefaultDataFilePath,
    unsilenceUser,
} from '../src/services/larpJarService';
import {
    handleMessageDeletion,
    isMessageBotDeleted,
    markMessageAsBotDeleted,
} from '../src/services/auditLogService';

const testStateFile = path.resolve(__dirname, '../data/test_larp_jar_state.json');

async function runLarpJarTests(): Promise<void> {
    setDefaultDataFilePath(testStateFile);

    // Clean up test file before tests
    if (fs.existsSync(testStateFile)) {
        fs.unlinkSync(testStateFile);
    }

    await runTestCase('larp word detection and counting', () => {
        assert.strictEqual(containsLarpWord('Hello world'), false);
        assert.strictEqual(containsLarpWord('sharp turns ahead'), false);
        assert.strictEqual(containsLarpWord('polar bears'), false);

        assert.strictEqual(containsLarpWord('stop your larping right now'), true);
        assert.strictEqual(containsLarpWord('what a larper'), true);
        assert.strictEqual(containsLarpWord('I larped all day'), true);
        assert.strictEqual(containsLarpWord('LARP!'), true);
        assert.strictEqual(containsLarpWord('larps are fun'), true);

        // Anti-bypass tests: repeated letters, leetspeak, separators
        assert.strictEqual(containsLarpWord('nice llarp'), true);
        assert.strictEqual(containsLarpWord('stop llarping'), true);
        assert.strictEqual(containsLarpWord('what a lllarper'), true);
        assert.strictEqual(containsLarpWord('laaaaarping'), true);
        assert.strictEqual(containsLarpWord('larrrrrp'), true);
        assert.strictEqual(containsLarpWord('larpppp'), true);
        assert.strictEqual(containsLarpWord('llaaarrrpp'), true);
        assert.strictEqual(containsLarpWord('l.a.r.p'), true);
        assert.strictEqual(containsLarpWord('l a r p'), true);
        assert.strictEqual(containsLarpWord('l_a_r_p'), true);
        assert.strictEqual(containsLarpWord('_llarp_'), true);
        assert.strictEqual(containsLarpWord('*larp*'), true);
        assert.strictEqual(containsLarpWord('1arp'), true);
        assert.strictEqual(containsLarpWord('l4rp'), true);
        assert.strictEqual(containsLarpWord('l\u200Barp'), true);

        assert.strictEqual(countLarpOccurrences('larp, larper, and larping!'), 3);
        assert.strictEqual(countLarpOccurrences('just one larp'), 1);
        assert.strictEqual(countLarpOccurrences('larp and llarp'), 2);
        assert.strictEqual(countLarpOccurrences('no matches here'), 0);
    });

    await runTestCase('threshold penalty calculations', () => {
        const tier3 = calculatePenaltyForThreshold(3);
        assert.strictEqual(tier3.durationMs, 1 * 3600 * 1000);
        assert.strictEqual(tier3.durationLabel, '1 hour');

        const tier10 = calculatePenaltyForThreshold(10);
        assert.strictEqual(tier10.durationMs, 2 * 3600 * 1000);
        assert.strictEqual(tier10.durationLabel, '2 hours');

        const tier25 = calculatePenaltyForThreshold(25);
        assert.strictEqual(tier25.durationMs, 4 * 3600 * 1000);
        assert.strictEqual(tier25.durationLabel, '4 hours');

        const tier50 = calculatePenaltyForThreshold(50);
        assert.strictEqual(tier50.durationMs, 8 * 3600 * 1000);
        assert.strictEqual(tier50.durationLabel, '8 hours');

        const tier100 = calculatePenaltyForThreshold(100);
        assert.strictEqual(tier100.durationMs, 12 * 3600 * 1000);
        assert.strictEqual(tier100.durationLabel, '12 hours');

        // Dynamic tier beyond 100 (e.g. 150 -> 16h, 200 -> 20h)
        const tier150 = calculatePenaltyForThreshold(150);
        assert.strictEqual(tier150.durationMs, 16 * 3600 * 1000);
        assert.strictEqual(tier150.durationLabel, '16 hours');

        const tier200 = calculatePenaltyForThreshold(200);
        assert.strictEqual(tier200.durationMs, 20 * 3600 * 1000);
        assert.strictEqual(tier200.durationLabel, '20 hours');
    });

    await runTestCase('next threshold progression', () => {
        assert.strictEqual(getNextThreshold(0), 3);
        assert.strictEqual(getNextThreshold(2), 3);
        assert.strictEqual(getNextThreshold(3), 10);
        assert.strictEqual(getNextThreshold(9), 10);
        assert.strictEqual(getNextThreshold(10), 25);
        assert.strictEqual(getNextThreshold(25), 50);
        assert.strictEqual(getNextThreshold(50), 100);
        assert.strictEqual(getNextThreshold(100), 150);
        assert.strictEqual(getNextThreshold(120), 150);
    });

    await runTestCase('checkThresholdCrossed checks', () => {
        const crossed3 = checkThresholdCrossed(2, 3, 0);
        assert.ok(crossed3);
        assert.strictEqual(crossed3.threshold, 3);

        // Already triggered tier 3, going from 3 to 4 should NOT trigger again
        const noCross = checkThresholdCrossed(3, 4, 3);
        assert.strictEqual(noCross, null);

        // Crossing to 10
        const crossed10 = checkThresholdCrossed(9, 10, 3);
        assert.ok(crossed10);
        assert.strictEqual(crossed10.threshold, 10);
    });

    await runTestCase('state management, larp recording and timeout activation', () => {
        const guildId = 'guild_1';
        const userId = 'user_larper';

        // 1st larp
        const step1 = recordLarp(guildId, userId, 'larp_master', 'LarpMaster', 1);
        assert.strictEqual(step1.user.count, 1);
        assert.strictEqual(step1.thresholdCrossed, null);
        assert.strictEqual(isUserSilenced(step1.user), false);

        // 2nd larp
        const step2 = recordLarp(guildId, userId, 'larp_master', 'LarpMaster', 1);
        assert.strictEqual(step2.user.count, 2);
        assert.strictEqual(step2.thresholdCrossed, null);
        assert.strictEqual(isUserSilenced(step2.user), false);

        // 3rd larp -> crosses threshold 3!
        const step3 = recordLarp(guildId, userId, 'larp_master', 'LarpMaster', 1);
        assert.strictEqual(step3.user.count, 3);
        assert.ok(step3.thresholdCrossed);
        assert.strictEqual(step3.thresholdCrossed.threshold, 3);
        assert.strictEqual(isUserSilenced(step3.user), true);
        assert.ok(step3.user.bannedUntil && step3.user.bannedUntil > Date.now());

        // Verify persisted state in file
        assert.ok(fs.existsSync(testStateFile));
        const userFetched = getLarpUser(guildId, userId);
        assert.strictEqual(userFetched.count, 3);
        assert.strictEqual(userFetched.highestTierTriggered, 3);
    });

    await runTestCase('admin unsilencing a user', () => {
        const guildId = 'guild_1';
        const userId = 'user_larper';

        assert.strictEqual(isUserSilenced(getLarpUser(guildId, userId)), true);

        const res = unsilenceUser(guildId, userId);
        assert.strictEqual(res.success, true);
        assert.strictEqual(res.wasSilenced, true);
        assert.strictEqual(res.user.bannedUntil, null);
        assert.strictEqual(isUserSilenced(res.user), false);

        // Unsilencing again when already unsilenced
        const res2 = unsilenceUser(guildId, userId);
        assert.strictEqual(res2.wasSilenced, false);
    });

    await runTestCase('guild leaderboard ordering', () => {
        const guildId = 'guild_leaderboard_test';
        recordLarp(guildId, 'u1', 'alice', 'Alice', 5);
        recordLarp(guildId, 'u2', 'bob', 'Bob', 25);
        recordLarp(guildId, 'u3', 'charlie', 'Charlie', 12);

        const leaderboard = getGuildLeaderboard(guildId, 10);
        assert.strictEqual(leaderboard.totalLarps, 42);
        assert.strictEqual(leaderboard.users.length, 3);
        assert.strictEqual(leaderboard.users[0].userId, 'u2');
        assert.strictEqual(leaderboard.users[0].count, 25);
        assert.strictEqual(leaderboard.users[1].userId, 'u3');
        assert.strictEqual(leaderboard.users[1].count, 12);
        assert.strictEqual(leaderboard.users[2].userId, 'u1');
        assert.strictEqual(leaderboard.users[2].count, 5);
    });

    await runTestCase('bot message deletion suppression', async () => {
        const fakeMessageId = 'msg_999888';

        assert.strictEqual(isMessageBotDeleted(fakeMessageId), false);
        markMessageAsBotDeleted(fakeMessageId);
        assert.strictEqual(isMessageBotDeleted(fakeMessageId), true);
        // Should persist across multiple checks (e.g. ghost ping check then message deletion check)
        assert.strictEqual(isMessageBotDeleted(fakeMessageId), true);

        // Test handleMessageDeletion does not send audit log when message is marked
        let auditSent = false;
        markMessageAsBotDeleted('deleted_by_bot');

        const mockGuild = {
            id: 'mock_g1',
            channels: {
                cache: new Map([
                    [
                        'audit_ch',
                        {
                            id: 'audit_ch',
                            isTextBased: () => true,
                            send: async () => {
                                auditSent = true;
                            },
                        },
                    ],
                ]),
            },
        };

        const mockMessage = {
            id: 'deleted_by_bot',
            guild: mockGuild,
            author: { id: 'user_123', bot: false },
            content: 'I larped',
        };

        // Even after handleMessageDeletion runs, it should not have sent an audit log
        await handleMessageDeletion(mockMessage);
        assert.strictEqual(auditSent, false, 'Audit log should not be sent for bot-deleted message');
    });

    await runTestCase('message generator formatting and ping safety', () => {
        const clink = getRandomClinkMessage('KomaruFan', 5);
        assert.ok(clink.includes('KomaruFan'));
        assert.ok(!clink.includes('<@'));

        const threshold = getRandomThresholdMessage('KomaruFan', 3, '1 hour', Date.now() + 3600000);
        assert.ok(threshold.includes('KomaruFan'));
        assert.ok(threshold.includes('1 hour'));
        assert.ok(!threshold.includes('<@'));

        const silenced = getRandomSilencedAttemptMessage('KomaruFan', 1800000);
        assert.ok(silenced.includes('KomaruFan'));
        assert.ok(!silenced.includes('<@'));

        const timeFmt = formatTimeRemaining(3665000);
        assert.strictEqual(timeFmt, '1h 1m');
    });

    // Clean up test file after tests
    if (fs.existsSync(testStateFile)) {
        fs.unlinkSync(testStateFile);
    }
}

runLarpJarTests().catch((err) => {
    console.error(err);
    process.exit(1);
});
