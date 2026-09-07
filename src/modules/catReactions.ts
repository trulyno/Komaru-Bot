import { config } from '../config';
import { BotModule } from '../moduleLoader';
import {
    handleCatReactionsMessage,
    respondToBingusMention,
    respondToCatNoise,
    respondToKomaruMention,
    sendCatStats,
} from '../services/catReactionsService';

export {
    respondToCatNoise,
    respondToKomaruMention,
    respondToBingusMention,
    sendCatStats,
    handleCatReactionsMessage,
};

const moduleDefinition: BotModule = {
    name: 'catReactions',
    description: 'Probabilistic cat persona triggers, emojis, and Bingus/Komaru responses',
    help: {
        summary: 'Cat persona and playful reactions',
        description:
            'Passively responds to cat sounds (nya, meow, etc.) and bot mentions with cute text, emojis, and GIFs based on configurable probabilities.',
        usage: 'Chat triggers (nya, meow, mew, @Komaru Bot)',
        examples: ['nya~', 'meow', 'mew'],
    },
    register: async (client: any) => {
        client.on('messageCreate', async (message: any) => {
            if (
                !config.modules.isModuleEnabled('catReactions', message.guildId, message.channelId)
            ) {
                return;
            }
            await handleCatReactionsMessage(message);
        });
    },
};

export default moduleDefinition;
export const module = moduleDefinition;
