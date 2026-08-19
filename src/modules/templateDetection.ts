import {
    Colors,
    EmbedBuilder,
    type AnyThreadChannel,
    type ChatInputCommandInteraction,
} from 'discord.js';
import { commandRegistry } from '../commandRegistry';
import {
    buildTemplateModal,
    checkTemplateCoverage,
    handleThreadTemplate,
    MODPACK_VERSIONS,
    normalizeTemplateText,
    pasteTemplateToThread,
} from '../services/templateDetectionService';

export { normalizeTemplateText, checkTemplateCoverage };

const moduleDefinition = {
    name: 'templateDetection',
    description: 'Detects and warns about missing template fields and helps fill them out',
    register: async (client: any) => {
        commandRegistry.register({
            name: 'template_issue',
            description: 'Open a form to fill out an issue report template',
            handler: async (interaction: ChatInputCommandInteraction) => {
                const modal = buildTemplateModal('issue');
                await interaction.showModal(modal);
            },
        });

        commandRegistry.register({
            name: 'template_suggestion',
            description: 'Open a form to fill out a suggestion template',
            handler: async (interaction: ChatInputCommandInteraction) => {
                const modal = buildTemplateModal('suggestion');
                await interaction.showModal(modal);
            },
        });

        commandRegistry.register({
            name: 'list_modpack_versions',
            description: 'List the available modpack versions',
            handler: async (interaction: ChatInputCommandInteraction) => {
                const embed = new EmbedBuilder()
                    .setTitle('📦 Available Modpack Versions')
                    .setDescription('Here are the currently available modpack versions:')
                    .setColor(Colors.Blue);

                embed.addFields({
                    name: 'Versions',
                    value: MODPACK_VERSIONS.map((version) => `• ${version}`).join('\n'),
                });

                await interaction.reply({ embeds: [embed], ephemeral: true });
            },
        });

        client.on('threadCreate', (thread: AnyThreadChannel) => {
            void handleThreadTemplate(thread);
        });

        client.on('interactionCreate', async (interaction: any) => {
            if (!interaction.isModalSubmit()) {
                return;
            }

            if (interaction.customId === 'template_issue_submit') {
                await pasteTemplateToThread(interaction, 'issue');
                return;
            }

            if (interaction.customId === 'template_suggestion_submit') {
                await pasteTemplateToThread(interaction, 'suggestion');
            }
        });
    },
};

export default moduleDefinition;
export const module = moduleDefinition;
