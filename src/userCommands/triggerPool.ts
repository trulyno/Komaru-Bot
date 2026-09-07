import { logger } from '../logger';
import {
    evaluateBooleanExpr,
    evaluateCalc,
    evaluateChoice,
    evaluateRandom,
    EvaluationContext,
    executePipeline,
    interpolateString,
} from './evaluator';
import { UserCommandStorage } from './storage';
import {
    ActionValue,
    ComplexValue,
    EmbedData,
    PipelineData,
    PonderData,
    UserCommandAction,
    UserCommandJson,
} from './types';

export class TriggerPool {
    private commands: Map<string, UserCommandJson> = new Map();
    // Track cooldowns per user per command: commandName -> (userId -> lastTimestamp)
    private cooldowns: Map<string, Map<string, number>> = new Map();

    constructor(private storage: UserCommandStorage) {}

    public loadFromStorage(): void {
        const loaded = this.storage.loadAllCommands();
        this.commands.clear();
        for (const cmd of loaded) {
            this.commands.set(cmd.metadata.name, cmd);
        }
        logger.info(`TriggerPool initialized with ${this.commands.size} user commands.`);
    }

    public registerCommand(cmd: UserCommandJson): void {
        this.commands.set(cmd.metadata.name, cmd);
        logger.info(`Registered user command "${cmd.metadata.name}" in TriggerPool.`);
    }

    public unregisterCommand(name: string): boolean {
        const existed = this.commands.delete(name);
        if (existed) {
            logger.info(`Unregistered user command "${name}" from TriggerPool.`);
        }
        return existed;
    }

    public getCommand(name: string): UserCommandJson | undefined {
        return this.commands.get(name);
    }

    public getAllCommands(): UserCommandJson[] {
        return Array.from(this.commands.values());
    }

    public findConflictingCommand(
        trigger: { type: string; value: string },
        aliases: string[] = [],
        currentCommandName?: string,
    ): UserCommandJson | undefined {
        const newTriggers = [trigger.value.toLowerCase(), ...aliases.map((a) => a.toLowerCase())];

        for (const cmd of this.commands.values()) {
            if (
                currentCommandName &&
                cmd.metadata.name.toLowerCase() === currentCommandName.toLowerCase()
            ) {
                continue;
            }

            const existingTriggers = [
                cmd.trigger.value.toLowerCase(),
                ...(cmd.aliases || []).map((a) => a.toLowerCase()),
            ];

            for (const newT of newTriggers) {
                if (existingTriggers.includes(newT)) {
                    return cmd;
                }
            }
        }
        return undefined;
    }

    public async handleMessage(message: any): Promise<boolean> {
        if (!message || !message.content || message.author?.bot) {
            return false;
        }

        const content = message.content.trim();
        const authorId = message.author.id;

        for (const cmd of this.commands.values()) {
            const matchResult = this.isTriggerMatch(cmd, content, authorId);
            if (matchResult.matched) {
                // Meta Enabled check
                if (cmd.metadata.enabled === false) {
                    return false;
                }

                // Meta Channels check
                if (cmd.metadata.channels && cmd.metadata.channels.length > 0) {
                    const chName = (message.channel?.name || '').toLowerCase();
                    const chId = (message.channel?.id || '').toLowerCase();
                    const allowed = cmd.metadata.channels.some((rawC) => {
                        const c = rawC
                            .replace(/^<#(\d+)>$/, '$1')
                            .replace(/^["']|["']$/g, '')
                            .trim()
                            .toLowerCase();
                        return c === chName || c === chId;
                    });
                    if (!allowed) return false;
                }

                // Meta Roles check
                if (
                    cmd.metadata.roles &&
                    cmd.metadata.roles.length > 0 &&
                    message.member?.roles?.cache
                ) {
                    const userRoleNames = message.member.roles.cache.map((r: any) =>
                        (r.name || '').toLowerCase(),
                    );
                    const userRoleIds = message.member.roles.cache.map((r: any) =>
                        (r.id || '').toLowerCase(),
                    );
                    const allowed = cmd.metadata.roles.some((rawR) => {
                        const r = rawR
                            .replace(/^<@&?(\d+)>$/, '$1')
                            .replace(/^["']|["']$/g, '')
                            .trim()
                            .toLowerCase();
                        return userRoleNames.includes(r) || userRoleIds.includes(r);
                    });
                    if (!allowed) return false;
                }

                // Meta Cooldown check
                const cooldownSec = cmd.metadata.cooldown ?? 5;
                if (cooldownSec > 0) {
                    if (!this.cooldowns.has(cmd.metadata.name)) {
                        this.cooldowns.set(cmd.metadata.name, new Map());
                    }
                    const cmdCooldowns = this.cooldowns.get(cmd.metadata.name)!;
                    const lastUsed = cmdCooldowns.get(authorId) || 0;
                    const now = Date.now();
                    if (now - lastUsed < cooldownSec * 1000) {
                        const remaining = ((cooldownSec * 1000 - (now - lastUsed)) / 1000).toFixed(
                            1,
                        );
                        await message.reply({
                            content: `⏳ Command **${cmd.metadata.name}** is on cooldown. Please wait ${remaining}s.`,
                            allowedMentions: { parse: [] },
                        });
                        return true;
                    }
                    cmdCooldowns.set(authorId, now);
                }

                try {
                    await this.executeCommand(cmd, message, matchResult.matchGroups);
                    return true;
                } catch (error) {
                    logger.error(`Error executing user command "${cmd.metadata.name}": ${error}`);
                    return false;
                }
            }
        }

        return false;
    }

    private isTriggerMatch(
        cmd: UserCommandJson,
        content: string,
        authorId: string,
    ): { matched: boolean; matchGroups: string[] } {
        const { trigger, metadata } = cmd;

        // Check scope requirement (author or coauthors)
        if (trigger.scope === 'author') {
            const isCoauthor = cmd.coauthors && cmd.coauthors.includes(authorId);
            if (metadata.author !== authorId && !isCoauthor) {
                return { matched: false, matchGroups: [] };
            }
        }

        const triggersToCheck = [trigger.value, ...(cmd.aliases || [])];

        for (const trigVal of triggersToCheck) {
            if (trigger.type === 'string') {
                if (content.toLowerCase() === trigVal.toLowerCase()) {
                    return { matched: true, matchGroups: [content] };
                }
            } else if (trigger.type === 'regex') {
                try {
                    const reg = new RegExp(trigVal, 'i');
                    const match = reg.exec(content);
                    if (match) {
                        return { matched: true, matchGroups: Array.from(match) };
                    }
                } catch (err) {
                    logger.error(`Invalid regex trigger in command "${metadata.name}": ${err}`);
                }
            }
        }

        return { matched: false, matchGroups: [] };
    }

    private async executeCommand(
        cmd: UserCommandJson,
        message: any,
        matchGroups: string[],
    ): Promise<void> {
        const variables: Array<string | number> = new Array(10);
        const aliases = cmd.varAliases;

        const now = new Date();
        const userDisplayName =
            message.member?.displayName ||
            message.author?.displayName ||
            message.author?.globalName ||
            message.author?.username ||
            message.author?.tag ||
            'User';

        const ctx: EvaluationContext = {
            userMention: userDisplayName, // Non-pinging nickname / display name
            username: message.author?.username || message.author?.tag || 'User',
            userId: message.author?.id || '',
            channelName: message.channel?.name || 'chat',
            serverName: message.guild?.name || 'DM',
            timeStr: now.toISOString().split('T')[1].slice(0, 8),
            dateStr: now.toISOString().split('T')[0],
            input: message.content || '',
            matchGroups,
            variables,
            varAliases: aliases,
            resolveUserDisplayName: (id: string) => resolveUserDisplayNameSync(id, message),
            resolveRoleName: (id: string) => resolveRoleName(id, message),
        };

        await this.runActionSequence(cmd.actions, cmd, message, ctx);
    }

    private async runActionSequence(
        actions: UserCommandAction[],
        cmd: UserCommandJson,
        message: any,
        ctx: EvaluationContext,
    ): Promise<void> {
        for (const action of actions) {
            switch (action.type) {
                case 'memorize': {
                    const evaluatedValue = this.evaluateActionValue(action.value, ctx);
                    const slot = action.targetSlot ?? 0;
                    if (slot >= 0 && slot < 10) {
                        ctx.variables[slot] = evaluatedValue;
                    }
                    break;
                }
                case 'say': {
                    let strContent = String(this.evaluateActionValue(action.value, ctx));
                    strContent = await sanitizeMentions(strContent, message);
                    if (strContent) {
                        await message.channel.send({
                            content: strContent,
                            allowedMentions: { parse: [] }, // Never ping users
                        });
                    }
                    break;
                }
                case 'reply': {
                    let strContent = String(this.evaluateActionValue(action.value, ctx));
                    strContent = await sanitizeMentions(strContent, message);
                    if (strContent) {
                        await message.reply({
                            content: strContent,
                            allowedMentions: { parse: [] }, // Never ping users
                        });
                    }
                    break;
                }
                case 'whisper': {
                    let strContent = String(this.evaluateActionValue(action.value, ctx));
                    strContent = await sanitizeMentions(strContent, message);
                    if (strContent) {
                        const isInteraction =
                            typeof message.isChatInputCommand === 'function' ||
                            Boolean(message.interaction);
                        if (isInteraction) {
                            try {
                                if (message.replied || message.deferred) {
                                    await message.followUp({
                                        content: strContent,
                                        ephemeral: true,
                                        allowedMentions: { parse: [] },
                                    });
                                } else {
                                    await message.reply({
                                        content: strContent,
                                        ephemeral: true,
                                        allowedMentions: { parse: [] },
                                    });
                                }
                            } catch (err: any) {
                                logger.error(
                                    `Could not send ephemeral whisper interaction: ${err}`,
                                );
                            }
                        } else {
                            try {
                                await message.author.send({
                                    content: strContent,
                                    allowedMentions: { parse: [] },
                                });
                            } catch (dmError: any) {
                                logger.warn(
                                    `Could not send DM whisper to user ${message.author?.id}: ${dmError}`,
                                );
                                await message.channel.send({
                                    content: `*(Could not whisper to ${ctx.userMention}: DMs are disabled or blocked in Discord privacy settings)*`,
                                    allowedMentions: { parse: [] },
                                });
                            }
                        }
                    }
                    break;
                }
                case 'send': {
                    const fileRef = String(this.evaluateActionValue(action.value, ctx)).trim();
                    const mediaItem = cmd.media[fileRef];
                    if (mediaItem && mediaItem.path) {
                        await message.channel.send({
                            files: [mediaItem.path],
                        });
                    } else {
                        logger.warn(
                            `Media file reference "${fileRef}" not found in command "${cmd.metadata.name}"`,
                        );
                    }
                    break;
                }
                case 'embed': {
                    const embedData = action.value as EmbedData;
                    if (embedData) {
                        const rawTitle = embedData.title
                            ? interpolateString(embedData.title, ctx)
                            : undefined;
                        const rawDescription = embedData.description
                            ? interpolateString(embedData.description, ctx)
                            : undefined;
                        const title = rawTitle
                            ? await sanitizeMentions(rawTitle, message)
                            : undefined;
                        const description = rawDescription
                            ? await sanitizeMentions(rawDescription, message)
                            : undefined;
                        const colorHex = embedData.color
                            ? parseInt(embedData.color.replace('#', ''), 16)
                            : 0x6a5acd;

                        const fields = await Promise.all(
                            (embedData.fields || []).map(async (f) => ({
                                name: await sanitizeMentions(
                                    interpolateString(f.name, ctx),
                                    message,
                                ),
                                value: await sanitizeMentions(
                                    interpolateString(f.value, ctx),
                                    message,
                                ),
                                inline: f.inline ?? false,
                            })),
                        );

                        await message.channel.send({
                            embeds: [
                                {
                                    title,
                                    description,
                                    color: isNaN(colorHex) ? 0x6a5acd : colorHex,
                                    fields,
                                },
                            ],
                            allowedMentions: { parse: [] },
                        });
                    }
                    break;
                }
                case 'ponder': {
                    const ponderData = action.value as PonderData;
                    if (ponderData && ponderData.branches) {
                        let matchedBranch = false;
                        for (const branch of ponderData.branches) {
                            if (evaluateBooleanExpr(branch.condition, ctx)) {
                                matchedBranch = true;
                                await this.runActionSequence(branch.actions, cmd, message, ctx);
                                break;
                            }
                        }
                        if (!matchedBranch && ponderData.otherwise) {
                            await this.runActionSequence(ponderData.otherwise, cmd, message, ctx);
                        }
                    }
                    break;
                }
                case 'pipeline': {
                    const pipeData = action.value as PipelineData;
                    if (pipeData) {
                        executePipeline(pipeData, ctx);
                    }
                    break;
                }
            }
        }
    }

    private evaluateActionValue(val: ActionValue, ctx: EvaluationContext): string | number {
        if (typeof val === 'string') {
            return interpolateString(val, ctx);
        }

        const complex = val as ComplexValue;
        if (!complex) return '';

        switch (complex.type) {
            case 'choice': {
                const choiceStr = evaluateChoice(complex.value || []);
                return interpolateString(choiceStr, ctx);
            }
            case 'random': {
                return evaluateRandom(complex.min ?? 1, complex.max ?? 10);
            }
            case 'calc': {
                const mathExpr = String(complex.value || '');
                return evaluateCalc(mathExpr, ctx.variables, ctx.varAliases);
            }
            case 'remember': {
                const slot = complex.slot ?? 0;
                const v = ctx.variables[slot];
                return v !== undefined ? v : '';
            }
            case 'literal': {
                return interpolateString(String(complex.value || ''), ctx);
            }
            default:
                return '';
        }
    }
}

export function resolveUserDisplayNameSync(userId: string, message?: any): string {
    if (message?.author?.id === userId) {
        return (
            message.member?.displayName ||
            message.author?.displayName ||
            message.author?.globalName ||
            message.author?.username ||
            'User'
        );
    }
    const member =
        message?.guild?.members?.cache?.get?.(userId) || message?.mentions?.members?.get?.(userId);
    if (member?.displayName) {
        return member.displayName;
    }
    const user =
        message?.mentions?.users?.get?.(userId) || message?.client?.users?.cache?.get?.(userId);
    if (user) {
        return user.displayName || user.globalName || user.username || 'User';
    }
    return `User_${userId}`;
}

export async function resolveUserDisplayName(userId: string, message?: any): Promise<string> {
    const syncName = resolveUserDisplayNameSync(userId, message);
    if (syncName && syncName !== `User_${userId}`) {
        return syncName;
    }

    if (message?.guild?.members?.fetch) {
        try {
            const member = await message.guild.members.fetch(userId);
            if (member?.displayName) {
                return member.displayName;
            }
        } catch {
            // Ignore fetch error
        }
    }

    if (message?.client?.users?.fetch) {
        try {
            const user = await message.client.users.fetch(userId);
            if (user) {
                return user.displayName || user.globalName || user.username || 'User';
            }
        } catch {
            // Ignore fetch error
        }
    }

    return syncName || `User_${userId}`;
}

export function resolveRoleName(roleId: string, message?: any): string {
    const role =
        message?.guild?.roles?.cache?.get?.(roleId) || message?.mentions?.roles?.get?.(roleId);
    if (role?.name) {
        return role.name;
    }
    return `Role_${roleId}`;
}

export async function sanitizeMentions(text: string, message?: any): Promise<string> {
    if (!text) return '';

    let sanitized = text.replace(/@everyone/g, '@\u200beveryone').replace(/@here/g, '@\u200bhere');

    const userMentionRegex = /<@!?(\d+)>/g;
    const matches = Array.from(sanitized.matchAll(userMentionRegex));
    for (const match of matches) {
        const fullTag = match[0];
        const userId = match[1];
        const displayName = await resolveUserDisplayName(userId, message);
        sanitized = sanitized.split(fullTag).join(displayName);
    }

    const roleMentionRegex = /<@&(\d+)>/g;
    const roleMatches = Array.from(sanitized.matchAll(roleMentionRegex));
    for (const match of roleMatches) {
        const fullTag = match[0];
        const roleId = match[1];
        const roleName = resolveRoleName(roleId, message);
        sanitized = sanitized.split(fullTag).join(roleName);
    }

    return sanitized;
}
