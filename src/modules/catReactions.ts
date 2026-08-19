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

const moduleDefinition = {
    name: 'catReactions',
    description: 'Random reactions from the bot',
    register: async (client: any) => {
        client.on('messageCreate', async (message: any) => {
            await handleCatReactionsMessage(message);
        });
    },
};

export default moduleDefinition;
export const module = moduleDefinition;
