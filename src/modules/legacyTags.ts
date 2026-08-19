import {
    buildAliasIndex,
    handleLegacyTagMessage,
    normalizeTagName,
    resolveAndReplyTag,
    resolveCanonicalTagName,
    safeReply,
} from '../services/legacyTagService';

export {
    safeReply,
    normalizeTagName,
    buildAliasIndex,
    resolveCanonicalTagName,
    resolveAndReplyTag,
    handleLegacyTagMessage,
};

const moduleDefinition = {
    name: 'legacyTags',
    description: 'Read-only legacy tag system',
    register: async (client: any) => {
        client.on('messageCreate', async (message: any) => {
            await handleLegacyTagMessage(message);
        });
    },
};

export default moduleDefinition;
export const module = moduleDefinition;
