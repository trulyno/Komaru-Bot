import fs from 'node:fs';
import path from 'node:path';
import { EmbedBuilder } from 'discord.js';
import { config } from '../config';
import { logger } from '../logger';
import { KomaruChatEngine, MAX_NICKNAME_LENGTH } from '../komaruChat/engine';
import {
    applyTimeDecay,
    deriveMood,
    getBondTitle,
    getMoodHint,
    NICKNAME_UNLOCK_AFFINITY,
} from '../komaruChat/mood';
import {
    GuildChatState,
    InteractAction,
    KomaruChatConfig,
    KomaruChatStateFile,
    KomaruMood,
} from '../komaruChat/types';

const MOOD_COLORS: Record<KomaruMood, number> = {
    happy: 0xffc0cb,
    playful: 0xffa500,
    sleepy: 0x9b9ece,
    affectionate: 0xff69b4,
    sassy: 0xba55d3,
    chaotic: 0xff4500,
    grumpy: 0x708090,
};

function renderBar(value: number, length = 10): string {
    const filled = Math.round((Math.max(0, Math.min(100, value)) / 100) * length);
    return `[${'#'.repeat(filled)}${'-'.repeat(length - filled)}] ${value}%`;
}

export class KomaruChatService {
    private stateFilePath: string;
    private state: KomaruChatStateFile;
    public readonly engine: KomaruChatEngine;

    constructor(
        customStatePath?: string,
        getConfig: () => KomaruChatConfig = () => config.komaruChat,
    ) {
        this.stateFilePath =
            customStatePath ?? path.resolve(process.cwd(), 'data', 'komaru_chat', 'state.json');
        this.engine = new KomaruChatEngine(getConfig);
        this.state = this.loadState();
    }

    private loadState(): KomaruChatStateFile {
        try {
            if (fs.existsSync(this.stateFilePath)) {
                const raw = fs.readFileSync(this.stateFilePath, 'utf-8');
                const parsed = JSON.parse(raw) as Partial<KomaruChatStateFile>;
                return { guilds: parsed.guilds ?? {} };
            }
        } catch (error) {
            logger.error(`Failed to load komaruChat state from ${this.stateFilePath}: ${error}`);
        }
        return { guilds: {} };
    }

    private saveState(): void {
        try {
            const dir = path.dirname(this.stateFilePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(this.stateFilePath, JSON.stringify(this.state, null, 4), 'utf-8');
        } catch (error) {
            logger.error(`Failed to save komaruChat state to ${this.stateFilePath}: ${error}`);
        }
    }

    public getGuildState(guildId: string): GuildChatState {
        if (!this.state.guilds[guildId]) {
            this.state.guilds[guildId] = this.engine.createDefaultGuildState();
        }
        return this.state.guilds[guildId];
    }

    public isChannelEnabled(guildId: string, channelId: string): boolean {
        const guildState = this.getGuildState(guildId);
        return guildState.enabledChannels.includes(channelId);
    }

    public enableChannel(guildId: string, channelId: string): boolean {
        const guildState = this.getGuildState(guildId);
        if (guildState.enabledChannels.includes(channelId)) {
            return false;
        }
        guildState.enabledChannels.push(channelId);
        this.saveState();
        return true;
    }

    public disableChannel(guildId: string, channelId: string): boolean {
        const guildState = this.getGuildState(guildId);
        const idx = guildState.enabledChannels.indexOf(channelId);
        if (idx === -1) {
            return false;
        }
        guildState.enabledChannels.splice(idx, 1);
        this.saveState();
        return true;
    }

    public shouldRespondToMessage(
        message: any,
        clientUserId?: string,
        randomFn: () => number = Math.random,
    ): { shouldRespond: boolean; bypassCooldown: boolean } {
        if (!message || message.author?.bot) {
            return { shouldRespond: false, bypassCooldown: false };
        }

        const guildId = message.guildId ?? 'dm';
        const channelId = message.channelId ?? message.channel?.id ?? 'unknown';

        if (!config.modules.isModuleEnabled('komaruChat', message.guildId, channelId)) {
            return { shouldRespond: false, bypassCooldown: false };
        }

        const content = String(message.content ?? '').trim();
        // Ignore prefix commands
        if (content.startsWith('!')) {
            return { shouldRespond: false, bypassCooldown: false };
        }

        // 1. Direct reply to a message sent by Komaru
        if (
            clientUserId &&
            message.reference &&
            message.mentions?.repliedUser?.id === clientUserId
        ) {
            return { shouldRespond: true, bypassCooldown: false };
        }

        // 2. Explicit "komaru" keyword trigger (does not use @mention to avoid userCommands conflict)
        if (/\bkomaru\b/i.test(content)) {
            return { shouldRespond: true, bypassCooldown: false };
        }

        // 3. Passive engagement in explicitly enabled chat channels
        if (this.isChannelEnabled(guildId, channelId)) {
            if (randomFn() < config.komaruChat.passiveReplyChance) {
                return { shouldRespond: true, bypassCooldown: false };
            }
        }

        return { shouldRespond: false, bypassCooldown: false };
    }

    public async handleMessage(message: any, clientUserId?: string): Promise<boolean> {
        const trigger = this.shouldRespondToMessage(message, clientUserId);
        if (!trigger.shouldRespond) {
            return false;
        }

        const guildId = message.guildId ?? 'dm';
        const channelId = message.channelId ?? message.channel?.id ?? 'unknown';
        const userId = message.author?.id ?? 'unknown';
        const userName =
            message.member?.displayName ||
            message.author?.displayName ||
            message.author?.username ||
            'friend';

        const guildState = this.getGuildState(guildId);
        const result = this.engine.processMessage({
            guildState,
            channelId,
            userId,
            userName,
            content: String(message.content ?? ''),
            bypassCooldown: trigger.bypassCooldown,
        });

        if (result.rateLimited || !result.reply) {
            return false;
        }

        this.saveState();

        try {
            await message.reply({
                content: result.reply,
                allowedMentions: { repliedUser: false },
            });
            return true;
        } catch (error) {
            logger.error(`Failed to send Komaru chat reply: ${error}`);
            return false;
        }
    }

    public async handleChatCommand(interaction: any): Promise<void> {
        const messageText = interaction.options?.getString?.('message', true) ?? '';
        const guildId = interaction.guildId ?? 'dm';
        const channelId = interaction.channelId ?? 'unknown';
        const userId = interaction.user?.id ?? 'unknown';
        const userName =
            interaction.member?.displayName ||
            interaction.user?.displayName ||
            interaction.user?.username ||
            'friend';

        const guildState = this.getGuildState(guildId);
        const result = this.engine.processMessage({
            guildState,
            channelId,
            userId,
            userName,
            content: messageText,
            bypassCooldown: true,
        });

        this.saveState();
        await interaction.reply({ content: result.reply });
    }

    public async handleInteractCommand(interaction: any): Promise<void> {
        const action = (interaction.options?.getString?.('action', true) ??
            'pet') as InteractAction;
        const userId = interaction.user?.id ?? 'unknown';
        const remainingMs = this.engine.checkInteractCooldown(userId);

        if (remainingMs > 0) {
            const seconds = Math.ceil(remainingMs / 1000);
            await interaction.reply({
                content: `*tail flick* Wait ${seconds}s before interacting with Komaru again!`,
                ephemeral: true,
            });
            return;
        }

        const guildId = interaction.guildId ?? 'dm';
        const channelId = interaction.channelId ?? 'unknown';
        const userName =
            interaction.member?.displayName ||
            interaction.user?.displayName ||
            interaction.user?.username ||
            'friend';

        const guildState = this.getGuildState(guildId);
        const result = this.engine.processInteract({
            guildState,
            channelId,
            userId,
            userName,
            action,
        });

        this.saveState();
        await interaction.reply({ content: result.reply });
    }

    public async handleMoodCommand(interaction: any): Promise<void> {
        const guildId = interaction.guildId ?? 'dm';
        const userId = interaction.user?.id ?? 'unknown';
        const guildState = this.getGuildState(guildId);
        const now = Date.now();

        const stats = applyTimeDecay(guildState.mood, now, config.komaruChat.decayIntervalMinutes);
        guildState.mood = stats;
        this.saveState();

        const mood = deriveMood(stats, now);
        const hint = getMoodHint(mood, stats);
        const bond = guildState.userBonds[userId];
        const affinity = bond?.affinity ?? 0;
        const bondTitle = getBondTitle(affinity);
        const nicknameStatus = bond?.nickname
            ? `Nickname: **${bond.nickname}**`
            : affinity >= NICKNAME_UNLOCK_AFFINITY
              ? 'Nickname: Unlocked (set with `/komaru_nickname`)'
              : `Nickname: Locked (${affinity}/${NICKNAME_UNLOCK_AFFINITY} affinity)`;

        const embed = new EmbedBuilder()
            .setTitle(`Komaru's Mood: ${mood.toUpperCase()}`)
            .setDescription(hint)
            .setColor(MOOD_COLORS[mood])
            .addFields(
                { name: 'Happiness', value: renderBar(stats.happiness), inline: true },
                { name: 'Energy', value: renderBar(stats.energy), inline: true },
                { name: 'Hunger', value: renderBar(stats.hunger), inline: true },
                {
                    name: 'Your Bond',
                    value: `${bondTitle} (Affinity: ${affinity}, Interactions: ${bond?.interactions ?? 0})\n${nicknameStatus}`,
                    inline: false,
                },
            );

        await interaction.reply({ embeds: [embed] });
    }

    public async handleNicknameCommand(interaction: any): Promise<void> {
        const guildId = interaction.guildId ?? 'dm';
        const userId = interaction.user?.id ?? 'unknown';
        const guildState = this.getGuildState(guildId);
        const clear = Boolean(interaction.options?.getBoolean?.('clear', false));
        const requestedNickname = interaction.options?.getString?.('nickname', false);

        if (clear) {
            const cleared = this.engine.clearUserNickname(guildState, userId);
            if (cleared) {
                this.saveState();
                await interaction.reply({
                    content:
                        '*tilts head* Okay! I cleared your custom nickname and will use your regular name again, nya~',
                    ephemeral: true,
                });
            } else {
                await interaction.reply({
                    content: 'You do not have a custom Komaru nickname set right now.',
                    ephemeral: true,
                });
            }
            return;
        }

        if (requestedNickname === null || requestedNickname === undefined) {
            const bond = guildState.userBonds[userId];
            const affinity = bond?.affinity ?? 0;
            const current = bond?.nickname;
            if (current) {
                await interaction.reply({
                    content: `Komaru currently calls you **${current}** (Affinity: ${affinity}). Pass \`nickname:\` to change it or \`clear:true\` to remove it.`,
                    ephemeral: true,
                });
            } else if (affinity >= NICKNAME_UNLOCK_AFFINITY) {
                await interaction.reply({
                    content: `You have unlocked custom nicknames! (Affinity: ${affinity}/${NICKNAME_UNLOCK_AFFINITY}). Run \`/komaru_nickname nickname:<name>\` to set one.`,
                    ephemeral: true,
                });
            } else {
                await interaction.reply({
                    content: `Custom nicknames unlock at **Trusted Friend** (${NICKNAME_UNLOCK_AFFINITY} affinity). Your current affinity is **${affinity}**. Keep chatting or interacting with Komaru!`,
                    ephemeral: true,
                });
            }
            return;
        }

        const result = this.engine.setUserNickname(guildState, userId, requestedNickname);
        if (!result.ok) {
            if (result.reason === 'locked') {
                await interaction.reply({
                    content: `*tilts head* We are not quite close enough for nicknames yet! Reach **Trusted Friend** (${result.affinity}/${result.requiredAffinity} affinity) first.`,
                    ephemeral: true,
                });
            } else {
                await interaction.reply({
                    content: `That nickname is invalid. Keep it between 1 and ${MAX_NICKNAME_LENGTH} characters with no mentions.`,
                    ephemeral: true,
                });
            }
            return;
        }

        this.saveState();
        await interaction.reply({
            content: `*perks up ears and memorizes it* Okay! From now on Komaru will call you **${result.nickname}**, nya~`,
        });
    }

    public async handleChannelCommand(interaction: any): Promise<void> {
        const isAdmin =
            Boolean(interaction.memberPermissions?.has?.('Administrator')) ||
            Boolean(interaction.memberPermissions?.has?.('ManageChannels')) ||
            (process.env.BOT_OWNER_ID && interaction.user?.id === process.env.BOT_OWNER_ID);

        if (!isAdmin) {
            await interaction.reply({
                content: 'You need Administrator or Manage Channels permissions to configure this.',
                ephemeral: true,
            });
            return;
        }

        const mode = interaction.options?.getString?.('mode', true) ?? 'status';
        const guildId = interaction.guildId ?? 'dm';
        const channelId = interaction.channelId ?? 'unknown';

        if (mode === 'enable') {
            const added = this.enableChannel(guildId, channelId);
            await interaction.reply({
                content: added
                    ? 'Komaru will now passively join conversations in this channel!'
                    : 'Passive chat is already enabled in this channel.',
                ephemeral: true,
            });
            return;
        }

        if (mode === 'disable') {
            const removed = this.disableChannel(guildId, channelId);
            await interaction.reply({
                content: removed
                    ? 'Passive chat disabled for this channel. Komaru will still respond when addressed by name ("komaru") or via `/chat`.'
                    : 'Passive chat was not enabled in this channel.',
                ephemeral: true,
            });
            return;
        }

        const enabled = this.isChannelEnabled(guildId, channelId);
        await interaction.reply({
            content: `Passive Komaru chat in this channel is currently **${enabled ? 'enabled' : 'disabled'}**.`,
            ephemeral: true,
        });
    }
}

export const komaruChatService = new KomaruChatService();
