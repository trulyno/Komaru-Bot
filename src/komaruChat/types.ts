export type KomaruMood =
    'happy' | 'playful' | 'sleepy' | 'affectionate' | 'sassy' | 'chaotic' | 'grumpy';

export type InteractAction =
    'pet' | 'belly_rub' | 'boop' | 'brush' | 'cuddle' | 'box' | 'treat' | 'play' | 'catnip' | 'nap';

export type MoodAction = InteractAction | 'scold' | 'cucumber' | 'chat';

export interface MoodStats {
    happiness: number; // 0-100
    energy: number; // 0-100
    hunger: number; // 0-100 (higher = hungrier)
    overstimulation: number; // 0-100 (high = annoyed by too many pets)
    lastUpdatedAt: number;
}

export interface UserBond {
    affinity: number;
    interactions: number;
    treatsGiven: number;
    lastInteractionAt: number;
    nickname?: string;
}

export type IntentCategory =
    | 'pet'
    | 'belly_rub'
    | 'boop'
    | 'brush'
    | 'cuddle'
    | 'box'
    | 'pspsps'
    | 'feed_treat'
    | 'catnip'
    | 'play'
    | 'nap'
    | 'scold_spray'
    | 'scary_object'
    | 'set_nickname'
    | 'choice_picker'
    | 'yes_no_question'
    | 'rate_thing'
    | 'time_status'
    | 'mood_query'
    | 'greeting'
    | 'farewell'
    | 'gratitude'
    | 'apology'
    | 'praise'
    | 'insult'
    | 'user_sad_tired'
    | 'user_happy_excited'
    | 'user_bored_hungry'
    | 'work_study'
    | 'human_food'
    | 'who_are_you'
    | 'help_capabilities'
    | 'joke_fact'
    | 'bingus_lore'
    | 'sing_dance'
    | 'secret_knock'
    | 'cat_noises'
    | 'fallback_question'
    | 'fallback_exclamation'
    | 'fallback_long'
    | 'fallback_statement';

export interface IntentMatch {
    intent: IntentCategory;
    confidence: number;
    extracted?: {
        topic?: string;
        choiceA?: string;
        choiceB?: string;
        nickname?: string;
    };
}

export interface KomaruChatConfig {
    userCooldownMs: number;
    channelCooldownMs: number;
    passiveReplyChance: number;
    interactCooldownMs: number;
    historyLimit: number;
    decayIntervalMinutes: number;
}

export interface GuildChatState {
    mood: MoodStats;
    enabledChannels: string[];
    userBonds: Record<string, UserBond>;
}

export interface KomaruChatStateFile {
    guilds: Record<string, GuildChatState>;
}

export interface ChatResponseContext {
    userName: string;
    bondTitle: string;
    overstimulated?: boolean;
    bellyTrapTriggered?: boolean;
    recentResponses?: string[];
}
