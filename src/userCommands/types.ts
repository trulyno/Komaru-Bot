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
    'say' | 'reply' | 'whisper' | 'send' | 'memorize' | 'embed' | 'ponder' | 'pipeline';

export interface ComplexValue {
    type: 'choice' | 'random' | 'calc' | 'remember' | 'literal';
    value?: any;
    min?: number;
    max?: number;
    slot?: number;
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
