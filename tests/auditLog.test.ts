import assert from 'node:assert';
import { buildMessageFingerprint, parseDurationToMilliseconds } from '../src/modules/auditLog';
import { runTestCase } from './testHarness';

function runAuditLogTests(): void {
    runTestCase('auditLog parsing and fingerprinting', () => {
        assert.strictEqual(parseDurationToMilliseconds('10m'), 600000);
        assert.strictEqual(parseDurationToMilliseconds('2h'), 7200000);
        assert.strictEqual(parseDurationToMilliseconds('1d'), 86400000);
        assert.strictEqual(parseDurationToMilliseconds('not-a-duration'), 0);

        const messageOne = {
            content: 'hello world',
            attachments: {
                values: () => [
                    { name: 'a.png', url: 'https://x/a.png' },
                    { name: 'b.png', url: 'https://x/b.png' },
                ],
            },
        };

        const messageTwo = {
            content: 'hello world',
            attachments: {
                values: () => [
                    { name: 'b.png', url: 'https://x/b.png' },
                    { name: 'a.png', url: 'https://x/a.png' },
                ],
            },
        };

        assert.strictEqual(
            buildMessageFingerprint(messageOne),
            buildMessageFingerprint(messageTwo),
        );
    });
}

runAuditLogTests();
