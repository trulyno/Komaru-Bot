import { Colors, EmbedBuilder } from 'discord.js';
import { commandRegistry } from '../commandRegistry';
import {
    GLOBAL_PREFIX_SCOPE,
    GithubPrefixStore,
    isValidPrefix,
    isValidRepository,
    normalizeRepository,
} from '../githubReferences/prefixStore';
import { logger } from '../logger';
import { config } from '../config';

interface GithubLabel {
    name: string;
    color?: string;
}

interface GithubIssue {
    body?: string | null;
    comments?: number;
    html_url: string;
    labels?: GithubLabel[];
    number: number;
    pull_request?: unknown;
    state: string;
    title: string;
    updated_at?: string;
    user?: {
        avatar_url?: string;
        login?: string;
    };
}

export interface GithubReference {
    number: number;
    repository: string;
}

const prefixStore = new GithubPrefixStore();
const MAX_REFERENCES_PER_MESSAGE = 5;
const MAX_DESCRIPTION_LENGTH = 3_500;

function truncate(value: string, maxLength: number): string {
    if (value.length <= maxLength) {
        return value;
    }
    return `${value.slice(0, maxLength - 3)}...`;
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function canManageGithubPrefixes(member: any): boolean {
    if (!member?.guild) {
        return false;
    }

    if (member.permissions?.has?.('Administrator')) {
        return true;
    }

    const configuredRoles = [
        config.env.moderationModeratorRoleId ??
            config.env.moderationModeratorRoleName ??
            'Moderator',
        config.env.moderationAdminRoleId ?? config.env.moderationAdminRoleName ?? 'Administrator',
    ];

    return member.roles?.cache?.some((role: any) => {
        return configuredRoles.some(
            (configuredRole) =>
                role.id === configuredRole ||
                role.name?.toLowerCase() === configuredRole.toLowerCase(),
        );
    });
}

export function findGithubReferences(
    content: string,
    guildId: string,
    store: Pick<GithubPrefixStore, 'listForGuild'> = prefixStore,
    maxReferences = MAX_REFERENCES_PER_MESSAGE,
): GithubReference[] {
    const references = new Map<string, { index: number; reference: GithubReference }>();
    const addReference = (repository: string, issueNumber: string, index: number): void => {
        const number = Number(issueNumber);
        const normalizedRepository = normalizeRepository(repository);
        const key = `${normalizedRepository.toLowerCase()}#${number}`;
        const existingReference = references.get(key);
        if (!existingReference || index < existingReference.index) {
            references.set(key, {
                index,
                reference: { repository: normalizedRepository, number },
            });
        }
    };

    const fullReferencePattern =
        /(?<![a-z0-9_./-])([a-z0-9_.-]+\/[a-z0-9_.-]+)#([1-9]\d*)(?![a-z0-9_])/gi;
    for (const match of content.matchAll(fullReferencePattern)) {
        addReference(match[1], match[2], match.index);
    }

    const aliases = store.listForGuild(guildId);
    for (const alias of aliases) {
        const aliasPattern = new RegExp(
            `(?<![a-z0-9_./-])(${escapeRegExp(alias.prefix)})#([1-9]\\d*)(?![a-z0-9_])`,
            'gi',
        );
        for (const match of content.matchAll(aliasPattern)) {
            addReference(alias.repository, match[2], match.index);
        }
    }

    return Array.from(references.values())
        .sort((left, right) => left.index - right.index)
        .slice(0, maxReferences)
        .map((entry) => entry.reference);
}

function isGithubIssue(value: unknown): value is GithubIssue {
    if (!value || typeof value !== 'object') {
        return false;
    }
    const issue = value as Partial<GithubIssue>;
    return (
        typeof issue.number === 'number' &&
        typeof issue.title === 'string' &&
        typeof issue.state === 'string' &&
        typeof issue.html_url === 'string'
    );
}

export async function fetchGithubIssue(
    repository: string,
    number: number,
): Promise<GithubIssue | null> {
    const response = await fetch(`https://api.github.com/repos/${repository}/issues/${number}`, {
        headers: {
            Accept: 'application/vnd.github+json',
            'User-Agent': 'Komaru-Bot',
            'X-GitHub-Api-Version': '2022-11-28',
        },
        signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
        logger.warn(`GitHub lookup failed for ${repository}#${number}: HTTP ${response.status}`);
        return null;
    }

    const issue: unknown = await response.json();
    if (!isGithubIssue(issue)) {
        logger.warn(`GitHub returned an unexpected response for ${repository}#${number}`);
        return null;
    }
    return issue;
}

export function buildGithubEmbed(repository: string, issue: GithubIssue): EmbedBuilder {
    const isPullRequest = Boolean(issue.pull_request);
    const type = isPullRequest ? 'Pull Request' : 'Issue';
    const state = issue.state.toLowerCase() === 'open' ? 'Open' : 'Closed';
    const labels = issue.labels?.map((label) => `\`${label.name}\``).join(' ') || 'None';
    const embed = new EmbedBuilder()
        .setTitle(truncate(`${type} #${issue.number}: ${issue.title}`, 256))
        .setURL(issue.html_url)
        .setColor(state === 'Open' ? Colors.Green : Colors.Red)
        .addFields(
            { name: 'Status', value: state, inline: true },
            { name: 'Author', value: issue.user?.login ?? 'Unknown', inline: true },
            { name: 'Comments', value: String(issue.comments ?? 0), inline: true },
            { name: 'Labels', value: truncate(labels, 1_024), inline: false },
        )
        .setFooter({ text: repository });

    const description = issue.body?.trim();
    if (description) {
        embed.setDescription(truncate(description, MAX_DESCRIPTION_LENGTH));
    }
    if (issue.user?.avatar_url) {
        embed.setThumbnail(issue.user.avatar_url);
    }
    if (issue.updated_at && !Number.isNaN(Date.parse(issue.updated_at))) {
        embed.setTimestamp(new Date(issue.updated_at));
    }

    return embed;
}

async function handleGithubReferences(message: any): Promise<void> {
    if (!message?.guild || message.author?.bot) {
        return;
    }

    const references = findGithubReferences(message.content ?? '', message.guild.id, prefixStore);
    for (const reference of references) {
        try {
            const issue = await fetchGithubIssue(reference.repository, reference.number);
            if (!issue) {
                continue;
            }
            await message.reply({
                embeds: [buildGithubEmbed(reference.repository, issue)],
                allowedMentions: { repliedUser: false },
            });
        } catch (error) {
            logger.warn(
                `GitHub lookup failed for ${reference.repository}#${reference.number}: ${String(error)}`,
            );
        }
    }
}

function hasGuildManagementPermission(interaction: any): boolean {
    return Boolean(interaction.guild && canManageGithubPrefixes(interaction.member));
}

function isMainGuild(guildId: string): boolean {
    return Boolean(config.env.discordGuildId && guildId === config.env.discordGuildId);
}

const moduleDefinition = {
    name: 'githubReferences',
    description: 'Embeds public GitHub issues and pull requests referenced in messages',
    register: async (client: any) => {
        commandRegistry.register({
            name: 'github_prefix_add',
            description: 'Add a GitHub repository prefix for this server',
            options: [
                { name: 'prefix', description: 'Prefix, such as myrepo', type: 3, required: true },
                {
                    name: 'repository',
                    description: 'Public GitHub repository, such as owner/repo',
                    type: 3,
                    required: true,
                },
                {
                    name: 'global',
                    description: 'Make this prefix available in every server',
                    type: 5,
                    required: false,
                },
            ],
            handler: async (interaction: any) => {
                if (!hasGuildManagementPermission(interaction)) {
                    await interaction.reply({
                        content: 'You do not have permission to manage GitHub prefixes.',
                        ephemeral: true,
                    });
                    return;
                }

                const prefix = interaction.options.getString('prefix', true);
                const repository = interaction.options.getString('repository', true);
                const global = interaction.options.getBoolean('global') ?? false;
                if (!isValidPrefix(prefix) || !isValidRepository(repository)) {
                    await interaction.reply({
                        content:
                            'Use a 1-64 character prefix containing letters, numbers, `_`, or `-`, and a repository in `owner/repo` form.',
                        ephemeral: true,
                    });
                    return;
                }

                if (global && !isMainGuild(interaction.guild.id)) {
                    await interaction.reply({
                        content:
                            'Global GitHub prefixes can only be managed in the configured main server.',
                        ephemeral: true,
                    });
                    return;
                }

                const scope = global ? GLOBAL_PREFIX_SCOPE : interaction.guild.id;
                if (!prefixStore.add(scope, prefix, repository)) {
                    await interaction.reply({
                        content: `The ${global ? 'global ' : ''}prefix \`${prefix}\` is already configured.`,
                        ephemeral: true,
                    });
                    return;
                }

                await interaction.reply({
                    content: `Added ${global ? 'global ' : ''}\`${prefix.toLowerCase()}#<number>\` for \`${repository}\`.`,
                    ephemeral: true,
                });
            },
        });

        commandRegistry.register({
            name: 'github_prefix_remove',
            description: 'Remove a GitHub repository prefix from this server',
            options: [
                { name: 'prefix', description: 'Prefix to remove', type: 3, required: true },
                {
                    name: 'global',
                    description: 'Remove a prefix available in every server',
                    type: 5,
                    required: false,
                },
            ],
            handler: async (interaction: any) => {
                if (!hasGuildManagementPermission(interaction)) {
                    await interaction.reply({
                        content: 'You do not have permission to manage GitHub prefixes.',
                        ephemeral: true,
                    });
                    return;
                }

                const prefix = interaction.options.getString('prefix', true);
                const global = interaction.options.getBoolean('global') ?? false;
                if (global && !isMainGuild(interaction.guild.id)) {
                    await interaction.reply({
                        content:
                            'Global GitHub prefixes can only be managed in the configured main server.',
                        ephemeral: true,
                    });
                    return;
                }

                const scope = global ? GLOBAL_PREFIX_SCOPE : interaction.guild.id;
                if (!prefixStore.remove(scope, prefix)) {
                    await interaction.reply({
                        content: `No ${global ? 'global ' : ''}GitHub prefix named \`${prefix}\` is configured.`,
                        ephemeral: true,
                    });
                    return;
                }

                await interaction.reply({
                    content: `Removed the ${global ? 'global ' : ''}GitHub prefix \`${prefix.toLowerCase()}\`.`,
                    ephemeral: true,
                });
            },
        });

        commandRegistry.register({
            name: 'github_prefix_list',
            description: 'List this server’s GitHub repository prefixes',
            handler: async (interaction: any) => {
                if (!hasGuildManagementPermission(interaction)) {
                    await interaction.reply({
                        content: 'You do not have permission to manage GitHub prefixes.',
                        ephemeral: true,
                    });
                    return;
                }

                const localPrefixes = prefixStore.list(interaction.guild.id);
                const globalPrefixes = prefixStore.list(GLOBAL_PREFIX_SCOPE);
                if (localPrefixes.length === 0 && globalPrefixes.length === 0) {
                    await interaction.reply({
                        content: 'No GitHub prefixes are configured for this server.',
                        ephemeral: true,
                    });
                    return;
                }

                const sections = [
                    localPrefixes.length > 0
                        ? `**This server**\n${localPrefixes.map((entry) => `\`${entry.prefix}\`-> \`${entry.repository}\``).join('\n')}`
                        : '',
                    globalPrefixes.length > 0
                        ? `**Global**\n${globalPrefixes.map((entry) => `\`${entry.prefix}\`-> \`${entry.repository}\``).join('\n')}`
                        : '',
                ].filter(Boolean);
                await interaction.reply({
                    content: `**GitHub prefixes**\n${truncate(sections.join('\n\n'), 1_900)}`,
                    ephemeral: true,
                });
            },
        });

        client.on('messageCreate', (message: any) => {
            void handleGithubReferences(message);
        });
    },
};

export default moduleDefinition;
export const module = moduleDefinition;
