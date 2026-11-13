import fs from 'node:fs';
import path from 'node:path';
import { logger } from '../logger';
import {
    buildAliasIndex,
    LegacyTagEntry,
    LegacyTagNavigationFile,
    LegacyTagStorageFile,
    loadLegacyTagNavigation,
    resolveCanonicalTagName,
} from '../services/legacyTagService';
import { UserCommandStorage } from './storage';
import { TriggerPool } from './triggerPool';
import { UserCommandAction, UserCommandJson, UserCommandTrigger } from './types';

export interface TagConversionOptions {
    tag?: string;
    overwrite?: boolean;
    category?: string;
    navigationPath?: string;
    legacyStorageDir?: string;
    legacyMediaDir?: string;
    userCommandsStorage?: UserCommandStorage;
    triggerPool?: TriggerPool;
}

export interface TagConversionDetail {
    name: string;
    status: 'converted' | 'overwritten' | 'skipped' | 'error';
    reason?: string;
    mediaCount?: number;
    aliasesCount?: number;
}

export interface TagConversionResult {
    totalScanned: number;
    converted: number;
    overwritten: number;
    skipped: number;
    errors: number;
    details: TagConversionDetail[];
}

export function collectTagAliases(
    tagName: string,
    entry: LegacyTagEntry,
    navigation: LegacyTagNavigationFile,
): string[] {
    const aliasSet = new Set<string>();
    const normalizedName = tagName.trim().toLowerCase();

    for (const a of entry.aliases ?? []) {
        if (a && a.trim().toLowerCase() !== normalizedName) {
            aliasSet.add(a.trim());
        }
    }

    for (const [alias, target] of Object.entries(navigation.aliases ?? {})) {
        if (target && target.trim().toLowerCase() === normalizedName) {
            if (alias && alias.trim().toLowerCase() !== normalizedName) {
                aliasSet.add(alias.trim());
            }
        }
    }

    return Array.from(aliasSet).sort((a, b) => a.localeCompare(b));
}

export function buildCommandRawContent(
    name: string,
    description: string,
    triggerValue: string,
    aliases: string[],
    content?: string,
    mediaCount: number = 0,
): string {
    const lines: string[] = [];
    lines.push(`name "${name}"`);
    lines.push(`description "${description}"`);
    if (aliases.length > 0) {
        const aliasList = aliases.map((a) => `"${a}"`).join(', ');
        lines.push(`alias ${aliasList}`);
    }
    lines.push(`when someone says "${triggerValue}"`);

    if (content) {
        const safeContent = content.includes('"""') ? content.replace(/"""/g, '"\\""') : content;
        lines.push(`you reply """${safeContent}"""`);
    }

    for (let i = 1; i <= mediaCount; i++) {
        lines.push(`you send &${i}`);
    }

    if (!content && mediaCount === 0) {
        lines.push(`you reply "Tag **${name}** exists but has no content or media."`);
    }

    return lines.join('\n');
}

export async function convertLegacyTags(
    options: TagConversionOptions = {},
): Promise<TagConversionResult> {
    const navigationPath =
        options.navigationPath ?? path.resolve(process.cwd(), 'data', 'tag_navigation.json');
    const legacyStorageDir =
        options.legacyStorageDir ??
        path.resolve(process.cwd(), 'data', 'legacy_tags', 'tag_storage');
    const legacyMediaDir =
        options.legacyMediaDir ?? path.resolve(process.cwd(), 'data', 'legacy_tags', 'tag_media');

    const storage = options.userCommandsStorage ?? new UserCommandStorage();
    const triggerPool = options.triggerPool;
    const overwrite = options.overwrite ?? false;
    const category = options.category ?? 'General';

    const result: TagConversionResult = {
        totalScanned: 0,
        converted: 0,
        overwritten: 0,
        skipped: 0,
        errors: 0,
        details: [],
    };

    if (!fs.existsSync(navigationPath)) {
        result.errors = 1;
        result.details.push({
            name: options.tag ?? 'all',
            status: 'error',
            reason: `Navigation file not found at ${navigationPath}`,
        });
        return result;
    }

    const navigation = loadLegacyTagNavigation(navigationPath);
    const aliasIndex = buildAliasIndex(navigation);

    let targetTagNames: string[] = [];

    if (options.tag && options.tag.trim().toLowerCase() !== 'all') {
        const canonical = resolveCanonicalTagName(options.tag, navigation, aliasIndex);
        if (!canonical) {
            result.totalScanned = 1;
            result.errors = 1;
            result.details.push({
                name: options.tag,
                status: 'error',
                reason: `Tag "${options.tag}" was not found in legacy tags navigation.`,
            });
            return result;
        }
        targetTagNames = [canonical];
    } else {
        targetTagNames = Object.keys(navigation.tags ?? {});
    }

    result.totalScanned = targetTagNames.length;
    const storageCache = new Map<string, LegacyTagStorageFile>();

    for (const tagName of targetTagNames) {
        try {
            const entry = navigation.tags?.[tagName];
            if (!entry) {
                result.errors++;
                result.details.push({
                    name: tagName,
                    status: 'error',
                    reason: `No entry found in navigation tags for "${tagName}".`,
                });
                continue;
            }

            const existingCmd = storage.getCommand(tagName);
            const isOverwrite = Boolean(existingCmd);

            if (isOverwrite && !overwrite) {
                result.skipped++;
                result.details.push({
                    name: tagName,
                    status: 'skipped',
                    reason: `Command "${tagName}" already exists. Use overwrite option to replace.`,
                });
                continue;
            }

            const aliases = collectTagAliases(tagName, entry, navigation);
            const dummyTrigger: UserCommandTrigger = {
                type: 'string',
                value: tagName,
                scope: 'everyone',
            };

            if (triggerPool) {
                const conflict = triggerPool.findConflictingCommand(dummyTrigger, aliases, tagName);
                if (conflict && conflict.metadata.name.toLowerCase() !== tagName.toLowerCase()) {
                    if (!overwrite) {
                        result.skipped++;
                        result.details.push({
                            name: tagName,
                            status: 'skipped',
                            reason: `Trigger or alias conflicts with existing command "${conflict.metadata.name}".`,
                        });
                        continue;
                    } else {
                        storage.deleteCommand(conflict.metadata.name);
                        triggerPool.unregisterCommand(conflict.metadata.name);
                    }
                }
            }

            let authorId = '0';
            if (entry.file) {
                const match = entry.file.match(/user_(\d+)\.json/i);
                if (match) {
                    authorId = match[1];
                }
            }
            if (authorId === '0' && entry.owner) {
                authorId = String(entry.owner);
            }

            if (entry.type?.toLowerCase() === 'logic') {
                const content = 'Logic tags are not supported in this read-only legacy tag system.';
                const rawContent = buildCommandRawContent(
                    tagName,
                    `Legacy tag: ${tagName}`,
                    tagName,
                    aliases,
                    content,
                    0,
                );
                const storageUsed = Buffer.byteLength(rawContent, 'utf-8');
                const cmdJson: UserCommandJson = {
                    metadata: {
                        author: authorId,
                        storage_used: storageUsed,
                        creation_date: new Date().toISOString(),
                        name: tagName,
                        description: `Legacy tag: ${tagName}`,
                        category,
                        raw: `${tagName}.md`,
                        cooldown: 5,
                        enabled: true,
                    },
                    media: {},
                    trigger: {
                        type: 'string',
                        value: tagName,
                        scope: 'everyone',
                    },
                    actions: [{ type: 'reply', value: content }],
                    aliases: aliases.length > 0 ? aliases : undefined,
                };

                storage.saveCommand(cmdJson, rawContent);
                if (triggerPool) {
                    triggerPool.registerCommand(cmdJson);
                }

                if (isOverwrite) {
                    result.overwritten++;
                    result.details.push({
                        name: tagName,
                        status: 'overwritten',
                        aliasesCount: aliases.length,
                        mediaCount: 0,
                    });
                } else {
                    result.converted++;
                    result.details.push({
                        name: tagName,
                        status: 'converted',
                        aliasesCount: aliases.length,
                        mediaCount: 0,
                    });
                }
                continue;
            }

            const storageFile = entry.file ? path.resolve(legacyStorageDir, entry.file) : null;
            if (!storageFile || !fs.existsSync(storageFile)) {
                result.errors++;
                result.details.push({
                    name: tagName,
                    status: 'error',
                    reason: `Storage file "${entry.file}" does not exist.`,
                });
                continue;
            }

            let storageData = storageCache.get(storageFile);
            if (!storageData) {
                try {
                    storageData = JSON.parse(
                        fs.readFileSync(storageFile, 'utf-8'),
                    ) as LegacyTagStorageFile;
                    storageCache.set(storageFile, storageData);
                } catch (readErr) {
                    result.errors++;
                    result.details.push({
                        name: tagName,
                        status: 'error',
                        reason: `Failed to read storage file: ${readErr}`,
                    });
                    continue;
                }
            }

            const normalizedTagKey = tagName.toLowerCase();
            const storedTag = Object.entries(storageData.tags ?? {}).find(
                ([name]) => name.toLowerCase() === normalizedTagKey,
            )?.[1];

            if (!storedTag) {
                result.errors++;
                result.details.push({
                    name: tagName,
                    status: 'error',
                    reason: `Tag "${tagName}" not found in storage file "${entry.file}".`,
                });
                continue;
            }

            const content = (storedTag.content ?? '').trim();
            const mediaFileNames = (storedTag.media_files ?? []).filter(Boolean) as string[];

            const mediaBuffers: Array<{ filename: string; buffer: Buffer }> = [];
            for (const mf of mediaFileNames) {
                const mfPath = path.resolve(legacyMediaDir, mf);
                if (fs.existsSync(mfPath)) {
                    try {
                        const buffer = fs.readFileSync(mfPath);
                        mediaBuffers.push({ filename: mf, buffer });
                    } catch (mErr) {
                        logger.warn(`Failed to read legacy media file ${mfPath}: ${mErr}`);
                    }
                } else {
                    logger.warn(`Legacy media file ${mf} does not exist at ${mfPath}`);
                }
            }

            const actions: UserCommandAction[] = [];
            if (content) {
                actions.push({
                    type: 'reply',
                    value: content,
                });
            }

            for (let i = 1; i <= mediaBuffers.length; i++) {
                actions.push({
                    type: 'send',
                    value: `&${i}`,
                });
            }

            if (!content && mediaBuffers.length === 0) {
                actions.push({
                    type: 'reply',
                    value: `Tag **${tagName}** exists but has no content or media.`,
                });
            }

            const rawContent = buildCommandRawContent(
                tagName,
                `Legacy tag: ${tagName}`,
                tagName,
                aliases,
                content,
                mediaBuffers.length,
            );

            const storageUsed = Buffer.byteLength(rawContent, 'utf-8');
            const creationDate = storedTag.created_at || new Date().toISOString();

            const cmdJson: UserCommandJson = {
                metadata: {
                    author: authorId,
                    storage_used: storageUsed,
                    creation_date: creationDate,
                    name: tagName,
                    description: `Legacy tag: ${tagName}`,
                    category,
                    raw: `${tagName}.md`,
                    cooldown: 5,
                    enabled: true,
                },
                media: {},
                trigger: {
                    type: 'string',
                    value: tagName,
                    scope: 'everyone',
                },
                actions,
                aliases: aliases.length > 0 ? aliases : undefined,
            };

            storage.saveCommand(cmdJson, rawContent, mediaBuffers);

            if (triggerPool) {
                triggerPool.registerCommand(cmdJson);
            }

            if (isOverwrite) {
                result.overwritten++;
                result.details.push({
                    name: tagName,
                    status: 'overwritten',
                    aliasesCount: aliases.length,
                    mediaCount: mediaBuffers.length,
                });
            } else {
                result.converted++;
                result.details.push({
                    name: tagName,
                    status: 'converted',
                    aliasesCount: aliases.length,
                    mediaCount: mediaBuffers.length,
                });
            }
        } catch (err) {
            result.errors++;
            result.details.push({
                name: tagName,
                status: 'error',
                reason: `Unexpected error: ${err}`,
            });
            logger.error(`Error converting legacy tag "${tagName}": ${err}`);
        }
    }

    return result;
}
