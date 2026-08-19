import fs from 'node:fs';
import path from 'node:path';
import { logger } from '../logger';

interface LegacyTagEntry {
    owner?: number;
    file?: string;
    aliases?: string[];
    type?: string;
    param_count?: number;
}

interface LegacyTagStorageEntry {
    content?: string;
    media_files?: string[];
    created_at?: string;
}

interface LegacyTagStorageFile {
    tags?: Record<string, LegacyTagStorageEntry>;
}

interface LegacyTagNavigationFile {
    tags?: Record<string, LegacyTagEntry>;
    aliases?: Record<string, string>;
}

async function safeReply(message: any, options: any): Promise<void> {
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

const moduleDefinition = {
    name: 'legacyTags',
    description: 'Read-only legacy tag system',
    register: async (client: any) => {
        client.on('messageCreate', async (message: any) => {
            if (!message || message.author?.bot) {
                return;
            }

            const content = message.content?.trim();
            if (!content || !/^%t(?:\s|$)/i.test(content)) {
                return;
            }

            try {
                const body = content.replace(/^%t/i, '').trim();
                if (!body) {
                    await safeReply(message, 'Usage: `%t <tag_name_or_alias>`');
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

                const tagName = parts[0];
                const response = await resolveAndReplyTag(tagName, message);
                if (!response) {
                    await safeReply(message, `Tag **${tagName}** was not found.`);
                }
            } catch (error) {
                logger.error(`Error handling legacy tag lookup: ${error}`);
                await safeReply(message, 'Unable to retrieve that legacy tag right now.');
            }
        });
    },
};

async function resolveAndReplyTag(tagName: string, message: any): Promise<boolean> {
    const navigationPath = path.resolve(process.cwd(), 'data', 'tag_navigation.json');
    const storageDir = path.resolve(process.cwd(), 'data', 'legacy_tags', 'tag_storage');
    const mediaDir = path.resolve(process.cwd(), 'data', 'legacy_tags', 'tag_media');

    if (!fs.existsSync(navigationPath)) {
        return false;
    }

    const navigation = JSON.parse(
        fs.readFileSync(navigationPath, 'utf8'),
    ) as LegacyTagNavigationFile;
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
        await safeReply(message, 'Logic tags are not supported in this read-only legacy tag system.');
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

function buildAliasIndex(navigation: LegacyTagNavigationFile): Map<string, string> {
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

function resolveCanonicalTagName(
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

function normalizeTagName(value: string): string {
    return value.trim().toLowerCase();
}

export default moduleDefinition;
export const module = moduleDefinition;
