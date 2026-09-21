import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
    isDryRunEnabled,
    isSkipEnabled,
    parseSuitePriority,
    sortTestSuites,
    TestSuiteInfo,
} from './testHarness';

const projectRoot = path.resolve(__dirname, '..');
const testsDir = __dirname;

const isSkip = isSkipEnabled();
const isDryRun = isDryRunEnabled();

let allTestFiles = fs.readdirSync(testsDir).filter((file) => file.endsWith('.test.ts'));

if (isDryRun) {
    allTestFiles = allTestFiles.filter((file) => file === 'testHarness.test.ts');
    if (allTestFiles.length === 0) {
        allTestFiles = ['testHarness.test.ts'];
    }
}

const suiteInfos: TestSuiteInfo[] = allTestFiles.map((file) => {
    const filePath = path.join(testsDir, file);
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        return {
            file,
            priority: parseSuitePriority(content),
        };
    } catch {
        return { file, priority: 0 };
    }
});

const { enabled: testFiles, disabled: disabledFiles } = sortTestSuites(suiteInfos);

const tsNodeBin = path.join(
    projectRoot,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'ts-node.cmd' : 'ts-node',
);

let passed = 0;
let failed = 0;
let skipped = 0;

if (isDryRun) {
    console.log(
        `[DRY RUN] Running test harness suite (${testFiles.map((s) => s.file).join(', ')})${isSkip ? ' with --skip' : ''}...`,
    );
} else {
    console.log(`Starting ${testFiles.length} test suite(s)${isSkip ? ' (--skip active)' : ''}...`);
}

if (disabledFiles.length > 0) {
    for (const d of disabledFiles) {
        console.log(`[DISABLED] ${d.file} (negative priority: ${d.priority})`);
    }
}

for (const suite of testFiles) {
    const testFile = suite.file;
    const absoluteTestPath = path.join(testsDir, testFile);
    console.log(
        `\n=== ${testFile}${suite.priority !== 0 ? ` (priority: ${suite.priority})` : ''} ===`,
    );

    const childArgs = [absoluteTestPath];
    if (isSkip) {
        childArgs.push('--skip');
    }

    const result = spawnSync(tsNodeBin, childArgs, {
        cwd: projectRoot,
        encoding: 'utf8',
        stdio: 'pipe',
        env: {
            ...process.env,
            ...(isSkip ? { SKIP_SKIPPABLE: 'true' } : {}),
        },
    });

    if (result.stdout) {
        process.stdout.write(result.stdout);
        const matches = result.stdout.match(/^\[SKIP\] /gm);
        if (matches) {
            skipped += matches.length;
        }
    }

    if (result.stderr) {
        process.stderr.write(result.stderr);
    }

    if (result.error) {
        console.error(`Failed to start ${testFile}: ${result.error.message}`);
        failed += 1;
        continue;
    }

    if (result.status === 0) {
        passed += 1;
        console.log(`[PASS] ${testFile}`);
    } else {
        failed += 1;
        console.log(`[FAIL] ${testFile} (exit code ${result.status})`);
    }
}

console.log('\n=== Test Summary ===');
console.log(`Success: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Skipped: ${skipped}`);
if (disabledFiles.length > 0) {
    console.log(`Disabled: ${disabledFiles.length}`);
}
console.log(`Total: ${passed + failed}`);

process.exitCode = failed > 0 ? 1 : 0;
