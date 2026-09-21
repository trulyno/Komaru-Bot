export interface TestCaseOptions {
    skippable?: boolean;
}

export interface TestSuiteInfo {
    file: string;
    priority: number;
}

export type TestFunction = () => void | Promise<void>;

export const DEFAULT_PRIORITY = 0;

/**
 * Checks whether the skip flag (--skip) is enabled in CLI arguments or environment variables.
 */
export function isSkipEnabled(): boolean {
    return (
        process.argv.includes('--skip') ||
        process.env.SKIP_SKIPPABLE === 'true' ||
        process.env.npm_config_skip === 'true'
    );
}

/**
 * Checks whether dry run mode (--dry-run) is enabled in CLI arguments or environment variables.
 */
export function isDryRunEnabled(): boolean {
    return (
        process.argv.includes('--dry-run') ||
        process.argv.includes('-d') ||
        process.env.DRY_RUN === 'true' ||
        process.env.npm_config_dry_run === 'true'
    );
}

/**
 * Parses the suite execution priority from test file content.
 * Looks for `export const priority = <num>`, `export const suitePriority = <num>`,
 * or `// @priority <num>` / `// priority: <num>` comments.
 * Returns DEFAULT_PRIORITY (0) if none is specified.
 */
export function parseSuitePriority(content: string): number {
    const exportMatch = content.match(
        /export\s+const\s+(?:priority|suitePriority)\s*(?::\s*number\s*)?=\s*(-?\d+)/,
    );
    if (exportMatch && exportMatch[1]) {
        const parsed = parseInt(exportMatch[1], 10);
        if (!isNaN(parsed)) return parsed;
    }

    const commentMatch = content.match(
        /(?:\/\/|\/\*)\s*@?(?:suite[_-]?)?priority\s*[:=]?\s*(-?\d+)/i,
    );
    if (commentMatch && commentMatch[1]) {
        const parsed = parseInt(commentMatch[1], 10);
        if (!isNaN(parsed)) return parsed;
    }

    return DEFAULT_PRIORITY;
}

/**
 * Filters and sorts test suites:
 * - Suites with priority < 0 are separated into `disabled`.
 * - Enabled suites are sorted by priority (highest first), then alphabetically by filename.
 */
export function sortTestSuites(suites: TestSuiteInfo[]): {
    enabled: TestSuiteInfo[];
    disabled: TestSuiteInfo[];
} {
    const enabled: TestSuiteInfo[] = [];
    const disabled: TestSuiteInfo[] = [];

    for (const suite of suites) {
        if (suite.priority < 0) {
            disabled.push(suite);
        } else {
            enabled.push(suite);
        }
    }

    enabled.sort((a, b) => {
        if (b.priority !== a.priority) {
            return b.priority - a.priority;
        }
        return a.file.localeCompare(b.file);
    });

    disabled.sort((a, b) => a.file.localeCompare(b.file));

    return { enabled, disabled };
}

/**
 * Convenience helper to check if the current test suite should be skipped when --skip is enabled.
 */
export function skipSuiteIfEnabled(reason?: string): boolean {
    if (isSkipEnabled()) {
        console.log(`[SKIP] Suite skipped${reason ? `: ${reason}` : ''}`);
        return true;
    }
    return false;
}

/**
 * Runs a test case. If marked as skippable and the --skip flag is provided,
 * the test execution will be skipped and logged as [SKIP].
 */
export async function runTestCase(
    name: string,
    fnOrOptions: TestFunction | TestCaseOptions,
    maybeFnOrOptions?: TestFunction | TestCaseOptions | boolean,
): Promise<void> {
    let fn: TestFunction;
    let options: TestCaseOptions = {};

    if (typeof fnOrOptions === 'function') {
        fn = fnOrOptions;
        if (typeof maybeFnOrOptions === 'boolean') {
            options = { skippable: maybeFnOrOptions };
        } else if (maybeFnOrOptions && typeof maybeFnOrOptions === 'object') {
            options = maybeFnOrOptions;
        }
    } else if (typeof fnOrOptions === 'object' && typeof maybeFnOrOptions === 'function') {
        options = fnOrOptions;
        fn = maybeFnOrOptions;
    } else {
        throw new Error(`Invalid arguments to runTestCase("${name}")`);
    }

    if (options.skippable && isSkipEnabled()) {
        console.log(`[SKIP] ${name}`);
        return;
    }

    console.log(`[TEST] ${name}`);
    try {
        await fn();
        console.log(`[PASS] ${name}`);
    } catch (error) {
        console.log(`[FAIL] ${name}`);
        throw error;
    }
}

/**
 * Helper to run a test case that is explicitly marked as skippable.
 */
export async function runSkippableTestCase(name: string, fn: TestFunction): Promise<void> {
    return runTestCase(name, fn, { skippable: true });
}

runTestCase.skippable = async function (name: string, fn: TestFunction): Promise<void> {
    return runTestCase(name, fn, { skippable: true });
};

runTestCase.skip = async function (name: string, fn: TestFunction): Promise<void> {
    return runTestCase(name, fn, { skippable: true });
};
