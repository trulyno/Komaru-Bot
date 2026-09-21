import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
    buildTimeReply,
    formatTimeForTimezone,
    parseTimeExpression,
    UserTimezoneStore,
} from '../src/modules/time';
import { runTestCase } from './testHarness';

async function runTests() {
    runTestCase('time expression parsing', () => {
        const parsedBase = parseTimeExpression('!time');
        assert.deepStrictEqual(parsedBase, { command: 'time', offsetMs: 0 });

        const parsedOffset = parseTimeExpression('!time+2h+5m+15s');
        assert.deepStrictEqual(parsedOffset, {
            command: 'time',
            offsetMs: 2 * 60 * 60 * 1000 + 5 * 60 * 1000 + 15 * 1000,
        });

        const parsedMyTime = parseTimeExpression('!mytime+2');
        assert.deepStrictEqual(parsedMyTime, { command: 'mytime', offsetMs: 2 * 60 * 60 * 1000 });

        const parsedSubtraction = parseTimeExpression('!mytime-30m');
        assert.deepStrictEqual(parsedSubtraction, { command: 'mytime', offsetMs: -30 * 60 * 1000 });
    });

    runTestCase('user timezone storage', () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'komaru-time-'));
        const storePath = path.join(tempDir, 'user_timezones.json');
        const store = new UserTimezoneStore(storePath);

        assert.strictEqual(store.getUserTimezone('user-1'), null);
        store.setUserTimezone('user-1', 'America/New_York');
        assert.strictEqual(store.getUserTimezone('user-1'), 'America/New_York');

        const reloadedStore = new UserTimezoneStore(storePath);
        assert.strictEqual(reloadedStore.getUserTimezone('user-1'), 'America/New_York');
    });

    runTestCase('timezone formatting', () => {
        const formatted = formatTimeForTimezone(
            new Date('2024-01-01T12:00:00.000Z'),
            'America/New_York',
        );
        assert.strictEqual(formatted, '07:00:00 (America/New_York)');

        const formattedUtc = formatTimeForTimezone(new Date('2024-01-01T12:00:00.000Z'), 'UTC');
        assert.strictEqual(formattedUtc, '12:00:00 (UTC)');
    });

    runTestCase('buildTimeReply output', () => {
        const timeReply = buildTimeReply({ command: 'time', offsetMs: 0 });
        assert.match(timeReply, /^Current time: \d{2}:\d{2}:\d{2} \(UTC\)$/);

        const myTimeReply = buildTimeReply({ command: 'mytime', offsetMs: 0 }, 'America/New_York');
        assert.match(
            myTimeReply,
            /^Current time for you: \d{2}:\d{2}:\d{2} \(America\/New_York\)$/,
        );

        const unregReply = buildTimeReply({ command: 'mytime', offsetMs: 0 }, null);
        assert.strictEqual(
            unregReply,
            'You have not registered a timezone yet. Use !settimezone <IANA timezone> to register one.',
        );
    });
}

runTests().catch((error) => {
    console.error('Time test failed:', error);
    process.exit(1);
});
