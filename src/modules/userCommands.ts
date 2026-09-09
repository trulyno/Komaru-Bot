import { logger } from '../logger';
import { commandRegistry } from '../commandRegistry';
import { ConfigStore } from '../userCommands/configStore';
import { QuotaManager } from '../userCommands/quotaManager';
import { SessionManager } from '../userCommands/sessionManager';
import { UserCommandStorage } from '../userCommands/storage';
import { TriggerPool } from '../userCommands/triggerPool';
import { getHelpTopicEmbed } from '../userCommands/helpProvider';
import { UserCommandTrigger } from '../userCommands/types';
import { config } from '../config';
import { sendAuditLog } from '../services/auditLogService';

const storage = new UserCommandStorage();
const configStore = new ConfigStore();
const quotaManager = new QuotaManager(configStore, storage);
const triggerPool = new TriggerPool(storage, configStore);
const sessionManager = new SessionManager(storage, triggerPool, quotaManager);

// Initialize trigger pool from storage
triggerPool.loadFromStorage();

function isBotOwner(userId: string, client: any): boolean {
    const ownerId = config.env.botOwnerId;
    if (ownerId && userId === ownerId) {
        return true;
    }
    const appOwnerId = client?.application?.owner?.id;
    if (appOwnerId && userId === appOwnerId) {
        return true;
    }
    return false;
}

function extractUserIdFromMention(input: string): string {
    const clean = input.trim();
    const match = clean.match(/^<@!?(\d+)>$/);
    if (match) return match[1];
    if (/^\d+$/.test(clean)) return clean;
    return clean;
}

import { BotModule } from '../moduleLoader';

const moduleDefinition: BotModule = {
    name: 'userCommands',
    description: 'System for user defined custom natural language commands',
    help: {
        summary: 'User-defined custom macro DSL and natural language triggers',
        description:
            'Create, test, manage, and execute custom macros using a rich domain-specific language supporting variables, random choices, math calculations, pipes, conditionals, and embeds.',
        usage: '/cmd_create | /cmd_edit | /cmd_list | /cmd_info | /cmd_delete | /cmd_test',
        commands: [
            {
                name: 'cmd_create',
                description: 'Open a modal form to create a new user command',
                usage: '/cmd_create',
            },
            {
                name: 'cmd_edit',
                description: 'Edit one of your existing user commands',
                usage: '/cmd_edit <name:string>',
            },
            {
                name: 'cmd_info',
                description: 'View metadata, triggers, and stats for a user command',
                usage: '/cmd_info <name:string>',
            },
            {
                name: 'cmd_list',
                description: 'List user commands with optional author filter',
                usage: '/cmd_list [user:user]',
            },
            {
                name: 'cmd_delete',
                description: 'Delete a user command you own',
                usage: '/cmd_delete <name:string>',
            },
            {
                name: 'cmd_test',
                description: 'Test evaluating user command DSL script text',
                usage: '/cmd_test <script:string>',
            },
        ],
        examples: [
            '/cmd_create',
            '/cmd_info name:hug',
            '/cmd_test script:Hello $user{name}! Choice: choice(cat, dog, bird)',
            '!qt flip -> Tails/Heads',
        ],
    },
    register: async (client: any) => {
        // Register message listener for command definition pings, utility text commands, and execution
        client.on('messageCreate', async (message: any) => {
            if (!message || message.author?.bot) return;

            if (
                !config.modules.isModuleEnabled('userCommands', message.guildId, message.channelId)
            ) {
                return;
            }

            try {
                // 1. Check if user is defining a command or continuing a session
                const handledSession = await sessionManager.handleMessage(
                    message,
                    client.user?.id || '',
                );
                if (handledSession) return;

                // 2. Check text prefix management & utility commands
                const textHandled = await handleTextCommands(message, client);
                if (textHandled) return;

                // 3. Check trigger pool for executing user commands
                await triggerPool.handleMessage(message);
            } catch (error) {
                logger.error(`Error in userCommands message listener: ${error}`);
            }
        });

        // -------------------------------------------------------------
        // Core Slash Commands: raw, edit_trigger, delete
        // -------------------------------------------------------------
        commandRegistry.register({
            name: 'raw',
            description: 'Returns the raw command definition of a user command',
            options: [{ name: 'name', description: 'Command name', type: 3, required: true }],
            handler: async (interaction: any) => {
                const name = interaction.options?.getString?.('name') || interaction.commandName;
                const raw = storage.getRawCommand(name);
                if (raw) {
                    await interaction.reply({
                        content: `**Raw definition for ${name}:**\n\`\`\`markdown\n${raw}\n\`\`\``,
                        ephemeral: true,
                    });
                } else {
                    await interaction.reply({
                        content: `Command **${name}** not found.`,
                        ephemeral: true,
                    });
                }
            },
        });

        commandRegistry.register({
            name: 'edit_trigger',
            description: 'Edits the trigger of a user command',
            options: [
                { name: 'name', description: 'Command name', type: 3, required: true },
                {
                    name: 'new_trigger',
                    description: 'New trigger (e.g. /ask)',
                    type: 3,
                    required: true,
                },
            ],
            handler: async (interaction: any) => {
                const name = interaction.options?.getString?.('name');
                const newTriggerStr = interaction.options?.getString?.('new_trigger');

                if (!name || !newTriggerStr) {
                    await interaction.reply({
                        content: 'Usage: /edit_trigger <name> <new_trigger>',
                        ephemeral: true,
                    });
                    return;
                }

                const cmd = storage.getCommand(name);
                if (!cmd) {
                    await interaction.reply({
                        content: `Command **${name}** not found.`,
                        ephemeral: true,
                    });
                    return;
                }

                // Check ownership, coauthor, or admin
                const isCoauthor = cmd.coauthors && cmd.coauthors.includes(interaction.user.id);
                if (
                    cmd.metadata.author !== interaction.user.id &&
                    !isCoauthor &&
                    !interaction.memberPermissions?.has?.('Administrator')
                ) {
                    await interaction.reply({
                        content: '❌ You do not have permission to edit this command.',
                        ephemeral: true,
                    });
                    return;
                }

                const success = editCommandTrigger(name, newTriggerStr);
                if (success) {
                    await interaction.reply({
                        content: `Trigger for **${name}** updated to: \`${newTriggerStr}\``,
                        ephemeral: true,
                    });
                } else {
                    await interaction.reply({
                        content: `Failed to update trigger for command **${name}**.`,
                        ephemeral: true,
                    });
                }
            },
        });

        commandRegistry.register({
            name: 'delete',
            description: 'Deletes a user command',
            options: [{ name: 'name', description: 'Command name', type: 3, required: true }],
            handler: async (interaction: any) => {
                const name = interaction.options?.getString?.('name');
                if (!name) {
                    await interaction.reply({ content: 'Usage: /delete <name>', ephemeral: true });
                    return;
                }

                const cmd = storage.getCommand(name);
                if (!cmd) {
                    await interaction.reply({
                        content: `Command **${name}** not found.`,
                        ephemeral: true,
                    });
                    return;
                }

                // Check ownership or admin
                if (
                    cmd.metadata.author !== interaction.user.id &&
                    !interaction.memberPermissions?.has?.('Administrator')
                ) {
                    await interaction.reply({
                        content: '❌ You do not have permission to delete this command.',
                        ephemeral: true,
                    });
                    return;
                }

                const deleted = deleteUserCommand(name);
                if (deleted) {
                    await interaction.reply({
                        content: `Command **${name}** deleted successfully.`,
                        ephemeral: true,
                    });
                } else {
                    await interaction.reply({
                        content: `Command **${name}** not found.`,
                        ephemeral: true,
                    });
                }
            },
        });

        // -------------------------------------------------------------
        // User Utility Slash Commands: mycommands, usercommands, storage_info, report_command
        // -------------------------------------------------------------
        commandRegistry.register({
            name: 'mycommands',
            description: 'Lists all user commands created by you',
            handler: async (interaction: any) => {
                const userId = interaction.user.id;
                const cmds = storage.getCommandsByAuthor(userId);
                const bytes = storage.calculateUserStorage(userId);
                const mb = (bytes / (1024 * 1024)).toFixed(2);

                if (cmds.length === 0) {
                    await interaction.reply({
                        content: 'You have not created any user commands yet.',
                        ephemeral: true,
                    });
                    return;
                }

                const listStr = cmds
                    .map(
                        (c) =>
                            `- **${c.metadata.name}** (\`${c.trigger.type}\`: \`${c.trigger.value}\`)`,
                    )
                    .join('\n');
                await interaction.reply({
                    content: `**Your User Commands (${cmds.length} total, ${mb} MB used):**\n${listStr}`,
                    ephemeral: true,
                });
            },
        });

        commandRegistry.register({
            name: 'usercommands',
            description: 'Lists user commands created by a specific user',
            options: [{ name: 'user', description: 'Target user', type: 6, required: true }],
            handler: async (interaction: any) => {
                const targetUser = interaction.options?.getUser?.('user') || interaction.user;
                const targetName =
                    targetUser.displayName ||
                    targetUser.globalName ||
                    targetUser.username ||
                    'User';
                const cmds = storage.getCommandsByAuthor(targetUser.id);
                const bytes = storage.calculateUserStorage(targetUser.id);
                const mb = (bytes / (1024 * 1024)).toFixed(2);

                if (cmds.length === 0) {
                    await interaction.reply({
                        content: `User **${targetName}** has not created any commands.`,
                        ephemeral: true,
                    });
                    return;
                }

                const listStr = cmds
                    .map(
                        (c) =>
                            `- **${c.metadata.name}** (\`${c.trigger.type}\`: \`${c.trigger.value}\`)`,
                    )
                    .join('\n');
                await interaction.reply({
                    content: `**User Commands created by ${targetName} (${cmds.length} total, ${mb} MB used):**\n${listStr}`,
                    ephemeral: true,
                });
            },
        });

        commandRegistry.register({
            name: 'storage_info',
            description: 'Check your current user command storage usage and quota',
            handler: async (interaction: any) => {
                const userId = interaction.user.id;
                const userDisplayName =
                    interaction.member?.displayName ||
                    interaction.user?.displayName ||
                    interaction.user?.globalName ||
                    interaction.user?.username ||
                    'User';
                const currentBytes = storage.calculateUserStorage(userId);
                const maxBytes = quotaManager.getUserMaxStorageBytes(interaction.member);
                const currentMb = (currentBytes / (1024 * 1024)).toFixed(2);
                const maxMb = (maxBytes / (1024 * 1024)).toFixed(2);
                const isRestricted = quotaManager.isUserRestricted(userId);

                await interaction.reply({
                    content: `**Storage Quota Info for ${userDisplayName}:**\n- **Usage:** ${currentMb} MB / ${maxMb} MB\n- **Status:** ${isRestricted ? '❌ Restricted' : '✅ Allowed'}`,
                    ephemeral: true,
                });
            },
        });

        commandRegistry.register({
            name: 'find_command',
            description: 'Find user commands by trigger text, including similar triggers',
            options: [
                {
                    name: 'trigger',
                    description: 'Trigger text to search for',
                    type: 3,
                    required: true,
                },
            ],
            handler: async (interaction: any) => {
                const trigger = interaction.options?.getString?.('trigger');
                if (!trigger) {
                    await interaction.reply({
                        content: 'Usage: /find_command <trigger>',
                        ephemeral: true,
                    });
                    return;
                }

                const matches = storage.findCommandsByTrigger(trigger);
                if (matches.length === 0) {
                    await interaction.reply({
                        content: `No matching commands found for trigger **${trigger}**.`,
                        ephemeral: true,
                    });
                    return;
                }

                const lines = matches.map(
                    (match) => `- **${match.commandName}**: \`${match.triggerValue}\``,
                );
                await interaction.reply({
                    content: `**Matching commands for trigger \"${trigger}\":**\n${lines.join('\n')}`,
                    ephemeral: true,
                });
            },
        });

        commandRegistry.register({
            name: 'report_command',
            description: 'Report a user command for rule breaking',
            options: [
                { name: 'name', description: 'Command name', type: 3, required: true },
                { name: 'reason', description: 'Reason for report', type: 3, required: true },
            ],
            handler: async (interaction: any) => {
                const name = interaction.options?.getString?.('name');
                const reason = interaction.options?.getString?.('reason');

                if (!name || !reason) {
                    await interaction.reply({
                        content: 'Usage: /report_command <name> <reason>',
                        ephemeral: true,
                    });
                    return;
                }

                const cmd = storage.getCommand(name);
                if (!cmd) {
                    await interaction.reply({
                        content: `Command **${name}** not found.`,
                        ephemeral: true,
                    });
                    return;
                }

                const report = configStore.addReport(name, interaction.user.id, reason);
                await interaction.reply({
                    content: `✅ Report submitted for command **${name}** (Report ID: \`${report.id}\`). An admin will review it.`,
                    ephemeral: true,
                });
            },
        });

        // -------------------------------------------------------------
        // Admin Moderation Slash Commands
        // -------------------------------------------------------------
        commandRegistry.register({
            name: 'view_reports',
            description: '[Admin] View pending user command reports',
            handler: async (interaction: any) => {
                if (!interaction.memberPermissions?.has?.('Administrator')) {
                    await interaction.reply({
                        content: '❌ Admin permissions required.',
                        ephemeral: true,
                    });
                    return;
                }

                const openReports = configStore.getReports('open');
                if (openReports.length === 0) {
                    await interaction.reply({
                        content: 'No open reports at this time.',
                        ephemeral: true,
                    });
                    return;
                }

                const lines = openReports.map((r) => {
                    const reporter =
                        interaction.guild?.members?.cache?.get?.(r.reporterId)?.displayName ||
                        interaction.client?.users?.cache?.get?.(r.reporterId)?.username ||
                        `User_${r.reporterId}`;
                    return `- **ID \`${r.id}\`**: Command **${r.commandName}** reported by **${reporter}**. Reason: "${r.reason}" (${r.createdAt})`;
                });
                await interaction.reply({
                    content: `**Open Command Reports (${openReports.length}):**\n${lines.join('\n')}`,
                    ephemeral: true,
                });
            },
        });

        commandRegistry.register({
            name: 'dismiss_report',
            description: '[Admin] Dismiss a command report by ID',
            options: [{ name: 'report_id', description: 'Report ID', type: 3, required: true }],
            handler: async (interaction: any) => {
                if (!interaction.memberPermissions?.has?.('Administrator')) {
                    await interaction.reply({
                        content: '❌ Admin permissions required.',
                        ephemeral: true,
                    });
                    return;
                }

                const reportId = interaction.options?.getString?.('report_id');
                if (!reportId) {
                    await interaction.reply({
                        content: 'Usage: /dismiss_report <report_id>',
                        ephemeral: true,
                    });
                    return;
                }

                const dismissed = configStore.dismissReport(reportId);
                if (dismissed) {
                    await interaction.reply({
                        content: `Report \`${reportId}\` dismissed.`,
                        ephemeral: true,
                    });
                } else {
                    await interaction.reply({
                        content: `Report \`${reportId}\` not found.`,
                        ephemeral: true,
                    });
                }
            },
        });

        commandRegistry.register({
            name: 'wipe_user_commands',
            description: '[Admin] Delete all commands created by a specific user',
            options: [{ name: 'user', description: 'Target user', type: 6, required: true }],
            handler: async (interaction: any) => {
                if (!interaction.memberPermissions?.has?.('Administrator')) {
                    await interaction.reply({
                        content: '❌ Admin permissions required.',
                        ephemeral: true,
                    });
                    return;
                }

                const targetUser = interaction.options?.getUser?.('user');
                if (!targetUser) {
                    await interaction.reply({
                        content: 'Usage: /wipe_user_commands <user>',
                        ephemeral: true,
                    });
                    return;
                }

                const targetName =
                    targetUser.displayName ||
                    targetUser.globalName ||
                    targetUser.username ||
                    'User';
                const count = storage.wipeUserCommands(targetUser.id);
                triggerPool.loadFromStorage();

                await interaction.reply({
                    content: `Wiped **${count}** commands created by **${targetName}**.`,
                    ephemeral: true,
                });
            },
        });

        commandRegistry.register({
            name: 'restrict_user',
            description: '[Admin] Restrict a user from creating commands',
            options: [{ name: 'user', description: 'Target user', type: 6, required: true }],
            handler: async (interaction: any) => {
                if (!interaction.memberPermissions?.has?.('Administrator')) {
                    await interaction.reply({
                        content: '❌ Admin permissions required.',
                        ephemeral: true,
                    });
                    return;
                }

                const targetUser = interaction.options?.getUser?.('user');
                if (!targetUser) {
                    await interaction.reply({
                        content: 'Usage: /restrict_user <user>',
                        ephemeral: true,
                    });
                    return;
                }

                const targetName =
                    targetUser.displayName ||
                    targetUser.globalName ||
                    targetUser.username ||
                    'User';
                configStore.restrictUser(targetUser.id);
                await interaction.reply({
                    content: `User **${targetName}** is now restricted from creating commands.`,
                    ephemeral: true,
                });
            },
        });

        commandRegistry.register({
            name: 'unrestrict_user',
            description: '[Admin] Remove command creation restriction from a user',
            options: [{ name: 'user', description: 'Target user', type: 6, required: true }],
            handler: async (interaction: any) => {
                if (!interaction.memberPermissions?.has?.('Administrator')) {
                    await interaction.reply({
                        content: '❌ Admin permissions required.',
                        ephemeral: true,
                    });
                    return;
                }

                const targetUser = interaction.options?.getUser?.('user');
                if (!targetUser) {
                    await interaction.reply({
                        content: 'Usage: /unrestrict_user <user>',
                        ephemeral: true,
                    });
                    return;
                }

                const targetName =
                    targetUser.displayName ||
                    targetUser.globalName ||
                    targetUser.username ||
                    'User';
                const removed = configStore.unrestrictUser(targetUser.id);
                if (removed) {
                    await interaction.reply({
                        content: `Restriction removed for user **${targetName}**.`,
                        ephemeral: true,
                    });
                } else {
                    await interaction.reply({
                        content: `User **${targetName}** was not restricted.`,
                        ephemeral: true,
                    });
                }
            },
        });

        // BOT OWNER ONLY COMMAND: set_role_storage
        commandRegistry.register({
            name: 'set_role_storage',
            description: '[Bot Owner Only] Set extra storage quota in MB for a role',
            options: [
                { name: 'role', description: 'Role name or ID', type: 3, required: true },
                { name: 'limit_mb', description: 'Storage limit in MB', type: 10, required: true },
            ],
            handler: async (interaction: any) => {
                if (!isBotOwner(interaction.user.id, client)) {
                    await interaction.reply({
                        content: '❌ Only the Bot Owner can execute this command.',
                        ephemeral: true,
                    });
                    return;
                }

                const role = interaction.options?.getString?.('role');
                const limitMbStr =
                    interaction.options?.getNumber?.('limit_mb') ||
                    interaction.options?.getString?.('limit_mb');

                if (!role || limitMbStr === undefined) {
                    await interaction.reply({
                        content: 'Usage: /set_role_storage <role_name_or_id> <limit_mb>',
                        ephemeral: true,
                    });
                    return;
                }

                const mb = parseFloat(String(limitMbStr));
                if (isNaN(mb) || mb < 0) {
                    await interaction.reply({
                        content: 'Please provide a valid non-negative number for limit_mb.',
                        ephemeral: true,
                    });
                    return;
                }

                configStore.setRoleQuota(role, mb);
                await interaction.reply({
                    content: `Role \`${role}\` quota updated to **${mb} MB**.`,
                    ephemeral: true,
                });
            },
        });

        commandRegistry.register({
            name: 'add_alias',
            description: 'Adds an alias to an existing user command',
            options: [
                { name: 'name', description: 'Command name', type: 3, required: true },
                { name: 'alias', description: 'New trigger alias to add', type: 3, required: true },
            ],
            handler: async (interaction: any) => {
                const name = interaction.options?.getString?.('name');
                const aliasStr = interaction.options?.getString?.('alias');

                if (!name || !aliasStr) {
                    await interaction.reply({
                        content: 'Usage: /add_alias <name> <alias>',
                        ephemeral: true,
                    });
                    return;
                }

                const cmd = storage.getCommand(name);
                if (!cmd) {
                    await interaction.reply({
                        content: `Command **${name}** not found.`,
                        ephemeral: true,
                    });
                    return;
                }

                const allowPublic = configStore.getAllowPublicAliases();
                const isAuthor = cmd.metadata.author === interaction.user.id;
                const isCoauthor = cmd.coauthors && cmd.coauthors.includes(interaction.user.id);
                const isAdmin =
                    interaction.memberPermissions?.has?.('Administrator') ||
                    isBotOwner(interaction.user.id, client);

                if (!allowPublic && !isAuthor && !isCoauthor && !isAdmin) {
                    await interaction.reply({
                        content: '❌ Public alias addition is currently disabled by admins.',
                        ephemeral: true,
                    });
                    return;
                }

                const dummyTrigger = { type: 'string', value: aliasStr };
                const conflict = triggerPool.findConflictingCommand(dummyTrigger, [], name);
                if (conflict) {
                    await interaction.reply({
                        content: `❌ Cannot add alias \`${aliasStr}\`: it is already used by command **${conflict.metadata.name}**.`,
                        ephemeral: true,
                    });
                    return;
                }

                const success = storage.addAliasToCommand(name, aliasStr);
                if (success) {
                    triggerPool.loadFromStorage();
                    await interaction.reply({
                        content: `✅ Alias \`${aliasStr}\` added to command **${cmd.metadata.name}**!`,
                        ephemeral: true,
                    });
                } else {
                    await interaction.reply({
                        content: `Failed to add alias to command **${name}**.`,
                        ephemeral: true,
                    });
                }
            },
        });

        commandRegistry.register({
            name: 'set_public_aliases',
            description: '[Admin] Enable or disable public alias creation by all users',
            options: [
                {
                    name: 'enabled',
                    description: 'Enable public alias creation (true/false)',
                    type: 5,
                    required: true,
                },
            ],
            handler: async (interaction: any) => {
                if (
                    !interaction.memberPermissions?.has?.('Administrator') &&
                    !isBotOwner(interaction.user.id, client)
                ) {
                    await interaction.reply({
                        content: '❌ Admin permissions required.',
                        ephemeral: true,
                    });
                    return;
                }

                const enabled = interaction.options?.getBoolean?.('enabled');
                if (enabled === undefined) {
                    await interaction.reply({
                        content: 'Usage: /set_public_aliases <true|false>',
                        ephemeral: true,
                    });
                    return;
                }

                configStore.setAllowPublicAliases(enabled);
                await interaction.reply({
                    content: `✅ Public alias creation is now **${enabled ? 'enabled' : 'disabled'}**.`,
                    ephemeral: true,
                });
            },
        });

        commandRegistry.register({
            name: 'view_storage_config',
            description: '[Admin] View role-based storage quota configuration',
            handler: async (interaction: any) => {
                if (
                    !interaction.memberPermissions?.has?.('Administrator') &&
                    !isBotOwner(interaction.user.id, client)
                ) {
                    await interaction.reply({
                        content: '❌ Admin permissions required.',
                        ephemeral: true,
                    });
                    return;
                }

                const quotas = configStore.getRoleQuotas();
                const lines = Object.entries(quotas).map(([k, v]) => `- **${k}**: ${v} MB`);
                await interaction.reply({
                    content: `**Role-Based Storage Quota Config:**\n${lines.join('\n')}`,
                    ephemeral: true,
                });
            },
        });

        commandRegistry.register({
            name: 'user_command_help',
            description: 'Tutorial guide & documentation for the User Command System',
            options: [
                {
                    name: 'topic',
                    description:
                        'Help topic (overview, quick, triggers, embeds, ponder, pipeline, meta, utility, admin)',
                    type: 3,
                    required: false,
                },
            ],
            handler: async (interaction: any) => {
                const topic = interaction.options?.getString?.('topic');
                const embed = getHelpTopicEmbed(topic);
                await interaction.reply({
                    embeds: [embed],
                    ephemeral: true,
                });
            },
        });

        // -------------------------------------------------------------
        // Creator Approvals & Governance Slash Commands
        // -------------------------------------------------------------
        commandRegistry.register({
            name: 'usercmd_creator_approve',
            description: '[Admin] Add a user to the approved command creators whitelist',
            options: [{ name: 'user', description: 'Target user', type: 6, required: true }],
            handler: async (interaction: any) => {
                if (
                    !interaction.memberPermissions?.has?.('Administrator') &&
                    !isBotOwner(interaction.user.id, client)
                ) {
                    await interaction.reply({
                        content: '❌ Admin permissions required.',
                        ephemeral: true,
                    });
                    return;
                }

                const targetUser = interaction.options?.getUser?.('user');
                if (!targetUser) {
                    await interaction.reply({
                        content: 'Usage: /usercmd_creator_approve <user>',
                        ephemeral: true,
                    });
                    return;
                }

                configStore.addApprovedCreator(targetUser.id);
                await sendAuditLog(
                    interaction.guild,
                    'User Command Creator Approved',
                    `User <@${targetUser.id}> was approved to create commands without admin review by <@${interaction.user.id}>.`,
                    [
                        { name: 'User', value: `<@${targetUser.id}> (${targetUser.id})` },
                        { name: 'Approved By', value: `<@${interaction.user.id}>` },
                    ],
                );
                await interaction.reply({
                    content: `✅ <@${targetUser.id}> added to approved command creators. Their commands will now be enabled immediately.`,
                    ephemeral: true,
                });
            },
        });

        commandRegistry.register({
            name: 'usercmd_creator_revoke',
            description: '[Admin] Remove a user from the approved command creators whitelist',
            options: [{ name: 'user', description: 'Target user', type: 6, required: true }],
            handler: async (interaction: any) => {
                if (
                    !interaction.memberPermissions?.has?.('Administrator') &&
                    !isBotOwner(interaction.user.id, client)
                ) {
                    await interaction.reply({
                        content: '❌ Admin permissions required.',
                        ephemeral: true,
                    });
                    return;
                }

                const targetUser = interaction.options?.getUser?.('user');
                if (!targetUser) {
                    await interaction.reply({
                        content: 'Usage: /usercmd_creator_revoke <user>',
                        ephemeral: true,
                    });
                    return;
                }

                const removed = configStore.removeApprovedCreator(targetUser.id);
                if (removed) {
                    await sendAuditLog(
                        interaction.guild,
                        'User Command Creator Revoked',
                        `User <@${targetUser.id}> had approved creator status revoked by <@${interaction.user.id}>.`,
                        [
                            { name: 'User', value: `<@${targetUser.id}> (${targetUser.id})` },
                            { name: 'Revoked By', value: `<@${interaction.user.id}>` },
                        ],
                    );
                    await interaction.reply({
                        content: `✅ Removed <@${targetUser.id}> from approved command creators.`,
                        ephemeral: true,
                    });
                } else {
                    await interaction.reply({
                        content: `<@${targetUser.id}> was not on the approved creators list.`,
                        ephemeral: true,
                    });
                }
            },
        });

        commandRegistry.register({
            name: 'usercmd_creator_list',
            description: 'List all approved user command creators',
            handler: async (interaction: any) => {
                const creators = configStore.getApprovedCreators();
                if (creators.length === 0) {
                    await interaction.reply({
                        content: 'There are currently no approved command creators.',
                        ephemeral: true,
                    });
                    return;
                }

                const listStr = creators.map((id) => `- <@${id}> (\`${id}\`)`).join('\n');
                await interaction.reply({
                    content: `**Approved Command Creators (${creators.length} total):**\n${listStr}`,
                    ephemeral: true,
                });
            },
        });

        // -------------------------------------------------------------
        // Command Review Queue & Enable / Disable
        // -------------------------------------------------------------
        commandRegistry.register({
            name: 'usercmd_review_list',
            description: '[Admin] List user commands awaiting admin review and approval',
            handler: async (interaction: any) => {
                if (
                    !interaction.memberPermissions?.has?.('Administrator') &&
                    !isBotOwner(interaction.user.id, client)
                ) {
                    await interaction.reply({
                        content: '❌ Admin permissions required.',
                        ephemeral: true,
                    });
                    return;
                }

                const allCmds = storage.loadAllCommands();
                const pending = allCmds.filter((c) => c.metadata.enabled === false);

                if (pending.length === 0) {
                    await interaction.reply({
                        content: '✅ There are no pending commands awaiting review.',
                        ephemeral: true,
                    });
                    return;
                }

                const listStr = pending
                    .map(
                        (c) =>
                            `- **${c.metadata.name}** [${c.metadata.category || 'General'}] by <@${c.metadata.author}> | Trigger: \`${c.trigger.value}\``,
                    )
                    .join('\n');

                await interaction.reply({
                    content: `**Pending Commands Awaiting Review (${pending.length}):**\n${listStr}\n\n*Use \`/usercmd_enable name:<name>\` to approve, or \`/cmd_delete name:<name>\` to reject.*`,
                    ephemeral: true,
                });
            },
        });

        commandRegistry.register({
            name: 'usercmd_enable',
            description: '[Admin] Enable or approve a user command',
            options: [{ name: 'name', description: 'Command name', type: 3, required: true }],
            handler: async (interaction: any) => {
                if (
                    !interaction.memberPermissions?.has?.('Administrator') &&
                    !isBotOwner(interaction.user.id, client)
                ) {
                    await interaction.reply({
                        content: '❌ Admin permissions required.',
                        ephemeral: true,
                    });
                    return;
                }

                const name = interaction.options?.getString?.('name');
                if (!name) {
                    await interaction.reply({
                        content: 'Usage: /usercmd_enable <name>',
                        ephemeral: true,
                    });
                    return;
                }

                const cmd = storage.getCommand(name);
                if (!cmd) {
                    await interaction.reply({
                        content: `Command **${name}** not found.`,
                        ephemeral: true,
                    });
                    return;
                }

                cmd.metadata.enabled = true;
                const rawDef = storage.getRawCommand(name) || '';
                storage.saveCommand(cmd, rawDef);
                triggerPool.registerCommand(cmd);

                await sendAuditLog(
                    interaction.guild,
                    'User Command Approved / Enabled',
                    `User command **${cmd.metadata.name}** was approved and enabled by <@${interaction.user.id}>.`,
                    [
                        { name: 'Command', value: `**${cmd.metadata.name}**` },
                        { name: 'Category', value: cmd.metadata.category || 'General' },
                        { name: 'Author', value: `<@${cmd.metadata.author}>` },
                        { name: 'Enabled By', value: `<@${interaction.user.id}>` },
                    ],
                );

                await interaction.reply({
                    content: `✅ Command **${cmd.metadata.name}** has been approved and enabled!`,
                    ephemeral: true,
                });
            },
        });

        commandRegistry.register({
            name: 'usercmd_disable',
            description: '[Admin] Disable an active user command',
            options: [{ name: 'name', description: 'Command name', type: 3, required: true }],
            handler: async (interaction: any) => {
                if (
                    !interaction.memberPermissions?.has?.('Administrator') &&
                    !isBotOwner(interaction.user.id, client)
                ) {
                    await interaction.reply({
                        content: '❌ Admin permissions required.',
                        ephemeral: true,
                    });
                    return;
                }

                const name = interaction.options?.getString?.('name');
                if (!name) {
                    await interaction.reply({
                        content: 'Usage: /usercmd_disable <name>',
                        ephemeral: true,
                    });
                    return;
                }

                const cmd = storage.getCommand(name);
                if (!cmd) {
                    await interaction.reply({
                        content: `Command **${name}** not found.`,
                        ephemeral: true,
                    });
                    return;
                }

                cmd.metadata.enabled = false;
                const rawDef = storage.getRawCommand(name) || '';
                storage.saveCommand(cmd, rawDef);
                triggerPool.registerCommand(cmd);

                await sendAuditLog(
                    interaction.guild,
                    'User Command Disabled',
                    `User command **${cmd.metadata.name}** was disabled by <@${interaction.user.id}>.`,
                    [
                        { name: 'Command', value: `**${cmd.metadata.name}**` },
                        { name: 'Disabled By', value: `<@${interaction.user.id}>` },
                    ],
                );

                await interaction.reply({
                    content: `⚠️ Command **${cmd.metadata.name}** has been disabled.`,
                    ephemeral: true,
                });
            },
        });

        // -------------------------------------------------------------
        // Category Management Slash Commands
        // -------------------------------------------------------------
        commandRegistry.register({
            name: 'usercmd_category_list',
            description: 'List all registered user command categories',
            handler: async (interaction: any) => {
                const categories = configStore.getCategories();
                const listStr = categories
                    .map((c) => `- **${c.name}**: ${c.description || 'No description'}`)
                    .join('\n');
                await interaction.reply({
                    content: `**User Command Categories (${categories.length} total):**\n${listStr}`,
                    ephemeral: true,
                });
            },
        });

        commandRegistry.register({
            name: 'usercmd_category_add',
            description: '[Admin] Add a new user command category',
            options: [
                { name: 'name', description: 'Category name', type: 3, required: true },
                {
                    name: 'description',
                    description: 'Category description',
                    type: 3,
                    required: false,
                },
            ],
            handler: async (interaction: any) => {
                if (
                    !interaction.memberPermissions?.has?.('Administrator') &&
                    !isBotOwner(interaction.user.id, client)
                ) {
                    await interaction.reply({
                        content: '❌ Admin permissions required.',
                        ephemeral: true,
                    });
                    return;
                }

                const name = interaction.options?.getString?.('name');
                const desc = interaction.options?.getString?.('description');

                if (!name) {
                    await interaction.reply({
                        content: 'Usage: /usercmd_category_add <name> [description]',
                        ephemeral: true,
                    });
                    return;
                }

                const added = configStore.addCategory(name, desc);
                if (added) {
                    await interaction.reply({
                        content: `✅ Category **${name}** added successfully.`,
                        ephemeral: true,
                    });
                } else {
                    await interaction.reply({
                        content: `❌ Category **${name}** already exists.`,
                        ephemeral: true,
                    });
                }
            },
        });

        commandRegistry.register({
            name: 'usercmd_category_remove',
            description: '[Admin] Remove an existing user command category',
            options: [{ name: 'name', description: 'Category name', type: 3, required: true }],
            handler: async (interaction: any) => {
                if (
                    !interaction.memberPermissions?.has?.('Administrator') &&
                    !isBotOwner(interaction.user.id, client)
                ) {
                    await interaction.reply({
                        content: '❌ Admin permissions required.',
                        ephemeral: true,
                    });
                    return;
                }

                const name = interaction.options?.getString?.('name');
                if (!name) {
                    await interaction.reply({
                        content: 'Usage: /usercmd_category_remove <name>',
                        ephemeral: true,
                    });
                    return;
                }

                const removed = configStore.removeCategory(name);
                if (removed) {
                    await interaction.reply({
                        content: `✅ Category **${name}** removed successfully.`,
                        ephemeral: true,
                    });
                } else {
                    await interaction.reply({
                        content: `❌ Cannot remove category **${name}** (either does not exist or is protected default General).`,
                        ephemeral: true,
                    });
                }
            },
        });

        // -------------------------------------------------------------
        // Channel Timeout & Category Controls Slash Commands
        // -------------------------------------------------------------
        commandRegistry.register({
            name: 'usercmd_channel_timeout',
            description: '[Admin] Configure or view channel-wide execution timeout',
            options: [
                {
                    name: 'channel',
                    description: 'Target channel (defaults to current)',
                    type: 7,
                    required: false,
                },
                {
                    name: 'seconds',
                    description: 'Execution timeout in seconds (0 to disable)',
                    type: 4,
                    required: false,
                },
            ],
            handler: async (interaction: any) => {
                if (
                    !interaction.memberPermissions?.has?.('Administrator') &&
                    !isBotOwner(interaction.user.id, client)
                ) {
                    await interaction.reply({
                        content: '❌ Admin permissions required.',
                        ephemeral: true,
                    });
                    return;
                }

                const targetChannel =
                    interaction.options?.getChannel?.('channel') || interaction.channel;
                const seconds = interaction.options?.getInteger?.('seconds');

                if (seconds !== null && seconds !== undefined) {
                    configStore.setChannelTimeout(targetChannel.id, seconds);
                    await interaction.reply({
                        content: `✅ Channel-wide command timeout for <#${targetChannel.id}> set to **${seconds}s** ${seconds === 0 ? '(disabled)' : ''}.`,
                        ephemeral: true,
                    });
                } else {
                    const cfg = configStore.getChannelConfig(targetChannel.id);
                    const current = cfg.timeoutSeconds ?? 0;
                    await interaction.reply({
                        content: `Channel-wide command timeout for <#${targetChannel.id}> is currently **${current}s** ${current === 0 ? '(disabled)' : ''}.`,
                        ephemeral: true,
                    });
                }
            },
        });

        commandRegistry.register({
            name: 'usercmd_channel_categories',
            description: '[Admin] Restrict or allow specific command categories in a channel',
            options: [
                {
                    name: 'channel',
                    description: 'Target channel (defaults to current)',
                    type: 7,
                    required: false,
                },
                {
                    name: 'categories',
                    description: 'Comma-separated allowed categories (or * for all)',
                    type: 3,
                    required: false,
                },
            ],
            handler: async (interaction: any) => {
                if (
                    !interaction.memberPermissions?.has?.('Administrator') &&
                    !isBotOwner(interaction.user.id, client)
                ) {
                    await interaction.reply({
                        content: '❌ Admin permissions required.',
                        ephemeral: true,
                    });
                    return;
                }

                const targetChannel =
                    interaction.options?.getChannel?.('channel') || interaction.channel;
                const catStr = interaction.options?.getString?.('categories');

                if (catStr !== null && catStr !== undefined) {
                    const cleanList = catStr
                        .split(',')
                        .map((s: string) => s.trim())
                        .filter((s: string) => s.length > 0);
                    configStore.setChannelAllowedCategories(targetChannel.id, cleanList);
                    await interaction.reply({
                        content: `✅ Allowed command categories for <#${targetChannel.id}> set to: **${cleanList.join(', ')}**.`,
                        ephemeral: true,
                    });
                } else {
                    const cfg = configStore.getChannelConfig(targetChannel.id);
                    const allowed = cfg.allowedCategories || ['* (All categories allowed)'];
                    await interaction.reply({
                        content: `Allowed command categories for <#${targetChannel.id}>: **${allowed.join(', ')}**.`,
                        ephemeral: true,
                    });
                }
            },
        });

        commandRegistry.register({
            name: 'usercmd_creation_channels',
            description: '[Admin] View or configure channels where command creation is allowed',
            options: [
                {
                    name: 'channels',
                    description:
                        'Comma-separated channels (e.g. #bot-commands, 123456) or * for all channels',
                    type: 3,
                    required: false,
                },
                {
                    name: 'action',
                    description: 'Action to perform: set | add | remove | clear | list',
                    type: 3,
                    required: false,
                    choices: [
                        { name: 'list', value: 'list' },
                        { name: 'set', value: 'set' },
                        { name: 'add', value: 'add' },
                        { name: 'remove', value: 'remove' },
                        { name: 'clear', value: 'clear' },
                    ],
                },
            ],
            handler: async (interaction: any) => {
                if (
                    !interaction.memberPermissions?.has?.('Administrator') &&
                    !isBotOwner(interaction.user.id, client)
                ) {
                    await interaction.reply({
                        content: '❌ Admin permissions required.',
                        ephemeral: true,
                    });
                    return;
                }

                const action = interaction.options?.getString?.('action')?.toLowerCase() || 'set';
                const channelsStr = interaction.options?.getString?.('channels');

                if (action === 'clear' || (channelsStr && channelsStr.trim() === '*')) {
                    configStore.clearAllowedCreationChannels();
                    await interaction.reply({
                        content: '✅ Command creation is now allowed in **all channels**.',
                        ephemeral: true,
                    });
                    return;
                }

                if (action === 'list' || (!channelsStr && action === 'set')) {
                    const current = configStore.formatAllowedCreationChannels();
                    await interaction.reply({
                        content: `User command creation is currently allowed in: **${current}**.`,
                        ephemeral: true,
                    });
                    return;
                }

                if (channelsStr) {
                    const cleanList = channelsStr
                        .split(',')
                        .map((s: string) => s.trim())
                        .filter((s: string) => s.length > 0);

                    if (action === 'add') {
                        for (const ch of cleanList) {
                            configStore.addAllowedCreationChannel(ch);
                        }
                        const updated = configStore.formatAllowedCreationChannels();
                        await interaction.reply({
                            content: `✅ Added channels. Command creation allowed in: **${updated}**.`,
                            ephemeral: true,
                        });
                    } else if (action === 'remove') {
                        for (const ch of cleanList) {
                            configStore.removeAllowedCreationChannel(ch);
                        }
                        const updated = configStore.formatAllowedCreationChannels();
                        await interaction.reply({
                            content: `✅ Removed channels. Command creation allowed in: **${updated}**.`,
                            ephemeral: true,
                        });
                    } else {
                        // set
                        configStore.setAllowedCreationChannels(cleanList);
                        const updated = configStore.formatAllowedCreationChannels();
                        await interaction.reply({
                            content: `✅ Allowed command creation channels set to: **${updated}**.`,
                            ephemeral: true,
                        });
                    }
                }
            },
        });

        logger.info('Registered userCommands module listeners, utilities, and admin commands.');
    },
};

async function handleTextCommands(message: any, client: any): Promise<boolean> {
    const content = message.content.trim();
    const prefix = '!';

    if (!content.startsWith(prefix)) {
        return false;
    }

    const cmdStr = content.slice(prefix.length).trim();
    const parts = cmdStr.split(/\s+/);
    const command = parts[0]?.toLowerCase();
    const arg1 = parts[1];
    const restArgs = parts.slice(2).join(' ');

    const userId = message.author.id;
    const isAdmin = message.member?.permissions?.has?.('Administrator') || false;
    const owner = isBotOwner(userId, client);

    switch (command) {
        case 'raw': {
            if (!arg1) return false;
            const raw = storage.getRawCommand(arg1);
            if (raw) {
                await message.reply(
                    `**Raw definition for ${arg1}:**\n\`\`\`markdown\n${raw}\n\`\`\``,
                );
            } else {
                await message.reply(`Command **${arg1}** not found.`);
            }
            return true;
        }
        case 'edit_trigger': {
            if (!arg1 || !restArgs) return false;
            const cmd = storage.getCommand(arg1);
            if (!cmd) {
                await message.reply(`Command **${arg1}** not found.`);
                return true;
            }
            if (cmd.metadata.author !== userId && !isAdmin) {
                await message.reply('❌ You do not have permission to edit this command.');
                return true;
            }
            const success = editCommandTrigger(arg1, restArgs);
            if (success) {
                await message.reply(`Trigger for **${arg1}** updated to: \`${restArgs}\``);
            } else {
                await message.reply(`Failed to update trigger for command **${arg1}**.`);
            }
            return true;
        }
        case 'delete': {
            if (!arg1) return false;
            const cmd = storage.getCommand(arg1);
            if (!cmd) {
                await message.reply(`Command **${arg1}** not found.`);
                return true;
            }
            if (cmd.metadata.author !== userId && !isAdmin) {
                await message.reply('❌ You do not have permission to delete this command.');
                return true;
            }
            const deleted = deleteUserCommand(arg1);
            if (deleted) {
                await message.reply(`Command **${arg1}** deleted successfully.`);
            } else {
                await message.reply(`Command **${arg1}** not found.`);
            }
            return true;
        }
        case 'mycommands': {
            const cmds = storage.getCommandsByAuthor(userId);
            const bytes = storage.calculateUserStorage(userId);
            const mb = (bytes / (1024 * 1024)).toFixed(2);
            if (cmds.length === 0) {
                await message.reply('You have not created any user commands yet.');
            } else {
                const listStr = cmds
                    .map(
                        (c) =>
                            `- **${c.metadata.name}** (\`${c.trigger.type}\`: \`${c.trigger.value}\`)`,
                    )
                    .join('\n');
                await message.reply(
                    `**Your User Commands (${cmds.length} total, ${mb} MB used):**\n${listStr}`,
                );
            }
            return true;
        }
        case 'usercommands': {
            if (!arg1) return false;
            const targetId = extractUserIdFromMention(arg1);
            const targetMember =
                message.guild?.members?.cache?.get?.(targetId) ||
                message.mentions?.members?.get?.(targetId);
            const targetUserObj =
                message.mentions?.users?.get?.(targetId) ||
                message.client?.users?.cache?.get?.(targetId);
            const targetName =
                targetMember?.displayName ||
                targetUserObj?.displayName ||
                targetUserObj?.globalName ||
                targetUserObj?.username ||
                `User_${targetId}`;

            const cmds = storage.getCommandsByAuthor(targetId);
            const bytes = storage.calculateUserStorage(targetId);
            const mb = (bytes / (1024 * 1024)).toFixed(2);
            if (cmds.length === 0) {
                await message.reply(`User **${targetName}** has not created any commands.`);
            } else {
                const listStr = cmds
                    .map(
                        (c) =>
                            `- **${c.metadata.name}** (\`${c.trigger.type}\`: \`${c.trigger.value}\`)`,
                    )
                    .join('\n');
                await message.reply(
                    `**User Commands created by ${targetName} (${cmds.length} total, ${mb} MB used):**\n${listStr}`,
                );
            }
            return true;
        }
        case 'storage_info': {
            const userDisplayName =
                message.member?.displayName ||
                message.author?.displayName ||
                message.author?.globalName ||
                message.author?.username ||
                'User';
            const currentBytes = storage.calculateUserStorage(userId);
            const maxBytes = quotaManager.getUserMaxStorageBytes(message.member);
            const currentMb = (currentBytes / (1024 * 1024)).toFixed(2);
            const maxMb = (maxBytes / (1024 * 1024)).toFixed(2);
            const isRestricted = quotaManager.isUserRestricted(userId);
            await message.reply(
                `**Storage Quota Info for ${userDisplayName}:**\n- **Usage:** ${currentMb} MB / ${maxMb} MB\n- **Status:** ${isRestricted ? '❌ Restricted' : '✅ Allowed'}`,
            );
            return true;
        }
        case 'find_command': {
            if (!arg1) return false;
            const matches = storage.findCommandsByTrigger(arg1);
            if (matches.length === 0) {
                await message.reply(`No matching commands found for trigger **${arg1}**.`);
                return true;
            }
            const lines = matches.map(
                (match) => `- **${match.commandName}**: \`${match.triggerValue}\``,
            );
            await message.reply(
                `**Matching commands for trigger \"${arg1}\":**\n${lines.join('\n')}`,
            );
            return true;
        }
        case 'report_command': {
            if (!arg1 || !restArgs) return false;
            const cmd = storage.getCommand(arg1);
            if (!cmd) {
                await message.reply(`Command **${arg1}** not found.`);
                return true;
            }
            const report = configStore.addReport(arg1, userId, restArgs);
            await message.reply(
                `✅ Report submitted for command **${arg1}** (Report ID: \`${report.id}\`). An admin will review it.`,
            );
            return true;
        }
        case 'view_reports': {
            if (!isAdmin && !owner) {
                await message.reply('❌ Admin permissions required.');
                return true;
            }
            const openReports = configStore.getReports('open');
            if (openReports.length === 0) {
                await message.reply('No open reports at this time.');
            } else {
                const lines = openReports.map((r) => {
                    const reporter =
                        message.guild?.members?.cache?.get?.(r.reporterId)?.displayName ||
                        message.client?.users?.cache?.get?.(r.reporterId)?.username ||
                        `User_${r.reporterId}`;
                    return `- **ID \`${r.id}\`**: Command **${r.commandName}** reported by **${reporter}**. Reason: "${r.reason}"`;
                });
                await message.reply(
                    `**Open Command Reports (${openReports.length}):**\n${lines.join('\n')}`,
                );
            }
            return true;
        }
        case 'dismiss_report': {
            if (!isAdmin && !owner) {
                await message.reply('❌ Admin permissions required.');
                return true;
            }
            if (!arg1) return false;
            const dismissed = configStore.dismissReport(arg1);
            if (dismissed) {
                await message.reply(`Report \`${arg1}\` dismissed.`);
            } else {
                await message.reply(`Report \`${arg1}\` not found.`);
            }
            return true;
        }
        case 'wipe_user_commands': {
            if (!isAdmin && !owner) {
                await message.reply('❌ Admin permissions required.');
                return true;
            }
            if (!arg1) return false;
            const targetId = extractUserIdFromMention(arg1);
            const targetMember =
                message.guild?.members?.cache?.get?.(targetId) ||
                message.mentions?.members?.get?.(targetId);
            const targetUserObj =
                message.mentions?.users?.get?.(targetId) ||
                message.client?.users?.cache?.get?.(targetId);
            const targetName =
                targetMember?.displayName ||
                targetUserObj?.displayName ||
                targetUserObj?.globalName ||
                targetUserObj?.username ||
                `User_${targetId}`;
            const count = storage.wipeUserCommands(targetId);
            triggerPool.loadFromStorage();
            await message.reply(`Wiped **${count}** commands created by **${targetName}**.`);
            return true;
        }
        case 'restrict_user': {
            if (!isAdmin && !owner) {
                await message.reply('❌ Admin permissions required.');
                return true;
            }
            if (!arg1) return false;
            const targetId = extractUserIdFromMention(arg1);
            const targetMember =
                message.guild?.members?.cache?.get?.(targetId) ||
                message.mentions?.members?.get?.(targetId);
            const targetUserObj =
                message.mentions?.users?.get?.(targetId) ||
                message.client?.users?.cache?.get?.(targetId);
            const targetName =
                targetMember?.displayName ||
                targetUserObj?.displayName ||
                targetUserObj?.globalName ||
                targetUserObj?.username ||
                `User_${targetId}`;
            configStore.restrictUser(targetId);
            await message.reply(`User **${targetName}** is now restricted from creating commands.`);
            return true;
        }
        case 'unrestrict_user': {
            if (!isAdmin && !owner) {
                await message.reply('❌ Admin permissions required.');
                return true;
            }
            if (!arg1) return false;
            const targetId = extractUserIdFromMention(arg1);
            const targetMember =
                message.guild?.members?.cache?.get?.(targetId) ||
                message.mentions?.members?.get?.(targetId);
            const targetUserObj =
                message.mentions?.users?.get?.(targetId) ||
                message.client?.users?.cache?.get?.(targetId);
            const targetName =
                targetMember?.displayName ||
                targetUserObj?.displayName ||
                targetUserObj?.globalName ||
                targetUserObj?.username ||
                `User_${targetId}`;
            const removed = configStore.unrestrictUser(targetId);
            if (removed) {
                await message.reply(`Restriction removed for user **${targetName}**.`);
            } else {
                await message.reply(`User **${targetName}** was not restricted.`);
            }
            return true;
        }
        case 'add_alias': {
            if (!arg1 || !restArgs) return false;
            const cmd = storage.getCommand(arg1);
            if (!cmd) {
                await message.reply(`Command **${arg1}** not found.`);
                return true;
            }
            const allowPublic = configStore.getAllowPublicAliases();
            const isAuthor = cmd.metadata.author === userId;
            const isCoauthor = cmd.coauthors && cmd.coauthors.includes(userId);
            if (!allowPublic && !isAuthor && !isCoauthor && !isAdmin && !owner) {
                await message.reply('❌ Public alias addition is currently disabled by admins.');
                return true;
            }
            const dummyTrigger = { type: 'string', value: restArgs };
            const conflict = triggerPool.findConflictingCommand(dummyTrigger, [], arg1);
            if (conflict) {
                await message.reply(
                    `❌ Cannot add alias \`${restArgs}\`: it is already used by command **${conflict.metadata.name}**.`,
                );
                return true;
            }
            const success = storage.addAliasToCommand(arg1, restArgs);
            if (success) {
                triggerPool.loadFromStorage();
                await message.reply(
                    `✅ Alias \`${restArgs}\` added to command **${cmd.metadata.name}**!`,
                );
            } else {
                await message.reply(`Failed to add alias to command **${arg1}**.`);
            }
            return true;
        }
        case 'set_public_aliases': {
            if (!isAdmin && !owner) {
                await message.reply('❌ Admin permissions required.');
                return true;
            }
            if (!arg1) return false;
            const enabled = arg1.toLowerCase() === 'true' || arg1 === '1';
            configStore.setAllowPublicAliases(enabled);
            await message.reply(
                `✅ Public alias creation is now **${enabled ? 'enabled' : 'disabled'}**.`,
            );
            return true;
        }
        case 'set_role_storage': {
            // BOT OWNER ONLY
            if (!owner) {
                await message.reply('❌ Only the Bot Owner can execute this command.');
                return true;
            }
            if (!arg1 || !restArgs) return false;
            const mb = parseFloat(restArgs);
            if (isNaN(mb) || mb < 0) {
                await message.reply('Please provide a valid non-negative number for limit_mb.');
                return true;
            }
            configStore.setRoleQuota(arg1, mb);
            await message.reply(`Role \`${arg1}\` quota updated to **${mb} MB**.`);
            return true;
        }
        case 'view_storage_config': {
            if (!isAdmin && !owner) {
                await message.reply('❌ Admin permissions required.');
                return true;
            }
            const quotas = configStore.getRoleQuotas();
            const lines = Object.entries(quotas).map(([k, v]) => `- **${k}**: ${v} MB`);
            await message.reply(`**Role-Based Storage Quota Config:**\n${lines.join('\n')}`);
            return true;
        }
        case 'usercmd_creator_approve':
        case 'approve_creator': {
            if (!isAdmin && !owner) {
                await message.reply('❌ Admin permissions required.');
                return true;
            }
            if (!arg1) return false;
            const targetId = extractUserIdFromMention(arg1);
            configStore.addApprovedCreator(targetId);
            await sendAuditLog(
                message.guild,
                'User Command Creator Approved',
                `User <@${targetId}> was approved to create commands without review by <@${userId}>.`,
                [
                    { name: 'User', value: `<@${targetId}> (${targetId})` },
                    { name: 'Approved By', value: `<@${userId}>` },
                ],
            );
            await message.reply(`✅ Added <@${targetId}> to approved user command creators.`);
            return true;
        }
        case 'usercmd_creator_revoke':
        case 'revoke_creator': {
            if (!isAdmin && !owner) {
                await message.reply('❌ Admin permissions required.');
                return true;
            }
            if (!arg1) return false;
            const targetId = extractUserIdFromMention(arg1);
            const removed = configStore.removeApprovedCreator(targetId);
            if (removed) {
                await sendAuditLog(
                    message.guild,
                    'User Command Creator Revoked',
                    `User <@${targetId}> had approved creator status revoked by <@${userId}>.`,
                    [
                        { name: 'User', value: `<@${targetId}> (${targetId})` },
                        { name: 'Revoked By', value: `<@${userId}>` },
                    ],
                );
                await message.reply(`✅ Removed <@${targetId}> from approved command creators.`);
            } else {
                await message.reply(`<@${targetId}> was not on the approved creators list.`);
            }
            return true;
        }
        case 'usercmd_creator_list':
        case 'approved_creators': {
            const creators = configStore.getApprovedCreators();
            if (creators.length === 0) {
                await message.reply('There are currently no approved command creators.');
            } else {
                const listStr = creators.map((id) => `- <@${id}> (\`${id}\`)`).join('\n');
                await message.reply(
                    `**Approved Command Creators (${creators.length} total):**\n${listStr}`,
                );
            }
            return true;
        }
        case 'usercmd_review_list':
        case 'cmd_reviews': {
            if (!isAdmin && !owner) {
                await message.reply('❌ Admin permissions required.');
                return true;
            }
            const allCmds = storage.loadAllCommands();
            const pending = allCmds.filter((c) => c.metadata.enabled === false);
            if (pending.length === 0) {
                await message.reply('✅ There are no pending commands awaiting review.');
            } else {
                const listStr = pending
                    .map(
                        (c) =>
                            `- **${c.metadata.name}** [${c.metadata.category || 'General'}] by <@${c.metadata.author}> | Trigger: \`${c.trigger.value}\``,
                    )
                    .join('\n');
                await message.reply(
                    `**Pending Commands Awaiting Review (${pending.length}):**\n${listStr}`,
                );
            }
            return true;
        }
        case 'usercmd_enable':
        case 'enable_cmd': {
            if (!isAdmin && !owner) {
                await message.reply('❌ Admin permissions required.');
                return true;
            }
            if (!arg1) return false;
            const cmd = storage.getCommand(arg1);
            if (!cmd) {
                await message.reply(`Command **${arg1}** not found.`);
                return true;
            }
            cmd.metadata.enabled = true;
            const rawDef = storage.getRawCommand(arg1) || '';
            storage.saveCommand(cmd, rawDef);
            triggerPool.registerCommand(cmd);
            await sendAuditLog(
                message.guild,
                'User Command Approved / Enabled',
                `User command **${cmd.metadata.name}** was approved and enabled by <@${userId}>.`,
                [
                    { name: 'Command', value: `**${cmd.metadata.name}**` },
                    { name: 'Category', value: cmd.metadata.category || 'General' },
                    { name: 'Author', value: `<@${cmd.metadata.author}>` },
                    { name: 'Enabled By', value: `<@${userId}>` },
                ],
            );
            await message.reply(
                `✅ Command **${cmd.metadata.name}** has been approved and enabled!`,
            );
            return true;
        }
        case 'usercmd_disable':
        case 'disable_cmd': {
            if (!isAdmin && !owner) {
                await message.reply('❌ Admin permissions required.');
                return true;
            }
            if (!arg1) return false;
            const cmd = storage.getCommand(arg1);
            if (!cmd) {
                await message.reply(`Command **${arg1}** not found.`);
                return true;
            }
            cmd.metadata.enabled = false;
            const rawDef = storage.getRawCommand(arg1) || '';
            storage.saveCommand(cmd, rawDef);
            triggerPool.registerCommand(cmd);
            await sendAuditLog(
                message.guild,
                'User Command Disabled',
                `User command **${cmd.metadata.name}** was disabled by <@${userId}>.`,
                [
                    { name: 'Command', value: `**${cmd.metadata.name}**` },
                    { name: 'Disabled By', value: `<@${userId}>` },
                ],
            );
            await message.reply(`⚠️ Command **${cmd.metadata.name}** has been disabled.`);
            return true;
        }
        case 'usercmd_category_list':
        case 'cmd_categories': {
            const categories = configStore.getCategories();
            const listStr = categories
                .map((c) => `- **${c.name}**: ${c.description || 'No description'}`)
                .join('\n');
            await message.reply(
                `**User Command Categories (${categories.length} total):**\n${listStr}`,
            );
            return true;
        }
        case 'usercmd_category_add': {
            if (!isAdmin && !owner) {
                await message.reply('❌ Admin permissions required.');
                return true;
            }
            if (!arg1) return false;
            const added = configStore.addCategory(arg1, restArgs);
            if (added) {
                await message.reply(`✅ Category **${arg1}** added successfully.`);
            } else {
                await message.reply(`❌ Category **${arg1}** already exists.`);
            }
            return true;
        }
        case 'usercmd_category_remove': {
            if (!isAdmin && !owner) {
                await message.reply('❌ Admin permissions required.');
                return true;
            }
            if (!arg1) return false;
            const removed = configStore.removeCategory(arg1);
            if (removed) {
                await message.reply(`✅ Category **${arg1}** removed successfully.`);
            } else {
                await message.reply(`❌ Cannot remove category **${arg1}**.`);
            }
            return true;
        }
        case 'usercmd_channel_timeout': {
            if (!isAdmin && !owner) {
                await message.reply('❌ Admin permissions required.');
                return true;
            }
            const chanId = message.channel.id;
            if (arg1 !== undefined && !isNaN(parseInt(arg1, 10))) {
                const secs = parseInt(arg1, 10);
                configStore.setChannelTimeout(chanId, secs);
                await message.reply(`✅ Channel timeout for <#${chanId}> set to **${secs}s**.`);
            } else {
                const cfg = configStore.getChannelConfig(chanId);
                const current = cfg.timeoutSeconds ?? 0;
                await message.reply(`Channel timeout for <#${chanId}> is **${current}s**.`);
            }
            return true;
        }
        case 'usercmd_channel_categories': {
            if (!isAdmin && !owner) {
                await message.reply('❌ Admin permissions required.');
                return true;
            }
            const chanId = message.channel.id;
            if (arg1) {
                const cats = [arg1, ...(restArgs ? restArgs.split(/\s+/) : [])];
                configStore.setChannelAllowedCategories(chanId, cats);
                await message.reply(
                    `✅ Allowed categories for <#${chanId}> set to: **${cats.join(', ')}**.`,
                );
            } else {
                const cfg = configStore.getChannelConfig(chanId);
                const allowed = cfg.allowedCategories || ['*'];
                await message.reply(
                    `Allowed categories for <#${chanId}>: **${allowed.join(', ')}**.`,
                );
            }
            return true;
        }
        case 'usercmd_creation_channels':
        case 'creation_channels': {
            if (!isAdmin && !owner) {
                await message.reply('❌ Admin permissions required.');
                return true;
            }
            if (!arg1) {
                const current = configStore.formatAllowedCreationChannels();
                await message.reply(
                    `User command creation is currently allowed in: **${current}**.`,
                );
                return true;
            }
            if (arg1 === 'clear' || arg1 === '*') {
                configStore.clearAllowedCreationChannels();
                await message.reply('✅ Command creation is now allowed in **all channels**.');
                return true;
            }
            if (arg1 === 'add') {
                if (!restArgs) {
                    await message.reply('Usage: `!usercmd_creation_channels add <channel>`');
                    return true;
                }
                const channels = restArgs
                    .split(/\s+/)
                    .map((s: string) => s.trim())
                    .filter(Boolean);
                for (const ch of channels) {
                    configStore.addAllowedCreationChannel(ch);
                }
                const updated = configStore.formatAllowedCreationChannels();
                await message.reply(
                    `✅ Added channels. Allowed creation channels: **${updated}**.`,
                );
                return true;
            }
            if (arg1 === 'remove') {
                if (!restArgs) {
                    await message.reply('Usage: `!usercmd_creation_channels remove <channel>`');
                    return true;
                }
                const channels = restArgs
                    .split(/\s+/)
                    .map((s: string) => s.trim())
                    .filter(Boolean);
                for (const ch of channels) {
                    configStore.removeAllowedCreationChannel(ch);
                }
                const updated = configStore.formatAllowedCreationChannels();
                await message.reply(
                    `✅ Removed channels. Allowed creation channels: **${updated}**.`,
                );
                return true;
            }
            // default is set
            const channels = [arg1, ...(restArgs ? restArgs.split(/\s+/) : [])]
                .map((s: string) => s.trim())
                .filter(Boolean);
            configStore.setAllowedCreationChannels(channels);
            const updated = configStore.formatAllowedCreationChannels();
            await message.reply(`✅ Allowed command creation channels set to: **${updated}**.`);
            return true;
        }
        case 'user_command_help':
        case 'usercommands_help':
        case 'cmdhelp': {
            const embed = getHelpTopicEmbed(arg1);
            await message.reply({ embeds: [embed] });
            return true;
        }
    }

    return false;
}

function editCommandTrigger(name: string, newTriggerRaw: string): boolean {
    let trigger: UserCommandTrigger;
    const trimmed = newTriggerRaw.trim();

    if (trimmed.startsWith('/') && trimmed.endsWith('/') && trimmed.length > 2) {
        trigger = {
            type: 'regex',
            value: trimmed.slice(1, -1),
            scope: 'everyone',
        };
    } else {
        let strVal = trimmed;
        if (strVal.startsWith('"') && strVal.endsWith('"')) {
            strVal = strVal.slice(1, -1);
        }
        trigger = {
            type: 'string',
            value: strVal,
            scope: 'everyone',
        };
    }

    const existingCmd = storage.getCommand(name);
    const conflictingCmd = triggerPool.findConflictingCommand(
        trigger,
        existingCmd?.aliases || [],
        name,
    );
    if (conflictingCmd) {
        return false;
    }

    const success = storage.updateTrigger(name, trigger);
    if (success) {
        triggerPool.loadFromStorage();
    }
    return success;
}

function deleteUserCommand(name: string): boolean {
    const deleted = storage.deleteCommand(name);
    if (deleted) {
        triggerPool.unregisterCommand(name);
    }
    return deleted;
}

export default moduleDefinition;
export const module = moduleDefinition;
export { storage, triggerPool, sessionManager, configStore, quotaManager };
