#!/usr/bin/env node
const util = require('node:util');

if (typeof util.styleText !== 'function') {
    util.styleText = (_format, text) => (typeof text === 'string' ? text : String(text || ''));
}

const eslintPkg = require('eslint');

async function main() {
    const ESLint = typeof eslintPkg.loadESLint === 'function' ? await eslintPkg.loadESLint() : eslintPkg.ESLint;
    const eslint = new ESLint();
    const args = process.argv.slice(2);
    const patterns = args.length > 0 ? args : ['.'];
    const results = await eslint.lintFiles(patterns);
    const formatter = await eslint.loadFormatter('stylish');
    const resultText = await formatter.format(results);

    if (resultText && resultText.trim()) {
        console.log(resultText);
    }

    const hasErrors = results.some((r) => r.errorCount > 0);
    process.exitCode = hasErrors ? 1 : 0;
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
