import fs from 'node:fs';
import path from 'node:path';
import { Colors, EmbedBuilder } from 'discord.js';
import { logger } from '../logger';

interface CatReactionsConfig {
    cat_triggers: string[];
    cat_response_rate: number;
    cat_responses: Record<string, string[]>;
    komaru_emojis: string[];
    komaru_responses: string[];
    komaru_gifs: string[];
    bingus_gifs: string[];
    bingus_responses: string[];
    komaru_response_weights: Record<string, number>;
    elaboration_chance: number;
    max_komaru_emojis: number;
}

const loadConfig = (): CatReactionsConfig => {
    const configPath = path.resolve(__dirname, '../../data/cat_reactions_config.json');

    try {
        const rawConfig = fs.readFileSync(configPath, 'utf8');
        return JSON.parse(rawConfig) as CatReactionsConfig;
    } catch (error) {
        logger.error(`Failed to load cat reactions config from ${configPath}: ${error}`);
        return {
            cat_triggers: ['nya', 'meow', 'mew'],
            cat_response_rate: 0.1,
            cat_responses: {
                curious: ['Nya? 🐱'],
            },
            komaru_emojis: ['😸'],
            komaru_responses: ['Nya~!'],
            komaru_gifs: [],
            bingus_gifs: [],
            bingus_responses: ['Bingus!'],
            komaru_response_weights: {
                emoji_react: 40,
                text_response: 40,
                gif_response: 20,
            },
            elaboration_chance: 0.1,
            max_komaru_emojis: 3,
        };
    }
};

const config = loadConfig();

const moduleDefinition = {
    name: 'catReactions',
    description: 'Random reactions from the bot',
    register: async (client: any) => {
        client.on('messageCreate', async (message: any) => {
            if (message.author.bot) return;

            const content = String(message.content ?? '');
            const contentLower = content.toLowerCase();

            if (contentLower.startsWith('!nya')) {
                await respondToCatNoise(message);
                return;
            }

            if (contentLower.startsWith('!komaru_test')) {
                await respondToKomaruMention(message);
                return;
            }

            if (contentLower.startsWith('!bingus_test')) {
                await respondToBingusMention(message);
                return;
            }

            if (contentLower.startsWith('!cat_stats')) {
                await sendCatStats(message);
                return;
            }

            for (const pattern of config.cat_triggers) {
                if (new RegExp(pattern, 'i').test(contentLower)) {
                    await respondToCatNoise(message);
                    break;
                }
            }

            if (contentLower.includes('komaru')) {
                await respondToKomaruMention(message);
            }

            if (contentLower.includes('bingus')) {
                await respondToBingusMention(message);
            }
        });
    },
};

const respondToCatNoise = async (message: any) => {
    try {
        logger.info(`Cat noise detected in message: ${message.content} by ${message.author}`);

        if (Math.random() > config.cat_response_rate) {
            return;
        }

        const tonalities = Object.keys(config.cat_responses);
        const tonality = tonalities[Math.floor(Math.random() * tonalities.length)];
        const responses = config.cat_responses[tonality] ?? [];

        if (responses.length === 0) {
            return;
        }

        const response = responses[Math.floor(Math.random() * responses.length)];
        await message.channel.send(response);
    } catch (error) {
        logger.error(`Error responding to cat noise: ${error}`);
    }
};

const respondToKomaruMention = async (message: any) => {
    try {
        const actionTypes = Object.keys(config.komaru_response_weights);
        const weights = actionTypes.map((type) => config.komaru_response_weights[type] ?? 0);
        const actionType = actionTypes[Math.floor(Math.random() * actionTypes.length)];

        const weightedActionType = (() => {
            const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
            let roll = Math.random() * totalWeight;

            for (let index = 0; index < actionTypes.length; index += 1) {
                roll -= weights[index] ?? 0;
                if (roll <= 0) {
                    return actionTypes[index];
                }
            }

            return actionTypes[0] ?? 'text_response';
        })();

        if (weightedActionType === 'emoji_react') {
            const maxEmojis = Math.max(
                1,
                Math.min(config.max_komaru_emojis, config.komaru_emojis.length),
            );
            const numEmojis = Math.floor(Math.random() * maxEmojis) + 1;
            const chosenEmojis = [...config.komaru_emojis]
                .sort(() => Math.random() - 0.5)
                .slice(0, Math.min(numEmojis, config.komaru_emojis.length));

            for (const emoji of chosenEmojis) {
                await message.react(emoji);
            }
        } else if (weightedActionType === 'text_response') {
            const response =
                config.komaru_responses[Math.floor(Math.random() * config.komaru_responses.length)];
            await message.reply({ content: response, allowedMentions: { repliedUser: false } });
        } else if (weightedActionType === 'gif_response') {
            if (config.komaru_gifs.length > 0) {
                const gifUrl =
                    config.komaru_gifs[Math.floor(Math.random() * config.komaru_gifs.length)];
                const responseText =
                    config.komaru_responses[
                        Math.floor(Math.random() * config.komaru_responses.length)
                    ];
                const embed = new EmbedBuilder()
                    .setDescription(responseText)
                    .setImage(gifUrl)
                    .setColor(0xffc0cb);

                try {
                    await message.channel.send({ embeds: [embed] });
                    return;
                } catch (error) {
                    logger.error(`Failed to send Komaru GIF embed: ${error}`);
                }
            }

            const response =
                config.komaru_responses[Math.floor(Math.random() * config.komaru_responses.length)];
            await message.reply({ content: response, allowedMentions: { repliedUser: false } });
        }
    } catch (error) {
        logger.error(`Error responding to Komaru mention: ${error}`);
    }
};

const respondToBingusMention = async (message: any) => {
    try {
        if (config.bingus_gifs.length > 0) {
            const gifUrl =
                config.bingus_gifs[Math.floor(Math.random() * config.bingus_gifs.length)];
            const responseText =
                config.bingus_responses[Math.floor(Math.random() * config.bingus_responses.length)];
            const embed = new EmbedBuilder()
                .setDescription(responseText)
                .setImage(gifUrl)
                .setColor(0xffc0cb);

            try {
                await message.channel.send({ embeds: [embed] });
                return;
            } catch (error) {
                logger.error(`Failed to send Bingus GIF embed: ${error}`);
            }
        }

        const response =
            config.bingus_responses[Math.floor(Math.random() * config.bingus_responses.length)];
        await message.reply({ content: response, allowedMentions: { repliedUser: false } });
    } catch (error) {
        logger.error(`Error responding to Bingus mention: ${error}`);
    }
};

const sendCatStats = async (message: any) => {
    try {
        const embed = new EmbedBuilder()
            .setTitle('🐱 Cat Response Statistics')
            .setDescription("Komaru's cat behavior patterns")
            .setColor(0xffc0cb)
            .addFields(
                {
                    name: 'Cat Triggers',
                    value: `• Responds to: ${config.cat_triggers.join(', ')}\n• Response rate: ${Math.round(config.cat_response_rate * 100)}% (to avoid spam)`,
                    inline: false,
                },
                {
                    name: 'Tonalities Available',
                    value: `• ${Object.keys(config.cat_responses).join(', ')}\n• Total responses: ${Object.values(config.cat_responses).reduce((total, entries) => total + entries.length, 0)}`,
                    inline: false,
                },
                {
                    name: 'Komaru Reactions',
                    value: `• Emoji reactions: ${config.komaru_emojis.length} different emojis\n• Text responses: ${config.komaru_responses.length} variations\n• GIFs available: ${config.komaru_gifs.length}`,
                    inline: false,
                },
                {
                    name: 'Bingus Responses',
                    value: `• Response rate: 100% (bingus is life!)\n• Text responses: ${config.bingus_responses.length} variations\n• GIFs available: ${config.bingus_gifs.length}`,
                    inline: false,
                },
            )
            .setFooter({ text: "Try saying 'nya', 'Komaru', or 'bingus' to see me in action! 😸" });

        await message.reply({ embeds: [embed], allowedMentions: { repliedUser: false } });
    } catch (error) {
        logger.error(`Error sending cat stats: ${error}`);
    }
};

export default moduleDefinition;
export const module = moduleDefinition;
