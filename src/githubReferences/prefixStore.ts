import fs from 'node:fs';
import path from 'node:path';
import { logger } from '../logger';

export interface RepositoryPrefix {
    prefix: string;
    repository: string;
}

type PrefixesByGuild = Record<string, RepositoryPrefix[]>;

export const GLOBAL_PREFIX_SCOPE = 'global';

const PREFIX_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
const REPOSITORY_PATTERN = /^[a-z0-9_.-]+\/[a-z0-9_.-]+$/i;

export function normalizePrefix(prefix: string): string {
    return prefix.trim().toLowerCase();
}

export function normalizeRepository(repository: string): string {
    return repository.trim();
}

export function isValidPrefix(prefix: string): boolean {
    return PREFIX_PATTERN.test(prefix);
}

export function isValidRepository(repository: string): boolean {
    return REPOSITORY_PATTERN.test(repository);
}

export class GithubPrefixStore {
    private prefixesByGuild: PrefixesByGuild = {};

    constructor(
        private readonly filePath = path.resolve(
            process.cwd(),
            'data',
            'github_reference_prefixes.json',
        ),
    ) {
        this.load();
    }

    add(guildId: string, prefix: string, repository: string): boolean {
        const normalizedPrefix = normalizePrefix(prefix);
        const normalizedRepository = normalizeRepository(repository);
        if (!isValidPrefix(normalizedPrefix) || !isValidRepository(normalizedRepository)) {
            return false;
        }
        const entries = this.prefixesByGuild[guildId] ?? [];

        if (entries.some((entry) => entry.prefix === normalizedPrefix)) {
            return false;
        }

        this.prefixesByGuild[guildId] = [
            ...entries,
            { prefix: normalizedPrefix, repository: normalizedRepository },
        ].sort((left, right) => left.prefix.localeCompare(right.prefix));
        this.save();
        return true;
    }

    remove(guildId: string, prefix: string): boolean {
        const normalizedPrefix = normalizePrefix(prefix);
        const entries = this.prefixesByGuild[guildId] ?? [];
        const updatedEntries = entries.filter((entry) => entry.prefix !== normalizedPrefix);

        if (updatedEntries.length === entries.length) {
            return false;
        }

        if (updatedEntries.length === 0) {
            delete this.prefixesByGuild[guildId];
        } else {
            this.prefixesByGuild[guildId] = updatedEntries;
        }
        this.save();
        return true;
    }

    getRepository(guildId: string, prefix: string): string | undefined {
        const normalizedPrefix = normalizePrefix(prefix);
        return this.prefixesByGuild[guildId]?.find((entry) => entry.prefix === normalizedPrefix)
            ?.repository;
    }

    list(guildId: string): RepositoryPrefix[] {
        return [...(this.prefixesByGuild[guildId] ?? [])];
    }

    listForGuild(guildId: string): RepositoryPrefix[] {
        const prefixes = new Map<string, RepositoryPrefix>();
        for (const entry of this.list(GLOBAL_PREFIX_SCOPE)) {
            prefixes.set(entry.prefix, entry);
        }
        for (const entry of this.list(guildId)) {
            prefixes.set(entry.prefix, entry);
        }
        return Array.from(prefixes.values()).sort((left, right) =>
            left.prefix.localeCompare(right.prefix),
        );
    }

    private load(): void {
        if (!fs.existsSync(this.filePath)) {
            return;
        }

        try {
            const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8')) as unknown;
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                throw new Error('expected an object keyed by guild ID');
            }

            this.prefixesByGuild = Object.fromEntries(
                Object.entries(parsed).flatMap(([guildId, entries]) => {
                    if (!Array.isArray(entries)) {
                        return [];
                    }

                    const validEntries = entries.flatMap((entry) => {
                        if (!entry || typeof entry !== 'object') {
                            return [];
                        }
                        const candidate = entry as Partial<RepositoryPrefix>;
                        if (
                            typeof candidate.prefix !== 'string' ||
                            typeof candidate.repository !== 'string' ||
                            !isValidPrefix(candidate.prefix) ||
                            !isValidRepository(candidate.repository)
                        ) {
                            return [];
                        }
                        return [
                            {
                                prefix: normalizePrefix(candidate.prefix),
                                repository: normalizeRepository(candidate.repository),
                            },
                        ];
                    });

                    return validEntries.length > 0 ? [[guildId, validEntries]] : [];
                }),
            );
        } catch (error) {
            logger.error(`Failed to load GitHub reference prefixes: ${error}`);
            this.prefixesByGuild = {};
        }
    }

    private save(): void {
        fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
        fs.writeFileSync(this.filePath, JSON.stringify(this.prefixesByGuild, null, 4), 'utf8');
    }
}
