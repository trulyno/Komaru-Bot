import path from 'node:path';
import { EnvConfig, loadEnvConfig } from './envConfig';
import { loadJsonConfigFile } from './jsonLoader';
import type { CatReactionsConfig } from '../services/catReactionsService';
import type { PassTheTunaConfig } from '../passTheTuna';

export interface TemplateConfig {
    issueTemplateFields: string[];
    suggestionTemplateFields: string[];
    modpackVersions: string[];
    defaultExamples: {
        modifications: string;
        description: string;
        suggestionTitle: string;
        suggestionDescription: string;
        suggestionFit: string;
        suggestionIssues: string;
    };
}

export interface AuditLogConfig {
    maxTimeoutMs: number;
    duplicateSpamWindowMs: number;
    ghostPingWindowMs: number;
    defaultModeratorRoleName: string;
    defaultAdminRoleName: string;
}

export const DEFAULT_TEMPLATE_CONFIG: TemplateConfig = {
    issueTemplateFields: [
        'modpack version',
        'is on server',
        'modifications done',
        'description',
    ],
    suggestionTemplateFields: [
        'description',
        'how would it fit with start',
        'possible issues',
    ],
    modpackVersions: [
        'Theta 1 Hotfix 3',
        'Theta 1 Hotfix 2',
        'Theta 1 Hotfix 1',
        'Theta 1',
        'Eta 3 Hotfix 3',
        'Eta 3 Hotfix 2',
        'Eta 3 Hotfix 1',
        'Eta 3',
        'Eta 2 Hotfix 1',
        'Eta 2',
        'Eta Hotfix 3',
        'Eta Hotfix 2',
        'Eta Hotfix 1',
        'Eta',
        'Zeta Hotfix 5',
        'Zeta Hotfix 4',
        'Zeta Hotfix 3',
        'Zeta Hotfix 2',
        'Zeta Hotfix 1',
        'Zeta',
        'Epsilon Hotfix 4',
        'Epsilon Hotfix 3',
        'Epsilon Hotfix 2',
        'Epsilon Hotfix 1',
        'Epsilon',
        'Delta Hotfix 3',
        'Delta Hotfix 2',
        'Delta Hotfix 1',
        'Delta',
    ],
    defaultExamples: {
        modifications: 'Write here any additions you have made to the modpack',
        description: 'Describe your issue',
        suggestionTitle: '(Have a short title that will explain the general idea)',
        suggestionDescription: '(Describe in detail the suggestion)',
        suggestionFit: '(Explain why your idea will improve Star Technology)',
        suggestionIssues:
            '(List the possible issues that might arise from implementing your idea, if you can think of any)',
    },
};

export const DEFAULT_AUDIT_LOG_CONFIG: AuditLogConfig = {
    maxTimeoutMs: 1000 * 60 * 60 * 24 * 28,
    duplicateSpamWindowMs: 1000 * 10,
    ghostPingWindowMs: 1000 * 10,
    defaultModeratorRoleName: 'Moderator',
    defaultAdminRoleName: 'Administrator',
};

export const DEFAULT_CAT_REACTIONS_CONFIG: CatReactionsConfig = {
    cat_triggers: ['nya', 'meow', 'mew'],
    cat_response_rate: 0.1,
    cat_responses: {
        curious: ['Nya? 🐱'],
    },
    komaru_emojis: ['😸'],
    komaru_responses: ['Nya~!'],
    komaru_gifs: [],
    bingus_gifs: [],
    bingus_responses: ['Bingus!'],
    komaru_response_weights: {
        emoji_react: 40,
        text_response: 40,
        gif_response: 20,
    },
    elaboration_chance: 0.1,
    max_komaru_emojis: 3,
};

export const DEFAULT_PASS_THE_TUNA_CONFIG: PassTheTunaConfig = {
    passBaseScore: 10,
    takeBaseScore: 25,
    gracePeriodSeconds: 30,
    deliciousThresholdMin: 5,
    deliciousThresholdMax: 15,
    idlePenaltyThresholdHours: 12,
    idlePenaltyMultiplier: 0.5,
    announcementTurnsBeforeDelicious: 2,
    passGifPath: 'data/pass_the_tuna/pass.gif',
    takeGifPath: 'data/pass_the_tuna/take.gif',
    events: [],
};

class ConfigManager {
    private envConfigCache?: EnvConfig;
    private templateConfigCache?: TemplateConfig;
    private auditLogConfigCache?: AuditLogConfig;
    private catReactionsConfigCache?: CatReactionsConfig;
    private passTheTunaConfigCache?: PassTheTunaConfig;

    public get env(): EnvConfig {
        if (!this.envConfigCache) {
            this.envConfigCache = loadEnvConfig();
        }
        return this.envConfigCache;
    }

    public get templates(): TemplateConfig {
        if (!this.templateConfigCache) {
            const filePath = path.resolve(process.cwd(), 'data', 'template_config.json');
            this.templateConfigCache = loadJsonConfigFile<TemplateConfig>(
                filePath,
                DEFAULT_TEMPLATE_CONFIG,
            );
        }
        return this.templateConfigCache;
    }

    public get auditLog(): AuditLogConfig {
        if (!this.auditLogConfigCache) {
            const filePath = path.resolve(process.cwd(), 'data', 'audit_log_config.json');
            this.auditLogConfigCache = loadJsonConfigFile<AuditLogConfig>(
                filePath,
                DEFAULT_AUDIT_LOG_CONFIG,
            );
        }
        return this.auditLogConfigCache;
    }

    public get catReactions(): CatReactionsConfig {
        if (!this.catReactionsConfigCache) {
            const filePath = path.resolve(process.cwd(), 'data', 'cat_reactions_config.json');
            this.catReactionsConfigCache = loadJsonConfigFile<CatReactionsConfig>(
                filePath,
                DEFAULT_CAT_REACTIONS_CONFIG,
            );
        }
        return this.catReactionsConfigCache;
    }

    public get tuna(): PassTheTunaConfig {
        if (!this.passTheTunaConfigCache) {
            const filePath = path.resolve(process.cwd(), 'data', 'pass_the_tuna', 'config.json');
            this.passTheTunaConfigCache = loadJsonConfigFile<PassTheTunaConfig>(
                filePath,
                DEFAULT_PASS_THE_TUNA_CONFIG,
            );
        }
        return this.passTheTunaConfigCache;
    }

    /**
     * Forces reloading of environment and JSON configuration caches from disk.
     */
    public reload(): void {
        this.envConfigCache = loadEnvConfig();
        this.templateConfigCache = undefined;
        this.auditLogConfigCache = undefined;
        this.catReactionsConfigCache = undefined;
        this.passTheTunaConfigCache = undefined;
    }
}

export const config = new ConfigManager();
