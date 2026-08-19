import assert from 'node:assert';
import {
    evaluateExpression,
    extractExpressionFromMessage,
    formatCatifiedResult,
} from '../src/utils/calculator';

import { evaluateExpression as moduleEvaluateExpression } from '../src/modules/calculator';
import { runTestCase } from './testHarness';

async function runTests() {
    runTestCase('calculator expression evaluation', () => {
        assert.strictEqual(evaluateExpression('2 + 3 * 4'), 14);
        assert.strictEqual(evaluateExpression('(2 + 3) * 4'), 20);
        assert.strictEqual(evaluateExpression('2^3'), 8);
        assert.strictEqual(evaluateExpression('-5 + 3'), -2);
        assert.strictEqual(moduleEvaluateExpression('10 / 2'), 5);
    });

    runTestCase('calculator variables evaluation', () => {
        // Record variables
        assert.strictEqual(evaluateExpression('x + y * 2', { x: 5, y: 10 }), 25);
        assert.strictEqual(evaluateExpression('sqrt(val)', { val: 16 }), 4);

        // Array / slot variables with remember and bracket notation
        assert.strictEqual(evaluateExpression('remember [0] + 5', [10]), 15);
        assert.strictEqual(evaluateExpression('[0] * [1]', [3, 4]), 12);
        assert.strictEqual(evaluateExpression('[test] * 2', [0, 6], { test: 1 }), 12);
        assert.strictEqual(evaluateExpression('remember [alias] + 10', [100], { alias: 0 }), 110);
    });

    runTestCase('calculator error handling', () => {
        assert.throws(() => evaluateExpression('2 + (3 - 1'), /Unexpected end/);
        assert.throws(() => evaluateExpression('2 + process.exit(1)'), /Unknown identifier/);
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
