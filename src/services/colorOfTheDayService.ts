import fs from 'node:fs';
import path from 'node:path';
import {
    ActionRowBuilder,
    AttachmentBuilder,
    EmbedBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
} from 'discord.js';
import { logger } from '../logger';
import {
    formatRgbString,
    generateColorSquarePng,
    getRandomHexColor,
    hexToRgb,
} from '../utils/imageUtils';

export type ColorTier = 'S' | 'A' | 'B' | 'C' | 'D' | 'F';

export const VALID_TIERS: ColorTier[] = ['S', 'A', 'B', 'C', 'D', 'F'];

export const TIER_SCORES: Record<ColorTier, number> = {
    S: 5.0,
    A: 4.0,
    B: 3.0,
    C: 2.0,
    D: 1.0,
    F: 0.0,
};

export const TIER_EMOJIS: Record<ColorTier, string> = {
    S: '🌟',
    A: '✨',
    B: '🔷',
    C: '🟢',
    D: '🟡',
    F: '🔴',
};

export const CYCLE_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface ColorEntry {
    hex: string;
    rgb: { r: number; g: number; b: number };
    date: string; // YYYY-MM-DD
    tier?: ColorTier;
    averageScore?: number;
    votes: Record<string, ColorTier>; // userId -> Tier
    completedAt?: number;
}

export interface GuildColorConfig {
    channelId: string;
    lastAnnouncedHex?: string;
}

export interface ColorOfTheDayState {
    currentColor: ColorEntry | null;
    history: ColorEntry[];
    guilds: Record<string, GuildColorConfig>; // guildId -> config
    lastCycleTimestamp: number;
}

let dataFilePath = path.resolve(process.cwd(), 'data', 'color_of_the_day', 'state.json');

/**
 * Allows overriding data storage location (useful for unit tests).
 */
export function setDefaultDataFilePath(newPath: string): void {
    dataFilePath = newPath;
}

export function getDataFilePath(): string {
    return dataFilePath;
}

/**
 * Loads the current state from disk or initializes defaults.
 */
export function loadState(): ColorOfTheDayState {
    try {
        if (fs.existsSync(dataFilePath)) {
            const raw = fs.readFileSync(dataFilePath, 'utf-8');
            const parsed = JSON.parse(raw) as Partial<ColorOfTheDayState>;
            return {
                currentColor: parsed.currentColor ?? null,
                history: Array.isArray(parsed.history) ? parsed.history : [],
                guilds: parsed.guilds ?? {},
                lastCycleTimestamp:
                    typeof parsed.lastCycleTimestamp === 'number' ? parsed.lastCycleTimestamp : 0,
            };
        }
    } catch (error) {
        logger.error(`Failed to load Color of the Day state from ${dataFilePath}: ${error}`);
    }
    return {
        currentColor: null,
        history: [],
        guilds: {},
        lastCycleTimestamp: 0,
    };
}

/**
 * Saves the state atomically to disk.
 */
export function saveState(state: ColorOfTheDayState): void {
    try {
        const dir = path.dirname(dataFilePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        const tempPath = `${dataFilePath}.tmp`;
        fs.writeFileSync(tempPath, JSON.stringify(state, null, 4), 'utf-8');
        fs.renameSync(tempPath, dataFilePath);
    } catch (error) {
        logger.error(`Failed to save Color of the Day state to ${dataFilePath}: ${error}`);
    }
}

/**
 * Converts a numeric average score into a ColorTier.
 */
export function scoreToTier(score: number): ColorTier {
    if (score >= 4.5) return 'S';
    if (score >= 3.5) return 'A';
    if (score >= 2.5) return 'B';
    if (score >= 1.5) return 'C';
    if (score >= 0.5) return 'D';
    return 'F';
}

/**
 * Calculates average rating, mapped tier, and breakdown from a set of votes.
 */
export function calculateVotesSummary(votes: Record<string, ColorTier>): {
    totalVotes: number;
    averageScore: number;
    tier: ColorTier;
    breakdown: Record<ColorTier, number>;
} {
    const userIds = Object.keys(votes);
    const breakdown: Record<ColorTier, number> = { S: 0, A: 0, B: 0, C: 0, D: 0, F: 0 };

    for (const userId of userIds) {
        const tier = votes[userId];
        if (VALID_TIERS.includes(tier)) {
            breakdown[tier] = (breakdown[tier] || 0) + 1;
        }
    }

    const totalVotes = userIds.length;
    if (totalVotes === 0) {
        return {
            totalVotes: 0,
            averageScore: 2.5, // neutral C baseline
            tier: 'C',
            breakdown,
        };
    }

    let totalScore = 0;
    for (const tier of VALID_TIERS) {
        totalScore += breakdown[tier] * TIER_SCORES[tier];
    }

    const averageScore = Math.round((totalScore / totalVotes) * 100) / 100;
    const tier = scoreToTier(averageScore);

    return {
        totalVotes,
        averageScore,
        tier,
        breakdown,
    };
}

/**
 * Formats a date string as YYYY-MM-DD.
 */
export function getFormattedDate(date = new Date()): string {
    return date.toISOString().split('T')[0];
}

/**
 * Gets or initializes the active Color of the Day.
 */
export function getCurrentColor(): ColorEntry {
    const state = loadState();
    if (state.currentColor) {
        return state.currentColor;
    }

    const hex = getRandomHexColor();
    const newColor: ColorEntry = {
        hex,
        rgb: hexToRgb(hex),
        date: getFormattedDate(),
        votes: {},
    };

    state.currentColor = newColor;
    state.lastCycleTimestamp = Date.now();
    saveState(state);

    return newColor;
}

/**
 * Records or updates a user's tier vote for the current Color of the Day.
 */
export function recordVote(
    userId: string,
    tierInput: string,
): {
    success: boolean;
    tier?: ColorTier;
    oldTier?: ColorTier;
    color: ColorEntry;
    totalVotes: number;
} {
    const normalizedTier = tierInput.trim().toUpperCase() as ColorTier;
    if (!VALID_TIERS.includes(normalizedTier)) {
        return {
            success: false,
            color: getCurrentColor(),
            totalVotes: 0,
        };
    }

    const state = loadState();
    if (!state.currentColor) {
        state.currentColor = {
            hex: getRandomHexColor(),
            rgb: hexToRgb(getRandomHexColor()),
            date: getFormattedDate(),
            votes: {},
        };
        state.lastCycleTimestamp = Date.now();
    }

    const oldTier = state.currentColor.votes[userId];
    state.currentColor.votes[userId] = normalizedTier;
    saveState(state);

    return {
        success: true,
        tier: normalizedTier,
        oldTier,
        color: state.currentColor,
        totalVotes: Object.keys(state.currentColor.votes).length,
    };
}

/**
 * Configures the announcement channel for a specific guild.
 */
export function setGuildChannel(guildId: string, channelId: string): void {
    const state = loadState();
    state.guilds[guildId] = {
        channelId,
        lastAnnouncedHex: state.guilds[guildId]?.lastAnnouncedHex,
    };
    saveState(state);
}

/**
 * Retrieves the configured announcement channel ID for a guild.
 */
export function getGuildChannel(guildId: string): string | undefined {
    const state = loadState();
    return state.guilds[guildId]?.channelId;
}

/**
 * Removes the configured announcement channel for a guild.
 */
export function removeGuildChannel(guildId: string): boolean {
    const state = loadState();
    if (state.guilds[guildId]) {
        delete state.guilds[guildId];
        saveState(state);
        return true;
    }
    return false;
}

/**
 * Advances the 24-hour Color of the Day cycle.
 * Finalizes the previous color, archives it in history, generates a new color, and saves state.
 */
export function advanceColorOfTheDay(force = false): {
    advanced: boolean;
    previousColor: ColorEntry | null;
    newColor: ColorEntry;
} {
    const state = loadState();
    const now = Date.now();

    if (!force && state.currentColor && now - state.lastCycleTimestamp < CYCLE_INTERVAL_MS) {
        return {
            advanced: false,
            previousColor: null,
            newColor: state.currentColor,
        };
    }

    let previousColor: ColorEntry | null = null;

    if (state.currentColor) {
        const summary = calculateVotesSummary(state.currentColor.votes);
        state.currentColor.tier = summary.tier;
        state.currentColor.averageScore = summary.averageScore;
        state.currentColor.completedAt = now;

        previousColor = { ...state.currentColor };
        state.history.unshift(previousColor);
    }

    const newHex = getRandomHexColor();
    const newColor: ColorEntry = {
        hex: newHex,
        rgb: hexToRgb(newHex),
        date: getFormattedDate(new Date(now)),
        votes: {},
    };

    state.currentColor = newColor;
    state.lastCycleTimestamp = now;
    saveState(state);

    return {
        advanced: true,
        previousColor,
        newColor,
    };
}

/**
 * Groups historical colors by tier.
 */
export function getHistoricalTierList(): Record<ColorTier, ColorEntry[]> {
    const state = loadState();
    const tiers: Record<ColorTier, ColorEntry[]> = {
        S: [],
        A: [],
        B: [],
        C: [],
        D: [],
        F: [],
    };

    for (const entry of state.history) {
        const tier = entry.tier || 'C';
        if (tiers[tier]) {
            tiers[tier].push(entry);
        } else {
            tiers.C.push(entry);
        }
    }

    return tiers;
}

/**
 * Retrieves all historical colors for a specific tier.
 */
export function getColorsByTier(tier: ColorTier): ColorEntry[] {
    const historical = getHistoricalTierList();
    return historical[tier] || [];
}

/**
 * Generates an AttachmentBuilder for the color's solid PNG preview image.
 */
export function buildColorAttachment(hex: string): AttachmentBuilder {
    const buffer = generateColorSquarePng(hex, 160);
    return new AttachmentBuilder(buffer, { name: 'color.png' });
}

/**
 * Builds the embed displaying the active Color of the Day.
 */
export function buildColorOfTheDayEmbed(color: ColorEntry): EmbedBuilder {
    const state = loadState();
    const timeRemainingMs = Math.max(
        0,
        CYCLE_INTERVAL_MS - (Date.now() - state.lastCycleTimestamp),
    );
    const hoursRemaining = Math.floor(timeRemainingMs / (1000 * 60 * 60));
    const minutesRemaining = Math.floor((timeRemainingMs % (1000 * 60 * 60)) / (1000 * 60));

    const summary = calculateVotesSummary(color.votes);
    const colorInt = parseInt(color.hex.replace(/^#/, ''), 16) || 0x6a5acd;

    const embed = new EmbedBuilder()
        .setTitle(`🎨 Color of the Day: \`${color.hex}\``)
        .setDescription(
            `Today's featured palette color is **${color.hex}**!\nVote on its tier with \`/rankcoloroftheday\` 🐾`,
        )
        .setColor(colorInt)
        .addFields([
            {
                name: 'Hex Code',
                value: `\`${color.hex}\``,
                inline: true,
            },
            {
                name: 'RGB Values',
                value: `\`${formatRgbString(color.rgb.r, color.rgb.g, color.rgb.b)}\``,
                inline: true,
            },
            {
                name: 'Total Votes',
                value: `${summary.totalVotes} vote${summary.totalVotes === 1 ? '' : 's'}`,
                inline: true,
            },
            {
                name: 'Current Trending Tier',
                value:
                    summary.totalVotes > 0
                        ? `${TIER_EMOJIS[summary.tier]} **Tier ${summary.tier}** (Avg: ${summary.averageScore}/5.0)`
                        : '*No votes yet — be the first to rank it!*',
                inline: false,
            },
            {
                name: 'Next Color Rotation',
                value: `In **${hoursRemaining}h ${minutesRemaining}m**`,
                inline: false,
            },
        ])
        .setThumbnail('attachment://color.png')
        .setFooter({ text: 'Komaru the Cat • Color of the Day' })
        .setTimestamp();

    return embed;
}

/**
 * Builds the announcement embed sent to configured guild channels during daily rotation.
 */
export function buildAnnouncementEmbed(
    newColor: ColorEntry,
    previousColor: ColorEntry | null,
): EmbedBuilder {
    const colorInt = parseInt(newColor.hex.replace(/^#/, ''), 16) || 0x6a5acd;
    const embed = new EmbedBuilder()
        .setTitle(`🎨 Today's New Color of the Day: \`${newColor.hex}\``)
        .setColor(colorInt)
        .setThumbnail('attachment://color.png')
        .setFooter({ text: 'Komaru the Cat • Color of the Day' })
        .setTimestamp();

    let description = `Meow! 🐾 A brand new Color of the Day has arrived: **${newColor.hex}**!\n\n`;
    description += `• **RGB:** \`${formatRgbString(newColor.rgb.r, newColor.rgb.g, newColor.rgb.b)}\`\n`;
    description += `• Use \`/rankcoloroftheday <tier>\` to vote on today's color!\n`;
    description += `• Use \`/colorofthedaytierlist\` to view the historical rankings.`;

    if (previousColor) {
        const prevVotes = Object.keys(previousColor.votes || {}).length;
        const prevTier = previousColor.tier || 'C';
        const prevScore =
            previousColor.averageScore !== undefined
                ? `${previousColor.averageScore}/5.0`
                : 'Unrated';
        embed.addFields([
            {
                name: '📊 Yesterday’s Results',
                value: `Previous color **${previousColor.hex}** achieved ${TIER_EMOJIS[prevTier]} **Tier ${prevTier}** (${prevScore} with ${prevVotes} vote${prevVotes === 1 ? '' : 's'})!`,
            },
        ]);
    }

    embed.setDescription(description);
    return embed;
}

/**
 * Builds the interactive Tier List embed (Overview or specific Tier view).
 */
export function buildTierListEmbed(
    selectedTier: ColorTier | 'all' = 'all',
    page = 1,
): EmbedBuilder {
    const history = getHistoricalTierList();
    const embed = new EmbedBuilder()
        .setColor(0x6a5acd)
        .setFooter({ text: 'Komaru the Cat • Color of the Day Tier List' })
        .setTimestamp();

    if (selectedTier === 'all') {
        const totalColors = Object.values(history).reduce((acc, list) => acc + list.length, 0);
        embed
            .setTitle('🏆 Color of the Day — Historical Tier List')
            .setDescription(
                `Here is the community historical tier list for all past Colors of the Day (${totalColors} total color${totalColors === 1 ? '' : 's'})!\n` +
                    'Use the dropdown menu below to view all colors in a specific tier.',
            );

        for (const tier of VALID_TIERS) {
            const colors = history[tier] || [];
            const count = colors.length;
            const top5 = colors.slice(0, 5);

            let tierValue = '';
            if (top5.length === 0) {
                tierValue = '*No colors in this tier yet.*';
            } else {
                tierValue = top5
                    .map((c) => {
                        const votes = Object.keys(c.votes || {}).length;
                        const score = c.averageScore !== undefined ? ` (${c.averageScore}★)` : '';
                        return `• \`${c.hex}\`${score} — ${c.date} [${votes} vote${votes === 1 ? '' : 's'}]`;
                    })
                    .join('\n');
                if (count > 5) {
                    tierValue += `\n*+${count - 5} more... (select Tier ${tier} below to view all)*`;
                }
            }

            embed.addFields([
                {
                    name: `${TIER_EMOJIS[tier]} Tier ${tier} (${count} color${count === 1 ? '' : 's'})`,
                    value: tierValue,
                    inline: false,
                },
            ]);
        }
    } else {
        const colors = history[selectedTier] || [];
        const count = colors.length;
        const pageSize = 15;
        const totalPages = Math.max(1, Math.ceil(count / pageSize));
        const currentPage = Math.max(1, Math.min(totalPages, page));
        const startIndex = (currentPage - 1) * pageSize;
        const pageColors = colors.slice(startIndex, startIndex + pageSize);

        embed.setTitle(
            `${TIER_EMOJIS[selectedTier]} Tier ${selectedTier} Colors (${count} total color${count === 1 ? '' : 's'})`,
        );

        if (pageColors.length === 0) {
            embed.setDescription(
                `There are currently no Colors of the Day ranked in **Tier ${selectedTier}**.\n` +
                    'Select another tier or return to the Overview using the menu below.',
            );
        } else {
            let description = `All Colors of the Day awarded **Tier ${selectedTier}** by community ranking:\n\n`;
            description += pageColors
                .map((c, idx) => {
                    const votes = Object.keys(c.votes || {}).length;
                    const score = c.averageScore !== undefined ? `${c.averageScore}★` : 'N/A';
                    return `**${startIndex + idx + 1}.** \`${c.hex}\` — Score: **${score}** | Date: ${c.date} (${votes} vote${votes === 1 ? '' : 's'})`;
                })
                .join('\n');

            if (totalPages > 1) {
                description += `\n\n*Page ${currentPage} of ${totalPages}*`;
            }
            embed.setDescription(description);
        }
    }

    return embed;
}

/**
 * Builds the interactive Select Menu ActionRow allowing users to choose a Tier to browse.
 */
export function buildTierListActionRow(
    selectedTier: ColorTier | 'all' = 'all',
    authorId?: string,
): ActionRowBuilder<StringSelectMenuBuilder> {
    const history = getHistoricalTierList();
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`cotd_tier_select:${authorId || 'any'}`)
        .setPlaceholder('🐾 Select a tier to view all colors...');

    const options: StringSelectMenuOptionBuilder[] = [
        new StringSelectMenuOptionBuilder()
            .setLabel('Overview (All Tiers)')
            .setValue('all')
            .setDescription('View the full tier list overview with top colors per tier')
            .setDefault(selectedTier === 'all'),
    ];

    for (const tier of VALID_TIERS) {
        const count = (history[tier] || []).length;
        options.push(
            new StringSelectMenuOptionBuilder()
                .setLabel(`Tier ${tier} (${count} color${count === 1 ? '' : 's'})`)
                .setValue(tier)
                .setDescription(`View all ${count} color(s) ranked in Tier ${tier}`)
                .setDefault(selectedTier === tier),
        );
    }

    selectMenu.addOptions(options);
    return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);
}

/**
 * Broadcasts the Color of the Day announcement to all configured guild channels.
 */
export async function broadcastDailyAnnouncement(
    client: any,
    newColor: ColorEntry,
    previousColor: ColorEntry | null,
): Promise<number> {
    const state = loadState();
    const guilds = state.guilds || {};
    let sentCount = 0;

    const attachment = buildColorAttachment(newColor.hex);
    const embed = buildAnnouncementEmbed(newColor, previousColor);

    for (const guildId of Object.keys(guilds)) {
        const config = guilds[guildId];
        if (!config?.channelId) continue;

        try {
            const channel =
                client?.channels?.cache?.get(config.channelId) ||
                (await client?.channels?.fetch?.(config.channelId).catch(() => null));

            if (channel?.isTextBased?.() && channel?.send) {
                await channel.send({
                    embeds: [embed],
                    files: [attachment],
                });
                config.lastAnnouncedHex = newColor.hex;
                sentCount++;
            }
        } catch (error) {
            logger.warn(
                `Failed to send Color of the Day announcement to guild ${guildId} channel ${config.channelId}: ${error}`,
            );
        }
    }

    saveState(state);
    return sentCount;
}

/**
 * Checks if 24 hours have elapsed and rotates the color and broadcasts if needed.
 */
export async function checkAndAdvanceIfNeeded(client: any): Promise<boolean> {
    const state = loadState();
    const now = Date.now();

    if (now - state.lastCycleTimestamp >= CYCLE_INTERVAL_MS || !state.currentColor) {
        const { advanced, previousColor, newColor } = advanceColorOfTheDay(true);
        if (advanced && client) {
            await broadcastDailyAnnouncement(client, newColor, previousColor);
            return true;
        }
    }
    return false;
}
