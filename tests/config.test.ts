import assert from 'node:assert';
import { config } from '../src/config';
import { runTestCase } from './testHarness';

function runConfigTests() {
    runTestCase('config manager env defaults & structure', () => {
        assert.ok(typeof config.env.logLevel === 'string');
        assert.ok(Array.isArray(config.env.verificationChannelsAllowed));
        assert.ok(Array.isArray(config.env.templateInvalidTags));
        assert.strictEqual(typeof config.env.ticketInactivityHours, 'number');
    });

    runTestCase('config manager template config', () => {
        const templates = config.templates;
        assert.ok(Array.isArray(templates.issueTemplateFields));
        assert.ok(Array.isArray(templates.suggestionTemplateFields));
        assert.ok(Array.isArray(templates.modpackVersions));
        assert.ok(templates.modpackVersions.includes('Theta 1'));
    });

    runTestCase('config manager audit log config', () => {
        const auditLog = config.auditLog;
        assert.strictEqual(typeof auditLog.duplicateSpamWindowMs, 'number');
        assert.strictEqual(typeof auditLog.ghostPingWindowMs, 'number');
        assert.strictEqual(auditLog.defaultModeratorRoleName, 'Moderator');
    });

    runTestCase('config manager reload capability', () => {
        const originalLevel = process.env.LOG_LEVEL;
        try {
            process.env.LOG_LEVEL = 'debug';
            config.reload();
            assert.strictEqual(config.env.logLevel, 'debug');
        } finally {
            if (originalLevel !== undefined) {
                process.env.LOG_LEVEL = originalLevel;
            } else {
                delete process.env.LOG_LEVEL;
            }
            config.reload();
        }
    });
}

runConfigTests();
