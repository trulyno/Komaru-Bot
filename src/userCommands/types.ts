export const DEFAULT_GLOBAL_PERSISTENCE_LIMIT = 5;
export const DEFAULT_PER_USER_PERSISTENCE_LIMIT = 25;
export const DEFAULT_MAX_USER_INPUTS = 5;

export interface PersistenceLimits {
    global?: number;
    perUser?: number;
}

export interface CommandPersistenceData {
    global: Record<string, string | number>;
    users: Record<string, Record<string, string | number>>;
    userOrder: string[];
}

export interface UserCommandMetadata {
    author: string;
    storage_used: number;
    creation_date: string;
    name: string;
    description: string;
    raw: string;
    cooldown?: number;
    category?: string;
    roles?: string[];
    channels?: string[];
    enabled?: boolean;
    lastUsed?: Record<string, number>; // timestamp per user or global
    persistenceLimits?: PersistenceLimits;
    maxUserInputs?: number;
}

export interface UserCommandCategory {
    name: string;
    description?: string;
}

export interface ChannelCommandConfig {
    timeoutSeconds?: number;
    allowedCategories?: string[]; // e.g. ['General', 'Fun'] or ['*'] for all
}

export type TriggerType = 'string' | 'regex';
export type TriggerScope = 'author' | 'everyone';

export interface UserCommandTrigger {
    type: TriggerType;
    value: string;
    scope: TriggerScope;
}

export type ActionType =
    | 'say'
    | 'reply'
    | 'whisper'
    | 'send'
    | 'think'
    | 'hide'
    | 'ask'
    | 'memorize'
    | 'embed'
    | 'ponder'
    | 'pipeline';

export interface ComplexValue {
    type: 'choice' | 'random' | 'calc' | 'remember' | 'literal' | 'thought' | 'expr';
    value?: any;
    min?: number;
    max?: number;
    slot?: number;
    thoughtName?: string;
}

export type ActionValue = string | ComplexValue | EmbedData | PonderData | PipelineData;

export interface EmbedField {
    name: string;
    value: string;
    inline?: boolean;
}

export interface EmbedData {
    title?: string;
    description?: string;
    color?: string;
    fields?: EmbedField[];
}

export interface PonderBranch {
    condition: string;
    actions: UserCommandAction[];
}

export interface PonderData {
    branches: PonderBranch[];
    otherwise?: UserCommandAction[];
}

export type PipelineOpType =
    | 'split'
    | 'filter'
    | 'join'
    | 'save'
    | 'first'
    | 'last'
    | 'trim'
    | 'lower'
    | 'upper'
    | 'as_number'
    | 'reverse'
    | 'sort'
    | 'sort_reverse'
    | 'shuffle'
    | 'pole'
    | 'return';

export interface PipelineStep {
    type: PipelineOpType;
    arg?: string;
    varSlot?: number;
    condition?: string;
}

export interface PipelineData {
    source: string;
    steps: PipelineStep[];
}

export interface UserCommandAction {
    type: ActionType;
    value: ActionValue;
    targetSlot?: number;
    thoughtName?: string;
    files?: string[];
    hideScope?: 'global' | 'user';
    hideKey?: string;
    initialValue?: string | number;
    askPrompt?: string;
    askRegex?: string;
    askRegexFlags?: string;
    askRetryMessage?: string;
}

export interface MediaItem {
    id: string;
    filename: string;
    path: string;
    url?: string;
    index: number;
}

export interface UserCommandJson {
    metadata: UserCommandMetadata;
    media: Record<string, MediaItem>;
    trigger: UserCommandTrigger;
    actions: UserCommandAction[];
    varAliases?: Record<string, number>;
    aliases?: string[];
    coauthors?: string[];
}

export interface PendingSession {
    authorId: string;
    lines: string[];
    media: Array<{ filename: string; url: string; buffer?: Buffer }>;
    createdAt: number;
}
