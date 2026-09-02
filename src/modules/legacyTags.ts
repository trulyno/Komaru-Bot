import { MessageFlags } from 'discord.js';
import { commandRegistry } from '../commandRegistry';
import { logger } from '../logger';
import {
    buildAliasIndex,
    buildTagPaginationEmbed,
    buildTagPaginationRow,
    getAllLegacyTagNames,
    getLegacyTagPage,
    handleLegacyTagMessage,
    loadLegacyTagNavigation,
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
    loadLegacyTagNavigation,
    getAllLegacyTagNames,
    getLegacyTagPage,
    buildTagPaginationEmbed,
    buildTagPaginationRow,
};

const moduleDefinition = {
    name: 'legacyTags',
    description: 'Read-only legacy tag system with paginated tag browser',
    register: async (client: any) => {
        // Message listener for %t and %tags
        client.on('messageCreate', async (message: any) => {
            try {
                await handleLegacyTagMessage(message);
            } catch (error) {
                logger.error(`Error in legacyTags message listener: ${error}`);
            }
        });

        // Slash command: /tags
        commandRegistry.register({
            name: 'tags',
            description: 'Browse all legacy tags in alphabetical order (paginated)',
            options: [
                {
                    name: 'page',
                    description: 'Page number to view (default: 1)',
                    type: 4, // INTEGER
                    required: false,
                },
            ],
            handler: async (interaction: any) => {
                const requestedPage = interaction.options?.getInteger?.('page') ?? 1;
                const pageData = getLegacyTagPage(requestedPage);
                const embed = buildTagPaginationEmbed(pageData);
                const row = buildTagPaginationRow(
                    pageData.currentPage,
                    pageData.totalPages,
                    interaction.user.id,
                );

                await interaction.reply({
                    embeds: [embed],
                    components: [row],
                });
            },
        });

        // Slash command alias: /legacy_tags
        commandRegistry.register({
            name: 'legacy_tags',
            description: 'Browse all legacy tags in alphabetical order (paginated)',
            options: [
                {
                    name: 'page',
                    description: 'Page number to view (default: 1)',
                    type: 4, // INTEGER
                    required: false,
                },
            ],
            handler: async (interaction: any) => {
                const requestedPage = interaction.options?.getInteger?.('page') ?? 1;
                const pageData = getLegacyTagPage(requestedPage);
                const embed = buildTagPaginationEmbed(pageData);
                const row = buildTagPaginationRow(
                    pageData.currentPage,
                    pageData.totalPages,
                    interaction.user.id,
                );

                await interaction.reply({
                    embeds: [embed],
                    components: [row],
                });
            },
        });

        // Button interaction listener for pagination
        client.on('interactionCreate', async (interaction: any) => {
            try {
                if (!interaction.isButton?.()) {
                    return;
                }

                const customId = interaction.customId ?? '';
                if (!customId.startsWith('legacy_tags:')) {
                    return;
                }

                const parts = customId.split(':');
                let targetPage = 1;
                let authorId = '';

                if (parts.length >= 4) {
                    targetPage = parseInt(parts[2], 10) || 1;
                    authorId = parts[3];
                } else if (parts.length === 3) {
                    targetPage = parseInt(parts[1], 10) || 1;
                    authorId = parts[2];
                }

                if (authorId && interaction.user.id !== authorId) {
                    await interaction.reply({
                        content: 'Meow! 🐾 Use `/tags` to open your own tag browser!',
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }

                const pageData = getLegacyTagPage(targetPage);
                const embed = buildTagPaginationEmbed(pageData);
                const row = buildTagPaginationRow(
                    pageData.currentPage,
                    pageData.totalPages,
                    authorId,
                );

                await interaction.update({
                    embeds: [embed],
                    components: [row],
                });
            } catch (error) {
                logger.error(`Error handling legacy tags pagination interaction: ${error}`);
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({
                        content: 'Failed to update tag page.',
                        flags: MessageFlags.Ephemeral,
                    });
                }
            }
        });
    },
};

export default moduleDefinition;
export const module = moduleDefinition;
