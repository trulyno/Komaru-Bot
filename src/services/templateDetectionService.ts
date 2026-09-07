import {
    ActionRowBuilder,
    ChannelType,
    Colors,
    EmbedBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    type AnyThreadChannel,
    type ModalSubmitInteraction,
} from 'discord.js';
import { logger } from '../logger';
import { config } from '../config';

export const ISSUE_TEMPLATE_FIELDS = config.templates.issueTemplateFields;
export const SUGGESTION_TEMPLATE_FIELDS = config.templates.suggestionTemplateFields;
export const MODPACK_VERSIONS = config.templates.modpackVersions;
export const DEFAULT_EXAMPLES = config.templates.defaultExamples;

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

export function buildIssueTemplate(values: Record<string, string>): string {
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

export function buildSuggestionTemplate(values: Record<string, string>): string {
    const descriptionText = values.description || DEFAULT_EXAMPLES.suggestionDescription;
    const fitText = values.fit || DEFAULT_EXAMPLES.suggestionFit;
    const issuesText = values.issues || DEFAULT_EXAMPLES.suggestionIssues;

    return [
        `**Description:** ${descriptionText}`,
        `**How would it fit with StarT:** ${fitText}`,
        `**Possible issues:** ${issuesText}`,
    ].join('\n');
}

export function buildTemplateModal(templateType: 'issue' | 'suggestion'): ModalBuilder {
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

export function getFieldValues(interaction: ModalSubmitInteraction): Record<string, string> {
    const getSafe = (customId: string) => {
        try {
            return interaction.fields.getTextInputValue(customId).trim();
        } catch {
            return '';
        }
    };

    return {
        modpackVersion: getSafe('modpackVersion'),
        isOnServer: getSafe('isOnServer'),
        modifications: getSafe('modifications'),
        description: getSafe('description'),
        fit: getSafe('fit'),
        issues: getSafe('issues'),
    };
}

export async function removeInvalidTagsFromThread(thread: AnyThreadChannel): Promise<void> {
    const configuredTags = config.env.templateInvalidTags;

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

export async function pasteTemplateToThread(
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

export async function handleThreadTemplate(thread: AnyThreadChannel): Promise<void> {
    if (!thread.parent || thread.parent.type !== ChannelType.GuildForum) {
        return;
    }

    const issueReportingChannelId = config.env.issueReportingChannelId;
    const suggestionsChannelId = config.env.suggestionsChannelId;
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
                `Your ${isIssueThread ? 'issue reporting' : 'suggestion'} post appears to be missing some required template fields. ${isIssueThread ? 'Without the template, your issue report might not contain all the necessary information about how we could fix this issue or help you.' : "If you don't follow the template, your post might be ignored."}`,
            )
            .setColor(Colors.Red);

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
