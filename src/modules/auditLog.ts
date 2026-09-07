import { commandRegistry } from '../commandRegistry';
import { logger } from '../logger';
import {
    auditChannelByGuild,
    buildMessageFingerprint,
    canAdministrate,
    canModerate,
    handleBanAdd,
    handleBanRemove,
    handleDuplicateSpamming,
    handleGhostPing,
    handleGhostPingDelete,
    handleMessageDeletion,
    handleTimeoutChange,
    markMessageAsBotDeleted,
    MAX_TIMEOUT_MS,
    parseDurationToMilliseconds,
    sendAuditLog,
} from '../services/auditLogService';

export { buildMessageFingerprint, parseDurationToMilliseconds };

import { config } from '../config';
import { BotModule } from '../moduleLoader';

const moduleDefinition: BotModule = {
    name: 'auditLog',
    description: 'Moderation logging, timeout controls, and anti-spam / ghost-ping protection',
    help: {
        summary: 'Moderation logging and security auditing',
        description:
            'Tracks deleted messages, member timeouts, bans/unbans, duplicate spam detection, and ghost pings with searchable audit logs and stats.',
        usage: '/timeout | /ban | /warn | /set_audit_log_channel | /audit_search | /mod_stats',
        commands: [
            {
                name: 'set_audit_log_channel',
                description: 'Set the channel used for moderation audit logs',
                usage: '/set_audit_log_channel <channel:channel>',
            },
            {
                name: 'timeout',
                description: 'Timeout a guild member for a given duration',
                usage: '/timeout <user:user> <duration:string> [reason:string]',
            },
            {
                name: 'untimeout',
                description: 'Remove timeout from a guild member',
                usage: '/untimeout <user:user> [reason:string]',
            },
            {
                name: 'ban',
                description: 'Ban a member from the guild',
                usage: '/ban <user:user> [reason:string]',
            },
            {
                name: 'unban',
                description: 'Unban a user by their user ID',
                usage: '/unban <user_id:string> [reason:string]',
            },
            {
                name: 'warn',
                description: 'Issue a formal moderation warning to a user',
                usage: '/warn <user:user> <reason:string>',
            },
            {
                name: 'audit_search',
                description: 'Search recent audit log entries for this guild',
                usage: '/audit_search [user:user] [action:string] [limit:number]',
            },
            {
                name: 'mod_stats',
                description: 'View moderation action statistics for this guild',
                usage: '/mod_stats [user:user]',
            },
        ],
        examples: [
            '/timeout user:@Troublemaker duration:10m reason:Spamming',
            '/warn user:@Member reason:Please mind rule 3',
            '/audit_search action:BAN',
            '/mod_stats',
        ],
    },
    register: async (client: any) => {
        client.on('messageCreate', async (message: any) => {
            try {
                if (
                    !config.modules.isModuleEnabled(
                        'auditLog',
                        message?.guildId,
                        message?.channelId,
                    )
                ) {
                    return;
                }
                await handleDuplicateSpamming(message);
                await handleGhostPing(message);
            } catch (error) {
                logger.error(`Error handling moderation message event: ${error}`);
            }
        });

        client.on('messageDelete', async (message: any) => {
            try {
                if (
                    !config.modules.isModuleEnabled(
                        'auditLog',
                        message?.guildId,
                        message?.channelId,
                    )
                ) {
                    return;
                }
                await handleGhostPingDelete(message);
                await handleMessageDeletion(message);
            } catch (error) {
                logger.error(`Error handling moderation message delete event: ${error}`);
            }
        });

        client.on('guildMemberUpdate', async (oldMember: any, newMember: any) => {
            try {
                if (!config.modules.isModuleEnabled('auditLog', newMember?.guild?.id)) {
                    return;
                }
                await handleTimeoutChange(oldMember, newMember);
            } catch (error) {
                logger.error(`Error handling moderation timeout event: ${error}`);
            }
        });

        client.on('guildBanAdd', async (guildBan: any) => {
            try {
                if (!config.modules.isModuleEnabled('auditLog', guildBan?.guild?.id)) {
                    return;
                }
                await handleBanAdd(guildBan);
            } catch (error) {
                logger.error(`Error handling moderation ban add event: ${error}`);
            }
        });

        client.on('guildBanRemove', async (guildBan: any) => {
            try {
                if (!config.modules.isModuleEnabled('auditLog', guildBan?.guild?.id)) {
                    return;
                }
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
                    messages.forEach((msg: any) => {
                        if (msg?.id) {
                            markMessageAsBotDeleted(msg.id);
                        }
                    });
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
