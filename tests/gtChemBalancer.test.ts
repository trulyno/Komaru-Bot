import assert from 'node:assert';
import { balanceChemicalEquation, isBalancedChemicalEquation } from '../src/modules/gtChemBalancer';
import { runTestCase } from './testHarness';

async function runTests() {
    runTestCase('gt chemistry balancing', () => {
        const example = balanceChemicalEquation('Na2O (d) + H2O => NaOH (d)');
        assert.strictEqual(example.isBalanced, false);
        assert.strictEqual(example.balancedEquation, '3Na2O (d) + H2O (f) => 6NaOH (d)');

        const alreadyBalanced = balanceChemicalEquation('2H2 (f) + O2 (f) => 2H2O (f)');
        assert.strictEqual(alreadyBalanced.isBalanced, true);
        assert.strictEqual(alreadyBalanced.balancedEquation, '2H2 (f) + O2 (f) => 2H2O (f)');

        const catalystExample = balanceChemicalEquation('H2 + O2 + Ni (c) => H2O + Ni (c)');
        assert.strictEqual(catalystExample.isBalanced, false);
        assert.strictEqual(
            catalystExample.balancedEquation,
            '2H2 (f) + O2 (f) + Ni (c) => 2H2O (f) + Ni (c)',
        );
    });

    runTestCase('gt chemistry balance checks', () => {
        const checked = isBalancedChemicalEquation('Na2O (d) + H2O => NaOH (d)');
        assert.strictEqual(checked, false);
    });
}

runTests().catch((err) => {
    console.error('Test failed:', err);
    process.exit(1);
});
