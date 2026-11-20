import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { KomaruChatEngine } from '../src/komaruChat/engine';
import { matchIntent, normalizeText } from '../src/komaruChat/intents';
import {
    applyInteraction,
    applyTimeDecay,
    DEFAULT_MOOD_STATS,
    deriveMood,
    getBondTitle,
} from '../src/komaruChat/mood';
import { selectResponse } from '../src/komaruChat/responses';
import { KomaruChatConfig } from '../src/komaruChat/types';
import { KomaruChatService } from '../src/services/komaruChatService';
import { runTestCase } from './testHarness';

const TEST_CONFIG: KomaruChatConfig = {
    userCooldownMs: 1000,
    channelCooldownMs: 500,
    passiveReplyChance: 0.5,
    interactCooldownMs: 5000,
    historyLimit: 5,
    decayIntervalMinutes: 15,
};

async function runTests() {
    await runTestCase('text normalization and intent matching', () => {
        assert.strictEqual(normalizeText('Hey Komaru, helloooo!'), 'helloo!');
        assert.strictEqual(matchIntent('komaru, pet behind your ears').intent, 'pet');
        assert.strictEqual(matchIntent('komaru belly rub').intent, 'belly_rub');
        assert.strictEqual(matchIntent('komaru want some tuna?').intent, 'feed_treat');
        assert.strictEqual(matchIntent('komaru here is catnip').intent, 'catnip');
        assert.strictEqual(matchIntent('komaru play with laser').intent, 'play');
        assert.strictEqual(matchIntent('komaru cucumber!').intent, 'scary_object');
        assert.strictEqual(matchIntent('komaru how are you doing?').intent, 'mood_query');
        assert.strictEqual(matchIntent('komaru who are you?').intent, 'who_are_you');
        assert.strictEqual(matchIntent('komaru i am so tired today').intent, 'user_sad_tired');

        const choice = matchIntent('komaru pizza or sushi?');
        assert.strictEqual(choice.intent, 'choice_picker');
        assert.strictEqual(choice.extracted?.choiceA, 'pizza');
        assert.strictEqual(choice.extracted?.choiceB, 'sushi');

        const yesNo = matchIntent('komaru should i take a break?');
        assert.strictEqual(yesNo.intent, 'yes_no_question');

        const longMsg = matchIntent('komaru ' + 'word '.repeat(50));
        assert.strictEqual(longMsg.intent, 'fallback_long');
    });

    await runTestCase('mood transitions, belly trap, and overstimulation', () => {
        const now = 1_700_000_000_000;
        let stats = { ...DEFAULT_MOOD_STATS, lastUpdatedAt: now };

        // Belly rub when not affectionate/sleepy triggers bear-trap mode
        const bellyResult = applyInteraction(stats, 'belly_rub', now);
        assert.strictEqual(bellyResult.bellyTrapTriggered, true);
        stats = bellyResult.stats;

        // Repeated petting triggers overstimulation
        let overstimulated = false;
        for (let i = 0; i < 4; i += 1) {
            const res = applyInteraction(stats, 'pet', now + i * 100);
            stats = res.stats;
            if (res.overstimulated) {
                overstimulated = true;
            }
        }
        assert.strictEqual(overstimulated, true);

        // Treat reduces hunger and calms overstimulation
        const treatRes = applyInteraction(stats, 'treat', now + 500);
        assert.ok(treatRes.stats.hunger < stats.hunger);
        assert.ok(treatRes.stats.happiness > stats.happiness);
    });

    await runTestCase('mood time decay and derivation', () => {
        const start = 1_700_000_000_000;
        const exhausted = {
            happiness: 30,
            energy: 10,
            hunger: 20,
            overstimulation: 80,
            lastUpdatedAt: start,
        };
        assert.strictEqual(deriveMood(exhausted, start), 'grumpy');

        // After 2 hours (8 * 15m), overstimulation cools down and energy recovers
        const later = start + 2 * 60 * 60 * 1000;
        const decayed = applyTimeDecay(exhausted, later, 15);
        assert.strictEqual(decayed.overstimulation, 0);
        assert.ok(decayed.energy > 10);
        assert.ok(decayed.hunger > 20);
    });

    await runTestCase('anti-repetition and bond titles', () => {
        assert.strictEqual(getBondTitle(0), 'Stranger');
        assert.strictEqual(getBondTitle(10), 'Acquaintance');
        assert.strictEqual(getBondTitle(25), 'Trusted Friend');
        assert.strictEqual(getBondTitle(60), 'Favorite Human');
        assert.strictEqual(getBondTitle(120), 'Supreme Tuna Provider');

        const match = matchIntent('komaru hello');
        const first = selectResponse(match, 'happy', {
            userName: 'Alex',
            bondTitle: 'Friend',
            recentResponses: [],
        });
        const second = selectResponse(match, 'happy', {
            userName: 'Alex',
            bondTitle: 'Friend',
            recentResponses: [first],
        });
        assert.notStrictEqual(first, second);
    });

    await runTestCase('engine cooldowns and state updates', () => {
        const engine = new KomaruChatEngine(() => TEST_CONFIG);
        const now = 1_700_000_000_000;
        const guildState = engine.createDefaultGuildState(now);

        const first = engine.processMessage({
            guildState,
            channelId: 'ch-1',
            userId: 'user-1',
            userName: 'Alex',
            content: 'komaru hi!',
            now,
        });
        assert.strictEqual(first.rateLimited, undefined);
        assert.ok(first.reply.length > 0);
        assert.strictEqual(guildState.userBonds['user-1'].interactions, 1);

        const throttled = engine.processMessage({
            guildState,
            channelId: 'ch-1',
            userId: 'user-1',
            userName: 'Alex',
            content: 'komaru hi again!',
            now: now + 200,
        });
        assert.strictEqual(throttled.rateLimited, true);
    });

    await runTestCase('service triggers without @mention and persists channel toggles', () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'komaru-chat-'));
        const statePath = path.join(tempDir, 'state.json');
        const service = new KomaruChatService(statePath, () => TEST_CONFIG);

        // Plain @mention does NOT trigger komaruChat (reserved for userCommands)
        const mentionOnly = service.shouldRespondToMessage(
            {
                guildId: 'g1',
                channelId: 'c1',
                author: { id: 'u1', bot: false },
                content: '<@999999>',
            },
            '999999',
            () => 0.99,
        );
        assert.strictEqual(mentionOnly.shouldRespond, false);

        // Saying "komaru" triggers komaruChat
        const keywordTrigger = service.shouldRespondToMessage(
            {
                guildId: 'g1',
                channelId: 'c1',
                author: { id: 'u1', bot: false },
                content: 'komaru how are you?',
            },
            '999999',
            () => 0.99,
        );
        assert.strictEqual(keywordTrigger.shouldRespond, true);

        // Replying to Komaru's message triggers komaruChat
        const replyTrigger = service.shouldRespondToMessage(
            {
                guildId: 'g1',
                channelId: 'c1',
                author: { id: 'u1', bot: false },
                content: 'that is so cute',
                reference: { messageId: 'm1' },
                mentions: { repliedUser: { id: '999999' } },
            },
            '999999',
            () => 0.99,
        );
        assert.strictEqual(replyTrigger.shouldRespond, true);

        // Channel enablement persists across reload
        assert.strictEqual(service.enableChannel('g1', 'c2'), true);
        const reloaded = new KomaruChatService(statePath, () => TEST_CONFIG);
        assert.strictEqual(reloaded.isChannelEnabled('g1', 'c2'), true);
        assert.strictEqual(
            reloaded.shouldRespondToMessage(
                {
                    guildId: 'g1',
                    channelId: 'c2',
                    author: { id: 'u1', bot: false },
                    content: 'just chatting here',
                },
                '999999',
                () => 0.1,
            ).shouldRespond,
            true,
        );
    });
}

void runTests();
