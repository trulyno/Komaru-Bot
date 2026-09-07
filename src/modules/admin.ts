import { EmbedBuilder } from 'discord.js';
import { logger } from '../logger';
import { cleanAndSyncCommands, restartBot, stopBot, syncCommands } from '../commandHandlers';
import { commandRegistry } from '../commandRegistry';
import { config } from '../config';
import { BotModule, moduleLoader } from '../moduleLoader';
import { UNBLOCKABLE_MODULES } from '../services/moduleConfigService';

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

const moduleDefinition: BotModule = {
    name: 'admin',
    description: 'Admin commands for bot control, module configuration, and command syncing',
    help: {
        summary: 'Server administration and bot management utilities',
        description:
            'Allows Discord administrators to enable/disable modules per guild and per channel, sync slash commands, and control the bot runtime.',
        usage: '/module_enable <module> | /module_disable <module> | /module_channel_disable <module> [channel]',
        commands: [
            {
                name: 'synccommands',
                description: 'Sync slash commands with Discord REST API',
                usage: '/synccommands',
            },
            {
                name: 'cleancommands',
                description: 'Clear all registered commands and re-sync from scratch',
                usage: '/cleancommands',
            },
            {
                name: 'restartbot',
                description: 'Restart the bot process',
                usage: '/restartbot',
            },
            {
                name: 'stopbot',
                description: 'Gracefully terminate the bot process',
                usage: '/stopbot',
            },
            {
                name: 'module_list',
                description: 'List all loaded bot modules with descriptions',
                usage: '/module_list',
            },
            {
                name: 'module_status',
                description: 'Check enabled and disabled modules in this guild and channel',
                usage: '/module_status [channel:channel]',
            },
            {
                name: 'module_enable',
                description: 'Enable a module server-wide for this guild',
                usage: '/module_enable <module:name>',
            },
            {
                name: 'module_disable',
                description: 'Disable a module server-wide for this guild',
                usage: '/module_disable <module:name>',
            },
            {
                name: 'module_channel_disable',
                description: 'Disable a module in a specific channel',
                usage: '/module_channel_disable <module:name> [channel:channel]',
            },
            {
                name: 'module_channel_enable',
                description: 'Re-enable a module in a specific channel',
                usage: '/module_channel_enable <module:name> [channel:channel]',
            },
        ],
        examples: [
            '/module_status',
            '/module_disable module:chess',
            '/module_enable module:chess',
            '/module_channel_disable module:calculator channel:#general',
            '/module_channel_enable module:calculator channel:#general',
        ],
    },
    register: async (client: any) => {
        commandRegistry.register({
            name: 'synccommands',
            description: 'Sync slash commands',
            handler: async (interaction: any) => {
                if (!checkAdmin(interaction)) {
                    await interaction.reply({
                        content: 'You do not have permission to use this command.',
                        ephemeral: true,
                    });
                    return;
                }

                await interaction.deferReply({ ephemeral: true });
                try {
                    const guildId = config.env.discordGuildId;
                    await syncCommands(config.env.discordToken, client?.user?.id, guildId);
                    await interaction.editReply('Slash commands synced.');
                } catch (error) {
                    logger.error(`Failed to sync commands: ${error}`);
                    await interaction.editReply('Unable to sync commands.');
                }
            },
        });

        commandRegistry.register({
            name: 'cleancommands',
            description: 'Clean all slash commands and re-register from command registry',
            handler: async (interaction: any) => {
                if (!checkAdmin(interaction)) {
                    await interaction.reply({
                        content: 'You do not have permission to use this command.',
                        ephemeral: true,
                    });
                    return;
                }

                await interaction.deferReply({ ephemeral: true });
                try {
                    const guildId = config.env.discordGuildId;
                    await cleanAndSyncCommands(config.env.discordToken, client?.user?.id, guildId);
                    await interaction.editReply('Slash commands cleaned and re-registered.');
                } catch (error) {
                    logger.error(`Failed to clean and re-register commands: ${error}`);
                    await interaction.editReply('Unable to clean and re-register commands.');
                }
            },
        });

        commandRegistry.register({
            name: 'restartbot',
            description: 'Restart the bot',
            handler: async (interaction: any) => {
                if (!checkAdmin(interaction)) {
                    await interaction.reply({
                        content: 'You do not have permission to use this command.',
                        ephemeral: true,
                    });
                    return;
                }

                await interaction.reply({ content: 'Restarting bot...', ephemeral: true });
                await restartBot();
            },
        });

        commandRegistry.register({
            name: 'stopbot',
            description: 'Stop the bot',
            handler: async (interaction: any) => {
                if (!checkAdmin(interaction)) {
                    await interaction.reply({
                        content: 'You do not have permission to use this command.',
                        ephemeral: true,
                    });
                    return;
                }

                await interaction.reply({ content: 'Stopping bot...', ephemeral: true });
                await stopBot();
            },
        });

        // Module Management Commands
        commandRegistry.register({
            name: 'module_list',
            description: 'List all loaded bot modules',
            handler: async (interaction: any) => {
                const modules = moduleLoader
                    .getAllModules()
                    .sort((a, b) => a.name.localeCompare(b.name));
                const list = modules.map((m) => `• **\`${m.name}\`**: ${m.description}`).join('\n');

                const embed = new EmbedBuilder()
                    .setTitle('Bot Modules')
                    .setDescription(list || 'No modules loaded.')
                    .setColor(0x6a5acd);

                await interaction.reply({ embeds: [embed], ephemeral: true });
            },
        });

        commandRegistry.register({
            name: 'module_status',
            description: 'Show enabled and disabled modules in this guild and channel',
            options: [
                {
                    name: 'channel',
                    description: 'Channel to check (defaults to current channel)',
                    type: 7, // CHANNEL
                    required: false,
                },
            ],
            handler: async (interaction: any) => {
                const guildId = interaction.guildId;
                if (!guildId) {
                    await interaction.reply({
                        content: 'This command can only be used in a server.',
                        ephemeral: true,
                    });
                    return;
                }

                const targetChannel = interaction.options?.getChannel?.('channel');
                const channelId = targetChannel?.id || interaction.channelId;
                const channelName = targetChannel?.name
                    ? `#${targetChannel.name}`
                    : `<#${channelId}>`;

                const modules = moduleLoader
                    .getAllModules()
                    .sort((a, b) => a.name.localeCompare(b.name));

                const lines = modules.map((mod) => {
                    const isGuildEnabled = config.modules.isModuleEnabled(mod.name, guildId);
                    const isChannelEnabled = config.modules.isModuleEnabled(
                        mod.name,
                        guildId,
                        channelId,
                    );

                    let status = '🟢 Enabled';
                    if (!isGuildEnabled) {
                        status = '🔴 Disabled (Server-wide)';
                    } else if (!isChannelEnabled) {
                        status = `🟡 Disabled in ${channelName}`;
                    }

                    return `• **${mod.name}**: ${status}`;
                });

                const embed = new EmbedBuilder()
                    .setTitle('Module Status Overview')
                    .setDescription(
                        `**Server ID**: \`${guildId}\`\n**Channel**: ${channelName}\n\n${lines.join('\n')}`,
                    )
                    .setColor(0x6a5acd);

                await interaction.reply({ embeds: [embed], ephemeral: true });
            },
        });

        commandRegistry.register({
            name: 'module_enable',
            description: 'Enable a module server-wide for this guild',
            options: [
                {
                    name: 'module',
                    description: 'The name of the module to enable',
                    type: 3, // STRING
                    required: true,
                },
            ],
            handler: async (interaction: any) => {
                if (!checkAdmin(interaction)) {
                    await interaction.reply({
                        content: 'You do not have permission to configure modules.',
                        ephemeral: true,
                    });
                    return;
                }

                const guildId = interaction.guildId;
                if (!guildId) {
                    await interaction.reply({
                        content: 'This command can only be used in a server.',
                        ephemeral: true,
                    });
                    return;
                }

                const moduleName = interaction.options.getString('module')?.trim();
                const targetMod = moduleLoader.getModule(moduleName);
                if (!targetMod) {
                    await interaction.reply({
                        content: `Module \`${moduleName}\` does not exist. Use \`/module_list\` to see available modules.`,
                        ephemeral: true,
                    });
                    return;
                }

                const changed = config.modules.enableModuleInGuild(guildId, targetMod.name);
                if (changed) {
                    await interaction.reply({
                        content: `✅ Module \`${targetMod.name}\` has been **enabled** server-wide.`,
                        ephemeral: true,
                    });
                } else {
                    await interaction.reply({
                        content: `ℹ️ Module \`${targetMod.name}\` is already enabled server-wide.`,
                        ephemeral: true,
                    });
                }
            },
        });

        commandRegistry.register({
            name: 'module_disable',
            description: 'Disable a module server-wide for this guild',
            options: [
                {
                    name: 'module',
                    description: 'The name of the module to disable',
                    type: 3, // STRING
                    required: true,
                },
            ],
            handler: async (interaction: any) => {
                if (!checkAdmin(interaction)) {
                    await interaction.reply({
                        content: 'You do not have permission to configure modules.',
                        ephemeral: true,
                    });
                    return;
                }

                const guildId = interaction.guildId;
                if (!guildId) {
                    await interaction.reply({
                        content: 'This command can only be used in a server.',
                        ephemeral: true,
                    });
                    return;
                }

                const moduleName = interaction.options.getString('module')?.trim();
                const targetMod = moduleLoader.getModule(moduleName);
                if (!targetMod) {
                    await interaction.reply({
                        content: `Module \`${moduleName}\` does not exist. Use \`/module_list\` to see available modules.`,
                        ephemeral: true,
                    });
                    return;
                }

                if (UNBLOCKABLE_MODULES.has(targetMod.name.toLowerCase())) {
                    await interaction.reply({
                        content: `⚠️ The \`${targetMod.name}\` module is a core system module and cannot be disabled.`,
                        ephemeral: true,
                    });
                    return;
                }

                const changed = config.modules.disableModuleInGuild(guildId, targetMod.name);
                if (changed) {
                    await interaction.reply({
                        content: `🛑 Module \`${targetMod.name}\` has been **disabled** server-wide.`,
                        ephemeral: true,
                    });
                } else {
                    await interaction.reply({
                        content: `ℹ️ Module \`${targetMod.name}\` is already disabled server-wide.`,
                        ephemeral: true,
                    });
                }
            },
        });

        commandRegistry.register({
            name: 'module_channel_disable',
            description: 'Disable a module in a specific channel',
            options: [
                {
                    name: 'module',
                    description: 'The name of the module to disable in channel',
                    type: 3, // STRING
                    required: true,
                },
                {
                    name: 'channel',
                    description: 'Channel to disable module in (defaults to current channel)',
                    type: 7, // CHANNEL
                    required: false,
                },
            ],
            handler: async (interaction: any) => {
                if (!checkAdmin(interaction)) {
                    await interaction.reply({
                        content: 'You do not have permission to configure modules.',
                        ephemeral: true,
                    });
                    return;
                }

                const guildId = interaction.guildId;
                if (!guildId) {
                    await interaction.reply({
                        content: 'This command can only be used in a server.',
                        ephemeral: true,
                    });
                    return;
                }

                const moduleName = interaction.options.getString('module')?.trim();
                const targetMod = moduleLoader.getModule(moduleName);
                if (!targetMod) {
                    await interaction.reply({
                        content: `Module \`${moduleName}\` does not exist. Use \`/module_list\` to see available modules.`,
                        ephemeral: true,
                    });
                    return;
                }

                if (UNBLOCKABLE_MODULES.has(targetMod.name.toLowerCase())) {
                    await interaction.reply({
                        content: `⚠️ The \`${targetMod.name}\` module is a core system module and cannot be disabled.`,
                        ephemeral: true,
                    });
                    return;
                }

                const targetChannel = interaction.options?.getChannel?.('channel');
                const channelId = targetChannel?.id || interaction.channelId;
                const channelName = targetChannel?.name
                    ? `#${targetChannel.name}`
                    : `<#${channelId}>`;

                const changed = config.modules.disableModuleInChannel(
                    guildId,
                    channelId,
                    targetMod.name,
                );

                if (changed) {
                    await interaction.reply({
                        content: `🛑 Module \`${targetMod.name}\` has been **disabled** in channel ${channelName}.`,
                        ephemeral: true,
                    });
                } else {
                    await interaction.reply({
                        content: `ℹ️ Module \`${targetMod.name}\` is already disabled in channel ${channelName}.`,
                        ephemeral: true,
                    });
                }
            },
        });

        commandRegistry.register({
            name: 'module_channel_enable',
            description: 'Re-enable a module in a specific channel',
            options: [
                {
                    name: 'module',
                    description: 'The name of the module to enable in channel',
                    type: 3, // STRING
                    required: true,
                },
                {
                    name: 'channel',
                    description: 'Channel to re-enable module in (defaults to current channel)',
                    type: 7, // CHANNEL
                    required: false,
                },
            ],
            handler: async (interaction: any) => {
                if (!checkAdmin(interaction)) {
                    await interaction.reply({
                        content: 'You do not have permission to configure modules.',
                        ephemeral: true,
                    });
                    return;
                }

                const guildId = interaction.guildId;
                if (!guildId) {
                    await interaction.reply({
                        content: 'This command can only be used in a server.',
                        ephemeral: true,
                    });
                    return;
                }

                const moduleName = interaction.options.getString('module')?.trim();
                const targetMod = moduleLoader.getModule(moduleName);
                if (!targetMod) {
                    await interaction.reply({
                        content: `Module \`${moduleName}\` does not exist. Use \`/module_list\` to see available modules.`,
                        ephemeral: true,
                    });
                    return;
                }

                const targetChannel = interaction.options?.getChannel?.('channel');
                const channelId = targetChannel?.id || interaction.channelId;
                const channelName = targetChannel?.name
                    ? `#${targetChannel.name}`
                    : `<#${channelId}>`;

                const changed = config.modules.enableModuleInChannel(
                    guildId,
                    channelId,
                    targetMod.name,
                );

                if (changed) {
                    await interaction.reply({
                        content: `✅ Module \`${targetMod.name}\` has been **re-enabled** in channel ${channelName}.`,
                        ephemeral: true,
                    });
                } else {
                    await interaction.reply({
                        content: `ℹ️ Module \`${targetMod.name}\` was not channel-disabled in ${channelName}.`,
                        ephemeral: true,
                    });
                }
            },
        });
    },
};

export default moduleDefinition;
export const module = moduleDefinition;
