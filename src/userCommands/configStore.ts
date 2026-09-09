import fs from 'node:fs';
import path from 'node:path';
import { logger } from '../logger';

import { ChannelCommandConfig, UserCommandCategory } from './types';

export interface CommandReport {
    id: string;
    commandName: string;
    reporterId: string;
    reason: string;
    createdAt: string;
    status: 'open' | 'dismissed';
}

export interface RoleQuotaConfig {
    [roleKey: string]: number; // extra quota in MB for role
}

export interface AppSettingsConfig {
    allowPublicAliases: boolean;
    allowedCreationChannels?: string[];
}

const DEFAULT_CATEGORIES: UserCommandCategory[] = [
    { name: 'General', description: 'General utility and general purpose commands' },
    { name: 'Fun', description: 'Fun, games, and entertainment commands' },
    { name: 'Utility', description: 'Useful tools and information commands' },
    { name: 'Media', description: 'Media, GIFs, and image commands' },
];

export class ConfigStore {
    private baseDir: string;
    private roleQuotasFile: string;
    private restrictionsFile: string;
    private reportsFile: string;
    private settingsFile: string;
    private approvedCreatorsFile: string;
    private categoriesFile: string;
    private channelConfigsFile: string;

    private roleQuotas: RoleQuotaConfig = { default: 5, vip: 5 }; // default base 5MB, vip +5MB
    private restrictedUsers: Set<string> = new Set();
    private approvedCreators: Set<string> = new Set();
    private categories: UserCommandCategory[] = [...DEFAULT_CATEGORIES];
    private channelConfigs: Record<string, ChannelCommandConfig> = {};
    private reports: CommandReport[] = [];
    private allowPublicAliases: boolean = true;
    private allowedCreationChannels: string[] = [];

    constructor(baseDir?: string) {
        this.baseDir = baseDir || path.resolve(process.cwd(), 'data', 'user_commands_config');
        this.roleQuotasFile = path.join(this.baseDir, 'role_quotas.json');
        this.restrictionsFile = path.join(this.baseDir, 'restrictions.json');
        this.reportsFile = path.join(this.baseDir, 'reports.json');
        this.settingsFile = path.join(this.baseDir, 'settings.json');
        this.approvedCreatorsFile = path.join(this.baseDir, 'approved_creators.json');
        this.categoriesFile = path.join(this.baseDir, 'categories.json');
        this.channelConfigsFile = path.join(this.baseDir, 'channel_configs.json');
        this.loadAll();
    }

    private ensureDirectory(): void {
        if (!fs.existsSync(this.baseDir)) {
            fs.mkdirSync(this.baseDir, { recursive: true });
        }
    }

    public loadAll(): void {
        this.ensureDirectory();

        // Load role quotas
        if (fs.existsSync(this.roleQuotasFile)) {
            try {
                const content = fs.readFileSync(this.roleQuotasFile, 'utf-8');
                this.roleQuotas = JSON.parse(content);
            } catch (err) {
                logger.error(`Error loading role quotas: ${err}`);
            }
        } else {
            this.saveRoleQuotas();
        }

        // Load restrictions
        if (fs.existsSync(this.restrictionsFile)) {
            try {
                const content = fs.readFileSync(this.restrictionsFile, 'utf-8');
                const list: string[] = JSON.parse(content);
                this.restrictedUsers = new Set(list);
            } catch (err) {
                logger.error(`Error loading restrictions: ${err}`);
            }
        }

        // Load approved creators
        if (fs.existsSync(this.approvedCreatorsFile)) {
            try {
                const content = fs.readFileSync(this.approvedCreatorsFile, 'utf-8');
                const list: string[] = JSON.parse(content);
                this.approvedCreators = new Set(list);
            } catch (err) {
                logger.error(`Error loading approved creators: ${err}`);
            }
        } else {
            this.saveApprovedCreators();
        }

        // Load categories
        if (fs.existsSync(this.categoriesFile)) {
            try {
                const content = fs.readFileSync(this.categoriesFile, 'utf-8');
                this.categories = JSON.parse(content);
            } catch (err) {
                logger.error(`Error loading categories: ${err}`);
            }
        } else {
            this.saveCategories();
        }

        // Load channel configs
        if (fs.existsSync(this.channelConfigsFile)) {
            try {
                const content = fs.readFileSync(this.channelConfigsFile, 'utf-8');
                this.channelConfigs = JSON.parse(content);
            } catch (err) {
                logger.error(`Error loading channel configs: ${err}`);
            }
        } else {
            this.saveChannelConfigs();
        }

        // Load reports
        if (fs.existsSync(this.reportsFile)) {
            try {
                const content = fs.readFileSync(this.reportsFile, 'utf-8');
                this.reports = JSON.parse(content);
            } catch (err) {
                logger.error(`Error loading reports: ${err}`);
            }
        }

        // Load settings
        if (fs.existsSync(this.settingsFile)) {
            try {
                const content = fs.readFileSync(this.settingsFile, 'utf-8');
                const parsed: AppSettingsConfig = JSON.parse(content);
                if (typeof parsed.allowPublicAliases === 'boolean') {
                    this.allowPublicAliases = parsed.allowPublicAliases;
                }
                if (Array.isArray(parsed.allowedCreationChannels)) {
                    this.allowedCreationChannels = parsed.allowedCreationChannels
                        .map((c) => String(c).trim())
                        .filter(Boolean);
                }
            } catch (err) {
                logger.error(`Error loading settings: ${err}`);
            }
        } else {
            this.saveSettings();
        }
    }

    // Role Quota Methods
    public getRoleQuotas(): RoleQuotaConfig {
        return { ...this.roleQuotas };
    }

    public setRoleQuota(roleKey: string, extraMb: number): void {
        this.roleQuotas[roleKey.toLowerCase()] = extraMb;
        this.saveRoleQuotas();
    }

    public deleteRoleQuota(roleKey: string): boolean {
        const key = roleKey.toLowerCase();
        if (key in this.roleQuotas && key !== 'default') {
            delete this.roleQuotas[key];
            this.saveRoleQuotas();
            return true;
        }
        return false;
    }

    private saveRoleQuotas(): void {
        this.ensureDirectory();
        fs.writeFileSync(this.roleQuotasFile, JSON.stringify(this.roleQuotas, null, 4), 'utf-8');
    }

    // Public Alias Settings Methods
    public getAllowPublicAliases(): boolean {
        return this.allowPublicAliases;
    }

    public setAllowPublicAliases(allow: boolean): void {
        this.allowPublicAliases = allow;
        this.saveSettings();
    }

    // Allowed Creation Channels Methods
    public getAllowedCreationChannels(): string[] {
        return [...this.allowedCreationChannels];
    }

    public setAllowedCreationChannels(channels: string[]): void {
        this.allowedCreationChannels = channels.map((c) => c.trim()).filter(Boolean);
        this.saveSettings();
    }

    public addAllowedCreationChannel(channel: string): void {
        const clean = channel.trim();
        if (clean && !this.allowedCreationChannels.includes(clean)) {
            this.allowedCreationChannels.push(clean);
            this.saveSettings();
        }
    }

    public removeAllowedCreationChannel(channel: string): boolean {
        const clean = channel.trim().toLowerCase();
        const initialLen = this.allowedCreationChannels.length;
        this.allowedCreationChannels = this.allowedCreationChannels.filter((c) => {
            const normalized = c.trim().toLowerCase();
            return (
                normalized !== clean &&
                normalized.replace(/[<#>]/g, '') !== clean.replace(/[<#>]/g, '')
            );
        });
        if (this.allowedCreationChannels.length !== initialLen) {
            this.saveSettings();
            return true;
        }
        return false;
    }

    public clearAllowedCreationChannels(): void {
        this.allowedCreationChannels = [];
        this.saveSettings();
    }

    public isCreationAllowedInChannel(channelId: string, channelName?: string): boolean {
        if (this.allowedCreationChannels.length === 0) {
            return true;
        }

        const idClean = channelId.trim();
        const nameClean = (channelName || '').trim().toLowerCase().replace(/^#/, '');

        return this.allowedCreationChannels.some((allowed) => {
            const raw = allowed.trim();
            const stripped = raw.replace(/[<#>]/g, '').toLowerCase();

            if (stripped === idClean) return true;
            if (raw === channelId || raw === `<#${channelId}>`) return true;
            if (nameClean && (stripped === nameClean || raw.toLowerCase() === `#${nameClean}`)) {
                return true;
            }
            return false;
        });
    }

    public formatAllowedCreationChannels(): string {
        if (this.allowedCreationChannels.length === 0) {
            return 'all channels';
        }
        return this.allowedCreationChannels
            .map((ch) => {
                const trimmed = ch.trim();
                if (/^\d+$/.test(trimmed)) {
                    return `<#${trimmed}>`;
                }
                if (trimmed.startsWith('<#') && trimmed.endsWith('>')) {
                    return trimmed;
                }
                if (trimmed.startsWith('#')) {
                    return trimmed;
                }
                return `#${trimmed}`;
            })
            .join(', ');
    }

    private saveSettings(): void {
        this.ensureDirectory();
        const settingsData: AppSettingsConfig = {
            allowPublicAliases: this.allowPublicAliases,
            allowedCreationChannels: this.allowedCreationChannels,
        };
        fs.writeFileSync(this.settingsFile, JSON.stringify(settingsData, null, 4), 'utf-8');
    }

    // User Restriction Methods
    public isUserRestricted(userId: string): boolean {
        return this.restrictedUsers.has(userId);
    }

    public restrictUser(userId: string): void {
        this.restrictedUsers.add(userId);
        this.saveRestrictions();
    }

    public unrestrictUser(userId: string): boolean {
        const deleted = this.restrictedUsers.delete(userId);
        if (deleted) {
            this.saveRestrictions();
        }
        return deleted;
    }

    private saveRestrictions(): void {
        this.ensureDirectory();
        fs.writeFileSync(
            this.restrictionsFile,
            JSON.stringify(Array.from(this.restrictedUsers), null, 4),
            'utf-8',
        );
    }

    // Reports Methods
    public addReport(commandName: string, reporterId: string, reason: string): CommandReport {
        const report: CommandReport = {
            id: `rep_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
            commandName,
            reporterId,
            reason,
            createdAt: new Date().toISOString(),
            status: 'open',
        };
        this.reports.push(report);
        this.saveReports();
        return report;
    }

    public getReports(statusFilter?: 'open' | 'dismissed'): CommandReport[] {
        if (!statusFilter) return [...this.reports];
        return this.reports.filter((r) => r.status === statusFilter);
    }

    public dismissReport(reportId: string): boolean {
        const report = this.reports.find((r) => r.id === reportId);
        if (report) {
            report.status = 'dismissed';
            this.saveReports();
            return true;
        }
        return false;
    }

    private saveReports(): void {
        this.ensureDirectory();
        fs.writeFileSync(this.reportsFile, JSON.stringify(this.reports, null, 4), 'utf-8');
    }

    // Approved Creators Methods
    public isApprovedCreator(userId: string): boolean {
        return this.approvedCreators.has(userId);
    }

    public addApprovedCreator(userId: string): void {
        this.approvedCreators.add(userId);
        this.saveApprovedCreators();
    }

    public removeApprovedCreator(userId: string): boolean {
        const deleted = this.approvedCreators.delete(userId);
        if (deleted) {
            this.saveApprovedCreators();
        }
        return deleted;
    }

    public getApprovedCreators(): string[] {
        return Array.from(this.approvedCreators);
    }

    private saveApprovedCreators(): void {
        this.ensureDirectory();
        fs.writeFileSync(
            this.approvedCreatorsFile,
            JSON.stringify(Array.from(this.approvedCreators), null, 4),
            'utf-8',
        );
    }

    // Category Methods
    public getCategories(): UserCommandCategory[] {
        return [...this.categories];
    }

    public categoryExists(name: string): boolean {
        const normalized = name.trim().toLowerCase();
        return this.categories.some((c) => c.name.toLowerCase() === normalized);
    }

    public normalizeCategory(name?: string): string {
        if (!name || !name.trim()) return 'General';
        const trimmed = name.trim();
        const found = this.categories.find((c) => c.name.toLowerCase() === trimmed.toLowerCase());
        return found ? found.name : 'General';
    }

    public addCategory(name: string, description?: string): boolean {
        if (this.categoryExists(name)) {
            return false;
        }
        this.categories.push({
            name: name.trim(),
            description: description?.trim() || undefined,
        });
        this.saveCategories();
        return true;
    }

    public removeCategory(name: string): boolean {
        const normalized = name.trim().toLowerCase();
        if (normalized === 'general') {
            return false; // Prevent removing the default category
        }
        const initialLen = this.categories.length;
        this.categories = this.categories.filter((c) => c.name.toLowerCase() !== normalized);
        if (this.categories.length !== initialLen) {
            this.saveCategories();
            return true;
        }
        return false;
    }

    private saveCategories(): void {
        this.ensureDirectory();
        fs.writeFileSync(this.categoriesFile, JSON.stringify(this.categories, null, 4), 'utf-8');
    }

    // Channel Config Methods
    public getChannelConfig(channelId: string): ChannelCommandConfig {
        const cfg = this.channelConfigs[channelId];
        return cfg ? { ...cfg } : {};
    }

    public setChannelTimeout(channelId: string, seconds: number): void {
        const existing = this.channelConfigs[channelId] || {};
        existing.timeoutSeconds = seconds > 0 ? seconds : undefined;
        this.channelConfigs[channelId] = existing;
        this.saveChannelConfigs();
    }

    public setChannelAllowedCategories(channelId: string, categories: string[]): void {
        const existing = this.channelConfigs[channelId] || {};
        existing.allowedCategories = categories.length > 0 ? categories : undefined;
        this.channelConfigs[channelId] = existing;
        this.saveChannelConfigs();
    }

    public getAllChannelConfigs(): Record<string, ChannelCommandConfig> {
        return { ...this.channelConfigs };
    }

    private saveChannelConfigs(): void {
        this.ensureDirectory();
        fs.writeFileSync(
            this.channelConfigsFile,
            JSON.stringify(this.channelConfigs, null, 4),
            'utf-8',
        );
    }
}
