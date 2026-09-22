import { EmbedBuilder } from 'discord.js';
import { BotModule } from '../moduleLoader';
import { commandRegistry } from '../commandRegistry';
import { config } from '../config';
import { logger } from '../logger';
import { backupService } from '../services/backupService';

function checkAdmin(interaction: any): boolean {
    if (interaction.user?.id && interaction.user.id === config.env.botOwnerId) {
        return true;
    }
    if (interaction.memberPermissions?.has?.('Administrator')) {
        return true;
    }
    if (interaction.member?.permissions?.has?.('Administrator')) {
        return true;
    }
    return false;
}

function formatBytes(bytes?: number | string): string {
    const num = Number(bytes);
    if (!num || isNaN(num)) {
        return '0 B';
    }
    if (num < 1024) {
        return `${num} B`;
    }
    if (num < 1024 * 1024) {
        return `${(num / 1024).toFixed(1)} KB`;
    }
    return `${(num / (1024 * 1024)).toFixed(2)} MB`;
}

const moduleDefinition: BotModule = {
    name: 'backup',
    description: 'Automated and on-demand Google Drive data backup and live restore',
    help: {
        summary: 'Google Drive backup and restoration system for bot data',
        description:
            'Automatically backs up the bot data directory to Google Drive on a schedule and allows administrators to manually create, list, and restore backups with automatic live reload.',
        usage: '/backup <create | list | restore | status>',
        commands: [
            {
                name: 'backup create',
                description:
                    'Trigger an immediate non-blocking backup of the data folder to Google Drive',
                usage: '/backup create',
            },
            {
                name: 'backup list',
                description: 'List available backups stored in Google Drive',
                usage: '/backup list',
            },
            {
                name: 'backup restore',
                description: 'Restore a backup live from Google Drive and soft-restart all modules',
                usage: '/backup restore <backup: latest | file_id | filename>',
            },
            {
                name: 'backup status',
                description:
                    'View backup scheduler status, last backup stats, and Google Drive connection',
                usage: '/backup status',
            },
        ],
        examples: [
            '/backup create',
            '/backup list',
            '/backup restore backup:latest',
            '/backup status',
        ],
    },
    register: async (client: any) => {
        // Start backup scheduler
        backupService.startScheduler(client);

        commandRegistry.register({
            name: 'backup',
            description: 'Google Drive data backup and live restore management',
            options: [
                {
                    name: 'create',
                    description: 'Trigger an immediate backup of data to Google Drive',
                    type: 1, // SUB_COMMAND
                },
                {
                    name: 'list',
                    description: 'List available backups on Google Drive',
                    type: 1, // SUB_COMMAND
                },
                {
                    name: 'restore',
                    description: 'Restore a backup live from Google Drive and soft-reload the bot',
                    type: 1, // SUB_COMMAND
                    options: [
                        {
                            name: 'backup',
                            description:
                                'The backup to restore ("latest", file ID, or archive filename)',
                            type: 3, // STRING
                            required: true,
                        },
                    ],
                },
                {
                    name: 'status',
                    description: 'View backup service status and scheduled interval',
                    type: 1, // SUB_COMMAND
                },
            ],
            handler: async (interaction: any) => {
                if (!checkAdmin(interaction)) {
                    await interaction.reply({
                        content: 'You do not have permission to manage bot backups.',
                        ephemeral: true,
                    });
                    return;
                }

                const subCommand = interaction.options?.getSubcommand?.() || 'status';

                if (subCommand === 'create') {
                    await interaction.deferReply({ ephemeral: true });
                    try {
                        const file = await backupService.createBackup('manual');
                        const status = backupService.getStatus();

                        const embed = new EmbedBuilder()
                            .setTitle('Backup Created Successfully')
                            .setColor(0x57f287)
                            .setDescription(
                                `Data directory has been archived and uploaded to Google Drive.`,
                            )
                            .addFields(
                                { name: 'File Name', value: `\`${file.name}\``, inline: false },
                                {
                                    name: 'Size',
                                    value: formatBytes(status.lastBackupSize),
                                    inline: true,
                                },
                                {
                                    name: 'Google Drive File ID',
                                    value: `\`${file.id}\``,
                                    inline: true,
                                },
                            )
                            .setTimestamp();

                        await interaction.editReply({ embeds: [embed] });
                    } catch (error: any) {
                        logger.error(`Manual backup failed: ${error}`);
                        await interaction.editReply(
                            `❌ **Backup Failed**: ${error?.message || error}`,
                        );
                    }
                } else if (subCommand === 'list') {
                    await interaction.deferReply({ ephemeral: true });
                    try {
                        const files = await backupService.listBackups();

                        if (files.length === 0) {
                            await interaction.editReply('No backups found in Google Drive.');
                            return;
                        }

                        const lines = files.slice(0, 15).map((f, idx) => {
                            const dateStr = f.createdTime
                                ? new Date(f.createdTime).toLocaleString()
                                : 'Unknown Date';
                            const sizeStr = formatBytes(f.size);
                            return `**${idx + 1}. \`${f.name}\`**\n• Size: ${sizeStr} | Date: ${dateStr}\n• ID: \`${f.id}\``;
                        });

                        const embed = new EmbedBuilder()
                            .setTitle('Google Drive Backups')
                            .setColor(0x6a5acd)
                            .setDescription(lines.join('\n\n'))
                            .setFooter({
                                text: `Showing ${Math.min(files.length, 15)} of ${files.length} backups`,
                            })
                            .setTimestamp();

                        await interaction.editReply({ embeds: [embed] });
                    } catch (error: any) {
                        logger.error(`Failed to list backups: ${error}`);
                        await interaction.editReply(
                            `❌ **Failed to list backups**: ${error?.message || error}`,
                        );
                    }
                } else if (subCommand === 'restore') {
                    const targetBackup = interaction.options.getString('backup');
                    await interaction.deferReply({ ephemeral: true });

                    try {
                        const result = await backupService.restoreBackup(targetBackup, client);

                        const embed = new EmbedBuilder()
                            .setTitle('Backup Restored Successfully')
                            .setColor(0x57f287)
                            .setDescription(
                                `Successfully restored data from \`${result.backupName}\`.\n` +
                                    `A live soft restart was performed — all configuration caches and modules have been reloaded.`,
                            )
                            .addFields(
                                {
                                    name: 'Files Restored',
                                    value: String(result.restoredFiles.length),
                                    inline: true,
                                },
                                { name: 'Status', value: '🟢 Operational', inline: true },
                            )
                            .setTimestamp();

                        await interaction.editReply({ embeds: [embed] });
                    } catch (error: any) {
                        logger.error(`Failed to restore backup "${targetBackup}": ${error}`);
                        await interaction.editReply(
                            `❌ **Restore Failed**: ${error?.message || error}`,
                        );
                    }
                } else if (subCommand === 'status') {
                    const status = backupService.getStatus();

                    let authDisplay = '🔴 Not Configured';
                    if (status.authType === 'oauth2') {
                        authDisplay = '🟢 OAuth2 User (Refresh Token)';
                    } else if (status.authType === 'service_account') {
                        authDisplay = `🟢 Service Account (${status.clientEmail || 'Configured'})`;
                        if (status.impersonatedUser) {
                            authDisplay += ` (Impersonating: ${status.impersonatedUser})`;
                        }
                    }

                    const embed = new EmbedBuilder()
                        .setTitle('Backup Service Status')
                        .setColor(status.isConfigured ? 0x6a5acd : 0xed4245)
                        .addFields(
                            {
                                name: 'Google Drive Auth',
                                value: authDisplay,
                                inline: true,
                            },
                            {
                                name: 'Scheduler',
                                value: status.schedulerActive
                                    ? `🟢 Active (Every ${status.intervalMinutes}m)`
                                    : '⚪ Inactive',
                                inline: true,
                            },
                            {
                                name: 'Retention Count',
                                value: `${status.retentionCount} backups`,
                                inline: true,
                            },
                            {
                                name: 'Target Folder ID',
                                value: status.targetFolderId
                                    ? `\`${status.targetFolderId}\``
                                    : '*(Root or Default)*',
                                inline: false,
                            },
                            {
                                name: 'Last Backup',
                                value: status.lastBackupTime
                                    ? `${new Date(status.lastBackupTime).toLocaleString()} (${status.lastBackupStatus === 'success' ? '🟢 Success' : '🔴 Failed'})`
                                    : 'None recorded this session',
                                inline: true,
                            },
                            {
                                name: 'Next Scheduled Run',
                                value: status.nextBackupTime
                                    ? new Date(status.nextBackupTime).toLocaleString()
                                    : 'N/A',
                                inline: true,
                            },
                        );

                    if (status.lastBackupName) {
                        embed.addFields({
                            name: 'Last File',
                            value: `\`${status.lastBackupName}\` (${formatBytes(status.lastBackupSize)})`,
                            inline: false,
                        });
                    }

                    if (status.lastBackupError) {
                        embed.addFields({
                            name: 'Last Error',
                            value: `\`${status.lastBackupError}\``,
                            inline: false,
                        });
                    }

                    await interaction.reply({ embeds: [embed], ephemeral: true });
                }
            },
        });
    },
};

export default moduleDefinition;
export const module = moduleDefinition;
