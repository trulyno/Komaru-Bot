import fs from 'node:fs';
import path from 'node:path';
import { logger } from '../logger';

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
}

export class ConfigStore {
    private baseDir: string;
    private roleQuotasFile: string;
    private restrictionsFile: string;
    private reportsFile: string;
    private settingsFile: string;

    private roleQuotas: RoleQuotaConfig = { default: 5, vip: 5 }; // default base 5MB, vip +5MB
    private restrictedUsers: Set<string> = new Set();
    private reports: CommandReport[] = [];
    private allowPublicAliases: boolean = true;

    constructor(baseDir?: string) {
        this.baseDir = baseDir || path.resolve(process.cwd(), 'data', 'user_commands_config');
        this.roleQuotasFile = path.join(this.baseDir, 'role_quotas.json');
        this.restrictionsFile = path.join(this.baseDir, 'restrictions.json');
        this.reportsFile = path.join(this.baseDir, 'reports.json');
        this.settingsFile = path.join(this.baseDir, 'settings.json');
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

    private saveSettings(): void {
        this.ensureDirectory();
        const settingsData: AppSettingsConfig = {
            allowPublicAliases: this.allowPublicAliases,
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
}
