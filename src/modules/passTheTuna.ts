import { commandRegistry } from '../commandRegistry';
import { logger } from '../logger';
import {
    loadPassTheTunaConfig,
    loadPassTheTunaState,
    savePassTheTunaState,
    createPassTheTunaEngine,
} from '../passTheTuna';
import { markMessageAsBotDeleted } from '../services/auditLogService';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config';
import { BotModule } from '../moduleLoader';

const defaultDataDir = path.resolve(__dirname, '../../data/pass_the_tuna');

function isAdmin(interaction: any): boolean {
    const memberPermissions = interaction.memberPermissions?.has?.('Administrator');
    if (memberPermissions) {
        return true;
    }
    if (process.env.BOT_OWNER_ID && interaction.user?.id === process.env.BOT_OWNER_ID) {
        return true;
    }
    return false;
}

const moduleDefinition: BotModule = {
    name: 'passTheTuna',
    description: 'A pass-the-tuna minigame for Discord channels',
    help: {
        summary: 'State-machine pass-the-tuna minigame',
        description:
            'Start a tuna chain in a channel where users type "pass" or "take" to score points, accumulate deliciousness, and trigger random events.',
        usage: '/tuna_start | /tuna_stop | /tuna_status | /tuna_leaderboard',
        commands: [
            {
                name: 'tuna_start',
                description: 'Start a new Pass the Tuna game in the specified channel',
                usage: '/tuna_start [channel:channel]',
            },
            {
                name: 'tuna_stop',
                description: 'Stop the active Pass the Tuna game',
                usage: '/tuna_stop',
            },
            {
                name: 'tuna_status',
                description: 'Check current tuna status and game state',
                usage: '/tuna_status',
            },
            {
                name: 'tuna_leaderboard',
                description: 'View the highest scoring Pass the Tuna players',
                usage: '/tuna_leaderboard [limit:number]',
            },
        ],
        examples: ['/tuna_start', '/tuna_status', '/tuna_leaderboard'],
    },
    register: async (client: any) => {
        loadPassTheTunaConfig(defaultDataDir);

        const engine = createPassTheTunaEngine(defaultDataDir);

        client.on('messageCreate', async (message: any) => {
            if (!message || message.author?.bot) return;

            if (
                !config.modules.isModuleEnabled('passTheTuna', message.guildId, message.channelId)
            ) {
                return;
            }

            const state = loadPassTheTunaState(defaultDataDir);
            if (
                state.active &&
                state.currentChain &&
                message.channel?.id === state.currentChain.channelId
            ) {
                try {
                    if (message.deletable) {
                        markMessageAsBotDeleted(message.id);
                        await message.delete();
                    }
                } catch (error) {
                    logger.warn(`Unable to delete Pass the Tuna channel message: ${error}`);
                }
            }

            const content = message.content?.trim() ?? '';
            if (!/\b(pass|take)\b/i.test(content)) return;

            if (!state.active || !state.currentChain) return;
            if (message.channel?.id !== state.currentChain.channelId) return;

            const action = /\btake\b/i.test(content) ? 'take' : 'pass';
            const userDisplayName =
                message.member?.displayName ||
                message.author?.displayName ||
                message.author?.username ||
                'User';
            const result = engine.handleAction({
                userId: message.author.id,
                userName: userDisplayName,
                action,
                now: Date.now(),
            });

            const sendMessage = async (content: string, attachmentPath?: string) => {
                const payload: any = {
                    content,
                    allowedMentions: { parse: [], users: [], roles: [] },
                };
                if (attachmentPath && fs.existsSync(attachmentPath)) {
                    payload.files = [attachmentPath];
                }

                try {
                    const sentMessage = await message.channel.send(payload);
                    if (
                        content ===
                        'The same user cannot take two actions in a row. Please wait for another player.'
                    ) {
                        setTimeout(async () => {
                            try {
                                await sentMessage.delete();
                            } catch (error) {
                                logger.warn(
                                    `Failed to delete queued Pass the Tuna warning message: ${error}`,
                                );
                            }
                        }, 3000);
                    }
                } catch (error) {
                    logger.warn(`Failed to send Pass the Tuna action message: ${error}`);
                    try {
                        const fallbackSentMessage = await message.channel.send(payload);
                        if (
                            content ===
                            'The same user cannot take two actions in a row. Please wait for another player.'
                        ) {
                            setTimeout(async () => {
                                try {
                                    await fallbackSentMessage.delete();
                                } catch (fallbackError) {
                                    logger.warn(
                                        `Failed to delete queued Pass the Tuna warning message after fallback send: ${fallbackError}`,
                                    );
                                }
                            }, 3000);
                        }
                    } catch (fallbackError) {
                        logger.warn(
                            `Failed to send Pass the Tuna action message to channel: ${fallbackError}`,
                        );
                    }
                }
            };

            if (result.blocked) {
                await sendMessage(result.message);
                return;
            }

            const gifPath = result.gifPath;
            await sendMessage(result.message, gifPath);
        });

        commandRegistry.register({
            name: 'setup_pass_the_tuna',
            description: 'Start Pass the Tuna in the current channel',
            options: [
                {
                    name: 'channel',
                    description: 'Optional channel to host the game',
                    type: 7,
                    required: false,
                },
            ],
            handler: async (interaction: any) => {
                if (!isAdmin(interaction)) {
                    await interaction.reply({
                        content: 'Only administrators can set up Pass the Tuna.',
                        ephemeral: true,
                    });
                    return;
                }

                const targetChannel =
                    interaction.options?.getChannel?.('channel') ?? interaction.channel;
                const guildId = interaction.guildId || interaction.guild?.id || 'unknown-guild';
                const startedChain = engine.startChain({
                    channelId: targetChannel.id,
                    guildId,
                    now: Date.now(),
                    config: loadPassTheTunaConfig(defaultDataDir),
                });

                const introMessage = `Pass the Tuna is live! The chain starts at length 0. Type pass or take to keep it going.`;
                if (targetChannel?.send) {
                    await targetChannel.send(introMessage);
                }

                await interaction.reply({
                    content: `Pass the Tuna is live in <#${targetChannel.id}>. The chain starts at length ${startedChain.chainLength} and the delicious threshold is ${startedChain.deliciousThreshold}.`,
                });
            },
        });

        commandRegistry.register({
            name: 'stop_pass_the_tuna',
            description: 'Stop the active Pass the Tuna chain',
            handler: async (interaction: any) => {
                if (!isAdmin(interaction)) {
                    await interaction.reply({
                        content: 'Only administrators can stop Pass the Tuna.',
                        ephemeral: true,
                    });
                    return;
                }

                const state = loadPassTheTunaState(defaultDataDir);
                if (!state.active) {
                    await interaction.reply({
                        content: 'No Pass the Tuna chain is currently active.',
                        ephemeral: true,
                    });
                    return;
                }

                const stoppedState = { ...state, active: false, currentChain: null };
                savePassTheTunaState(stoppedState, defaultDataDir);
                await interaction.reply({ content: 'Pass the Tuna chain has been stopped.' });
            },
        });

        commandRegistry.register({
            name: 'pass_the_tuna_status',
            description: 'Show the current Pass the Tuna chain status',
            handler: async (interaction: any) => {
                await interaction.reply({ content: engine.getStatus() });
            },
        });

        commandRegistry.register({
            name: 'pass_the_tuna_leaderboard',
            description: 'Show the Pass the Tuna score leaderboard',
            handler: async (interaction: any) => {
                await interaction.reply({ content: engine.getLeaderboards() });
            },
        });

        logger.info('Registered Pass the Tuna module.');
    },
};

export default moduleDefinition;
export const module = moduleDefinition;
