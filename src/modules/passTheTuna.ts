
import { commandRegistry } from '../commandRegistry';
import { logger } from '../logger';
import { loadPassTheTunaConfig, loadPassTheTunaState, savePassTheTunaState, createPassTheTunaEngine } from '../passTheTuna';
import fs from 'node:fs';
import path from 'node:path';

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

const moduleDefinition = {
    name: 'passTheTuna',
    description: 'A pass-the-tuna minigame for Discord channels',
    register: async (client: any) => {
        loadPassTheTunaConfig(defaultDataDir);

        const engine = createPassTheTunaEngine(defaultDataDir);

        client.on('messageCreate', async (message: any) => {
            if (!message || message.author?.bot) return;
            const content = message.content?.trim() ?? '';
            if (!/\b(pass|take)\b/i.test(content)) return;

            const state = loadPassTheTunaState(defaultDataDir);
            if (!state.active || !state.currentChain) return;
            if (message.channel?.id !== state.currentChain.channelId) return;

            const action = /\btake\b/i.test(content) ? 'take' : 'pass';
            const result = engine.handleAction({
                userId: message.author.id,
                action,
                now: Date.now(),
            });

            if (result.blocked) {
                await message.reply(result.message);
                return;
            }

            const gifPath = result.gifPath;
            const payload: any = { content: result.message };
            if (gifPath && fs.existsSync(gifPath)) {
                payload.files = [gifPath];
            }
            await message.reply(payload);
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
