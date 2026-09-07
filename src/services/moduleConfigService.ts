import fs from 'node:fs';
import path from 'node:path';
import { logger } from '../logger';

export interface GuildModuleConfig {
    disabledModules: string[];
    channelDisabledModules: Record<string, string[]>;
}

export interface ModulesConfigFile {
    guilds: Record<string, GuildModuleConfig>;
}

const DEFAULT_CONFIG_FILE: ModulesConfigFile = {
    guilds: {},
};

// Critical core modules that can never be disabled to prevent lockout
export const UNBLOCKABLE_MODULES = new Set<string>(['admin', 'help']);

export class ModuleConfigService {
    private filePath: string;
    private configData: ModulesConfigFile;

    constructor(customFilePath?: string) {
        this.filePath =
            customFilePath ?? path.resolve(process.cwd(), 'data', 'modules_config.json');
        this.configData = this.loadConfig();
    }

    private loadConfig(): ModulesConfigFile {
        try {
            if (fs.existsSync(this.filePath)) {
                const raw = fs.readFileSync(this.filePath, 'utf-8');
                const parsed = JSON.parse(raw) as Partial<ModulesConfigFile>;
                return {
                    guilds: parsed.guilds ?? {},
                };
            }
        } catch (error) {
            logger.error(`Failed to load module configuration from ${this.filePath}: ${error}`);
        }
        return { guilds: {} };
    }

    private saveConfig(): void {
        try {
            const dir = path.dirname(this.filePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(this.filePath, JSON.stringify(this.configData, null, 4), 'utf-8');
        } catch (error) {
            logger.error(`Failed to save module configuration to ${this.filePath}: ${error}`);
        }
    }

    public reload(): void {
        this.configData = this.loadConfig();
    }

    public getGuildConfig(guildId: string): GuildModuleConfig {
        if (!this.configData.guilds[guildId]) {
            return {
                disabledModules: [],
                channelDisabledModules: {},
            };
        }
        return {
            disabledModules: [...(this.configData.guilds[guildId].disabledModules || [])],
            channelDisabledModules: {
                ...(this.configData.guilds[guildId].channelDisabledModules || {}),
            },
        };
    }

    public isModuleEnabled(
        moduleName: string,
        guildId?: string | null,
        channelId?: string | null,
    ): boolean {
        const normalized = moduleName.trim().toLowerCase();
        if (UNBLOCKABLE_MODULES.has(normalized)) {
            return true;
        }

        if (!guildId) {
            return true;
        }

        const guildConfig = this.configData.guilds[guildId];
        if (!guildConfig) {
            return true;
        }

        // Check guild-wide disabled status
        const isGuildDisabled = (guildConfig.disabledModules || []).some(
            (m) => m.toLowerCase() === normalized,
        );
        if (isGuildDisabled) {
            return false;
        }

        // Check channel-specific disabled status
        if (channelId && guildConfig.channelDisabledModules?.[channelId]) {
            const isChannelDisabled = guildConfig.channelDisabledModules[channelId].some(
                (m) => m.toLowerCase() === normalized,
            );
            if (isChannelDisabled) {
                return false;
            }
        }

        return true;
    }

    public disableModuleInGuild(guildId: string, moduleName: string): boolean {
        const normalized = moduleName.trim();
        if (UNBLOCKABLE_MODULES.has(normalized.toLowerCase())) {
            return false;
        }

        if (!this.configData.guilds[guildId]) {
            this.configData.guilds[guildId] = {
                disabledModules: [],
                channelDisabledModules: {},
            };
        }

        const guild = this.configData.guilds[guildId];
        if (!guild.disabledModules) {
            guild.disabledModules = [];
        }

        if (!guild.disabledModules.some((m) => m.toLowerCase() === normalized.toLowerCase())) {
            guild.disabledModules.push(normalized);
            this.saveConfig();
            return true;
        }

        return false;
    }

    public enableModuleInGuild(guildId: string, moduleName: string): boolean {
        const normalized = moduleName.trim().toLowerCase();
        const guild = this.configData.guilds[guildId];
        if (!guild || !guild.disabledModules) {
            return false;
        }

        const initialLen = guild.disabledModules.length;
        guild.disabledModules = guild.disabledModules.filter((m) => m.toLowerCase() !== normalized);

        if (guild.disabledModules.length !== initialLen) {
            this.saveConfig();
            return true;
        }

        return false;
    }

    public disableModuleInChannel(guildId: string, channelId: string, moduleName: string): boolean {
        const normalized = moduleName.trim();
        if (UNBLOCKABLE_MODULES.has(normalized.toLowerCase())) {
            return false;
        }

        if (!this.configData.guilds[guildId]) {
            this.configData.guilds[guildId] = {
                disabledModules: [],
                channelDisabledModules: {},
            };
        }

        const guild = this.configData.guilds[guildId];
        if (!guild.channelDisabledModules) {
            guild.channelDisabledModules = {};
        }

        if (!guild.channelDisabledModules[channelId]) {
            guild.channelDisabledModules[channelId] = [];
        }

        const channelList = guild.channelDisabledModules[channelId];
        if (!channelList.some((m) => m.toLowerCase() === normalized.toLowerCase())) {
            channelList.push(normalized);
            this.saveConfig();
            return true;
        }

        return false;
    }

    public enableModuleInChannel(guildId: string, channelId: string, moduleName: string): boolean {
        const normalized = moduleName.trim().toLowerCase();
        const guild = this.configData.guilds[guildId];
        if (!guild || !guild.channelDisabledModules || !guild.channelDisabledModules[channelId]) {
            return false;
        }

        const channelList = guild.channelDisabledModules[channelId];
        const initialLen = channelList.length;
        const updatedList = channelList.filter((m) => m.toLowerCase() !== normalized);

        if (updatedList.length === 0) {
            delete guild.channelDisabledModules[channelId];
        } else {
            guild.channelDisabledModules[channelId] = updatedList;
        }

        if (updatedList.length !== initialLen) {
            this.saveConfig();
            return true;
        }

        return false;
    }

    public getDisabledModulesForGuild(guildId: string): string[] {
        const guild = this.configData.guilds[guildId];
        return guild?.disabledModules ? [...guild.disabledModules] : [];
    }

    public getDisabledModulesForChannel(guildId: string, channelId: string): string[] {
        const guild = this.configData.guilds[guildId];
        return guild?.channelDisabledModules?.[channelId]
            ? [...guild.channelDisabledModules[channelId]]
            : [];
    }

    public resetGuildConfig(guildId: string): void {
        if (this.configData.guilds[guildId]) {
            delete this.configData.guilds[guildId];
            this.saveConfig();
        }
    }
}

export const moduleConfigService = new ModuleConfigService();
