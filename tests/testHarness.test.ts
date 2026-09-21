import assert from 'node:assert';
import {
    DEFAULT_PRIORITY,
    isDryRunEnabled,
    isSkipEnabled,
    parseSuitePriority,
    runTestCase,
    runSkippableTestCase,
    skipSuiteIfEnabled,
    sortTestSuites,
    TestCaseOptions,
    TestSuiteInfo,
} from './testHarness';

export const priority = 100;

async function runTestHarnessTests(): Promise<void> {
    await runTestCase('testHarness runs standard test case', async () => {
        let executed = false;
        await runTestCase('inner test case', () => {
            executed = true;
        });
        assert.strictEqual(executed, true);
    });

    await runTestCase('testHarness propagates errors from failing test cases', async () => {
        let threw = false;
        try {
            await runTestCase('failing inner test case', () => {
                throw new Error('expected error');
            });
        } catch (err: any) {
            threw = true;
            assert.strictEqual(err.message, 'expected error');
        }
        assert.strictEqual(threw, true);
    });

    await runTestCase('testHarness skips skippable test when skip is active', async () => {
        const originalEnv = process.env.SKIP_SKIPPABLE;
        process.env.SKIP_SKIPPABLE = 'true';

        try {
            assert.strictEqual(isSkipEnabled(), true);

            let fnExecuted = false;
            await runTestCase(
                'skippable test with options object',
                () => {
                    fnExecuted = true;
                },
                { skippable: true },
            );
            assert.strictEqual(fnExecuted, false);

            let fnExecuted2 = false;
            await runTestCase(
                'skippable test with options as second argument',
                { skippable: true },
                () => {
                    fnExecuted2 = true;
                },
            );
            assert.strictEqual(fnExecuted2, false);

            let fnExecuted3 = false;
            await runTestCase(
                'skippable test with boolean parameter',
                () => {
                    fnExecuted3 = true;
                },
                true,
            );
            assert.strictEqual(fnExecuted3, false);

            let fnExecuted4 = false;
            await runSkippableTestCase('skippable test with runSkippableTestCase helper', () => {
                fnExecuted4 = true;
            });
            assert.strictEqual(fnExecuted4, false);

            let fnExecuted5 = false;
            await runTestCase.skippable('skippable test with runTestCase.skippable', () => {
                fnExecuted5 = true;
            });
            assert.strictEqual(fnExecuted5, false);

            let fnExecuted6 = false;
            await runTestCase.skip('skippable test with runTestCase.skip', () => {
                fnExecuted6 = true;
            });
            assert.strictEqual(fnExecuted6, false);

            assert.strictEqual(skipSuiteIfEnabled('testing suite skip'), true);
        } finally {
            if (originalEnv !== undefined) {
                process.env.SKIP_SKIPPABLE = originalEnv;
            } else {
                delete process.env.SKIP_SKIPPABLE;
            }
        }
    });

    await runTestCase('testHarness executes skippable test when skip is inactive', async () => {
        const originalEnv = process.env.SKIP_SKIPPABLE;
        const originalArgv = [...process.argv];
        delete process.env.SKIP_SKIPPABLE;
        process.argv = process.argv.filter((arg) => arg !== '--skip');

        try {
            assert.strictEqual(isSkipEnabled(), false);

            let fnExecuted = false;
            await runTestCase(
                'skippable test executed when skip disabled',
                () => {
                    fnExecuted = true;
                },
                { skippable: true },
            );
            assert.strictEqual(fnExecuted, true);

            let fnExecuted2 = false;
            await runSkippableTestCase('runSkippableTestCase executed when skip disabled', () => {
                fnExecuted2 = true;
            });
            assert.strictEqual(fnExecuted2, true);

            assert.strictEqual(skipSuiteIfEnabled('should not skip'), false);
        } finally {
            if (originalEnv !== undefined) {
                process.env.SKIP_SKIPPABLE = originalEnv;
            } else {
                delete process.env.SKIP_SKIPPABLE;
            }
            process.argv = originalArgv;
        }
    });

    await runTestCase('parseSuitePriority extracts priority from various formats', () => {
        assert.strictEqual(parseSuitePriority('export const priority = 10;'), 10);
        assert.strictEqual(parseSuitePriority('export const priority: number = -5;'), -5);
        assert.strictEqual(parseSuitePriority('export const suitePriority = 25;'), 25);
        assert.strictEqual(parseSuitePriority('// @priority 15'), 15);
        assert.strictEqual(parseSuitePriority('// @priority: -1'), -1);
        assert.strictEqual(parseSuitePriority('// priority: 50'), 50);
        assert.strictEqual(parseSuitePriority('/* @priority 42 */'), 42);
        assert.strictEqual(parseSuitePriority('// ordinary test file content'), DEFAULT_PRIORITY);
        assert.strictEqual(parseSuitePriority(''), DEFAULT_PRIORITY);
    });

    await runTestCase(
        'sortTestSuites prioritizes, ties alphabetically, and disables negatives',
        () => {
            const suites: TestSuiteInfo[] = [
                { file: 'b_normal.test.ts', priority: 0 },
                { file: 'a_normal.test.ts', priority: 0 },
                { file: 'high_prio.test.ts', priority: 50 },
                { file: 'very_high.test.ts', priority: 100 },
                { file: 'disabled_two.test.ts', priority: -2 },
                { file: 'disabled_one.test.ts', priority: -1 },
                { file: 'medium_prio_b.test.ts', priority: 25 },
                { file: 'medium_prio_a.test.ts', priority: 25 },
            ];

            const { enabled, disabled } = sortTestSuites(suites);

            assert.deepStrictEqual(
                enabled.map((s) => s.file),
                [
                    'very_high.test.ts',
                    'high_prio.test.ts',
                    'medium_prio_a.test.ts',
                    'medium_prio_b.test.ts',
                    'a_normal.test.ts',
                    'b_normal.test.ts',
                ],
            );

            assert.deepStrictEqual(
                disabled.map((s) => s.file),
                ['disabled_one.test.ts', 'disabled_two.test.ts'],
            );
        },
    );

    await runTestCase('isDryRunEnabled detects CLI arguments and environment variables', () => {
        const originalEnv = process.env.DRY_RUN;
        const originalArgv = [...process.argv];

        try {
            delete process.env.DRY_RUN;
            process.argv = process.argv.filter((a) => a !== '--dry-run' && a !== '-d');
            assert.strictEqual(isDryRunEnabled(), false);

            process.argv.push('--dry-run');
            assert.strictEqual(isDryRunEnabled(), true);

            process.argv = process.argv.filter((a) => a !== '--dry-run');
            process.argv.push('-d');
            assert.strictEqual(isDryRunEnabled(), true);

            process.argv = process.argv.filter((a) => a !== '-d');
            process.env.DRY_RUN = 'true';
            assert.strictEqual(isDryRunEnabled(), true);
        } finally {
            if (originalEnv !== undefined) {
                process.env.DRY_RUN = originalEnv;
            } else {
                delete process.env.DRY_RUN;
            }
            process.argv = originalArgv;
        }
    });
}

runTestHarnessTests().catch((err) => {
    console.error(err);
    process.exit(1);
});
