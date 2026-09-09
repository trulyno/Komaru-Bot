import fs from 'node:fs';
import path from 'node:path';
import { Colors, EmbedBuilder } from 'discord.js';
import { getAuditChannel } from './auditLogService';
import { logger } from '../logger';

export interface LarpTier {
    threshold: number;
    durationMs: number;
    durationLabel: string;
}

export interface LarpUserData {
    userId: string;
    username: string;
    displayName: string;
    guildId: string;
    count: number;
    bannedUntil: number | null;
    lastLarpAt: number;
    highestTierTriggered: number;
    silencedAttempts?: number;
}

export interface LarpJarGuildState {
    guildId: string;
    users: Record<string, LarpUserData>;
    totalLarps: number;
}

export interface LarpJarState {
    guilds: Record<string, LarpJarGuildState>;
}

export const DEFAULT_LARP_TIERS: LarpTier[] = [
    { threshold: 3, durationMs: 1 * 60 * 60 * 1000, durationLabel: '1 hour' },
    { threshold: 5, durationMs: 4 * 60 * 60 * 1000, durationLabel: '4 hours' },
    { threshold: 10, durationMs: 8 * 60 * 60 * 1000, durationLabel: '8 hours' },
    { threshold: 20, durationMs: 12 * 60 * 60 * 1000, durationLabel: '12 hours' },
    { threshold: 50, durationMs: 24 * 60 * 60 * 1000, durationLabel: '24 hours' },
];

export const LARP_REGEX =
    /(?<=^|[^a-z0-9])[l1!|]+[\s._\-~*|/]*[a4@]+[\s._\-~*|/]*r+[\s._\-~*|/]*p+[a-z0-9]*(?=$|[^a-z0-9])/gi;

let defaultDataFilePath = path.resolve(process.cwd(), 'data', 'larp_jar', 'state.json');
let cachedState: LarpJarState | null = null;

export function setDefaultDataFilePath(filePath: string): void {
    defaultDataFilePath = filePath;
    cachedState = null;
}

export function getDefaultDataFilePath(): string {
    return defaultDataFilePath;
}

export function sanitizeLarpText(text: string): string {
    if (!text) return '';
    return text.replace(/[\u200B-\u200D\uFEFF\u202A-\u202E]/g, '');
}

export function countLarpOccurrences(text: string): number {
    if (!text) return 0;
    const sanitized = sanitizeLarpText(text);
    const matches = sanitized.match(LARP_REGEX);
    return matches ? matches.length : 0;
}

export function containsLarpWord(text: string): boolean {
    return countLarpOccurrences(text) > 0;
}

export function isLarpSpam(text: string): boolean {
    if (!text) return false;
    const sanitized = sanitizeLarpText(text);
    const matches = sanitized.match(LARP_REGEX);
    if (!matches || matches.length < 5) {
        return false;
    }
    const withoutLarps = sanitized.replace(LARP_REGEX, '');
    const remaining = withoutLarps.replace(/[\s\t\r\n.,!?;:'"~*_\-`|/\\]/g, '');
    return remaining.length === 0;
}

export function calculatePenaltyForThreshold(threshold: number): LarpTier {
    const predefined = DEFAULT_LARP_TIERS.find((t) => t.threshold === threshold);
    if (predefined) {
        return predefined;
    }

    // Dynamic tiers for threshold > 50: +4 hours for every 10 larps
    if (threshold > 50) {
        const extra10s = Math.floor((threshold - 50) / 10);
        const hours = 24 + Math.max(1, extra10s) * 4;
        return {
            threshold,
            durationMs: hours * 60 * 60 * 1000,
            durationLabel: `${hours} hours`,
        };
    }

    return {
        threshold,
        durationMs: 1 * 60 * 60 * 1000,
        durationLabel: '1 hour',
    };
}

export function getNextThreshold(currentCount: number): number {
    for (const tier of DEFAULT_LARP_TIERS) {
        if (currentCount < tier.threshold) {
            return tier.threshold;
        }
    }
    // Dynamic higher thresholds (60, 70, 80, ...)
    const next10 = Math.floor(currentCount / 10) * 10 + 10;
    return Math.max(60, next10);
}

export function checkThresholdCrossed(
    prevCount: number,
    newCount: number,
    highestTierTriggered: number,
): LarpTier | null {
    // Check standard tiers
    for (const tier of DEFAULT_LARP_TIERS) {
        if (
            prevCount < tier.threshold &&
            newCount >= tier.threshold &&
            tier.threshold > highestTierTriggered
        ) {
            return tier;
        }
    }

    // Check dynamic higher tiers (> 50, step 10)
    if (newCount > 50) {
        const dynamicThreshold = Math.floor(newCount / 10) * 10;
        if (
            dynamicThreshold > 50 &&
            prevCount < dynamicThreshold &&
            dynamicThreshold > highestTierTriggered
        ) {
            return calculatePenaltyForThreshold(dynamicThreshold);
        }
    }

    return null;
}

export function loadLarpJarState(filePath: string = defaultDataFilePath): LarpJarState {
    if (cachedState && filePath === defaultDataFilePath) {
        return cachedState;
    }

    if (!fs.existsSync(filePath)) {
        const emptyState: LarpJarState = { guilds: {} };
        cachedState = emptyState;
        return emptyState;
    }

    try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        cachedState = JSON.parse(raw) as LarpJarState;
        return cachedState;
    } catch (error) {
        logger.error(`Failed to load Larp Jar state from ${filePath}: ${error}`);
        const fallback: LarpJarState = { guilds: {} };
        cachedState = fallback;
        return fallback;
    }
}

export function saveLarpJarState(filePath: string = defaultDataFilePath): void {
    if (!cachedState) return;

    try {
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(filePath, JSON.stringify(cachedState, null, 2), 'utf-8');
    } catch (error) {
        logger.error(`Failed to save Larp Jar state to ${filePath}: ${error}`);
    }
}

export function getOrCreateGuildState(state: LarpJarState, guildId: string): LarpJarGuildState {
    if (!state.guilds[guildId]) {
        state.guilds[guildId] = {
            guildId,
            users: {},
            totalLarps: 0,
        };
    }
    return state.guilds[guildId];
}

export function getLarpUser(
    guildId: string,
    userId: string,
    filePath: string = defaultDataFilePath,
): LarpUserData {
    const state = loadLarpJarState(filePath);
    const guildState = getOrCreateGuildState(state, guildId);

    if (!guildState.users[userId]) {
        guildState.users[userId] = {
            userId,
            username: 'Unknown',
            displayName: 'Unknown',
            guildId,
            count: 0,
            bannedUntil: null,
            lastLarpAt: 0,
            highestTierTriggered: 0,
            silencedAttempts: 0,
        };
    }
    return guildState.users[userId];
}

export function isUserSilenced(user: LarpUserData): boolean {
    return Boolean(user.bannedUntil && user.bannedUntil > Date.now());
}

export function recordSilencedAttempt(
    guildId: string,
    userId: string,
    filePath: string = defaultDataFilePath,
): { user: LarpUserData; attemptCount: number; shouldSendWarning: boolean } {
    const user = getLarpUser(guildId, userId, filePath);
    const count = (user.silencedAttempts || 0) + 1;
    user.silencedAttempts = count;
    saveLarpJarState(filePath);
    return {
        user,
        attemptCount: count,
        shouldSendWarning: count <= 3,
    };
}

export function unsilenceUser(
    guildId: string,
    userId: string,
    filePath: string = defaultDataFilePath,
): { success: boolean; wasSilenced: boolean; user: LarpUserData } {
    const user = getLarpUser(guildId, userId, filePath);
    const wasSilenced = isUserSilenced(user);
    user.bannedUntil = null;
    user.silencedAttempts = 0;
    saveLarpJarState(filePath);
    return { success: true, wasSilenced, user };
}

export function formatTimeRemaining(ms: number): string {
    if (ms <= 0) return '0 seconds';
    const totalSeconds = Math.ceil(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const parts: string[] = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (seconds > 0 && hours === 0) parts.push(`${seconds}s`);
    return parts.join(' ') || '1s';
}

export function recordLarp(
    guildId: string,
    userId: string,
    username: string,
    displayName: string,
    increment = 1,
    filePath: string = defaultDataFilePath,
): { user: LarpUserData; thresholdCrossed: LarpTier | null } {
    const state = loadLarpJarState(filePath);
    const guildState = getOrCreateGuildState(state, guildId);
    const user = getLarpUser(guildId, userId, filePath);

    user.username = username;
    user.displayName = displayName;

    const prevCount = user.count;
    const newCount = prevCount + increment;
    user.count = newCount;
    user.lastLarpAt = Date.now();
    guildState.totalLarps += increment;

    const tier = checkThresholdCrossed(prevCount, newCount, user.highestTierTriggered);
    if (tier) {
        user.bannedUntil = Date.now() + tier.durationMs;
        user.highestTierTriggered = tier.threshold;
        user.silencedAttempts = 0;
    }

    saveLarpJarState(filePath);
    return { user, thresholdCrossed: tier };
}

export function getGuildLeaderboard(
    guildId: string,
    limit = 10,
    filePath: string = defaultDataFilePath,
): { users: LarpUserData[]; totalLarps: number } {
    const state = loadLarpJarState(filePath);
    const guildState = getOrCreateGuildState(state, guildId);

    const userList = Object.values(guildState.users)
        .filter((u) => u.count > 0)
        .sort((a, b) => b.count - a.count);

    return {
        users: userList.slice(0, limit),
        totalLarps: guildState.totalLarps,
    };
}

// Fun message generators (ping-safe: displayName only)
export function getRandomClinkMessage(displayName: string, count: number): string {
    const messages = [
        `🪙 *Clink!* Larping again, **${displayName}**? +1 to the jar! Total: **${count}**.`,
        `🪙 Another coin in the Larp Jar! Caught red-handed, **${displayName}**! That makes **${count}**.`,
        `🪙 *Drop!* The Larp Jar claims another coin from **${displayName}**. You're at **${count}** now!`,
        `🪙 Caught in 4k larping, **${displayName}**! In goes the coin. Total jar count: **${count}**.`,
        `🪙 Ka-ching! The jar grows richer thanks to **${displayName}**. That's **${count}** times now.`,
        `🪙 Oh dear, **${displayName}** is at it again! +1 to the Larp Jar (Total: **${count}**).`,
        `🪙 *Clatter!* **${displayName}** dropped a dime into the Larp Jar. Count is now **${count}**.`,
        `🪙 Larp detected! The jar hungrily absorbs a quarter from **${displayName}**. Total: **${count}**.`,
        `🪙 *Clink!* Into the jar it goes! **${displayName}**, that's **${count}** larps on your tab.`,
        `🪙 You can run, **${displayName}**, but you can't hide from the Larp Jar. Count: **${count}**!`,
        `🪙 *Plink!* The jar thanks **${displayName}** for the generous donation. You're at **${count}**!`,
        `🪙 Is that a larp I hear? **${displayName}** pays the toll! Total: **${count}**.`,
        `🪙 The jar hungers, and **${displayName}** feeds it. Jar tally: **${count}** coins!`,
        `🪙 *Ding!* Order up: one fresh coin from **${displayName}**! Current balance: **${count}**.`,
        `🪙 Komaru inspects the jar and spots another nickel from **${displayName}**. Total: **${count}**.`,
        `🪙 Stop right there! Pay the court a fine, **${displayName}**! You've larped **${count}** times.`,
        `🪙 Cha-ching! **${displayName}** is single-handedly funding the server's tuna budget. Count: **${count}**!`,
        `🪙 *Clink!* Don't make me tap the jar sign, **${displayName}**. That makes **${count}**.`,
        `🪙 Caught in the act! Another shiny coin from **${displayName}** joins the jar. Total: **${count}**.`,
        `🪙 *Tinkle!* That's **${count}** times now, **${displayName}**. The jar is getting heavy!`,
        `🪙 Another one bites the dust! **${displayName}** deposits coin #**${count}** into the jar.`,
        `🪙 Larp jar tax collected! **${displayName}**, your larp count just climbed to **${count}**.`,
        `🪙 *Rattle!* The jar shakes as **${displayName}** tosses in coin number **${count}**!`,
        `🪙 Did someone say larp? **${displayName}** certainly did! In goes coin #**${count}**.`,
        `🪙 Your sacrifice has been accepted, **${displayName}**. Total larp count: **${count}**.`,
        `🪙 *Plunk!* **${displayName}** strikes again. The jar now holds **${count}** of your coins!`,
    ];
    return messages[Math.floor(Math.random() * messages.length)];
}

export function getRandomThresholdMessage(
    displayName: string,
    count: number,
    durationLabel: string,
    bannedUntil: number,
): string {
    const timestampUnix = Math.floor(bannedUntil / 1000);
    const messages = [
        `🚨 **${displayName}** has larped too much! They are now gonna be productive for **${durationLabel}** (until <t:${timestampUnix}:t>)!`,
        `🚨 You've larped enough, **${displayName}**. Time to touch grass! Silenced from larping for **${durationLabel}** (until <t:${timestampUnix}:t>)!`,
        `🛑 That's the limit, **${displayName}**! The Larp Jar overflowed (**${count}** larps). Go do something useful for **${durationLabel}**!`,
        `🚫 Step away from the larp, **${displayName}**! You've crossed the threshold (**${count}**) and earned a **${durationLabel}** break!`,
        `🧊 Cooldown engaged! **${displayName}** reached **${count}** larps. No more larping for **${durationLabel}**!`,
        `🛑 Jar quota exceeded (**${count}**)! **${displayName}** has been banned from saying the forbidden word for **${durationLabel}**!`,
        `🌾 Alert! **${displayName}** has larped **${count}** times. Please report to the nearest lawn for grass inspection for the next **${durationLabel}**!`,
    ];
    return messages[Math.floor(Math.random() * messages.length)];
}

export function getRandomSilencedAttemptMessage(
    displayName: string,
    timeRemainingMs: number,
): string {
    const remaining = formatTimeRemaining(timeRemainingMs);
    const messages = [
        `🤫 Nice try, **${displayName}**, but you are still in larp detention for **${remaining}**! Message deleted.`,
        `🛑 Uh-uh, **${displayName}**! Still on larp timeout for another **${remaining}**. Back to touching grass!`,
        `⏳ Not so fast, **${displayName}**! The Larp Jar forbids you from speaking that word for another **${remaining}**.`,
        `🧹 Poof! **${displayName}** tried to larp while silenced! Silenced for another **${remaining}**.`,
        `🫙 Silenced! **${displayName}** tried to say the forbidden word while serving their sentence. **${remaining}** remaining!`,
    ];
    return messages[Math.floor(Math.random() * messages.length)];
}

// export async function sendLarpJarAuditAlert(
//     guild: any,
//     user: any,
//     channelId: string,
//     content: string,
//     bannedUntil: number,
//     count: number,
// ): Promise<void> {
//     const channel = getAuditChannel(guild);
//     if (!channel) return;

//     try {
//         const remainingUnix = Math.floor(bannedUntil / 1000);
//         const embed = new EmbedBuilder()
//             .setTitle('🏺 Larp Jar: Silenced User Attempt')
//             .setDescription(
//                 'A member attempted to say a larp-related word while banned from larping.',
//             )
//             .setColor(Colors.Gold)
//             .addFields(
//                 {
//                     name: 'User',
//                     value: `<@${user.id}> (${user.tag || user.username})`,
//                     inline: true,
//                 },
//                 { name: 'Channel', value: `<#${channelId}>`, inline: true },
//                 { name: 'Jar Balance', value: `🪙 **${count}** larps`, inline: true },
//                 {
//                     name: 'Silenced Until',
//                     value: `<t:${remainingUnix}:f> (<t:${remainingUnix}:R>)`,
//                 },
//                 { name: 'Deleted Content', value: content.slice(0, 1000) || '*No content*' },
//             )
//             .setTimestamp();

//         await channel.send({ embeds: [embed] });
//     } catch (error) {
//         logger.error(`Failed to send Larp Jar audit alert in guild ${guild.id}: ${error}`);
//     }
// }

// export async function sendLarpJarUnsilenceAuditLog(
//     guild: any,
//     targetUser: any,
//     moderator: any,
//     reason?: string,
// ): Promise<void> {
//     const channel = getAuditChannel(guild);
//     if (!channel) return;

//     try {
//         const embed = new EmbedBuilder()
//             .setTitle('🏺 Larp Jar: Member Unsilenced')
//             .setDescription(`A staff member removed the Larp Jar silence for <@${targetUser.id}>.`)
//             .setColor(Colors.Green)
//             .addFields(
//                 {
//                     name: 'User',
//                     value: `<@${targetUser.id}> (${targetUser.tag || targetUser.username})`,
//                     inline: true,
//                 },
//                 {
//                     name: 'Moderator',
//                     value: `<@${moderator.id}> (${moderator.tag || moderator.username})`,
//                     inline: true,
//                 },
//                 { name: 'Reason', value: reason || 'No reason provided' },
//             )
//             .setTimestamp();

//         await channel.send({ embeds: [embed] });
//     } catch (error) {
//         logger.error(`Failed to send Larp Jar unsilence audit log in guild ${guild.id}: ${error}`);
//     }
// }
