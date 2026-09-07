import { Colors, EmbedBuilder } from 'discord.js';
import { commandRegistry } from '../commandRegistry';
import { logger } from '../logger';
import { canModerate, markMessageAsBotDeleted } from '../services/auditLogService';
import {
    containsLarpWord,
    countLarpOccurrences,
    formatTimeRemaining,
    getGuildLeaderboard,
    getLarpUser,
    getNextThreshold,
    getRandomClinkMessage,
    getRandomSilencedAttemptMessage,
    getRandomThresholdMessage,
    isUserSilenced,
    recordLarp,
    sendLarpJarAuditAlert,
    sendLarpJarUnsilenceAuditLog,
    unsilenceUser,
} from '../services/larpJarService';
import { config } from '../config';
import { BotModule } from '../moduleLoader';

const moduleDefinition: BotModule = {
    name: 'larpJar',
    description:
        'Tracks and fines users for saying larp variants, with dynamic escalating silences',
    help: {
        summary: 'Larp jar swear-jar tracking and escalating timeouts',
        description:
            'Detects uses of "larp" and related terms, fines users into the server jar, triggers escalating timeouts, and maintains server leaderboards.',
        usage: '/larp_leaderboard | /larp_stats | /larp_unsilence',
        commands: [
            {
                name: 'larp_leaderboard',
                description: 'View top larpers and most fined users in this server',
                usage: '/larp_leaderboard [limit:number]',
            },
            {
                name: 'larp_stats',
                description: 'View personal or user larp statistics and fines',
                usage: '/larp_stats [user:user]',
            },
            {
                name: 'larp_unsilence',
                description: 'Moderator command to unsilence a penalized user',
                usage: '/larp_unsilence <user:user>',
            },
        ],
        examples: ['/larp_leaderboard', '/larp_stats', '/larp_unsilence user:@Member'],
    },
    register: async (client: any) => {
        client.on('messageCreate', async (message: any) => {
            try {
                if (!message || !message.guild || message.author?.bot) {
                    return;
                }

                if (
                    !config.modules.isModuleEnabled(
                        'larpJar',
                        message.guild.id,
                        message.channel?.id,
                    )
                ) {
                    return;
                }

                const content = message.content ?? '';

                if (!containsLarpWord(content)) {
                    return;
                }

                const guildId = message.guild.id;
                const userId = message.author.id;
                const displayName =
                    message.member?.displayName ||
                    message.author?.displayName ||
                    message.author?.username ||
                    'Unknown';
                const user = getLarpUser(guildId, userId);

                // Case 1: User is currently silenced/banned from larping
                if (isUserSilenced(user)) {
                    try {
                        if (message.deletable) {
                            markMessageAsBotDeleted(message.id);
                            await message.delete();
                        }
                    } catch (error) {
                        logger.warn(`Failed to delete larp message from silenced user: ${error}`);
                    }

                    await sendLarpJarAuditAlert(
                        message.guild,
                        message.author,
                        message.channel.id,
                        content,
                        user.bannedUntil!,
                        user.count,
                    );

                    try {
                        const remainingMs = user.bannedUntil! - Date.now();
                        const warningContent = getRandomSilencedAttemptMessage(
                            displayName,
                            remainingMs,
                        );
                        const warningMsg = await message.channel.send({
                            content: warningContent,
                            allowedMentions: { parse: [], users: [], roles: [] },
                        });

                        setTimeout(() => {
                            warningMsg.delete().catch(() => undefined);
                        }, 5000);
                    } catch (sendErr) {
                        logger.warn(`Failed to send silenced larp notice: ${sendErr}`);
                    }
                    return;
                }

                // Case 2: User is active (not silenced)
                const occurrences = countLarpOccurrences(content);
                const { user: updatedUser, thresholdCrossed } = recordLarp(
                    guildId,
                    userId,
                    message.author.username,
                    displayName,
                    occurrences,
                );

                if (thresholdCrossed) {
                    const thresholdMsg = getRandomThresholdMessage(
                        displayName,
                        updatedUser.count,
                        thresholdCrossed.durationLabel,
                        updatedUser.bannedUntil!,
                    );
                    await message.channel.send({
                        content: thresholdMsg,
                        allowedMentions: { parse: [], users: [], roles: [] },
                    });
                } else {
                    const clinkMsg = getRandomClinkMessage(displayName, updatedUser.count);
                    await message.channel.send({
                        content: clinkMsg,
                        allowedMentions: { parse: [], users: [], roles: [] },
                    });
                }
            } catch (error) {
                logger.error(`Error in Larp Jar message listener: ${error}`);
            }
        });

        commandRegistry.register({
            name: 'larp_leaderboard',
            description: 'View the server Larp Jar leaderboard and top larpers',
            handler: async (interaction: any) => {
                if (!interaction.guild) {
                    await interaction.reply({
                        content: 'This command can only be used inside a server.',
                        ephemeral: true,
                    });
                    return;
                }

                const { users, totalLarps } = getGuildLeaderboard(interaction.guild.id, 10);
                if (users.length === 0) {
                    await interaction.reply({
                        content:
                            '🪙 The Larp Jar is sparkling clean and empty! Nobody has larped yet.',
                    });
                    return;
                }

                const medals = ['🥇', '🥈', '🥉'];
                const lines = users.map((u, idx) => {
                    const rankBadge = medals[idx] || `**#${idx + 1}**`;
                    const silencedBadge = isUserSilenced(u)
                        ? ` ⏳ *(Silenced: ${formatTimeRemaining(u.bannedUntil! - Date.now())})*`
                        : '';
                    return `${rankBadge} **${u.displayName}** — 🪙 **${u.count}** larps${silencedBadge}`;
                });

                const embed = new EmbedBuilder()
                    .setTitle('🏺 The Official Larp Jar Leaderboard')
                    .setDescription(
                        `**Server Total:** 🪙 **${totalLarps}** coins collected in the jar!\n\n` +
                            lines.join('\n'),
                    )
                    .setColor(Colors.Gold)
                    .setFooter({ text: 'Komaru Bot • Drop a coin whenever you larp!' })
                    .setTimestamp();

                await interaction.reply({ embeds: [embed] });
            },
        });

        commandRegistry.register({
            name: 'larp_stats',
            description: "Check a member's Larp Jar statistics and current status",
            options: [
                {
                    name: 'user',
                    description: 'The user to inspect (defaults to you)',
                    type: 6,
                    required: false,
                },
            ],
            handler: async (interaction: any) => {
                if (!interaction.guild) {
                    await interaction.reply({
                        content: 'This command can only be used inside a server.',
                        ephemeral: true,
                    });
                    return;
                }

                const targetUser = interaction.options.getUser('user') || interaction.user;
                const targetMember = await interaction.guild.members
                    .fetch(targetUser.id)
                    .catch(() => null);
                const displayName =
                    targetMember?.displayName || targetUser.displayName || targetUser.username;

                const larpUser = getLarpUser(interaction.guild.id, targetUser.id);
                const silenced = isUserSilenced(larpUser);
                const nextThreshold = getNextThreshold(larpUser.count);
                const larpsUntilThreshold = Math.max(0, nextThreshold - larpUser.count);

                const statusText = silenced
                    ? `🔴 **Silenced** (Time remaining: ${formatTimeRemaining(larpUser.bannedUntil! - Date.now())})`
                    : '🟢 **Active** (Not silenced)';

                const embed = new EmbedBuilder()
                    .setTitle(`🏺 Larp Jar Stats — ${displayName}`)
                    .setColor(silenced ? Colors.Red : Colors.Gold)
                    .addFields(
                        { name: 'Total Larps', value: `🪙 **${larpUser.count}**`, inline: true },
                        { name: 'Status', value: statusText, inline: true },
                        {
                            name: 'Next Threshold',
                            value: `**${nextThreshold}** larps (*${larpsUntilThreshold}* to go)`,
                            inline: true,
                        },
                    )
                    .setFooter({ text: 'Komaru Bot • Speak carefully!' })
                    .setTimestamp();

                await interaction.reply({ embeds: [embed] });
            },
        });

        commandRegistry.register({
            name: 'larp_unsilence',
            description: 'Remove the Larp Jar silence from a user (Admin/Mod only)',
            options: [
                {
                    name: 'user',
                    description: 'The member to unsilence',
                    type: 6, // USER
                    required: true,
                },
                {
                    name: 'reason',
                    description: 'Reason for unsilencing the user',
                    type: 3, // STRING
                    required: false,
                },
            ],
            handler: async (interaction: any) => {
                if (!interaction.guild) {
                    await interaction.reply({
                        content: 'This command can only be used inside a server.',
                        ephemeral: true,
                    });
                    return;
                }

                const isOwner =
                    process.env.BOT_OWNER_ID && interaction.user?.id === process.env.BOT_OWNER_ID;
                const isAdmin = interaction.memberPermissions?.has?.('Administrator');
                const isMod = canModerate(interaction.member);

                if (!isOwner && !isAdmin && !isMod) {
                    await interaction.reply({
                        content: '❌ You do not have permission to manage Larp Jar silences.',
                        ephemeral: true,
                    });
                    return;
                }

                const targetUser = interaction.options.getUser('user');
                const reason = interaction.options.getString('reason') || 'No reason provided';

                if (!targetUser) {
                    await interaction.reply({
                        content: 'Please specify a valid user.',
                        ephemeral: true,
                    });
                    return;
                }

                const { wasSilenced } = unsilenceUser(interaction.guild.id, targetUser.id);
                const targetMember = await interaction.guild.members
                    .fetch(targetUser.id)
                    .catch(() => null);
                const displayName =
                    targetMember?.displayName || targetUser.displayName || targetUser.username;

                if (!wasSilenced) {
                    await interaction.reply({
                        content: `ℹ️ **${displayName}** is not currently silenced from the Larp Jar.`,
                        ephemeral: true,
                    });
                    return;
                }

                await sendLarpJarUnsilenceAuditLog(
                    interaction.guild,
                    targetUser,
                    interaction.user,
                    reason,
                );

                await interaction.reply({
                    content: `✅ Successfully removed the Larp Jar silence for **${displayName}**.\n*Reason:* ${reason}`,
                    allowedMentions: { parse: [], users: [], roles: [] },
                });
            },
        });
    },
};

export default moduleDefinition;
export const module = moduleDefinition;
