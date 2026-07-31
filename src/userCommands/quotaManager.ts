import { ConfigStore } from './configStore';
import { UserCommandStorage } from './storage';

export interface QuotaCheckResult {
    allowed: boolean;
    reason?: string;
    currentBytes: number;
    maxBytes: number;
    incomingBytes: number;
}

export class QuotaManager {
    constructor(
        private configStore: ConfigStore,
        private storage: UserCommandStorage,
    ) {}

    public getUserMaxStorageBytes(member: any): number {
        const quotas = this.configStore.getRoleQuotas();
        let totalMb = quotas.default ?? 5; // Base 5MB

        if (member && member.roles && member.roles.cache) {
            const roleQuotas = quotas;
            member.roles.cache.forEach((role: any) => {
                const roleName = role.name?.toLowerCase();
                const roleId = role.id;
                if (roleName && roleQuotas[roleName] && roleName !== 'default') {
                    totalMb += roleQuotas[roleName];
                } else if (roleId && roleQuotas[roleId]) {
                    totalMb += roleQuotas[roleId];
                }
            });
        }

        return Math.floor(totalMb * 1024 * 1024);
    }

    public isUserRestricted(userId: string): boolean {
        return this.configStore.isUserRestricted(userId);
    }

    public checkQuota(authorId: string, member: any, incomingBytes: number): QuotaCheckResult {
        if (this.isUserRestricted(authorId)) {
            return {
                allowed: false,
                reason: 'You are currently restricted by an admin from creating user commands.',
                currentBytes: 0,
                maxBytes: 0,
                incomingBytes,
            };
        }

        const currentBytes = this.storage.calculateUserStorage(authorId);
        const maxBytes = this.getUserMaxStorageBytes(member);

        if (currentBytes + incomingBytes > maxBytes) {
            const currentMb = (currentBytes / (1024 * 1024)).toFixed(2);
            const maxMb = (maxBytes / (1024 * 1024)).toFixed(2);
            const incomingMb = (incomingBytes / (1024 * 1024)).toFixed(2);
            return {
                allowed: false,
                reason: `Storage quota exceeded! Used: ${currentMb}MB / ${maxMb}MB. Incoming command size: ${incomingMb}MB.`,
                currentBytes,
                maxBytes,
                incomingBytes,
            };
        }

        return {
            allowed: true,
            currentBytes,
            maxBytes,
            incomingBytes,
        };
    }
}
