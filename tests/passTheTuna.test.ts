import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
    createPassTheTunaEngine,
    loadPassTheTunaState,
    loadPassTheTunaConfig,
    savePassTheTunaState,
    savePassTheTunaConfig,
    type PassTheTunaState,
} from '../src/passTheTuna';
import { runTestCase } from './testHarness';

async function runTests() {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pass-tuna-tests-'));
    const engine = createPassTheTunaEngine(tempDir);

    const initialConfig = loadPassTheTunaConfig(tempDir);
    const configOverride = {
        ...initialConfig,
        passBaseScore: 10,
        takeBaseScore: 12,
        gracePeriodSeconds: 5,
        deliciousThresholdMin: 3,
        deliciousThresholdMax: 3,
        events: [
            {
                id: 'frozen',
                name: 'Frozen Tuna',
                description: 'The take is canceled into a pass.',
                type: 'frozen',
                chance: 1,
                hidden: true,
            },
        ],
    };

    savePassTheTunaConfig(configOverride, tempDir);

    runTestCase('pass the tuna chain flow', () => {
        const chain = engine.startChain({
            channelId: 'channel-1',
            guildId: 'guild-1',
            now: 1_000,
            config: configOverride,
        });
        assert.strictEqual(chain.chainLength, 0);
        assert.strictEqual(chain.deliciousThreshold, 3);

        const passOutcome = engine.handleAction({ userId: 'user-1', action: 'pass', now: 2_000 });
        assert.strictEqual(passOutcome.chainLength, 1);
        assert.strictEqual(passOutcome.score, 10);
        assert.strictEqual(passOutcome.action, 'pass');

        const blockedOutcome = engine.handleAction({
            userId: 'user-1',
            action: 'take',
            now: 2_000 + 2_000,
        });
        assert.strictEqual(blockedOutcome.blocked, true);
        assert.strictEqual(blockedOutcome.reason, 'grace_period');

        const secondPassOutcome = engine.handleAction({
            userId: 'user-2',
            action: 'pass',
            now: 2_000 + 6_000,
        });
        assert.strictEqual(secondPassOutcome.chainLength, 2);
        assert.strictEqual(secondPassOutcome.score, 20);
    });

    runTestCase('pass the tuna take and persistence', () => {
        const takeOutcome = engine.handleAction({
            userId: 'user-3',
            action: 'take',
            now: 2_000 + 10_000,
        });
        assert.strictEqual(takeOutcome.chainEnded, true);
        assert.strictEqual(takeOutcome.action, 'pass');
        assert.strictEqual(takeOutcome.event?.type, 'frozen');
        assert.strictEqual(takeOutcome.score, 0);

        const persistedState = loadPassTheTunaState(tempDir);
        assert.strictEqual(persistedState.active, true);
        assert.strictEqual(persistedState.chainId, 2);
        assert.strictEqual(persistedState.leaderboard['user-3']?.totalScore, 0);
    });

    runTestCase('pass the tuna idle penalty', () => {
        const idlePenaltyConfig = {
            ...configOverride,
            idlePenaltyThresholdHours: 1,
            idlePenaltyMultiplier: 0.5,
        };
        const idleChain = engine.startChain({
            channelId: 'channel-2',
            guildId: 'guild-1',
            now: 20_000,
            config: idlePenaltyConfig,
        });
        const idleOutcome = engine.handleAction({
            userId: 'user-4',
            action: 'pass',
            now: 20_000 + 3_600_000 + 1,
        });
        assert.strictEqual(idleOutcome.score, 5);
        assert.strictEqual(idleOutcome.penaltyApplied, true);

        const persistedIdleState: PassTheTunaState = {
            active: true,
            chainId: idleChain.id,
            nextChainId: 2,
            currentChain: idleChain,
            leaderboard: {},
        };
        const savedState = savePassTheTunaState(persistedIdleState, tempDir);
        assert.strictEqual(savedState.active, true);
    });

    runTestCase('pass the tuna compact messaging on pass', () => {
        const passDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pass-tuna-msg-'));
        const passEngine = createPassTheTunaEngine(passDir);
        const passConfig = {
            ...initialConfig,
            passBaseScore: 10,
            deliciousThresholdMin: 5,
            deliciousThresholdMax: 5,
            announcementTurnsBeforeDelicious: 1,
        };
        passEngine.startChain({
            channelId: 'channel-msg',
            guildId: 'guild-1',
            now: 1_000,
            config: passConfig,
        });

        // 1. Pass with userName provided
        const pass1 = passEngine.handleAction({
            userId: 'user-alice',
            userName: 'Alice',
            action: 'pass',
            now: 2_000,
        });
        assert.strictEqual(pass1.score, 10);
        assert.strictEqual(pass1.chainLength, 1);
        assert.strictEqual(
            pass1.message,
            '🐟 **Alice** passed the tuna! | ⛓️ Chain: **1** | ⭐ **+10 pts**',
        );
        // Verify no ping mention
        assert.strictEqual(pass1.message.includes('<@'), false);

        // 2. Pass without userName (fallback to non-pinging user id display)
        const pass2 = passEngine.handleAction({
            userId: 'user-bob',
            action: 'pass',
            now: 10_000,
        });
        assert.strictEqual(
            pass2.message,
            '🐟 **user-bob** passed the tuna! | ⛓️ Chain: **2** | ⭐ **+20 pts**',
        );
        assert.strictEqual(pass2.message.includes('<@'), false);

        // 3. Delicious announcement triggered at chain length 4 (threshold 5, announcementTurns 1)
        passEngine.handleAction({ userId: 'user-alice', action: 'pass', now: 18_000 });
        const pass4 = passEngine.handleAction({
            userId: 'user-bob',
            userName: 'Bob',
            action: 'pass',
            now: 26_000,
        });
        assert.strictEqual(pass4.chainLength, 4);
        assert.strictEqual(
            pass4.message,
            '🐟 **Bob** passed the tuna! | ⛓️ Chain: **4** | ⭐ **+40 pts** | 🤤 *The tuna smells delicious!*',
        );
        assert.strictEqual(pass4.message.includes('<@'), false);
    });

    runTestCase('pass the tuna score_boost event and messaging', () => {
        const boostDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pass-tuna-boost-'));
        const boostEngine = createPassTheTunaEngine(boostDir);
        const boostConfig = {
            ...initialConfig,
            takeBaseScore: 10,
            deliciousThresholdMin: 2,
            deliciousThresholdMax: 2,
            events: [
                {
                    id: 'spicy_tuna',
                    name: 'Spicy Tuna',
                    description: 'A spicy twist awards the taker extra points.',
                    type: 'score_boost',
                    chance: 1,
                    multiplier: 2.5,
                },
            ],
        };

        boostEngine.startChain({
            channelId: 'channel-boost',
            guildId: 'guild-1',
            now: 1_000,
            config: boostConfig,
        });
        boostEngine.handleAction({
            userId: 'user-1',
            userName: 'Player1',
            action: 'pass',
            now: 2_000,
        });
        boostEngine.handleAction({
            userId: 'user-2',
            userName: 'Player2',
            action: 'pass',
            now: 8_000,
        });

        const takeResult = boostEngine.handleAction({
            userId: 'user-3',
            userName: 'Player3',
            action: 'take',
            now: 14_000,
        });

        assert.strictEqual(takeResult.chainEnded, true);
        assert.strictEqual(takeResult.action, 'take');
        assert.strictEqual(takeResult.event?.id, 'spicy_tuna');
        // Base 10 * length 2 * multiplier 2.5 = 50
        assert.strictEqual(takeResult.score, 50);
        assert.strictEqual(
            takeResult.message,
            '🍣 **Player3** took the tuna! | ⛓️ Chain: **2** | ⭐ **+50 pts** | 👥 Participants: **Player1**, **Player2** | 🎉 **Event: Spicy Tuna** (A spicy twist awards the taker extra points.)',
        );
        assert.strictEqual(takeResult.message.includes('<@'), false);
    });

    runTestCase('pass the tuna chain_bonus event and messaging', () => {
        const bonusDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pass-tuna-bonus-'));
        const bonusEngine = createPassTheTunaEngine(bonusDir);
        const bonusConfig = {
            ...initialConfig,
            takeBaseScore: 10,
            deliciousThresholdMin: 2,
            deliciousThresholdMax: 2,
            events: [
                {
                    id: 'chain_bonus',
                    name: 'Chain Bonus',
                    description: 'Everyone in the chain except the taker gets a small bonus.',
                    type: 'chain_bonus',
                    chance: 1,
                    bonusAmount: 15,
                },
            ],
        };

        bonusEngine.startChain({
            channelId: 'channel-bonus',
            guildId: 'guild-1',
            now: 1_000,
            config: bonusConfig,
        });
        bonusEngine.handleAction({ userId: 'user-passer1', action: 'pass', now: 2_000 });
        bonusEngine.handleAction({ userId: 'user-passer2', action: 'pass', now: 8_000 });

        const takeResult = bonusEngine.handleAction({
            userId: 'user-taker',
            userName: 'TakerUser',
            action: 'take',
            now: 14_000,
        });

        assert.strictEqual(takeResult.event?.id, 'chain_bonus');
        assert.strictEqual(takeResult.score, 20); // 10 * 2
        assert.strictEqual(
            takeResult.message,
            '🍣 **TakerUser** took the tuna! | ⛓️ Chain: **2** | ⭐ **+20 pts** | 👥 Participants: **user-passer1**, **user-passer2** | 🎉 **Event: Chain Bonus** (Everyone in the chain except the taker gets a small bonus.)',
        );
        assert.strictEqual(takeResult.message.includes('<@'), false);

        // Verify chain participants received bonus
        const state = loadPassTheTunaState(bonusDir);
        assert.strictEqual(state.leaderboard['user-passer1']?.totalScore, 10 + 15);
        assert.strictEqual(state.leaderboard['user-passer2']?.totalScore, 20 + 15);
    });

    runTestCase('pass the tuna rotten event and messaging', () => {
        const rottenDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pass-tuna-rotten-'));
        const rottenEngine = createPassTheTunaEngine(rottenDir);
        const rottenConfig = {
            ...initialConfig,
            takeBaseScore: 10,
            deliciousThresholdMin: 2,
            deliciousThresholdMax: 2,
            events: [
                {
                    id: 'rotten_tuna',
                    name: 'Rotten Tuna',
                    description: 'The tuna is spoiled and awards no score.',
                    type: 'rotten',
                    chance: 1,
                    hidden: true,
                },
            ],
        };

        rottenEngine.startChain({
            channelId: 'channel-rotten',
            guildId: 'guild-1',
            now: 1_000,
            config: rottenConfig,
        });
        rottenEngine.handleAction({ userId: 'user-1', action: 'pass', now: 2_000 });
        rottenEngine.handleAction({ userId: 'user-2', action: 'pass', now: 8_000 });

        const takeResult = rottenEngine.handleAction({
            userId: 'user-3',
            userName: 'UnluckyPlayer',
            action: 'take',
            now: 14_000,
        });

        assert.strictEqual(takeResult.action, 'take');
        assert.strictEqual(takeResult.score, 0);
        assert.strictEqual(takeResult.event?.type, 'rotten');
        assert.strictEqual(
            takeResult.message,
            '🪰 **UnluckyPlayer** took the tuna, but it was rotten! | ⛓️ Chain: **2** | ⭐ **+0 pts** | 👥 Participants: **user-1**, **user-2** | 🤢 **Event: Rotten Tuna** (The tuna is spoiled and awards no score.)',
        );
        assert.strictEqual(takeResult.message.includes('<@'), false);
    });

    runTestCase('pass the tuna take too early (too fresh)', () => {
        const freshDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pass-tuna-fresh-'));
        const freshEngine = createPassTheTunaEngine(freshDir);
        const freshConfig = {
            ...initialConfig,
            takeBaseScore: 10,
            deliciousThresholdMin: 10,
            deliciousThresholdMax: 10,
            events: [],
        };

        freshEngine.startChain({
            channelId: 'channel-fresh',
            guildId: 'guild-1',
            now: 1_000,
            config: freshConfig,
        });
        freshEngine.handleAction({ userId: 'user-1', action: 'pass', now: 2_000 });

        const takeResult = freshEngine.handleAction({
            userId: 'user-2',
            userName: 'EagerPlayer',
            action: 'take',
            now: 8_000,
        });

        assert.strictEqual(takeResult.score, 0);
        assert.strictEqual(takeResult.event, undefined);
        assert.strictEqual(
            takeResult.message,
            '🍣 **EagerPlayer** took the tuna too early! | ⛓️ Chain: **1** (needed **10**) | ⭐ **+0 pts** | 👥 Participants: **user-1**',
        );
        assert.strictEqual(takeResult.message.includes('<@'), false);
    });

    runTestCase('pass the tuna participants display names and no pings', () => {
        const partDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pass-tuna-participants-'));
        const partEngine = createPassTheTunaEngine(partDir);
        const partConfig = {
            ...initialConfig,
            takeBaseScore: 10,
            deliciousThresholdMin: 3,
            deliciousThresholdMax: 3,
            events: [],
        };

        partEngine.startChain({
            channelId: 'channel-part',
            guildId: 'guild-1',
            now: 1_000,
            config: partConfig,
        });

        // Alice passes
        partEngine.handleAction({
            userId: '111',
            userName: 'Alice',
            action: 'pass',
            now: 2_000,
        });
        // Bob passes
        partEngine.handleAction({
            userId: '222',
            userName: 'Bob',
            action: 'pass',
            now: 8_000,
        });
        // Alice passes again (duplicate should not duplicate in participants list)
        partEngine.handleAction({
            userId: '111',
            userName: 'Alice',
            action: 'pass',
            now: 14_000,
        });

        // Charlie takes
        const takeResult = partEngine.handleAction({
            userId: '333',
            userName: 'Charlie',
            action: 'take',
            now: 20_000,
        });

        assert.strictEqual(takeResult.chainEnded, true);
        assert.strictEqual(
            takeResult.message,
            '🍣 **Charlie** took the tuna! | ⛓️ Chain: **3** | ⭐ **+30 pts** | 👥 Participants: **Alice**, **Bob**',
        );
        // Absolutely zero mentions/pings
        assert.strictEqual(takeResult.message.includes('<@'), false);
        assert.strictEqual(takeResult.message.includes('111'), false);
        assert.strictEqual(takeResult.message.includes('222'), false);
        assert.strictEqual(takeResult.message.includes('333'), false);
    });

    runTestCase('pass the tuna events happen naturally and in general', () => {
        const naturalDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pass-tuna-natural-'));
        const naturalEngine = createPassTheTunaEngine(naturalDir);
        // Realistic event config: 50% chance of event, 50% chance of normal take
        const naturalConfig = {
            ...initialConfig,
            takeBaseScore: 10,
            deliciousThresholdMin: 1,
            deliciousThresholdMax: 1,
            events: [
                {
                    id: 'score_boost',
                    name: 'Score Boost',
                    description: 'The take gets a 2x score boost.',
                    type: 'score_boost',
                    chance: 0.25,
                    multiplier: 2,
                },
                {
                    id: 'golden_tuna',
                    name: 'Golden Tuna',
                    description: 'The taker receives a 3x multiplier.',
                    type: 'score_boost',
                    chance: 0.25,
                    multiplier: 3,
                },
            ],
        };

        let eventOccurredCount = 0;
        let normalTakeCount = 0;
        const totalTrials = 60;

        for (let i = 0; i < totalTrials; i++) {
            naturalEngine.startChain({
                channelId: `channel-nat-${i}`,
                guildId: 'guild-1',
                now: 10_000 + i * 1_000,
                config: naturalConfig,
            });
            naturalEngine.handleAction({
                userId: 'passer',
                action: 'pass',
                now: 10_100 + i * 1_000,
            });
            const outcome = naturalEngine.handleAction({
                userId: 'taker',
                userName: 'PlayerX',
                action: 'take',
                now: 10_700 + i * 1_000,
            });

            // Verify message structure always includes user, chain length, points
            assert.strictEqual(outcome.message.includes('PlayerX'), true);
            assert.strictEqual(outcome.message.includes('Chain: **1**'), true);
            assert.strictEqual(outcome.message.includes('<@'), false);

            if (outcome.event) {
                eventOccurredCount++;
                assert.strictEqual(outcome.message.includes('Event:'), true);
                assert.strictEqual(outcome.score >= 20, true);
            } else {
                normalTakeCount++;
                assert.strictEqual(outcome.message.includes('Event:'), false);
                assert.strictEqual(outcome.score, 10);
            }
        }

        // Both events and non-events must happen naturally in general
        assert.ok(
            eventOccurredCount > 0,
            `Events should happen naturally (got ${eventOccurredCount}/${totalTrials})`,
        );
        assert.ok(
            normalTakeCount > 0,
            `Normal takes without events should happen naturally (got ${normalTakeCount}/${totalTrials})`,
        );
        // With 50% probability over 60 trials, eventOccurredCount should be realistically distributed (between 10 and 50)
        assert.ok(
            eventOccurredCount >= 10 && eventOccurredCount <= 50,
            `Expected event count to be statistically reasonable (got ${eventOccurredCount})`,
        );
    });
}

runTests().catch((error) => {
    console.error('Pass The Tuna test failed:', error);
    process.exit(1);
});
