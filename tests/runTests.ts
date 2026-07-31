import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const projectRoot = path.resolve(__dirname, '..');
const testsDir = __dirname;
const testFiles = fs
    .readdirSync(testsDir)
    .filter((file) => file.endsWith('.test.ts'))
    .sort();

const tsNodeBin = path.join(
    projectRoot,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'ts-node.cmd' : 'ts-node',
);

let passed = 0;
let failed = 0;

console.log(`Starting ${testFiles.length} test suite(s)...`);

for (const testFile of testFiles) {
    const absoluteTestPath = path.join(testsDir, testFile);
    console.log(`\n=== ${testFile} ===`);

    const result = spawnSync(tsNodeBin, [absoluteTestPath], {
        cwd: projectRoot,
        encoding: 'utf8',
        stdio: 'pipe',
    });

    if (result.stdout) {
        process.stdout.write(result.stdout);
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
console.log(`Total: ${passed + failed}`);

process.exitCode = failed > 0 ? 1 : 0;
