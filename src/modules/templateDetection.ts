import {
    ActionRowBuilder,
    ChannelType,
    Colors,
    EmbedBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    type AnyThreadChannel,
    type ChatInputCommandInteraction,
    type ModalSubmitInteraction,
} from 'discord.js';
import { logger } from '../logger';
import { commandRegistry } from '../commandRegistry';

const ISSUE_TEMPLATE_FIELDS = [
    'modpack version',
    'is on server',
    'modifications done',
    'description',
];

const SUGGESTION_TEMPLATE_FIELDS = [
    'description',
    'how would it fit with start',
    'possible issues',
];

const MODPACK_VERSIONS = [
    'Theta 1 Hotfix 3',
    'Theta 1 Hotfix 2',
    'Theta 1 Hotfix 1',
    'Theta 1',
    'Eta 3 Hotfix 3',
    'Eta 3 Hotfix 2',
    'Eta 3 Hotfix 1',
    'Eta 3',
    'Eta 2 Hotfix 1',
    'Eta 2',
    'Eta Hotfix 3',
    'Eta Hotfix 2',
    'Eta Hotfix 1',
    'Eta',
    'Zeta Hotfix 5',
    'Zeta Hotfix 4',
    'Zeta Hotfix 3',
    'Zeta Hotfix 2',
    'Zeta Hotfix 1',
    'Zeta',
    'Epsilon Hotfix 4',
    'Epsilon Hotfix 3',
    'Epsilon Hotfix 2',
    'Epsilon Hotfix 1',
    'Epsilon',
    'Delta Hotfix 3',
    'Delta Hotfix 2',
    'Delta Hotfix 1',
    'Delta',
];

const DEFAULT_EXAMPLES = {
    modifications: 'Write here any additions you have made to the modpack',
    description: 'Describe your issue',
    suggestionTitle: '(Have a short title that will explain the general idea)',
    suggestionDescription: '(Describe in detail the suggestion)',
    suggestionFit: '(Explain why your idea will improve Star Technology)',
    suggestionIssues:
        '(List the possible issues that might arise from implementing your idea, if you can think of any)',
};

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function normalizeTemplateText(content: string): string {
    return content
        .replace(/```(?:\w+)?\s*([\s\S]*?)```/g, '$1')
        .replace(/[*_~`]/g, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .toLowerCase()
        .trim();
}

export function checkTemplateCoverage(
    content: string,
    templateFields: string[],
): [boolean, string[]] {
    const normalizedContent = normalizeTemplateText(content);
    const missingFields: string[] = [];

    for (const field of templateFields) {
        const pattern = new RegExp(`${escapeRegExp(field.toLowerCase())}\\s*[:：]`);
        if (!pattern.test(normalizedContent)) {
            missingFields.push(field);
        }
    }

    return [missingFields.length === 0, missingFields];
}

function buildIssueTemplate(values: Record<string, string>): string {
    const versionText = values.modpackVersion || 'Ex. Theta 1 Hotfix 3';
    const serverText = values.isOnServer || 'yes/no';
    const modificationsText = values.modifications || DEFAULT_EXAMPLES.modifications;
    const descriptionText = values.description || DEFAULT_EXAMPLES.description;

    return [
        `**Modpack version:** ${versionText}`,
        `**Is on server:** ${serverText}`,
        `**Modifications done:** ${modificationsText}`,
        `**Description:** ${descriptionText}`,
    ].join('\n');
}

function buildSuggestionTemplate(values: Record<string, string>): string {
    const descriptionText = values.description || DEFAULT_EXAMPLES.suggestionDescription;
    const fitText = values.fit || DEFAULT_EXAMPLES.suggestionFit;
    const issuesText = values.issues || DEFAULT_EXAMPLES.suggestionIssues;

    return [
        `**Description:** ${descriptionText}`,
        `**How would it fit with StarT:** ${fitText}`,
        `**Possible issues:** ${issuesText}`,
    ].join('\n');
}

function buildModal(templateType: 'issue' | 'suggestion'): ModalBuilder {
    const modal = new ModalBuilder()
        .setCustomId(`template_${templateType}_submit`)
        .setTitle(templateType === 'issue' ? 'Fill out issue report' : 'Fill out suggestion');

    if (templateType === 'issue') {
        const modpackVersionInput = new TextInputBuilder()
            .setCustomId('modpackVersion')
            .setLabel('Modpack version')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setPlaceholder('Ex. Zeta Hotfix 5');

        const serverInput = new TextInputBuilder()
            .setCustomId('isOnServer')
            .setLabel('Is on server')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setPlaceholder('yes/no');

        const modificationsInput = new TextInputBuilder()
            .setCustomId('modifications')
            .setLabel('Modifications done')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false)
            .setPlaceholder(DEFAULT_EXAMPLES.modifications);

        const descriptionInput = new TextInputBuilder()
            .setCustomId('description')
            .setLabel('Description')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false)
            .setPlaceholder(DEFAULT_EXAMPLES.description);

        modal.addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(modpackVersionInput),
            new ActionRowBuilder<TextInputBuilder>().addComponents(serverInput),
            new ActionRowBuilder<TextInputBuilder>().addComponents(modificationsInput),
            new ActionRowBuilder<TextInputBuilder>().addComponents(descriptionInput),
        );
    } else {
        const descriptionInput = new TextInputBuilder()
            .setCustomId('description')
            .setLabel('Description')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false)
            .setPlaceholder(DEFAULT_EXAMPLES.suggestionDescription);

        const fitInput = new TextInputBuilder()
            .setCustomId('fit')
            .setLabel('How would it fit with StarT')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false)
            .setPlaceholder(DEFAULT_EXAMPLES.suggestionFit);

        const issuesInput = new TextInputBuilder()
            .setCustomId('issues')
            .setLabel('Possible issues')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false)
            .setPlaceholder(DEFAULT_EXAMPLES.suggestionIssues);

        modal.addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(descriptionInput),
            new ActionRowBuilder<TextInputBuilder>().addComponents(fitInput),
            new ActionRowBuilder<TextInputBuilder>().addComponents(issuesInput),
        );
    }

    return modal;
}

function getFieldValues(interaction: ModalSubmitInteraction): Record<string, string> {
    return {
        modpackVersion: interaction.fields.getTextInputValue('modpackVersion').trim(),
        isOnServer: interaction.fields.getTextInputValue('isOnServer').trim(),
        modifications: interaction.fields.getTextInputValue('modifications').trim(),
        description: interaction.fields.getTextInputValue('description').trim(),
        fit: interaction.fields.getTextInputValue('fit').trim(),
        issues: interaction.fields.getTextInputValue('issues').trim(),
    };
}

async function removeInvalidTagsFromThread(thread: AnyThreadChannel): Promise<void> {
    const configuredTags = (
        process.env.TEMPLATE_INVALID_TAGS ?? 'invalid,needs template,template missing'
    )
        .split(',')
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean);

    if (configuredTags.length === 0 || thread.parent?.type !== ChannelType.GuildForum) {
        return;
    }

    const parentForum = thread.parent;
    const availableTags = parentForum.availableTags ?? [];
    const currentTagIds = thread.appliedTags ?? [];
    const tagsToRemove = currentTagIds.filter((tagId) => {
        const tag = availableTags.find((availableTag) => availableTag.id === tagId);
        return Boolean(tag && configuredTags.includes(tag.name.toLowerCase()));
    });

    if (tagsToRemove.length > 0) {
        await thread.setAppliedTags(currentTagIds.filter((tagId) => !tagsToRemove.includes(tagId)));
    }
}

async function pasteTemplateToThread(
    interaction: ModalSubmitInteraction,
    templateType: 'issue' | 'suggestion',
): Promise<void> {
    const values = getFieldValues(interaction);
    const formattedMessage =
        templateType === 'issue' ? buildIssueTemplate(values) : buildSuggestionTemplate(values);

    if (interaction.channel && interaction.channel.isThread()) {
        await interaction.channel.send({ content: formattedMessage });
        await removeInvalidTagsFromThread(interaction.channel);
        await interaction.reply({
            content: 'Posted your filled template into this thread.',
            ephemeral: true,
        });
        return;
    }

    await interaction.reply({ content: formattedMessage, ephemeral: false });
}

async function handleThreadTemplate(thread: AnyThreadChannel): Promise<void> {
    if (!thread.parent || thread.parent.type !== ChannelType.GuildForum) {
        return;
    }

    const issueReportingChannelId = process.env.ISSUE_REPORTING_CHANNEL_ID;
    const suggestionsChannelId = process.env.SUGGESTIONS_CHANNEL_ID;
    if (!issueReportingChannelId && !suggestionsChannelId) {
        return;
    }

    const isIssueThread = issueReportingChannelId && thread.parent.id === issueReportingChannelId;
    const isSuggestionThread = suggestionsChannelId && thread.parent.id === suggestionsChannelId;
    if (!isIssueThread && !isSuggestionThread) {
        return;
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));

    try {
        const history = await thread.messages.fetch({ limit: 10 });
        const firstMessage = [...history.values()].find((message) => !message.author.bot);
        if (!firstMessage) {
            return;
        }

        const [isComplete, missingFields] = checkTemplateCoverage(
            firstMessage.content,
            isIssueThread ? ISSUE_TEMPLATE_FIELDS : SUGGESTION_TEMPLATE_FIELDS,
        );

        if (isComplete) {
            return;
        }

        const embed = new EmbedBuilder()
            .setTitle('⚠️ Template Missing or Incomplete')
            .setDescription(
                `Your ${isIssueThread ? 'issue reporting' : 'suggestion'} post appears to be missing some required template fields.`,
            )
            .setColor(Colors.Orange);

        if (missingFields.length > 0) {
            embed.addFields({
                name: 'Missing Fields',
                value: missingFields.map((field) => `• ${field}`).join('\n'),
            });
        }

        embed.addFields({
            name: 'Need Help?',
            value: `Use /template_${isIssueThread ? 'issue' : 'suggestion'} to open a form and fill it out.`,
        });

        await thread.send({ embeds: [embed] });
    } catch (error) {
        logger.error(`Error checking template in thread ${thread.id}: ${error}`);
    }
}

const moduleDefinition = {
    name: 'templateDetection',
    description: 'Detects and warns about missing template fields and helps fill them out',
    register: async (client: any) => {
        commandRegistry.register({
            name: 'template_issue',
            description: 'Open a form to fill out an issue report template',
            handler: async (interaction: ChatInputCommandInteraction) => {
                const modal = buildModal('issue');
                await interaction.showModal(modal);
            },
        });

        commandRegistry.register({
            name: 'template_suggestion',
            description: 'Open a form to fill out a suggestion template',
            handler: async (interaction: ChatInputCommandInteraction) => {
                const modal = buildModal('suggestion');
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
