import { logger } from '../logger';
import { commandRegistry } from '../commandRegistry';

const auditChannelByGuild = new Map<string, string>();
const duplicateMessageWindow = new Map<
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
const pendingGhostPings = new Map<string, any>();

const DEFAULT_MODERATOR_ROLE_NAME = 'Moderator';
const DEFAULT_ADMIN_ROLE_NAME = 'Administrator';
const MAX_TIMEOUT_MS = 1000 * 60 * 60 * 24 * 28;
const DUPLICATE_SPAM_WINDOW_MS = 1000 * 10;
const GHOST_PING_WINDOW_MS = 1000 * 10;

function normalizeRoleName(value?: string): string | undefined {
    const trimmed = value?.trim();
    if (!trimmed) {
        return undefined;
    }
    return trimmed;
}

function getConfiguredRoleNames(): { moderator?: string; admin?: string } {
    return {
        moderator: normalizeRoleName(
            process.env.MODERATION_MODERATOR_ROLE_ID ??
                process.env.MODERATION_MODERATOR_ROLE_NAME ??
                DEFAULT_MODERATOR_ROLE_NAME,
        ),
        admin: normalizeRoleName(
            process.env.MODERATION_ADMIN_ROLE_ID ??
                process.env.MODERATION_ADMIN_ROLE_NAME ??
                DEFAULT_ADMIN_ROLE_NAME,
        ),
    };
}

function hasConfiguredRole(member: any, roleNameOrId?: string): boolean {
    if (!member?.guild || !roleNameOrId) {
        return false;
    }

    const normalized = roleNameOrId.toLowerCase();
    return member.roles.cache.some((role: any) => {
        return role.id === roleNameOrId || role.name?.toLowerCase() === normalized;
    });
}

function canModerate(member: any): boolean {
    const roles = getConfiguredRoleNames();
    return hasConfiguredRole(member, roles.moderator) || hasConfiguredRole(member, roles.admin);
}

function canAdministrate(member: any): boolean {
    const roles = getConfiguredRoleNames();
    return hasConfiguredRole(member, roles.admin) || member?.permissions?.has?.('Administrator');
}

function getAuditChannel(guild: any): any | null {
    if (!guild) {
        return null;
    }

    const configuredChannelId =
        auditChannelByGuild.get(guild.id) || process.env.MODERATION_AUDIT_CHANNEL_ID;
    if (!configuredChannelId) {
        return null;
    }

    const channel =
        guild.channels.cache.get(configuredChannelId) ??
        guild.channels.resolve(configuredChannelId);
    if (channel?.isTextBased?.()) {
        return channel;
    }
    return null;
}

async function sendAuditLog(
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

function truncate(text: string, maxLength = 1000): string {
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

async function handleDuplicateSpamming(message: any): Promise<void> {
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
        await Promise.allSettled(
            messagesToDelete.map((item: any) => item.delete().catch(() => undefined)),
        );

        duplicateMessageWindow.delete(entryKey);
    }
}

async function handleGhostPing(message: any): Promise<void> {
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

async function handleGhostPingDelete(message: any): Promise<void> {
    if (!message?.guild || message.author?.bot) {
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
        await message.author.send(
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

async function handleTimeoutChange(oldMember: any, newMember: any): Promise<void> {
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

async function handleMessageDeletion(message: any): Promise<void> {
    if (!message?.guild || !message.author || message.author.bot) {
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

async function handleBanAdd(guildBan: any): Promise<void> {
    if (!guildBan?.guild) {
        return;
    }

    await sendAuditLog(guildBan.guild, 'Member banned', 'A member was banned from the server.', [
        { name: 'User', value: `<@${guildBan.user?.id ?? 'unknown'}>` },
        { name: 'Reason', value: guildBan.reason || 'No reason provided' },
    ]);
}

async function handleBanRemove(guildBan: any): Promise<void> {
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

const moduleDefinition = {
    name: 'auditLog',
    description: 'Moderation logging, timeout controls, and anti-spam / ghost-ping protection',
    register: async (client: any) => {
        client.on('messageCreate', async (message: any) => {
            try {
                await handleDuplicateSpamming(message);
                await handleGhostPing(message);
            } catch (error) {
                logger.error(`Error handling moderation message event: ${error}`);
            }
        });

        client.on('messageDelete', async (message: any) => {
            try {
                await handleGhostPingDelete(message);
                await handleMessageDeletion(message);
            } catch (error) {
                logger.error(`Error handling moderation message delete event: ${error}`);
            }
        });

        client.on('guildMemberUpdate', async (oldMember: any, newMember: any) => {
            try {
                await handleTimeoutChange(oldMember, newMember);
            } catch (error) {
                logger.error(`Error handling moderation timeout event: ${error}`);
            }
        });

        client.on('guildBanAdd', async (guildBan: any) => {
            try {
                await handleBanAdd(guildBan);
            } catch (error) {
                logger.error(`Error handling moderation ban add event: ${error}`);
            }
        });

        client.on('guildBanRemove', async (guildBan: any) => {
            try {
                await handleBanRemove(guildBan);
            } catch (error) {
                logger.error(`Error handling moderation ban remove event: ${error}`);
            }
        });

        commandRegistry.register({
            name: 'set_audit_log_channel',
            description: 'Set the channel used for moderation audit logs',
            options: [
                {
                    name: 'channel',
                    description: 'Text channel for audit logs',
                    type: 7,
                    required: true,
                },
            ],
            handler: async (interaction: any) => {
                if (!interaction.guild || !canModerate(interaction.member)) {
                    await interaction.reply({
                        content: 'You do not have permission to configure moderation settings.',
                        ephemeral: true,
                    });
                    return;
                }

                const channel = interaction.options.getChannel('channel');
                if (!channel?.isTextBased?.()) {
                    await interaction.reply({
                        content: 'Please select a text channel.',
                        ephemeral: true,
                    });
                    return;
                }

                auditChannelByGuild.set(interaction.guild.id, channel.id);
                await interaction.reply({
                    content: `Audit logs will now be sent to <#${channel.id}>.`,
                    ephemeral: true,
                });
            },
        });

        commandRegistry.register({
            name: 'timeout',
            description: 'Timeout a user for a custom duration',
            options: [
                { name: 'user', description: 'User to timeout', type: 6, required: true },
                {
                    name: 'duration',
                    description: 'Duration such as 10m, 2h, 1d',
                    type: 3,
                    required: true,
                },
                { name: 'reason', description: 'Reason for the timeout', type: 3, required: false },
            ],
            handler: async (interaction: any) => {
                if (!interaction.guild || !canModerate(interaction.member)) {
                    await interaction.reply({
                        content: 'You do not have permission to use moderation commands.',
                        ephemeral: true,
                    });
                    return;
                }

                const targetUser = interaction.options.getUser('user');
                const durationInput = interaction.options.getString('duration');
                const reason = interaction.options.getString('reason') || 'No reason provided';

                if (!targetUser || !durationInput) {
                    await interaction.reply({
                        content: 'Please provide a user and a duration.',
                        ephemeral: true,
                    });
                    return;
                }

                const durationMs = parseDurationToMilliseconds(durationInput);
                if (!durationMs || durationMs > MAX_TIMEOUT_MS) {
                    await interaction.reply({
                        content:
                            'Please use a duration between 1 second and 28 days (for example 10m, 2h, 1d).',
                        ephemeral: true,
                    });
                    return;
                }

                const targetMember = await interaction.guild.members
                    .fetch(targetUser.id)
                    .catch(() => null);
                if (!targetMember) {
                    await interaction.reply({
                        content: 'That user is not in this server.',
                        ephemeral: true,
                    });
                    return;
                }

                try {
                    await targetMember.timeout(durationMs, reason);
                    await sendAuditLog(
                        interaction.guild,
                        'User timed out',
                        'A user was timed out.',
                        [
                            { name: 'User', value: `<@${targetUser.id}>` },
                            { name: 'Duration', value: durationInput },
                            { name: 'Reason', value: reason },
                        ],
                    );
                    await interaction.reply({
                        content: `Timed out <@${targetUser.id}> for ${durationInput}.`,
                        ephemeral: false,
                    });
                } catch (error) {
                    logger.error(`Failed to timeout user ${targetUser.id}: ${error}`);
                    await interaction.reply({
                        content: 'I could not timeout that user.',
                        ephemeral: true,
                    });
                }
            },
        });

        commandRegistry.register({
            name: 'untimeout',
            description: 'Remove a timeout from a user',
            options: [
                {
                    name: 'user',
                    description: 'User to remove timeout from',
                    type: 6,
                    required: true,
                },
                {
                    name: 'reason',
                    description: 'Reason for removing the timeout',
                    type: 3,
                    required: false,
                },
            ],
            handler: async (interaction: any) => {
                if (!interaction.guild || !canModerate(interaction.member)) {
                    await interaction.reply({
                        content: 'You do not have permission to use moderation commands.',
                        ephemeral: true,
                    });
                    return;
                }

                const targetUser = interaction.options.getUser('user');
                const reason = interaction.options.getString('reason') || 'No reason provided';

                if (!targetUser) {
                    await interaction.reply({ content: 'Please provide a user.', ephemeral: true });
                    return;
                }

                const targetMember = await interaction.guild.members
                    .fetch(targetUser.id)
                    .catch(() => null);
                if (!targetMember) {
                    await interaction.reply({
                        content: 'That user is not in this server.',
                        ephemeral: true,
                    });
                    return;
                }

                try {
                    await targetMember.timeout(null, reason);
                    await sendAuditLog(
                        interaction.guild,
                        'Timeout removed',
                        'A timeout was removed from a user.',
                        [
                            { name: 'User', value: `<@${targetUser.id}>` },
                            { name: 'Reason', value: reason },
                        ],
                    );
                    await interaction.reply({
                        content: `Removed the timeout from <@${targetUser.id}>.`,
                        ephemeral: false,
                    });
                } catch (error) {
                    logger.error(`Failed to remove timeout from user ${targetUser.id}: ${error}`);
                    await interaction.reply({
                        content: 'I could not remove that timeout.',
                        ephemeral: true,
                    });
                }
            },
        });

        commandRegistry.register({
            name: 'warn',
            description: 'Warn a user and log the action',
            options: [
                { name: 'user', description: 'User to warn', type: 6, required: true },
                { name: 'reason', description: 'Reason for the warning', type: 3, required: true },
            ],
            handler: async (interaction: any) => {
                if (!interaction.guild || !canModerate(interaction.member)) {
                    await interaction.reply({
                        content: 'You do not have permission to use moderation commands.',
                        ephemeral: true,
                    });
                    return;
                }

                const targetUser = interaction.options.getUser('user');
                const reason = interaction.options.getString('reason');
                if (!targetUser || !reason) {
                    await interaction.reply({
                        content: 'Please provide a user and a reason.',
                        ephemeral: true,
                    });
                    return;
                }

                try {
                    await targetUser.send(
                        `You were warned in ${interaction.guild.name}: ${reason}`,
                    );
                } catch (error) {
                    logger.warn(`Unable to DM user ${targetUser.id}: ${error}`);
                }

                await sendAuditLog(interaction.guild, 'User warned', 'A user received a warning.', [
                    { name: 'User', value: `<@${targetUser.id}>` },
                    { name: 'Reason', value: reason },
                ]);
                await interaction.reply({
                    content: `Warned <@${targetUser.id}> for: ${reason}`,
                    ephemeral: false,
                });
            },
        });

        commandRegistry.register({
            name: 'kick',
            description: 'Kick a user from the server',
            options: [
                { name: 'user', description: 'User to kick', type: 6, required: true },
                { name: 'reason', description: 'Reason for the kick', type: 3, required: false },
            ],
            handler: async (interaction: any) => {
                if (!interaction.guild || !canModerate(interaction.member)) {
                    await interaction.reply({
                        content: 'You do not have permission to use moderation commands.',
                        ephemeral: true,
                    });
                    return;
                }

                const targetUser = interaction.options.getUser('user');
                const reason = interaction.options.getString('reason') || 'No reason provided';
                if (!targetUser) {
                    await interaction.reply({ content: 'Please provide a user.', ephemeral: true });
                    return;
                }

                const targetMember = await interaction.guild.members
                    .fetch(targetUser.id)
                    .catch(() => null);
                if (!targetMember) {
                    await interaction.reply({
                        content: 'That user is not in this server.',
                        ephemeral: true,
                    });
                    return;
                }

                try {
                    await targetMember.kick(reason);
                    await sendAuditLog(
                        interaction.guild,
                        'User kicked',
                        'A user was kicked from the server.',
                        [
                            { name: 'User', value: `<@${targetUser.id}>` },
                            { name: 'Reason', value: reason },
                        ],
                    );
                    await interaction.reply({
                        content: `Kicked <@${targetUser.id}>.`,
                        ephemeral: false,
                    });
                } catch (error) {
                    logger.error(`Failed to kick user ${targetUser.id}: ${error}`);
                    await interaction.reply({
                        content: 'I could not kick that user.',
                        ephemeral: true,
                    });
                }
            },
        });

        commandRegistry.register({
            name: 'ban',
            description: 'Ban a user from the server',
            options: [
                { name: 'user', description: 'User to ban', type: 6, required: true },
                { name: 'reason', description: 'Reason for the ban', type: 3, required: false },
                {
                    name: 'delete_days',
                    description: 'How many days of recent messages to delete',
                    type: 4,
                    required: false,
                },
            ],
            handler: async (interaction: any) => {
                if (!interaction.guild || !canModerate(interaction.member)) {
                    await interaction.reply({
                        content: 'You do not have permission to use moderation commands.',
                        ephemeral: true,
                    });
                    return;
                }

                const targetUser = interaction.options.getUser('user');
                const reason = interaction.options.getString('reason') || 'No reason provided';
                const deleteDays = interaction.options.getInteger('delete_days') ?? 0;
                if (!targetUser) {
                    await interaction.reply({ content: 'Please provide a user.', ephemeral: true });
                    return;
                }

                try {
                    await interaction.guild.members.ban(targetUser.id, {
                        deleteMessageSeconds: deleteDays * 24 * 60 * 60,
                        reason,
                    });
                    await sendAuditLog(
                        interaction.guild,
                        'User banned',
                        'A user was banned from the server.',
                        [
                            { name: 'User', value: `<@${targetUser.id}>` },
                            { name: 'Reason', value: reason },
                        ],
                    );
                    await interaction.reply({
                        content: `Banned <@${targetUser.id}>.`,
                        ephemeral: false,
                    });
                } catch (error) {
                    logger.error(`Failed to ban user ${targetUser.id}: ${error}`);
                    await interaction.reply({
                        content: 'I could not ban that user.',
                        ephemeral: true,
                    });
                }
            },
        });

        commandRegistry.register({
            name: 'unban',
            description: 'Unban a user from the server',
            options: [
                { name: 'user_id', description: 'User ID to unban', type: 3, required: true },
                { name: 'reason', description: 'Reason for the unban', type: 3, required: false },
            ],
            handler: async (interaction: any) => {
                if (!interaction.guild || !canAdministrate(interaction.member)) {
                    await interaction.reply({
                        content: 'You do not have permission to unban users.',
                        ephemeral: true,
                    });
                    return;
                }

                const userId = interaction.options.getString('user_id');
                const reason = interaction.options.getString('reason') || 'No reason provided';
                if (!userId) {
                    await interaction.reply({
                        content: 'Please provide a user ID.',
                        ephemeral: true,
                    });
                    return;
                }

                try {
                    await interaction.guild.members.unban(userId, reason);
                    await sendAuditLog(
                        interaction.guild,
                        'User unbanned',
                        'A user was unbanned from the server.',
                        [
                            { name: 'User ID', value: userId },
                            { name: 'Reason', value: reason },
                        ],
                    );
                    await interaction.reply({
                        content: `Unbanned user ID ${userId}.`,
                        ephemeral: false,
                    });
                } catch (error) {
                    logger.error(`Failed to unban user ${userId}: ${error}`);
                    await interaction.reply({
                        content: 'I could not unban that user.',
                        ephemeral: true,
                    });
                }
            },
        });

        commandRegistry.register({
            name: 'purge',
            description: 'Delete a number of recent messages from the current channel',
            options: [
                {
                    name: 'count',
                    description: 'How many messages to delete',
                    type: 4,
                    required: true,
                },
            ],
            handler: async (interaction: any) => {
                if (!interaction.guild || !canModerate(interaction.member)) {
                    await interaction.reply({
                        content: 'You do not have permission to use moderation commands.',
                        ephemeral: true,
                    });
                    return;
                }

                const count = interaction.options.getInteger('count');
                if (!count || count < 1 || count > 100) {
                    await interaction.reply({
                        content: 'Please choose a number between 1 and 100.',
                        ephemeral: true,
                    });
                    return;
                }

                try {
                    const messages = await interaction.channel.messages.fetch({ limit: count });
                    await interaction.channel.bulkDelete(messages);
                    await sendAuditLog(
                        interaction.guild,
                        'Messages purged',
                        'A moderation purge was executed.',
                        [
                            { name: 'Channel', value: `<#${interaction.channel.id}>` },
                            { name: 'Count', value: `${count}` },
                        ],
                    );
                    await interaction.reply({
                        content: `Deleted ${count} messages.`,
                        ephemeral: true,
                    });
                } catch (error) {
                    logger.error(`Failed to purge messages: ${error}`);
                    await interaction.reply({
                        content: 'I could not delete those messages.',
                        ephemeral: true,
                    });
                }
            },
        });
    },
};

export default moduleDefinition;
export const module = moduleDefinition;
