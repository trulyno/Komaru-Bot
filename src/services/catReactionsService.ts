import fs from 'node:fs';
import path from 'node:path';
import { EmbedBuilder } from 'discord.js';
import { logger } from '../logger';
import { config } from '../config';

export interface CatReactionsConfig {
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

export const loadCatReactionsConfig = (): CatReactionsConfig => {
    return config.catReactions;
};

export const respondToCatNoise = async (message: any): Promise<void> => {
    try {
        const catConfig = config.catReactions;
        logger.info(`Cat noise detected in message: ${message.content} by ${message.author}`);

        if (Math.random() > catConfig.cat_response_rate) {
            return;
        }

        const tonalities = Object.keys(catConfig.cat_responses);
        const tonality = tonalities[Math.floor(Math.random() * tonalities.length)];
        const responses = catConfig.cat_responses[tonality] ?? [];

        if (responses.length === 0) {
            return;
        }

        const response = responses[Math.floor(Math.random() * responses.length)];
        await message.channel.send(response);
    } catch (error) {
        logger.error(`Error responding to cat noise: ${error}`);
    }
};

export const respondToKomaruMention = async (message: any): Promise<void> => {
    try {
        const catConfig = config.catReactions;
        const actionTypes = Object.keys(catConfig.komaru_response_weights);
        const weights = actionTypes.map((type) => catConfig.komaru_response_weights[type] ?? 0);

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
                Math.min(catConfig.max_komaru_emojis, catConfig.komaru_emojis.length),
            );
            const numEmojis = Math.floor(Math.random() * maxEmojis) + 1;
            const chosenEmojis = [...catConfig.komaru_emojis]
                .sort(() => Math.random() - 0.5)
                .slice(0, Math.min(numEmojis, catConfig.komaru_emojis.length));

            for (const emoji of chosenEmojis) {
                await message.react(emoji);
            }
        } else if (weightedActionType === 'text_response') {
            const response =
                catConfig.komaru_responses[
                    Math.floor(Math.random() * catConfig.komaru_responses.length)
                ];
            await message.reply({ content: response, allowedMentions: { repliedUser: false } });
        } else if (weightedActionType === 'gif_response') {
            if (catConfig.komaru_gifs.length > 0) {
                const gifUrl =
                    catConfig.komaru_gifs[Math.floor(Math.random() * catConfig.komaru_gifs.length)];
                const responseText =
                    catConfig.komaru_responses[
                        Math.floor(Math.random() * catConfig.komaru_responses.length)
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
                catConfig.komaru_responses[
                    Math.floor(Math.random() * catConfig.komaru_responses.length)
                ];
            await message.reply({ content: response, allowedMentions: { repliedUser: false } });
        }
    } catch (error) {
        logger.error(`Error responding to Komaru mention: ${error}`);
    }
};

export const respondToBingusMention = async (message: any): Promise<void> => {
    try {
        const catConfig = config.catReactions;
        if (catConfig.bingus_gifs.length > 0) {
            const gifUrl =
                catConfig.bingus_gifs[Math.floor(Math.random() * catConfig.bingus_gifs.length)];
            const responseText =
                catConfig.bingus_responses[
                    Math.floor(Math.random() * catConfig.bingus_responses.length)
                ];
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
            catConfig.bingus_responses[
                Math.floor(Math.random() * catConfig.bingus_responses.length)
            ];
        await message.reply({ content: response, allowedMentions: { repliedUser: false } });
    } catch (error) {
        logger.error(`Error responding to Bingus mention: ${error}`);
    }
};

export const sendCatStats = async (message: any): Promise<void> => {
    try {
        const catConfig = config.catReactions;
        const embed = new EmbedBuilder()
            .setTitle('🐱 Cat Response Statistics')
            .setDescription("Komaru's cat behavior patterns")
            .setColor(0xffc0cb)
            .addFields(
                {
                    name: 'Cat Triggers',
                    value: `• Responds to: ${catConfig.cat_triggers.join(', ')}\n• Response rate: ${Math.round(catConfig.cat_response_rate * 100)}% (to avoid spam)`,
                    inline: false,
                },
                {
                    name: 'Tonalities Available',
                    value: `• ${Object.keys(catConfig.cat_responses).join(', ')}\n• Total responses: ${Object.values(catConfig.cat_responses).reduce((total, entries: string[]) => total + entries.length, 0)}`,
                    inline: false,
                },
                {
                    name: 'Komaru Reactions',
                    value: `• Emoji reactions: ${catConfig.komaru_emojis.length} different emojis\n• Text responses: ${catConfig.komaru_responses.length} variations\n• GIFs available: ${catConfig.komaru_gifs.length}`,
                    inline: false,
                },
                {
                    name: 'Bingus Responses',
                    value: `• Response rate: 100% (bingus is life!)\n• Text responses: ${catConfig.bingus_responses.length} variations\n• GIFs available: ${catConfig.bingus_gifs.length}`,
                    inline: false,
                },
            )
            .setFooter({ text: "Try saying 'nya', 'Komaru', or 'bingus' to see me in action! 😸" });

        await message.reply({ embeds: [embed], allowedMentions: { repliedUser: false } });
    } catch (error) {
        logger.error(`Error sending cat stats: ${error}`);
    }
};

export const handleCatReactionsMessage = async (message: any): Promise<void> => {
    if (!message || message.author?.bot) return;

    const catConfig = config.catReactions;
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

    for (const pattern of catConfig.cat_triggers) {
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
};
