import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { runTestCase } from './testHarness';
import {
    crc32,
    formatRgbString,
    generateColorSquarePng,
    getRandomHexColor,
    hexToRgb,
    rgbToHex,
} from '../src/utils/imageUtils';
import {
    advanceColorOfTheDay,
    buildAnnouncementEmbed,
    buildColorAttachment,
    buildColorOfTheDayEmbed,
    buildTierListActionRow,
    buildTierListEmbed,
    calculateVotesSummary,
    ColorTier,
    getCurrentColor,
    getGuildChannel,
    getHistoricalTierList,
    loadState,
    recordVote,
    removeGuildChannel,
    saveState,
    scoreToTier,
    setDefaultDataFilePath,
    setGuildChannel,
    TIER_SCORES,
    VALID_TIERS,
} from '../src/services/colorOfTheDayService';

export const priority = 15;

const testStateFile = path.resolve(__dirname, '../data/test_color_of_the_day_state.json');

async function runColorOfTheDayTests(): Promise<void> {
    setDefaultDataFilePath(testStateFile);

    // Clean up test file before tests
    if (fs.existsSync(testStateFile)) {
        fs.unlinkSync(testStateFile);
    }

    await runTestCase('imageUtils: hex and RGB conversion functions', () => {
        const rgb1 = hexToRgb('#FF5733');
        assert.strictEqual(rgb1.r, 255);
        assert.strictEqual(rgb1.g, 87);
        assert.strictEqual(rgb1.b, 51);

        const rgb2 = hexToRgb('00FFAA');
        assert.strictEqual(rgb2.r, 0);
        assert.strictEqual(rgb2.g, 255);
        assert.strictEqual(rgb2.b, 170);

        const rgb3 = hexToRgb('#ABC');
        assert.strictEqual(rgb3.r, 170);
        assert.strictEqual(rgb3.g, 187);
        assert.strictEqual(rgb3.b, 204);

        assert.strictEqual(rgbToHex(255, 87, 51), '#FF5733');
        assert.strictEqual(rgbToHex(0, 0, 0), '#000000');
        assert.strictEqual(rgbToHex(255, 255, 255), '#FFFFFF');

        assert.strictEqual(formatRgbString(255, 87, 51), 'rgb(255, 87, 51)');

        const randomHex = getRandomHexColor();
        assert.match(randomHex, /^#[0-9A-F]{6}$/);
    });

    await runTestCase('imageUtils: CRC32 checksum calculation', () => {
        const testBuf = Buffer.from('123456789', 'ascii');
        // Standard CRC32 of '123456789' is 0xCBF43926 (3421780262)
        assert.strictEqual(crc32(testBuf), 3421780262);
    });

    await runTestCase('imageUtils: generates valid solid color PNG buffer', () => {
        const buffer = generateColorSquarePng('#E63946', 64);
        assert.ok(buffer.length > 0);

        // Check PNG signature: 89 50 4E 47 0D 0A 1A 0A
        assert.strictEqual(buffer[0], 0x89);
        assert.strictEqual(buffer[1], 0x50); // P
        assert.strictEqual(buffer[2], 0x4e); // N
        assert.strictEqual(buffer[3], 0x47); // G
        assert.strictEqual(buffer[4], 0x0d);
        assert.strictEqual(buffer[5], 0x0a);
        assert.strictEqual(buffer[6], 0x1a);
        assert.strictEqual(buffer[7], 0x0a);

        // Check IHDR width and height
        const width = buffer.readUInt32BE(16);
        const height = buffer.readUInt32BE(20);
        assert.strictEqual(width, 64);
        assert.strictEqual(height, 64);
    });

    await runTestCase('colorOfTheDay: tier score mapping and boundary conditions', () => {
        assert.strictEqual(scoreToTier(5.0), 'S');
        assert.strictEqual(scoreToTier(4.5), 'S');
        assert.strictEqual(scoreToTier(4.49), 'A');
        assert.strictEqual(scoreToTier(3.5), 'A');
        assert.strictEqual(scoreToTier(3.49), 'B');
        assert.strictEqual(scoreToTier(2.5), 'B');
        assert.strictEqual(scoreToTier(2.49), 'C');
        assert.strictEqual(scoreToTier(1.5), 'C');
        assert.strictEqual(scoreToTier(1.49), 'D');
        assert.strictEqual(scoreToTier(0.5), 'D');
        assert.strictEqual(scoreToTier(0.49), 'F');
        assert.strictEqual(scoreToTier(0.0), 'F');
    });

    await runTestCase('colorOfTheDay: votes calculation and summary averaging', () => {
        // Empty votes
        const emptySummary = calculateVotesSummary({});
        assert.strictEqual(emptySummary.totalVotes, 0);
        assert.strictEqual(emptySummary.tier, 'C');

        // Unanimous S votes
        const unanimousS = calculateVotesSummary({
            user1: 'S',
            user2: 'S',
            user3: 'S',
        });
        assert.strictEqual(unanimousS.totalVotes, 3);
        assert.strictEqual(unanimousS.averageScore, 5.0);
        assert.strictEqual(unanimousS.tier, 'S');

        // Mixed votes: S (5), A (4), B (3) -> avg (5+4+3)/3 = 4.0 -> A
        const mixedSummary = calculateVotesSummary({
            user1: 'S',
            user2: 'A',
            user3: 'B',
        });
        assert.strictEqual(mixedSummary.totalVotes, 3);
        assert.strictEqual(mixedSummary.averageScore, 4.0);
        assert.strictEqual(mixedSummary.tier, 'A');
        assert.strictEqual(mixedSummary.breakdown.S, 1);
        assert.strictEqual(mixedSummary.breakdown.A, 1);
        assert.strictEqual(mixedSummary.breakdown.B, 1);
        assert.strictEqual(mixedSummary.breakdown.F, 0);
    });

    await runTestCase('colorOfTheDay: state persistence and user voting', () => {
        // Reset state
        saveState({
            currentColor: {
                hex: '#112233',
                rgb: hexToRgb('#112233'),
                date: '2026-09-21',
                votes: {},
            },
            history: [],
            guilds: {},
            lastCycleTimestamp: Date.now(),
        });

        const current = getCurrentColor();
        assert.strictEqual(current.hex, '#112233');

        // User 1 votes S
        const vote1 = recordVote('user-101', 'S');
        assert.strictEqual(vote1.success, true);
        assert.strictEqual(vote1.tier, 'S');
        assert.strictEqual(vote1.totalVotes, 1);

        // User 2 votes B
        const vote2 = recordVote('user-102', 'B');
        assert.strictEqual(vote2.success, true);
        assert.strictEqual(vote2.tier, 'B');
        assert.strictEqual(vote2.totalVotes, 2);

        // User 1 changes vote to A
        const vote3 = recordVote('user-101', 'A');
        assert.strictEqual(vote3.success, true);
        assert.strictEqual(vote3.oldTier, 'S');
        assert.strictEqual(vote3.tier, 'A');
        assert.strictEqual(vote3.totalVotes, 2);

        // Reject invalid tier
        const voteInvalid = recordVote('user-103', 'Z');
        assert.strictEqual(voteInvalid.success, false);

        // Verify loaded state from disk
        const state = loadState();
        assert.strictEqual(state.currentColor?.votes['user-101'], 'A');
        assert.strictEqual(state.currentColor?.votes['user-102'], 'B');
    });

    await runTestCase('colorOfTheDay: guild channel configuration', () => {
        setGuildChannel('guild-1', 'channel-999');
        assert.strictEqual(getGuildChannel('guild-1'), 'channel-999');
        assert.strictEqual(getGuildChannel('guild-2'), undefined);

        const removed = removeGuildChannel('guild-1');
        assert.strictEqual(removed, true);
        assert.strictEqual(getGuildChannel('guild-1'), undefined);
        assert.strictEqual(removeGuildChannel('nonexistent'), false);
    });

    await runTestCase('colorOfTheDay: 24h cycle advancement and historical tier list', () => {
        // Setup state with active color '#FF0000' and votes (S, S, A -> avg 4.67 -> S)
        saveState({
            currentColor: {
                hex: '#FF0000',
                rgb: hexToRgb('#FF0000'),
                date: '2026-09-20',
                votes: {
                    u1: 'S',
                    u2: 'S',
                    u3: 'A',
                },
            },
            history: [],
            guilds: {
                'guild-1': { channelId: 'channel-1' },
            },
            lastCycleTimestamp: Date.now() - 25 * 60 * 60 * 1000, // 25 hours ago
        });

        // Advance cycle
        const result = advanceColorOfTheDay(false);
        assert.strictEqual(result.advanced, true);
        assert.ok(result.previousColor !== null);
        assert.strictEqual(result.previousColor?.hex, '#FF0000');
        assert.strictEqual(result.previousColor?.tier, 'S');
        assert.strictEqual(result.previousColor?.averageScore, 4.67);

        assert.ok(result.newColor !== null);
        assert.match(result.newColor.hex, /^#[0-9A-F]{6}$/);
        assert.deepStrictEqual(result.newColor.votes, {});

        // Check history
        const state = loadState();
        assert.strictEqual(state.history.length, 1);
        assert.strictEqual(state.history[0].hex, '#FF0000');

        const tierList = getHistoricalTierList();
        assert.strictEqual(tierList.S.length, 1);
        assert.strictEqual(tierList.S[0].hex, '#FF0000');
        assert.strictEqual(tierList.A.length, 0);
    });

    await runTestCase('colorOfTheDay: embed and select menu component generation', () => {
        const color = getCurrentColor();
        const attachment = buildColorAttachment(color.hex);
        assert.ok(attachment !== null);

        const embed = buildColorOfTheDayEmbed(color);
        assert.ok(embed.data.title?.includes(color.hex));

        const announcementEmbed = buildAnnouncementEmbed(color, null);
        assert.ok(announcementEmbed.data.title?.includes(color.hex));

        // Tier list overview
        const overviewEmbed = buildTierListEmbed('all');
        assert.strictEqual(overviewEmbed.data.title, '🏆 Color of the Day — Historical Tier List');

        // Specific tier view
        const tierSEmbed = buildTierListEmbed('S');
        assert.ok(tierSEmbed.data.title?.includes('Tier S'));

        // Select menu component
        const actionRow = buildTierListActionRow('all', 'user-123');
        const json = actionRow.toJSON();
        assert.strictEqual(json.components[0].custom_id, 'cotd_tier_select:user-123');
        assert.ok(json.components[0].options.length >= 7); // All + S + A + B + C + D + F
    });

    // Clean up test file
    if (fs.existsSync(testStateFile)) {
        fs.unlinkSync(testStateFile);
    }
}

runColorOfTheDayTests().catch((err) => {
    console.error(err);
    process.exit(1);
});
