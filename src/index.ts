import 'dotenv/config';
import { config } from './config';
import { logger, logError } from './logger';
import { moduleLoader } from './moduleLoader';
import { once } from 'node:events';
import { cleanAndSyncCommands, restartBot, stopBot, syncCommands } from './commandHandlers';
import { commandRegistry } from './commandRegistry';

const { Client, GatewayIntentBits, Partials } = require('discord.js');

const token = config.env.discordToken;
if (!token) {
    logger.error('DISCORD_TOKEN is not defined. Set it in your .env file.');
    process.exit(1);
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildBans,
        GatewayIntentBits.GuildMessageReactions,
    ],
    partials: [
        Partials.Message,
        Partials.Channel,
        Partials.Reaction,
        Partials.User,
        Partials.GuildMember,
    ],
});

async function main(): Promise<void> {
    await moduleLoader.loadAll();

    client.once('clientReady', () => {
        logger.info(`Komaru the Cat ready as ${client.user?.tag ?? 'unknown'}`);
    });

    client.login(token).catch((error: unknown) => {
        logError(error, 'Failed to log in');
        process.exit(1);
    });

    await once(client, 'ready');

    commandRegistry.register({
        name: 'botinfo',
        description: 'Check bot details',
        handler: async (interaction: any) => {
            await interaction.reply({
                embeds: [
                    {
                        title: 'Komaru the Cat',
                        description:
                            'A modular Discord bot foundation with runtime command syncing.',
                        color: 0x6a5acd,
                        fields: [
                            { name: 'Status', value: 'Online' },
                            {
                                name: 'Modules',
                                value: String(
                                    moduleLoader.createContext(client).listModules().length,
                                ),
                            },
                            { name: 'Framework', value: 'TypeScript + discord.js' },
                        ],
                    },
                ],
            });
        },
    });

    await moduleLoader.registerAll(client);

    // Auto-sync slash commands to Discord after modules are loaded
    const guildId = config.env.discordGuildId;
    const clientId = client.user?.id;
    if (clientId) {
        await syncCommands(token as string, clientId, guildId);
    } else {
        logger.warn('Client ID not available, skipping auto-sync');
    }

    // Global command dispatcher - all commands go through the registry
    client.on('interactionCreate', async (interaction: any) => {
        if (!interaction.isChatInputCommand()) {
            return;
        }

        const command = commandRegistry.get(interaction.commandName);
        if (!command) {
            logger.warn(`Unknown command: ${interaction.commandName}`);
            return;
        }

        if (command.module) {
            const isGuildEnabled = config.modules.isModuleEnabled(
                command.module,
                interaction.guildId,
            );
            const isChannelEnabled = config.modules.isModuleEnabled(
                command.module,
                interaction.guildId,
                interaction.channelId,
            );

            if (!isGuildEnabled) {
                await interaction.reply({
                    content: `The \`${command.module}\` module is currently disabled in this server.`,
                    ephemeral: true,
                });
                return;
            }

            if (!isChannelEnabled) {
                await interaction.reply({
                    content: `The \`${command.module}\` module is currently disabled in this channel.`,
                    ephemeral: true,
                });
                return;
            }
        }

        try {
            await command.handler(interaction);
        } catch (error) {
            logger.error(`Error handling command ${interaction.commandName}: ${error}`);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: 'An error occurred while executing this command.',
                    ephemeral: true,
                });
            }
        }
    });

    // Text command fallback for admin commands (prefix: !)
    const adminPrefix = '!';
    client.on('messageCreate', async (message: any) => {
        if (message.author.bot || !message.content.startsWith(adminPrefix)) {
            return;
        }

        const args = message.content.slice(adminPrefix.length).trim().split(/\s+/);
        const command = args.shift()?.toLowerCase();

        if (command === 'synccommands') {
            try {
                if (clientId) {
                    await syncCommands(token as string, clientId, guildId);
                    await message.reply('Slash commands synced.');
                } else {
                    await message.reply('Client ID not available.');
                }
            } catch (error) {
                logger.error(`Failed to sync commands: ${error}`);
                await message.reply('Unable to sync commands.');
            }
        } else if (command === 'cleancommands') {
            try {
                if (clientId) {
                    await cleanAndSyncCommands(token as string, clientId, guildId);
                    await message.reply('Slash commands cleaned and re-registered.');
                } else {
                    await message.reply('Client ID not available.');
                }
            } catch (error) {
                logger.error(`Failed to clean and re-register commands: ${error}`);
                await message.reply('Unable to clean and re-register commands.');
            }
        } else if (command === 'restartbot') {
            await message.reply('Restarting bot...');
            await restartBot();
        } else if (command === 'stopbot') {
            await message.reply('Stopping bot...');
            await stopBot();
        }
    });
}

process.on('SIGTERM', () => {
    logger.info('Received SIGTERM, shutting down');
    void client.destroy();
    process.exit(0);
});

process.on('SIGINT', () => {
    logger.info('Received SIGINT, shutting down');
    void client.destroy();
    process.exit(0);
});

main().catch((error: unknown) => {
    logError(error, 'Fatal startup error');
    process.exit(1);
});

export { cleanAndSyncCommands, restartBot, stopBot, syncCommands };
