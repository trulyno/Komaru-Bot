import { ActionRowBuilder, ButtonBuilder, ButtonStyle, Colors, EmbedBuilder } from 'discord.js';
import fs from 'node:fs';
import path from 'node:path';
import { logger } from '../logger';

export interface LegacyTagEntry {
    owner?: number;
    file?: string;
    aliases?: string[];
    type?: string;
    param_count?: number;
}

export interface LegacyTagStorageEntry {
    content?: string;
    media_files?: string[];
    created_at?: string;
}

export interface LegacyTagStorageFile {
    tags?: Record<string, LegacyTagStorageEntry>;
}

export interface LegacyTagNavigationFile {
    tags?: Record<string, LegacyTagEntry>;
    aliases?: Record<string, string>;
}

export interface LegacyTagItem {
    name: string;
    aliases: string[];
}

export interface LegacyTagPageData {
    tags: LegacyTagItem[];
    currentPage: number;
    totalPages: number;
    totalTags: number;
    pageSize: number;
}

export async function safeReply(message: any, options: any): Promise<void> {
    try {
        await message.reply(options);
    } catch (error) {
        try {
            if (message.channel?.send) {
                const payload = typeof options === 'string' ? { content: options } : options;
                await message.channel.send(payload);
            }
        } catch (channelError) {
            logger.warn(`Failed to send fallback message response: ${channelError}`);
        }
    }
}

export function normalizeTagName(value: string): string {
    return value.trim().toLowerCase();
}

export function buildAliasIndex(navigation: LegacyTagNavigationFile): Map<string, string> {
    const aliases = new Map<string, string>();

    for (const [name, entry] of Object.entries(navigation.tags ?? {})) {
        const normalizedName = normalizeTagName(name);
        aliases.set(normalizedName, name);
        for (const alias of entry.aliases ?? []) {
            aliases.set(normalizeTagName(alias), name);
        }
    }

    for (const [alias, target] of Object.entries(navigation.aliases ?? {})) {
        aliases.set(normalizeTagName(alias), normalizeTagName(target));
    }

    return aliases;
}

export function resolveCanonicalTagName(
    tagName: string,
    navigation: LegacyTagNavigationFile,
    aliasIndex: Map<string, string>,
): string | null {
    const normalized = normalizeTagName(tagName);
    if (!normalized) {
        return null;
    }

    const directMatch = Object.keys(navigation.tags ?? {}).find(
        (name) => normalizeTagName(name) === normalized,
    );
    if (directMatch) {
        return directMatch;
    }

    const aliased = aliasIndex.get(normalized);
    if (aliased) {
        return navigation.tags?.[aliased] ? aliased : aliased;
    }

    return null;
}

export function loadLegacyTagNavigation(customPath?: string): LegacyTagNavigationFile {
    const navigationPath = customPath ?? path.resolve(process.cwd(), 'data', 'tag_navigation.json');
    if (!fs.existsSync(navigationPath)) {
        return { tags: {}, aliases: {} };
    }
    try {
        return JSON.parse(fs.readFileSync(navigationPath, 'utf8')) as LegacyTagNavigationFile;
    } catch (error) {
        logger.error(`Failed to load legacy tag navigation file: ${error}`);
        return { tags: {}, aliases: {} };
    }
}

export function getAllLegacyTagNames(navigation?: LegacyTagNavigationFile): string[] {
    const nav = navigation ?? loadLegacyTagNavigation();
    const tagNames = Object.keys(nav.tags ?? {});
    return tagNames.sort(
        (a, b) =>
            a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }) ||
            a.localeCompare(b),
    );
}

export function getLegacyTagPage(
    page: number = 1,
    pageSize: number = 20,
    navigation?: LegacyTagNavigationFile,
): LegacyTagPageData {
    const nav = navigation ?? loadLegacyTagNavigation();
    const allTagNames = getAllLegacyTagNames(nav);

    const totalTags = allTagNames.length;
    const totalPages = Math.max(1, Math.ceil(totalTags / pageSize));
    const currentPage = Math.max(1, Math.min(totalPages, page));

    const startIndex = (currentPage - 1) * pageSize;
    const pageTagNames = allTagNames.slice(startIndex, startIndex + pageSize);

    const topLevelAliasesByTarget = new Map<string, string[]>();
    for (const [alias, target] of Object.entries(nav.aliases ?? {})) {
        const canonical = normalizeTagName(target);
        if (!topLevelAliasesByTarget.has(canonical)) {
            topLevelAliasesByTarget.set(canonical, []);
        }
        topLevelAliasesByTarget.get(canonical)!.push(alias);
    }

    const tags: LegacyTagItem[] = pageTagNames.map((name) => {
        const entry = nav.tags?.[name];
        const aliasesSet = new Set<string>();

        for (const a of entry?.aliases ?? []) {
            if (a && a.toLowerCase() !== name.toLowerCase()) {
                aliasesSet.add(a);
            }
        }

        const topAliases = topLevelAliasesByTarget.get(normalizeTagName(name)) ?? [];
        for (const a of topAliases) {
            if (a && a.toLowerCase() !== name.toLowerCase()) {
                aliasesSet.add(a);
            }
        }

        return {
            name,
            aliases: Array.from(aliasesSet).sort((a, b) => a.localeCompare(b)),
        };
    });

    return {
        tags,
        currentPage,
        totalPages,
        totalTags,
        pageSize,
    };
}

export function buildTagPaginationEmbed(pageData: LegacyTagPageData): EmbedBuilder {
    const { tags, currentPage, totalPages, totalTags } = pageData;

    const embed = new EmbedBuilder()
        .setTitle('🏷️ Legacy Tags Directory')
        .setColor(Colors.Blurple)
        .setFooter({
            text: `Page ${currentPage} of ${totalPages} • Total: ${totalTags} tags • %t <tag>`,
        })
        .setTimestamp();

    if (tags.length === 0) {
        embed.setDescription('No legacy tags found.');
        return embed;
    }

    const lines = tags.map((t) => {
        const aliasText =
            t.aliases && t.aliases.length > 0
                ? ` *(aliases: ${t.aliases.map((a) => `\`${a}\``).join(', ')})*`
                : '';
        return `• \`${t.name}\`${aliasText}`;
    });

    embed.setDescription(
        `Browse all legacy tags in alphabetical order.\nUse \`%t <tag>\` to display any tag.\n\n` +
            lines.join('\n'),
    );

    return embed;
}

export function buildTagPaginationRow(
    currentPage: number,
    totalPages: number,
    authorId?: string,
): ActionRowBuilder<ButtonBuilder> {
    const userId = authorId ?? '';
    const firstButton = new ButtonBuilder()
        .setCustomId(`legacy_tags:first:1:${userId}`)
        .setLabel('First')
        .setEmoji('⏮️')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage <= 1);

    const prevButton = new ButtonBuilder()
        .setCustomId(`legacy_tags:prev:${Math.max(1, currentPage - 1)}:${userId}`)
        .setLabel('Previous')
        .setEmoji('◀️')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(currentPage <= 1);

    const nextButton = new ButtonBuilder()
        .setCustomId(`legacy_tags:next:${Math.min(totalPages, currentPage + 1)}:${userId}`)
        .setLabel('Next')
        .setEmoji('▶️')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(currentPage >= totalPages);

    const lastButton = new ButtonBuilder()
        .setCustomId(`legacy_tags:last:${totalPages}:${userId}`)
        .setLabel('Last')
        .setEmoji('⏭️')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage >= totalPages);

    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        firstButton,
        prevButton,
        nextButton,
        lastButton,
    );
}

export async function resolveAndReplyTag(tagName: string, message: any): Promise<boolean> {
    const navigationPath = path.resolve(process.cwd(), 'data', 'tag_navigation.json');
    const storageDir = path.resolve(process.cwd(), 'data', 'legacy_tags', 'tag_storage');
    const mediaDir = path.resolve(process.cwd(), 'data', 'legacy_tags', 'tag_media');

    if (!fs.existsSync(navigationPath)) {
        return false;
    }

    const navigation = loadLegacyTagNavigation(navigationPath);
    const aliasIndex = buildAliasIndex(navigation);
    const canonicalName = resolveCanonicalTagName(tagName, navigation, aliasIndex);

    if (!canonicalName) {
        return false;
    }

    const entry = navigation.tags?.[canonicalName];
    if (!entry) {
        return false;
    }

    if (entry.type?.toLowerCase() === 'logic') {
        await safeReply(
            message,
            'Logic tags are not supported in this read-only legacy tag system.',
        );
        return true;
    }

    const storageFile = entry.file ? path.resolve(storageDir, entry.file) : null;
    if (!storageFile || !fs.existsSync(storageFile)) {
        return false;
    }

    const storage = JSON.parse(fs.readFileSync(storageFile, 'utf8')) as LegacyTagStorageFile;
    const normalizedTagKey = canonicalName.toLowerCase();
    const storedTag = Object.entries(storage.tags ?? {}).find(
        ([name]) => name.toLowerCase() === normalizedTagKey,
    )?.[1];

    if (!storedTag) {
        return false;
    }

    const content = (storedTag.content ?? '').trim();
    const mediaFiles = (storedTag.media_files ?? []).filter((value): value is string =>
        Boolean(value),
    );
    const attachments = mediaFiles
        .map((fileName) => path.resolve(mediaDir, fileName))
        .filter((filePath) => fs.existsSync(filePath));

    if (content && attachments.length > 0) {
        await safeReply(message, {
            content: content,
            files: attachments,
        });
    } else if (content) {
        await safeReply(message, content);
    } else if (attachments.length > 0) {
        await safeReply(message, {
            content: '',
            files: attachments,
        });
    } else {
        await safeReply(message, `Tag **${canonicalName}** exists but has no content or media.`);
    }

    return true;
}

export async function handleLegacyTagMessage(message: any): Promise<void> {
    if (!message || message.author?.bot) {
        return;
    }

    const content = message.content?.trim();
    if (!content) {
        return;
    }

    // Direct %tags or %taglist command
    if (/^%(?:tags|taglist)(?:\s|$)/i.test(content)) {
        try {
            const arg = content.replace(/^%(?:tags|taglist)/i, '').trim();
            const requestedPage = parseInt(arg, 10) || 1;
            const pageData = getLegacyTagPage(requestedPage);
            const embed = buildTagPaginationEmbed(pageData);
            const row = buildTagPaginationRow(
                pageData.currentPage,
                pageData.totalPages,
                message.author?.id,
            );
            await safeReply(message, { embeds: [embed], components: [row] });
        } catch (error) {
            logger.error(`Error displaying legacy tags directory: ${error}`);
            await safeReply(message, 'Unable to retrieve the tag directory right now.');
        }
        return;
    }

    if (!/^%t(?:\s|$)/i.test(content)) {
        return;
    }

    try {
        const body = content.replace(/^%t/i, '').trim();
        if (!body) {
            await safeReply(message, 'Usage: `%t <tag_name_or_alias>` or `%tags`');
            return;
        }

        const parts = body.split(/\s+/);
        const command = parts[0]?.toLowerCase();

        if (command === 'create') {
            await safeReply(
                message,
                'Tags are read-only in this bot. Please use the command system to create new commands instead.',
            );
            return;
        }

        if (command === 'all' || command === 'tags' || command === 'all_tags') {
            const requestedPage = parts[1] ? parseInt(parts[1], 10) || 1 : 1;
            const pageData = getLegacyTagPage(requestedPage);
            const embed = buildTagPaginationEmbed(pageData);
            const row = buildTagPaginationRow(
                pageData.currentPage,
                pageData.totalPages,
                message.author?.id,
            );
            await safeReply(message, { embeds: [embed], components: [row] });
            return;
        }

        const tagName = parts[0];
        const response = await resolveAndReplyTag(tagName, message);
        if (!response) {
            await safeReply(message, `Tag **${tagName}** was not found.`);
        }
    } catch (error) {
        logger.error(`Error handling legacy tag lookup: ${error}`);
        await safeReply(message, 'Unable to retrieve that legacy tag right now.');
    }
}
