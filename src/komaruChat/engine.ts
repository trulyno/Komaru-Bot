import { matchIntent } from './intents';
import {
    applyInteraction,
    DEFAULT_MOOD_STATS,
    deriveMood,
    getBondTitle,
    NICKNAME_UNLOCK_AFFINITY,
} from './mood';
import { selectResponse } from './responses';
import {
    GuildChatState,
    IntentCategory,
    InteractAction,
    KomaruChatConfig,
    KomaruMood,
    MoodAction,
    UserBond,
} from './types';

export interface ProcessChatResult {
    reply: string;
    mood: KomaruMood;
    intent: IntentCategory;
    rateLimited?: boolean;
}

export interface SetNicknameResult {
    ok: boolean;
    reason?: 'locked' | 'invalid';
    nickname?: string;
    affinity: number;
    requiredAffinity: number;
}

export const MAX_NICKNAME_LENGTH = 32;

const INTENT_TO_MOOD_ACTION: Partial<Record<IntentCategory, MoodAction>> = {
    pet: 'pet',
    belly_rub: 'belly_rub',
    boop: 'boop',
    brush: 'brush',
    cuddle: 'cuddle',
    box: 'box',
    pspsps: 'play',
    feed_treat: 'treat',
    catnip: 'catnip',
    play: 'play',
    nap: 'nap',
    scold_spray: 'scold',
    scary_object: 'cucumber',
    praise: 'pet',
    insult: 'scold',
};

export class KomaruChatEngine {
    private userCooldowns = new Map<string, number>();
    private channelCooldowns = new Map<string, number>();
    private interactCooldowns = new Map<string, number>();
    private recentResponsesByChannel = new Map<string, string[]>();

    constructor(private readonly getConfig: () => KomaruChatConfig) {}

    public createDefaultGuildState(now = Date.now()): GuildChatState {
        return {
            mood: { ...DEFAULT_MOOD_STATS, lastUpdatedAt: now },
            enabledChannels: [],
            userBonds: {},
        };
    }

    private getOrInitBond(state: GuildChatState, userId: string, now: number): UserBond {
        if (!state.userBonds[userId]) {
            state.userBonds[userId] = {
                affinity: 0,
                interactions: 0,
                treatsGiven: 0,
                lastInteractionAt: now,
            };
        }
        return state.userBonds[userId];
    }

    private recordRecentResponse(channelId: string, response: string): void {
        const limit = Math.max(1, this.getConfig().historyLimit);
        const list = this.recentResponsesByChannel.get(channelId) ?? [];
        list.push(response);
        if (list.length > limit) {
            list.splice(0, list.length - limit);
        }
        this.recentResponsesByChannel.set(channelId, list);
    }

    public checkMessageCooldown(
        userId: string,
        channelId: string,
        now = Date.now(),
        bypassCooldown = false,
    ): boolean {
        if (bypassCooldown) return false;
        const cfg = this.getConfig();
        const lastUser = this.userCooldowns.get(userId) ?? 0;
        const lastChannel = this.channelCooldowns.get(channelId) ?? 0;

        if (now - lastUser < cfg.userCooldownMs || now - lastChannel < cfg.channelCooldownMs) {
            return true;
        }
        return false;
    }

    public checkInteractCooldown(userId: string, now = Date.now()): number {
        const cfg = this.getConfig();
        const last = this.interactCooldowns.get(userId) ?? 0;
        const remaining = cfg.interactCooldownMs - (now - last);
        return remaining > 0 ? remaining : 0;
    }

    public setUserNickname(
        guildState: GuildChatState,
        userId: string,
        rawNickname: string,
        now = Date.now(),
    ): SetNicknameResult {
        const bond = this.getOrInitBond(guildState, userId, now);
        if (bond.affinity < NICKNAME_UNLOCK_AFFINITY) {
            return {
                ok: false,
                reason: 'locked',
                affinity: bond.affinity,
                requiredAffinity: NICKNAME_UNLOCK_AFFINITY,
            };
        }

        const sanitized = rawNickname.replace(/[\r\n\t]+/g, ' ').trim();
        if (
            !sanitized ||
            sanitized.length > MAX_NICKNAME_LENGTH ||
            /<@!?\d+>|<#\d+>|<@&\d+>|@everyone|@here/i.test(sanitized)
        ) {
            return {
                ok: false,
                reason: 'invalid',
                affinity: bond.affinity,
                requiredAffinity: NICKNAME_UNLOCK_AFFINITY,
            };
        }

        bond.nickname = sanitized;
        return {
            ok: true,
            nickname: sanitized,
            affinity: bond.affinity,
            requiredAffinity: NICKNAME_UNLOCK_AFFINITY,
        };
    }

    public clearUserNickname(guildState: GuildChatState, userId: string): boolean {
        const bond = guildState.userBonds[userId];
        if (!bond || !bond.nickname) {
            return false;
        }
        delete bond.nickname;
        return true;
    }

    /**
     * Processes a conversational message and updates guild mood & user bond.
     */
    public processMessage(params: {
        guildState: GuildChatState;
        channelId: string;
        userId: string;
        userName: string;
        content: string;
        now?: number;
        bypassCooldown?: boolean;
    }): ProcessChatResult {
        const now = params.now ?? Date.now();
        const cfg = this.getConfig();

        if (
            this.checkMessageCooldown(params.userId, params.channelId, now, params.bypassCooldown)
        ) {
            return {
                reply: '',
                mood: deriveMood(params.guildState.mood, now),
                intent: 'fallback_statement',
                rateLimited: true,
            };
        }

        const intentMatch = matchIntent(params.content);
        const moodAction: MoodAction = INTENT_TO_MOOD_ACTION[intentMatch.intent] ?? 'chat';

        const moodResult = applyInteraction(
            params.guildState.mood,
            moodAction,
            now,
            cfg.decayIntervalMinutes,
        );
        params.guildState.mood = moodResult.stats;

        const bond = this.getOrInitBond(params.guildState, params.userId, now);
        bond.affinity = Math.max(0, bond.affinity + moodResult.affinityDelta);
        bond.interactions += 1;
        if (moodAction === 'treat') {
            bond.treatsGiven += 1;
        }
        bond.lastInteractionAt = now;

        let reply: string;
        if (intentMatch.intent === 'set_nickname' && intentMatch.extracted?.nickname) {
            const nickResult = this.setUserNickname(
                params.guildState,
                params.userId,
                intentMatch.extracted.nickname,
                now,
            );
            if (nickResult.ok && nickResult.nickname) {
                reply = `*perks up ears and memorizes it* Okay! From now on I will call you **${nickResult.nickname}**, nya~`;
            } else if (nickResult.reason === 'locked') {
                reply = `*tilts head* We are not quite close enough for special nicknames yet, ${params.userName}! Reach **Trusted Friend** (${nickResult.affinity}/${nickResult.requiredAffinity} affinity) first, or check \`/komaru_mood\`.`;
            } else {
                reply = `*bats at the name tag* That nickname will not fit on my collar, ${params.userName}! Keep it between 1 and ${MAX_NICKNAME_LENGTH} characters without mentions.`;
            }
        } else {
            const effectiveName = bond.nickname || params.userName;
            const recent = this.recentResponsesByChannel.get(params.channelId) ?? [];
            reply = selectResponse(intentMatch, moodResult.mood, {
                userName: effectiveName,
                bondTitle: getBondTitle(bond.affinity),
                overstimulated: moodResult.overstimulated,
                bellyTrapTriggered: moodResult.bellyTrapTriggered,
                recentResponses: recent,
            });
        }

        this.recordRecentResponse(params.channelId, reply);
        this.userCooldowns.set(params.userId, now);
        this.channelCooldowns.set(params.channelId, now);

        return {
            reply,
            mood: moodResult.mood,
            intent: intentMatch.intent,
        };
    }

    /**
     * Processes an explicit /komaru_interact action.
     */
    public processInteract(params: {
        guildState: GuildChatState;
        channelId: string;
        userId: string;
        userName: string;
        action: InteractAction;
        now?: number;
    }): ProcessChatResult {
        const now = params.now ?? Date.now();
        const cfg = this.getConfig();

        const moodResult = applyInteraction(
            params.guildState.mood,
            params.action,
            now,
            cfg.decayIntervalMinutes,
        );
        params.guildState.mood = moodResult.stats;

        const bond = this.getOrInitBond(params.guildState, params.userId, now);
        bond.affinity = Math.max(0, bond.affinity + moodResult.affinityDelta);
        bond.interactions += 1;
        if (params.action === 'treat') {
            bond.treatsGiven += 1;
        }
        bond.lastInteractionAt = now;

        const actionToIntent: Record<InteractAction, IntentCategory> = {
            pet: 'pet',
            belly_rub: 'belly_rub',
            boop: 'boop',
            brush: 'brush',
            cuddle: 'cuddle',
            box: 'box',
            treat: 'feed_treat',
            play: 'play',
            catnip: 'catnip',
            nap: 'nap',
        };

        const intentMatch = {
            intent: actionToIntent[params.action],
            confidence: 1,
        };

        const effectiveName = bond.nickname || params.userName;
        const recent = this.recentResponsesByChannel.get(params.channelId) ?? [];
        const reply = selectResponse(intentMatch, moodResult.mood, {
            userName: effectiveName,
            bondTitle: getBondTitle(bond.affinity),
            overstimulated: moodResult.overstimulated,
            bellyTrapTriggered: moodResult.bellyTrapTriggered,
            recentResponses: recent,
        });

        this.recordRecentResponse(params.channelId, reply);
        this.interactCooldowns.set(params.userId, now);

        return {
            reply,
            mood: moodResult.mood,
            intent: intentMatch.intent,
        };
    }
}
