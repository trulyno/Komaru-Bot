import { matchIntent } from './intents';
import { applyInteraction, DEFAULT_MOOD_STATS, deriveMood, getBondTitle } from './mood';
import { selectResponse } from './responses';
import {
    GuildChatState,
    IntentCategory,
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

const INTENT_TO_MOOD_ACTION: Partial<Record<IntentCategory, MoodAction>> = {
    pet: 'pet',
    belly_rub: 'belly_rub',
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

        const recent = this.recentResponsesByChannel.get(params.channelId) ?? [];
        const reply = selectResponse(intentMatch, moodResult.mood, {
            userName: params.userName,
            bondTitle: getBondTitle(bond.affinity),
            overstimulated: moodResult.overstimulated,
            bellyTrapTriggered: moodResult.bellyTrapTriggered,
            recentResponses: recent,
        });

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
        action: 'pet' | 'treat' | 'play' | 'catnip' | 'nap';
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

        const actionToIntent: Record<typeof params.action, IntentCategory> = {
            pet: 'pet',
            treat: 'feed_treat',
            play: 'play',
            catnip: 'catnip',
            nap: 'nap',
        };

        const intentMatch = {
            intent: actionToIntent[params.action],
            confidence: 1,
        };

        const recent = this.recentResponsesByChannel.get(params.channelId) ?? [];
        const reply = selectResponse(intentMatch, moodResult.mood, {
            userName: params.userName,
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
