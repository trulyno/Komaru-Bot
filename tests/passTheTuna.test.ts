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
}

runTests().catch((error) => {
    console.error('Pass The Tuna test failed:', error);
    process.exit(1);
});
