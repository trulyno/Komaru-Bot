import assert from 'node:assert';
import {
    evaluateExpression,
    extractExpressionFromMessage,
    formatCatifiedResult,
} from '../src/modules/calculator';
import { runTestCase } from './testHarness';

async function runTests() {
    runTestCase('calculator expression evaluation', () => {
        assert.strictEqual(evaluateExpression('2 + 3 * 4'), 14);
        assert.strictEqual(evaluateExpression('(2 + 3) * 4'), 20);
        assert.strictEqual(evaluateExpression('2^3'), 8);
        assert.strictEqual(evaluateExpression('-5 + 3'), -2);
    });

    runTestCase('calculator error handling', () => {
        assert.throws(() => evaluateExpression('2 + (3 - 1'), /Unexpected end/);
        assert.throws(() => evaluateExpression('2 + process.exit(1)'), /Unsupported character/);
    });

    runTestCase('calculator message parsing', () => {
        assert.strictEqual(extractExpressionFromMessage('!calc 4 + 5'), '4 + 5');
        assert.strictEqual(extractExpressionFromMessage('hello there'), null);
    });

    runTestCase('calculator formatting', () => {
        const reply = formatCatifiedResult('2 + 2', 4);
        assert.match(reply, /4/);
        assert.ok(reply.length > 0);
    });
}

runTests().catch((error) => {
    console.error('Calculator test failed:', error);
    process.exit(1);
});
