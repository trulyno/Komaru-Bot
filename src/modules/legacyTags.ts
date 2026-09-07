import { MessageFlags } from 'discord.js';
import { commandRegistry } from '../commandRegistry';
import { config } from '../config';
import { logger } from '../logger';
import { BotModule } from '../moduleLoader';
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

const moduleDefinition: BotModule = {
    name: 'legacyTags',
    description: 'Read-only legacy tag system with paginated tag browser',
    help: {
        summary: 'Browsing and lookup for legacy tags',
        description:
            'Allows viewing and paginating through legacy community tags and invoking shortcuts using %t or %tags.',
        usage: '/tags [page] or %t <tag_name> or %tags',
        commands: [
            {
                name: 'tags',
                description: 'Browse all legacy tags in alphabetical order',
                usage: '/tags [page:number]',
            },
            {
                name: 'legacy_tags',
                description: 'Browse all legacy tags in alphabetical order',
                usage: '/legacy_tags [page:number]',
            },
        ],
        examples: ['/tags', '/tags page:2', '%t startech', '%tags'],
    },
    register: async (client: any) => {
        // Message listener for %t and %tags
        client.on('messageCreate', async (message: any) => {
            try {
                if (
                    !config.modules.isModuleEnabled(
                        'legacyTags',
                        message.guildId,
                        message.channelId,
                    )
                ) {
                    return;
                }
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

                if (
                    !config.modules.isModuleEnabled(
                        'legacyTags',
                        interaction.guildId,
                        interaction.channelId,
                    )
                ) {
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
