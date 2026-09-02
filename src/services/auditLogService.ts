import { logger } from '../logger';
import { config } from '../config';

export const auditChannelByGuild = new Map<string, string>();
export const duplicateMessageWindow = new Map<
    string,
    {
        userId: string;
        startedAt: number;
        channels: Set<string>;
        messages: Array<any>;
        content: string;
        attachmentsKey: string;
    }
>();
export const pendingGhostPings = new Map<string, any>();
export const botDeletedMessageIds = new Map<string, number>();
const BOT_DELETION_TTL_MS = 60000;

export function markMessageAsBotDeleted(messageId: string): void {
    if (!messageId) return;
    botDeletedMessageIds.set(messageId, Date.now());
}

export function isMessageBotDeleted(messageId: string): boolean {
    if (!messageId) return false;
    const now = Date.now();
    for (const [id, timestamp] of botDeletedMessageIds.entries()) {
        if (now - timestamp > BOT_DELETION_TTL_MS) {
            botDeletedMessageIds.delete(id);
        }
    }

    return botDeletedMessageIds.has(messageId);
}

export async function isDeletionPerformedByBot(message: any): Promise<boolean> {
    if (isMessageBotDeleted(message?.id)) {
        return true;
    }

    if (!message?.guild || !message?.client?.user?.id) {
        return false;
    }

    if (typeof message.guild.fetchAuditLogs !== 'function') {
        return false;
    }

    try {
        const logs = await message.guild.fetchAuditLogs({
            limit: 5,
            type: 72, // AuditLogEvent.MessageDelete
        });
        if (!logs?.entries) return false;

        const botId = message.client.user.id;
        const now = Date.now();

        for (const entry of logs.entries.values()) {
            const isBot = entry.executor?.id === botId;
            const isTarget = !entry.target || entry.target.id === message.author?.id;
            const isRecent = Math.abs(now - (entry.createdTimestamp ?? 0)) < 8000;
            const isChannel =
                !entry.extra?.channel || entry.extra.channel.id === message.channel?.id;

            if (isBot && isTarget && isRecent && isChannel) {
                if (message.id) {
                    markMessageAsBotDeleted(message.id);
                }
                return true;
            }
        }
    } catch {
        // Missing permissions or mock guild
    }

    return false;
}

export const DEFAULT_MODERATOR_ROLE_NAME = config.auditLog.defaultModeratorRoleName;
export const DEFAULT_ADMIN_ROLE_NAME = config.auditLog.defaultAdminRoleName;
export const MAX_TIMEOUT_MS = config.auditLog.maxTimeoutMs;
export const DUPLICATE_SPAM_WINDOW_MS = config.auditLog.duplicateSpamWindowMs;
export const GHOST_PING_WINDOW_MS = config.auditLog.ghostPingWindowMs;

export function normalizeRoleName(value?: string): string | undefined {
    const trimmed = value?.trim();
    if (!trimmed) {
        return undefined;
    }
    return trimmed;
}

export function getConfiguredRoleNames(): { moderator?: string; admin?: string } {
    return {
        moderator: normalizeRoleName(
            config.env.moderationModeratorRoleId ??
                config.env.moderationModeratorRoleName ??
                DEFAULT_MODERATOR_ROLE_NAME,
        ),
        admin: normalizeRoleName(
            config.env.moderationAdminRoleId ??
                config.env.moderationAdminRoleName ??
                DEFAULT_ADMIN_ROLE_NAME,
        ),
    };
}

export function hasConfiguredRole(member: any, roleNameOrId?: string): boolean {
    if (!member?.guild || !roleNameOrId) {
        return false;
    }

    const normalized = roleNameOrId.toLowerCase();
    return member.roles.cache.some((role: any) => {
        return role.id === roleNameOrId || role.name?.toLowerCase() === normalized;
    });
}

export function canModerate(member: any): boolean {
    const roles = getConfiguredRoleNames();
    return hasConfiguredRole(member, roles.moderator) || hasConfiguredRole(member, roles.admin);
}

export function canAdministrate(member: any): boolean {
    const roles = getConfiguredRoleNames();
    return hasConfiguredRole(member, roles.admin) || member?.permissions?.has?.('Administrator');
}

export function getAuditChannel(guild: any): any | null {
    if (!guild) {
        return null;
    }

    const configuredChannelId =
        auditChannelByGuild.get(guild.id) || config.env.moderationAuditChannelId;
    if (!configuredChannelId) {
        return null;
    }

    const channel =
        guild.channels.cache?.get?.(configuredChannelId) ??
        (typeof guild.channels.resolve === 'function'
            ? guild.channels.resolve(configuredChannelId)
            : null);
    if (channel?.isTextBased?.()) {
        return channel;
    }
    return null;
}

export async function sendAuditLog(
    guild: any,
    title: string,
    description: string,
    fields: Array<{ name: string; value: string }> = [],
): Promise<void> {
    const channel = getAuditChannel(guild);
    if (!channel) {
        return;
    }

    try {
        const embed = {
            title,
            description,
            color: 0xed4245,
            timestamp: new Date().toISOString(),
            fields,
        };
        await channel.send({ embeds: [embed] });
    } catch (error) {
        logger.error(`Failed to send audit log for ${guild?.id}: ${error}`);
    }
}

export function truncate(text: string, maxLength = 1000): string {
    if (!text) {
        return 'No content';
    }
    if (text.length <= maxLength) {
        return text;
    }
    return `${text.slice(0, maxLength - 3)}...`;
}

export function parseDurationToMilliseconds(input: string): number {
    const normalized = input.trim().toLowerCase();
    const match = normalized.match(
        /^(\d+)\s*(s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days)$/i,
    );
    if (!match) {
        return 0;
    }

    const amount = Number(match[1]);
    const unit = match[2].toLowerCase();

    switch (unit) {
        case 's':
        case 'sec':
        case 'secs':
        case 'second':
        case 'seconds':
            return amount * 1000;
        case 'm':
        case 'min':
        case 'mins':
        case 'minute':
        case 'minutes':
            return amount * 60 * 1000;
        case 'h':
        case 'hr':
        case 'hrs':
        case 'hour':
        case 'hours':
            return amount * 60 * 60 * 1000;
        case 'd':
        case 'day':
        case 'days':
            return amount * 24 * 60 * 60 * 1000;
        default:
            return 0;
    }
}

export function buildMessageFingerprint(message: any): string {
    const attachments = Array.from(message?.attachments?.values?.() ?? []).map(
        (attachment: any) => `${attachment.name ?? 'unnamed'}:${attachment.url ?? ''}`,
    );
    attachments.sort();
    return JSON.stringify({
        content: message?.content ?? '',
        attachments,
    });
}

export async function handleDuplicateSpamming(message: any): Promise<void> {
    if (!message?.guild || message.author?.bot) {
        return;
    }

    const now = Date.now();
    for (const [key, entry] of duplicateMessageWindow.entries()) {
        if (now - entry.startedAt > DUPLICATE_SPAM_WINDOW_MS) {
            duplicateMessageWindow.delete(key);
        }
    }

    const fingerprint = buildMessageFingerprint(message);
    const entryKey = `${message.author.id}:${fingerprint}`;
    const existingEntry = duplicateMessageWindow.get(entryKey);

    if (!existingEntry || now - existingEntry.startedAt > DUPLICATE_SPAM_WINDOW_MS) {
        duplicateMessageWindow.set(entryKey, {
            userId: message.author.id,
            startedAt: now,
            channels: new Set<string>([message.channelId]),
            messages: [message],
            content: message.content ?? '',
            attachmentsKey: fingerprint,
        });
        return;
    }

    existingEntry.channels.add(message.channelId);
    existingEntry.messages.push(message);

    if (existingEntry.channels.size >= 3) {
        const targetMember = await message.guild.members.fetch(message.author.id).catch(() => null);
        const contentPreview = truncate(existingEntry.content || message.content || 'No content');

        if (targetMember) {
            try {
                await targetMember.timeout(
                    1000 * 60 * 60 * 24,
                    'Repeated duplicate posting across multiple channels',
                );
            } catch (error) {
                logger.error(`Failed to timeout spammer ${message.author.id}: ${error}`);
            }

            try {
                await targetMember.send(
                    'You were timed out for 24 hours for sending the same message with identical attachments across multiple channels in a short time.',
                );
            } catch (error) {
                logger.error(`Failed to DM spammer ${message.author.id}: ${error}`);
            }
        }

        await sendAuditLog(
            message.guild,
            'Spam detection triggered',
            'A user was timed out for posting duplicate messages with identical attachments in multiple channels.',
            [
                { name: 'User', value: `<@${message.author.id}>` },
                { name: 'Channels', value: `${existingEntry.channels.size}` },
                { name: 'Content', value: contentPreview },
            ],
        );

        const messagesToDelete = [
            ...new Map(
                existingEntry.messages.concat(message).map((item: any) => [item.id, item]),
            ).values(),
        ];
        messagesToDelete.forEach((item: any) => {
            if (item?.id) {
                markMessageAsBotDeleted(item.id);
            }
        });
        await Promise.allSettled(
            messagesToDelete.map((item: any) => item.delete().catch(() => undefined)),
        );

        duplicateMessageWindow.delete(entryKey);
    }
}

export async function handleGhostPing(message: any): Promise<void> {
    if (!message?.guild || message.author?.bot) {
        return;
    }

    const hasMentions =
        (message.mentions?.users?.size ?? 0) > 0 || (message.mentions?.roles?.size ?? 0) > 0;
    if (!hasMentions) {
        return;
    }

    pendingGhostPings.set(message.id, message);
    setTimeout(() => {
        pendingGhostPings.delete(message.id);
    }, GHOST_PING_WINDOW_MS);
}

export async function handleGhostPingDelete(message: any): Promise<void> {
    if (!message?.guild || message.author?.bot) {
        return;
    }

    if (await isDeletionPerformedByBot(message)) {
        pendingGhostPings.delete(message.id);
        return;
    }

    const pendingMessage = pendingGhostPings.get(message.id);
    if (!pendingMessage) {
        return;
    }

    pendingGhostPings.delete(message.id);

    const hasMentions =
        (message.mentions?.users?.size ?? 0) > 0 || (message.mentions?.roles?.size ?? 0) > 0;
    if (!hasMentions) {
        return;
    }

    try {
        await message.channel.send(
            'Ghost pings are not allowed here. Please avoid mentioning users or roles and then deleting the message immediately.',
        );
    } catch (error) {
        logger.error(`Failed to DM ghost ping user ${message.author.id}: ${error}`);
    }

    await sendAuditLog(
        message.guild,
        'Ghost ping detected',
        'A message containing mentions was deleted shortly after being sent.',
        [
            { name: 'User', value: `<@${message.author.id}>` },
            { name: 'Content', value: truncate(message.content || 'No content') },
        ],
    );
}

export async function handleTimeoutChange(oldMember: any, newMember: any): Promise<void> {
    if (!newMember?.guild || !newMember.id) {
        return;
    }

    const oldIsTimedOut =
        oldMember?.communicationDisabledUntilTimestamp &&
        oldMember.communicationDisabledUntilTimestamp > Date.now();
    const newIsTimedOut =
        newMember?.communicationDisabledUntilTimestamp &&
        newMember.communicationDisabledUntilTimestamp > Date.now();

    if (oldIsTimedOut === newIsTimedOut) {
        return;
    }

    const action = newIsTimedOut ? 'timed out' : 'untimed';
    await sendAuditLog(newMember.guild, 'Timeout updated', `A member was ${action}.`, [
        { name: 'User', value: `<@${newMember.id}>` },
        { name: 'Reason', value: 'Member timeout state changed' },
    ]);
}

export async function handleMessageDeletion(message: any): Promise<void> {
    if (!message?.guild || !message.author || message.author.bot) {
        return;
    }

    if (await isDeletionPerformedByBot(message)) {
        return;
    }

    const hasContent = Boolean((message.content || '').trim() || message.attachments?.size);
    if (!hasContent) {
        return;
    }

    const deletionReason = 'Message removed';
    await sendAuditLog(message.guild, 'Message removed', deletionReason, [
        { name: 'User', value: `<@${message.author.id}>` },
        { name: 'Content', value: truncate(message.content || 'No content') },
    ]);
}

export async function handleBanAdd(guildBan: any): Promise<void> {
    if (!guildBan?.guild) {
        return;
    }

    await sendAuditLog(guildBan.guild, 'Member banned', 'A member was banned from the server.', [
        { name: 'User', value: `<@${guildBan.user?.id ?? 'unknown'}>` },
        { name: 'Reason', value: guildBan.reason || 'No reason provided' },
    ]);
}

export async function handleBanRemove(guildBan: any): Promise<void> {
    if (!guildBan?.guild) {
        return;
    }

    await sendAuditLog(
        guildBan.guild,
        'Member unbanned',
        'A member was unbanned from the server.',
        [
            { name: 'User', value: `<@${guildBan.user?.id ?? 'unknown'}>` },
            { name: 'Reason', value: guildBan.reason || 'No reason provided' },
        ],
    );
}
