export interface UserCommandMetadata {
    author: string;
    storage_used: number;
    creation_date: string;
    name: string;
    description: string;
    raw: string;
}

export type TriggerType = 'string' | 'regex';
export type TriggerScope = 'author' | 'everyone';

export interface UserCommandTrigger {
    type: TriggerType;
    value: string;
    scope: TriggerScope;
}

export type ActionType = 'say' | 'reply' | 'whisper' | 'send' | 'memorize';

export interface ComplexValue {
    type: 'choice' | 'random' | 'calc' | 'remember' | 'literal';
    value?: any;
    min?: number;
    max?: number;
    slot?: number;
}

export type ActionValue = string | ComplexValue;

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
}

export interface PendingSession {
    authorId: string;
    lines: string[];
    media: Array<{ filename: string; url: string; buffer?: Buffer }>;
    createdAt: number;
}
