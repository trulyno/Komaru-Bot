import { logger } from '../logger';
import {
    evaluateBooleanExpr,
    evaluateCalc,
    evaluateChoice,
    evaluateExpression,
    evaluateRandom,
    EvaluationContext,
    executePipeline,
    interpolateString,
} from './evaluator';
import { UserCommandStorage } from './storage';
import { ConfigStore } from './configStore';
import {
    ActionType,
    ActionValue,
    CommandPersistenceData,
    ComplexValue,
    DEFAULT_GLOBAL_PERSISTENCE_LIMIT,
    DEFAULT_MAX_USER_INPUTS,
    DEFAULT_PER_USER_PERSISTENCE_LIMIT,
    EmbedData,
    PipelineData,
    PonderData,
    UserCommandAction,
    UserCommandJson,
} from './types';

interface ThoughtGroup {
    texts: string[];
    files: string[];
}

interface ExecutionState {
    actionsRun: number;
    maxActions: number;
    inputsUsed: number;
    stopped: boolean;
    thoughts: Map<string, ThoughtGroup>;
    persistence?: CommandPersistenceData;
    markPersistenceDirty?: () => void;
    setPendingHideInitial?: (
        pending:
            { key: string; scope: 'global' | 'user'; initialValue: string | number } | undefined,
    ) => void;
}

export class TriggerPool {
    private commands: Map<string, UserCommandJson> = new Map();
    // Track cooldowns per user per command: commandName -> (userId -> lastTimestamp)
    private cooldowns: Map<string, Map<string, number>> = new Map();
    // Track channel-wide execution cooldowns: channelId -> lastTimestamp
    private channelCooldowns: Map<string, number> = new Map();
    // Track pending user input waiters: `${channelId}:${userId}` -> resolver
    private pendingInputs: Map<string, (content: string | null) => void> = new Map();
    private inputTimeoutMs: number = 60000;

    constructor(
        private storage: UserCommandStorage,
        private configStore?: ConfigStore,
    ) {}

    public setConfigStore(configStore: ConfigStore): void {
        this.configStore = configStore;
    }

    public setInputTimeoutMs(ms: number): void {
        this.inputTimeoutMs = ms;
    }

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
        const channelId = message.channel?.id || 'dm';
        const inputKey = `${channelId}:${authorId}`;

        const pendingResolver = this.pendingInputs.get(inputKey);
        if (pendingResolver) {
            this.pendingInputs.delete(inputKey);
            pendingResolver(message.content);
            return true;
        }

        for (const cmd of this.commands.values()) {
            const matchResult = this.isTriggerMatch(cmd, content, authorId);
            if (matchResult.matched) {
                // Meta Enabled check
                if (cmd.metadata.enabled === false) {
                    return false;
                }

                // Check Channel Category Restrictions
                if (this.configStore && message.channel?.id) {
                    const chConfig = this.configStore.getChannelConfig(message.channel.id);
                    if (chConfig.allowedCategories && chConfig.allowedCategories.length > 0) {
                        const isAllAllowed = chConfig.allowedCategories.includes('*');
                        if (!isAllAllowed) {
                            const cmdCategory = (cmd.metadata.category || 'General').toLowerCase();
                            const allowed = chConfig.allowedCategories.some(
                                (c) => c.toLowerCase() === cmdCategory,
                            );
                            if (!allowed) {
                                return false;
                            }
                        }
                    }
                }

                // Check Channel-wide Execution Timeout
                if (this.configStore && message.channel?.id) {
                    const chConfig = this.configStore.getChannelConfig(message.channel.id);
                    const chTimeoutSec = chConfig.timeoutSeconds ?? 0;
                    if (chTimeoutSec > 0) {
                        const lastChUsed = this.channelCooldowns.get(message.channel.id) || 0;
                        const now = Date.now();
                        if (now - lastChUsed < chTimeoutSec * 1000) {
                            const remaining = (
                                (chTimeoutSec * 1000 - (now - lastChUsed)) /
                                1000
                            ).toFixed(1);
                            if (typeof message.reply === 'function') {
                                await message.reply({
                                    content: `⏳ Commands in this channel are on a channel-wide cooldown. Please wait ${remaining}s.`,
                                    allowedMentions: { parse: [] },
                                });
                            }
                            return true;
                        }
                        this.channelCooldowns.set(message.channel.id, now);
                    }
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
                        if (typeof message.reply === 'function') {
                            await message.reply({
                                content: `⏳ Command **${cmd.metadata.name}** is on cooldown. Please wait ${remaining}s.`,
                                allowedMentions: { parse: [] },
                            });
                        }
                        return true;
                    }
                    cmdCooldowns.set(authorId, now);
                }

                const hasAsk = this.containsAskAction(cmd.actions);
                const EXECUTION_TIMEOUT_MS = 5000;
                let timeoutHandle: NodeJS.Timeout | undefined;
                const timeoutPromise = new Promise((_, reject) => {
                    timeoutHandle = setTimeout(() => {
                        reject(
                            new Error(
                                `Execution of command "${cmd.metadata.name}" timed out after ${EXECUTION_TIMEOUT_MS}ms`,
                            ),
                        );
                    }, EXECUTION_TIMEOUT_MS);
                });

                try {
                    if (hasAsk) {
                        await this.executeCommand(cmd, message, matchResult.matchGroups);
                    } else {
                        await Promise.race([
                            this.executeCommand(cmd, message, matchResult.matchGroups),
                            timeoutPromise,
                        ]);
                    }
                    return true;
                } catch (error) {
                    logger.error(`Error executing user command "${cmd.metadata.name}": ${error}`);
                    return false;
                } finally {
                    if (timeoutHandle) {
                        clearTimeout(timeoutHandle);
                    }
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

        const persistence = this.storage.loadPersistence(cmd.metadata.name);
        let persistenceDirty = false;
        let pendingHideInitial:
            { key: string; scope: 'global' | 'user'; initialValue: string | number } | undefined;

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
            uncoverValue: (key: string, scope: 'global' | 'user') => {
                if (scope === 'global') {
                    if (key in persistence.global) {
                        return persistence.global[key];
                    }
                } else {
                    const userStore = persistence.users[ctx.userId];
                    if (userStore && key in userStore) {
                        return userStore[key];
                    }
                }
                if (
                    pendingHideInitial &&
                    pendingHideInitial.key === key &&
                    pendingHideInitial.scope === scope
                ) {
                    return pendingHideInitial.initialValue;
                }
                return undefined;
            },
        };

        const state: ExecutionState = {
            actionsRun: 0,
            maxActions: 100,
            inputsUsed: 0,
            stopped: false,
            thoughts: new Map<string, ThoughtGroup>(),
            persistence,
            markPersistenceDirty: () => {
                persistenceDirty = true;
            },
            setPendingHideInitial: (pending) => {
                pendingHideInitial = pending;
            },
        };
        try {
            await this.runActionSequence(cmd.actions, cmd, message, ctx, state);
        } finally {
            if (persistenceDirty) {
                this.storage.savePersistence(cmd.metadata.name, persistence);
            }
        }
    }

    private containsAskAction(actions: UserCommandAction[]): boolean {
        for (const action of actions) {
            if (action.type === 'ask') return true;
            if (action.type === 'ponder') {
                const ponderData = action.value as PonderData;
                if (ponderData?.branches?.some((b) => this.containsAskAction(b.actions))) {
                    return true;
                }
                if (ponderData?.otherwise && this.containsAskAction(ponderData.otherwise)) {
                    return true;
                }
            }
        }
        return false;
    }

    private waitForUserInput(channelId: string, userId: string): Promise<string | null> {
        const inputKey = `${channelId}:${userId}`;
        return new Promise((resolve) => {
            const timer = setTimeout(() => {
                if (this.pendingInputs.get(inputKey) === wrappedResolve) {
                    this.pendingInputs.delete(inputKey);
                }
                resolve(null);
            }, this.inputTimeoutMs);

            const wrappedResolve = (val: string | null) => {
                clearTimeout(timer);
                resolve(val);
            };

            this.pendingInputs.set(inputKey, wrappedResolve);
        });
    }

    private async runActionSequence(
        actions: UserCommandAction[],
        cmd: UserCommandJson,
        message: any,
        ctx: EvaluationContext,
        state: ExecutionState = {
            actionsRun: 0,
            maxActions: 100,
            inputsUsed: 0,
            stopped: false,
            thoughts: new Map(),
        },
    ): Promise<void> {
        for (const action of actions) {
            if (state.stopped) {
                return;
            }
            if (state.actionsRun >= state.maxActions) {
                logger.warn(
                    `Command "${cmd.metadata.name}" exceeded maximum action limit (${state.maxActions}). Stopping execution.`,
                );
                return;
            }
            state.actionsRun++;

            switch (action.type) {
                case 'memorize': {
                    const evaluatedValue = this.evaluateActionValue(action.value, ctx);
                    const slot = action.targetSlot ?? 0;
                    if (slot >= 0 && slot < 10) {
                        ctx.variables[slot] = evaluatedValue;
                    }
                    break;
                }
                case 'ask': {
                    const maxInputs = cmd.metadata.maxUserInputs ?? DEFAULT_MAX_USER_INPUTS;
                    if (state.inputsUsed >= maxInputs) {
                        logger.warn(
                            `Command "${cmd.metadata.name}" reached maximum user input limit (${maxInputs}). Stopping execution.`,
                        );
                        state.stopped = true;
                        return;
                    }
                    state.inputsUsed++;

                    const channelId = message.channel?.id || 'dm';
                    const authorId = message.author?.id || '';
                    const slot = action.targetSlot ?? 0;

                    const promptText = await sanitizeMentions(
                        interpolateString(action.askPrompt || '', ctx),
                        message,
                    );
                    if (promptText && message.channel?.send) {
                        await message.channel.send({
                            content: promptText,
                            allowedMentions: { parse: [] },
                        });
                    }

                    const firstReply = await this.waitForUserInput(channelId, authorId);
                    if (firstReply === null) {
                        state.stopped = true;
                        return;
                    }

                    let finalReply = firstReply;
                    if (action.askRegex) {
                        let reg: RegExp | null = null;
                        try {
                            reg = new RegExp(action.askRegex, action.askRegexFlags || '');
                        } catch (err) {
                            logger.error(
                                `Invalid ask validation regex in "${cmd.metadata.name}": ${err}`,
                            );
                        }

                        if (reg && !reg.test(firstReply)) {
                            const retryText = await sanitizeMentions(
                                interpolateString(
                                    action.askRetryMessage || 'Invalid input. Please try again.',
                                    ctx,
                                ),
                                message,
                            );
                            if (retryText && message.channel?.send) {
                                await message.channel.send({
                                    content: retryText,
                                    allowedMentions: { parse: [] },
                                });
                            }

                            const secondReply = await this.waitForUserInput(channelId, authorId);
                            if (secondReply === null || !reg.test(secondReply)) {
                                state.stopped = true;
                                return;
                            }
                            finalReply = secondReply;
                        }
                    }

                    if (slot >= 0 && slot < 10) {
                        ctx.variables[slot] = finalReply;
                    }
                    break;
                }
                case 'hide': {
                    if (state.persistence && action.hideKey) {
                        const scope = action.hideScope || 'global';
                        const key = action.hideKey;
                        const initVal = action.initialValue ?? 0;

                        state.setPendingHideInitial?.({
                            key,
                            scope,
                            initialValue: initVal,
                        });
                        const evaluatedValue = this.evaluateActionValue(action.value, ctx);
                        state.setPendingHideInitial?.(undefined);

                        if (scope === 'global') {
                            const globalLimit =
                                cmd.metadata.persistenceLimits?.global ??
                                DEFAULT_GLOBAL_PERSISTENCE_LIMIT;
                            const exists = key in state.persistence.global;
                            if (
                                !exists &&
                                Object.keys(state.persistence.global).length >= globalLimit
                            ) {
                                logger.warn(
                                    `Command "${cmd.metadata.name}" reached global persistence limit (${globalLimit}); cannot create store "${key}".`,
                                );
                            } else {
                                state.persistence.global[key] = evaluatedValue;
                                state.markPersistenceDirty?.();
                            }
                        } else {
                            const userId = ctx.userId || 'unknown';
                            const perUserLimit =
                                cmd.metadata.persistenceLimits?.perUser ??
                                DEFAULT_PER_USER_PERSISTENCE_LIMIT;

                            if (!state.persistence.users[userId]) {
                                while (state.persistence.userOrder.length >= perUserLimit) {
                                    const oldestUserId = state.persistence.userOrder.shift();
                                    if (oldestUserId) {
                                        delete state.persistence.users[oldestUserId];
                                    }
                                }
                                state.persistence.users[userId] = {};
                                state.persistence.userOrder.push(userId);
                            }

                            state.persistence.users[userId][key] = evaluatedValue;
                            state.markPersistenceDirty?.();
                        }
                    }
                    break;
                }
                case 'think': {
                    const thoughtName = action.thoughtName || '';
                    if (!state.thoughts.has(thoughtName)) {
                        state.thoughts.set(thoughtName, { texts: [], files: [] });
                    }
                    const group = state.thoughts.get(thoughtName)!;
                    const evaluated = this.evaluateActionValue(action.value, ctx);
                    const strVal = String(evaluated);
                    const trimmedRef = strVal.trim();
                    const mediaItem = cmd.media[trimmedRef];
                    if (mediaItem && mediaItem.path) {
                        group.files.push(mediaItem.path);
                    } else if (/^&\d+$/.test(trimmedRef)) {
                        logger.warn(
                            `Media file reference "${trimmedRef}" not found in command "${cmd.metadata.name}"`,
                        );
                    } else {
                        const sanitized = await sanitizeMentions(strVal, message);
                        if (sanitized) {
                            group.texts.push(sanitized);
                        }
                    }
                    break;
                }
                case 'say':
                case 'reply':
                case 'whisper':
                case 'send': {
                    const { content, files } = await this.resolveOutputPayload(
                        action,
                        cmd,
                        message,
                        ctx,
                        state,
                    );
                    await this.dispatchOutput(action.type, content, files, message, ctx);
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
                                await this.runActionSequence(
                                    branch.actions,
                                    cmd,
                                    message,
                                    ctx,
                                    state,
                                );
                                break;
                            }
                        }
                        if (!matchedBranch && ponderData.otherwise) {
                            await this.runActionSequence(
                                ponderData.otherwise,
                                cmd,
                                message,
                                ctx,
                                state,
                            );
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

    private async resolveOutputPayload(
        action: UserCommandAction,
        cmd: UserCommandJson,
        message: any,
        ctx: EvaluationContext,
        state: ExecutionState,
    ): Promise<{ content: string; files: string[] }> {
        if (
            typeof action.value === 'object' &&
            action.value !== null &&
            (action.value as ComplexValue).type === 'thought'
        ) {
            const thoughtName = (action.value as ComplexValue).thoughtName || '';
            const group = state.thoughts.get(thoughtName);
            return {
                content: group ? group.texts.join('\n') : '',
                files: group ? [...group.files] : [],
            };
        }

        if (action.files && action.files.length > 0) {
            const files: string[] = [];
            for (const ref of action.files) {
                const fileRef = String(this.evaluateActionValue(ref, ctx)).trim();
                const mediaItem = cmd.media[fileRef];
                if (mediaItem && mediaItem.path) {
                    files.push(mediaItem.path);
                } else {
                    logger.warn(
                        `Media file reference "${fileRef}" not found in command "${cmd.metadata.name}"`,
                    );
                }
            }

            let content = '';
            if (action.value !== '' && action.value !== undefined) {
                const rawContent = String(this.evaluateActionValue(action.value, ctx));
                content = await sanitizeMentions(rawContent, message);
            }
            return { content, files };
        }

        if (action.type === 'send') {
            const fileRef = String(this.evaluateActionValue(action.value, ctx)).trim();
            const mediaItem = cmd.media[fileRef];
            if (mediaItem && mediaItem.path) {
                return { content: '', files: [mediaItem.path] };
            }
            logger.warn(
                `Media file reference "${fileRef}" not found in command "${cmd.metadata.name}"`,
            );
            return { content: '', files: [] };
        }

        const rawContent = String(this.evaluateActionValue(action.value, ctx));
        const content = await sanitizeMentions(rawContent, message);
        return { content, files: [] };
    }

    private async dispatchOutput(
        actionType: ActionType,
        content: string,
        files: string[],
        message: any,
        ctx: EvaluationContext,
    ): Promise<void> {
        if (!content && files.length === 0) {
            return;
        }

        const payload: any = { allowedMentions: { parse: [] } };
        if (content) payload.content = content;
        if (files.length > 0) payload.files = files;

        if (actionType === 'say' || actionType === 'send') {
            await message.channel.send(payload);
            return;
        }

        if (actionType === 'reply') {
            await message.reply(payload);
            return;
        }

        if (actionType === 'whisper') {
            const isInteraction =
                typeof message.isChatInputCommand === 'function' || Boolean(message.interaction);
            if (isInteraction) {
                try {
                    const ephemeralPayload = { ...payload, ephemeral: true };
                    if (message.replied || message.deferred) {
                        await message.followUp(ephemeralPayload);
                    } else {
                        await message.reply(ephemeralPayload);
                    }
                } catch (err: any) {
                    logger.error(`Could not send ephemeral whisper interaction: ${err}`);
                }
            } else {
                try {
                    await message.author.send(payload);
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
                return evaluateCalc(mathExpr, ctx.variables, ctx.varAliases, ctx.uncoverValue);
            }
            case 'remember': {
                const slot = complex.slot ?? 0;
                const v = ctx.variables[slot];
                return v !== undefined ? v : '';
            }
            case 'expr': {
                return evaluateExpression(String(complex.value || ''), ctx);
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
