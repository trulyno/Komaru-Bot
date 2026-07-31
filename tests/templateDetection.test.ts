import assert from 'node:assert';
import { checkTemplateCoverage, normalizeTemplateText } from '../src/modules/templateDetection';
import { runTestCase } from './testHarness';

function assertCoverage(
    content: string,
    fields: string[],
    expectedComplete: boolean,
    expectedMissing: string[],
) {
    const [isComplete, missingFields] = checkTemplateCoverage(content, fields);
    assert.strictEqual(isComplete, expectedComplete);
    assert.deepStrictEqual(missingFields, expectedMissing);
}

function runTemplateDetectionTests() {
    runTestCase('template normalization', () => {
        const normalized = normalizeTemplateText(
            '**Modpack version:** Theta 1 Hotfix 3\n**Packmode:** hardmode\n**Description:** issue',
        );
        assert.ok(normalized.includes('modpack version'));
        assert.ok(normalized.includes('packmode'));
    });

    runTestCase('template coverage detection', () => {
        assertCoverage(
            '**Modpack version:** Theta 1 Hotfix 3\n**Packmode:** hardmode\n**Description:** issue',
            ['modpack version', 'packmode', 'is on server', 'description'],
            false,
            ['is on server'],
        );

        assertCoverage(
            '**Modpack version:** Theta 1 Hotfix 3\n*Packmode:* hardmode\n__Is on server:__ yes\n***Description:*** issue',
            ['modpack version', 'packmode', 'is on server', 'description'],
            true,
            [],
        );

        assertCoverage(
            '```md\nModpack version: Theta 1 Hotfix 3\nPackmode: hardmode\n```',
            ['modpack version', 'packmode', 'is on server', 'description'],
            false,
            ['is on server', 'description'],
        );

        assertCoverage(
            '**Description:** A new automation questline\n**How would it fit with StarT:** It gives clearer progression\n**Possible issues:** Balance concerns',
            ['description', 'how would it fit with start', 'possible issues'],
            true,
            [],
        );

        assertCoverage(
            '**Description:** A new automation questline\n**Possible issues:** Balance concerns',
            ['description', 'how would it fit with start', 'possible issues'],
            false,
            ['how would it fit with start'],
        );
    });
}

runTemplateDetectionTests();
