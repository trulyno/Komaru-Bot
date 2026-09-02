import { Colors, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import fs from 'node:fs';
import path from 'node:path';
import { logger, logError } from '../logger';
import { config } from '../config';

export interface ReactionRoleEntry {
    emoji: string; // Identifier: snowflake ID for custom emojis, or unicode char
    emojiRaw: string; // Full representation e.g. "<:cat:123456789>" or "🐱"
    roleId: string;
    roleName: string;
}

export interface ReactionRoleMessage {
    messageId: string;
    channelId: string;
    guildId: string;
    description?: string;
    entries: ReactionRoleEntry[];
    createdAt: number;
}

export interface ReactionRoleStore {
    messages: Record<string, ReactionRoleMessage>;
}

const DEFAULT_DATA_DIR = path.resolve(__dirname, '../../data/reaction_roles');

export function getReactionRolesFilePath(dataDir = DEFAULT_DATA_DIR): string {
    return path.join(dataDir, 'reaction_roles.json');
}

export function loadReactionRoles(dataDir = DEFAULT_DATA_DIR): ReactionRoleStore {
    const filePath = getReactionRolesFilePath(dataDir);
    if (!fs.existsSync(filePath)) {
        return { messages: {} };
    }
    try {
        const raw = fs.readFileSync(filePath, 'utf8');
        const parsed = JSON.parse(raw);
        if (
            parsed &&
            typeof parsed === 'object' &&
            parsed.messages &&
            typeof parsed.messages === 'object'
        ) {
            return { messages: parsed.messages };
        }
        return { messages: {} };
    } catch (error) {
        logError(error, `Failed to load reaction roles from ${filePath}`);
        return { messages: {} };
    }
}

export function saveReactionRoles(store: ReactionRoleStore, dataDir = DEFAULT_DATA_DIR): void {
    const filePath = getReactionRolesFilePath(dataDir);
    try {
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        fs.writeFileSync(filePath, JSON.stringify(store, null, 4), 'utf8');
    } catch (error) {
        logError(error, `Failed to save reaction roles to ${filePath}`);
    }
}

export function parseEmoji(input: string): { id: string | null; name: string; raw: string } {
    const trimmed = input.trim();
    // Match <:name:id> or <a:name:id>
    const customMatch = trimmed.match(/^<a?:([a-zA-Z0-9_~]+):(\d+)>$/);
    if (customMatch) {
        return {
            id: customMatch[2],
            name: customMatch[1],
            raw: trimmed,
        };
    }

    // Match name:id
    const colonMatch = trimmed.match(/^([a-zA-Z0-9_~]+):(\d+)$/);
    if (colonMatch) {
        return {
            id: colonMatch[2],
            name: colonMatch[1],
            raw: `<:${colonMatch[1]}:${colonMatch[2]}>`,
        };
    }

    // Match pure ID (snowflake)
    if (/^\d{17,21}$/.test(trimmed)) {
        return {
            id: trimmed,
            name: trimmed,
            raw: trimmed,
        };
    }

    // Otherwise standard unicode emoji
    return {
        id: null,
        name: trimmed,
        raw: trimmed,
    };
}

export function matchesEmoji(
    reactionEmoji: { id?: string | null; name?: string | null },
    entry: ReactionRoleEntry,
): boolean {
    if (reactionEmoji.id && entry.emoji) {
        if (reactionEmoji.id === entry.emoji) {
            return true;
        }
    }
    if (reactionEmoji.name && entry.emoji) {
        if (reactionEmoji.name === entry.emoji) {
            return true;
        }
    }
    if (reactionEmoji.name && entry.emojiRaw) {
        if (reactionEmoji.name === entry.emojiRaw) {
            return true;
        }
    }
    return false;
}

export function parseMessageReference(
    input: string,
): { guildId?: string; channelId?: string; messageId: string } | null {
    const trimmed = input.trim();
    const urlMatch = trimmed.match(
        /https:\/\/(?:ptb\.|canary\.)?discord\.com\/channels\/(\d+)\/(\d+)\/(\d+)/,
    );
    if (urlMatch) {
        return {
            guildId: urlMatch[1],
            channelId: urlMatch[2],
            messageId: urlMatch[3],
        };
    }

    if (/^\d{17,21}$/.test(trimmed)) {
        return {
            messageId: trimmed,
        };
    }

    return null;
}

export function canManageRole(guild: any, role: any): { canManage: boolean; reason?: string } {
    if (!role) {
        return { canManage: false, reason: 'Role does not exist.' };
    }
    if (role.managed) {
        return {
            canManage: false,
            reason: `Role **${role.name}** is managed by an integration or booster subscription and cannot be manually assigned.`,
        };
    }
    if (role.id === guild?.id) {
        return {
            canManage: false,
            reason: 'Cannot assign the @everyone role.',
        };
    }
    const botMember = guild?.members?.me;
    if (botMember) {
        if (!botMember.permissions?.has?.(PermissionFlagsBits.ManageRoles)) {
            return {
                canManage: false,
                reason: 'Bot lacks the "Manage Roles" permission in this server.',
            };
        }
        if (botMember.roles?.highest && role.position >= botMember.roles.highest.position) {
            return {
                canManage: false,
                reason: `Role **${role.name}** is higher than or equal to the bot's highest role (**${botMember.roles.highest.name}**) in the role hierarchy.`,
            };
        }
    }
    return { canManage: true };
}

export function isAdmin(member: any): boolean {
    if (!member) return false;
    if (config.env.botOwnerId && member.id === config.env.botOwnerId) return true;
    return (
        member.permissions?.has?.(PermissionFlagsBits.Administrator) ||
        member.permissions?.has?.(PermissionFlagsBits.ManageRoles) ||
        member.permissions?.has?.(PermissionFlagsBits.ManageGuild) ||
        false
    );
}

export function addReactionRole(
    params: {
        messageId: string;
        channelId: string;
        guildId: string;
        emojiInput: string;
        roleId: string;
        roleName: string;
        description?: string;
    },
    dataDir = DEFAULT_DATA_DIR,
): { success: boolean; entry: ReactionRoleEntry; message: ReactionRoleMessage } {
    const store = loadReactionRoles(dataDir);
    const parsed = parseEmoji(params.emojiInput);
    const entry: ReactionRoleEntry = {
        emoji: parsed.id ?? parsed.name,
        emojiRaw: parsed.raw,
        roleId: params.roleId,
        roleName: params.roleName,
    };

    let msg = store.messages[params.messageId];
    if (!msg) {
        msg = {
            messageId: params.messageId,
            channelId: params.channelId,
            guildId: params.guildId,
            description: params.description,
            entries: [],
            createdAt: Date.now(),
        };
        store.messages[params.messageId] = msg;
    } else {
        if (params.description) {
            msg.description = params.description;
        }
        // Remove existing entry for this emoji if previously assigned
        msg.entries = msg.entries.filter(
            (e) => !matchesEmoji({ id: parsed.id, name: parsed.name }, e),
        );
    }

    msg.entries.push(entry);
    saveReactionRoles(store, dataDir);
    return { success: true, entry, message: msg };
}

export function removeReactionRole(
    params: { messageId: string; emojiInput: string },
    dataDir = DEFAULT_DATA_DIR,
): { success: boolean; removed?: ReactionRoleEntry } {
    const store = loadReactionRoles(dataDir);
    const msg = store.messages[params.messageId];
    if (!msg) {
        return { success: false };
    }

    const parsed = parseEmoji(params.emojiInput);
    const index = msg.entries.findIndex((e) =>
        matchesEmoji({ id: parsed.id, name: parsed.name }, e),
    );
    if (index === -1) {
        return { success: false };
    }

    const [removed] = msg.entries.splice(index, 1);
    if (msg.entries.length === 0) {
        delete store.messages[params.messageId];
    }
    saveReactionRoles(store, dataDir);
    return { success: true, removed };
}

export function clearReactionRoleMessage(messageId: string, dataDir = DEFAULT_DATA_DIR): boolean {
    const store = loadReactionRoles(dataDir);
    if (!store.messages[messageId]) {
        return false;
    }
    delete store.messages[messageId];
    saveReactionRoles(store, dataDir);
    return true;
}

export function getReactionRoleForMessage(
    messageId: string,
    dataDir = DEFAULT_DATA_DIR,
): ReactionRoleMessage | undefined {
    const store = loadReactionRoles(dataDir);
    return store.messages[messageId];
}

export function getReactionRolesForGuild(
    guildId: string,
    dataDir = DEFAULT_DATA_DIR,
): ReactionRoleMessage[] {
    const store = loadReactionRoles(dataDir);
    return Object.values(store.messages).filter((m) => m.guildId === guildId);
}

export async function handleReactionAdd(
    reaction: any,
    user: any,
    dataDir = DEFAULT_DATA_DIR,
): Promise<boolean> {
    if (user?.bot) return false;

    const messageId = reaction.message?.id;
    if (!messageId) return false;

    const store = loadReactionRoles(dataDir);
    const msgConfig = store.messages[messageId];
    if (!msgConfig || !msgConfig.entries || msgConfig.entries.length === 0) {
        return false;
    }

    if (reaction.partial) {
        try {
            await reaction.fetch();
        } catch (error) {
            logError(error, 'Failed to fetch partial reaction');
            return false;
        }
    }

    if (user.partial) {
        try {
            await user.fetch();
        } catch (error) {
            logError(error, 'Failed to fetch partial user');
            return false;
        }
    }

    const matchingEntry = msgConfig.entries.find((entry) => matchesEmoji(reaction.emoji, entry));
    if (!matchingEntry) return false;

    const guild = reaction.message.guild;
    if (!guild) return false;

    const member = await guild.members.fetch(user.id).catch(() => null);
    if (!member) return false;

    const role = await guild.roles.fetch(matchingEntry.roleId).catch(() => null);
    if (!role) {
        logger.warn(
            `Reaction role ${matchingEntry.roleName} (${matchingEntry.roleId}) not found in guild ${guild.id}`,
        );
        return false;
    }

    const validation = canManageRole(guild, role);
    if (!validation.canManage) {
        logger.warn(`Cannot assign reaction role ${role.name}: ${validation.reason}`);
        return false;
    }

    if (!member.roles.cache.has(role.id)) {
        try {
            await member.roles.add(role);
            logger.info(
                `Assigned reaction role "${role.name}" (${role.id}) to user ${user.tag ?? user.id} via reaction ${reaction.emoji.name}`,
            );
            return true;
        } catch (error) {
            logError(error, `Failed to assign role ${role.name} to user ${user.tag ?? user.id}`);
            return false;
        }
    }

    return false;
}

export async function handleReactionRemove(
    reaction: any,
    user: any,
    dataDir = DEFAULT_DATA_DIR,
): Promise<boolean> {
    if (user?.bot) return false;

    const messageId = reaction.message?.id;
    if (!messageId) return false;

    const store = loadReactionRoles(dataDir);
    const msgConfig = store.messages[messageId];
    if (!msgConfig || !msgConfig.entries || msgConfig.entries.length === 0) {
        return false;
    }

    if (reaction.partial) {
        try {
            await reaction.fetch();
        } catch (error) {
            logError(error, 'Failed to fetch partial reaction');
            return false;
        }
    }

    if (user.partial) {
        try {
            await user.fetch();
        } catch (error) {
            logError(error, 'Failed to fetch partial user');
            return false;
        }
    }

    const matchingEntry = msgConfig.entries.find((entry) => matchesEmoji(reaction.emoji, entry));
    if (!matchingEntry) return false;

    const guild = reaction.message.guild;
    if (!guild) return false;

    const member = await guild.members.fetch(user.id).catch(() => null);
    if (!member) return false;

    const role = await guild.roles.fetch(matchingEntry.roleId).catch(() => null);
    if (!role) return false;

    const validation = canManageRole(guild, role);
    if (!validation.canManage) {
        logger.warn(`Cannot remove reaction role ${role.name}: ${validation.reason}`);
        return false;
    }

    if (member.roles.cache.has(role.id)) {
        try {
            await member.roles.remove(role);
            logger.info(
                `Removed reaction role "${role.name}" (${role.id}) from user ${user.tag ?? user.id} via unreacting ${reaction.emoji.name}`,
            );
            return true;
        } catch (error) {
            logError(error, `Failed to remove role ${role.name} from user ${user.tag ?? user.id}`);
            return false;
        }
    }

    return false;
}

export function buildReactionRoleListEmbed(
    guild: any,
    messages: ReactionRoleMessage[],
): EmbedBuilder {
    const embed = new EmbedBuilder()
        .setTitle('🎭 Reaction Roles Configuration')
        .setColor(Colors.Purple)
        .setDescription(
            messages.length === 0
                ? 'No reaction role messages have been configured yet.\nUse `/reaction_role_add` or `/reaction_role_create` to set one up!'
                : `Configured reaction role messages in **${guild.name}**:`,
        )
        .setTimestamp();

    for (const msg of messages.slice(0, 25)) {
        const channelMention = `<#${msg.channelId}>`;
        const jumpUrl = `https://discord.com/channels/${msg.guildId}/${msg.channelId}/${msg.messageId}`;
        const entriesText =
            msg.entries.length > 0
                ? msg.entries
                      .map((e) => `${e.emojiRaw} → <@&${e.roleId}> (\`${e.roleName}\`)`)
                      .join('\n')
                : '*No roles assigned*';

        embed.addFields({
            name: `Message ${msg.messageId} (in ${channelMention})`,
            value: `[Jump to message](${jumpUrl})\n${entriesText}`,
            inline: false,
        });
    }

    return embed;
}
