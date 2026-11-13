import fs from 'node:fs';
import path from 'node:path';
import { EmbedBuilder } from 'discord.js';
import { logger } from '../logger';

export interface ChangelogSection {
    title: string;
    items: string[];
}

export interface VersionEntry {
    version: string;
    date: string;
    title?: string;
    description?: string;
    sections: ChangelogSection[];
}

export const INITIAL_CHANGELOG: VersionEntry[] = [
    {
        version: '0.4.0',
        date: '2026-11-13',
        title: 'Legacy Tag Conversion & Production Deployment Pipeline',
        description:
            'Changelog tracking introduced. Major updates to deployment infrastructure, quality gates, and legacy tag migration.',
        sections: [
            {
                title: 'Added',
                items: [
                    'Changelog system and /changelog command with version inspection and historical release notes.',
                    'Legacy tag conversion command (/convert_legacy_tags) and migration engine converting legacy tags into rich user commands.',
                    'Production deployment pipeline (scripts/deploy.ts, deploy.sh, run-prod.sh) with strict multi-stage quality gates.',
                ],
            },
            {
                title: 'Changed',
                items: [
                    'Deployment pipeline configured to strictly exclude dev and test environment user commands from production targets.',
                    'Updated slash command synchronization and module loading diagnostics.',
                ],
            },
            {
                title: 'Removed',
                items: ['Google Drive backup service and associated commands.'],
            },
        ],
    },
];

export function normalizeVersion(v: string): string {
    return v.trim().replace(/^[vV]/, '');
}

export function resolveBotVersion(): string {
    const candidatePaths = [
        path.resolve(process.cwd(), 'package.json'),
        path.resolve(__dirname, '../../package.json'),
        path.resolve(__dirname, '../package.json'),
    ];

    for (const p of candidatePaths) {
        try {
            if (fs.existsSync(p)) {
                const raw = fs.readFileSync(p, 'utf8');
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed.version === 'string' && parsed.version.trim()) {
                    return parsed.version.trim();
                }
            }
        } catch {
            // try next candidate path
        }
    }

    return '0.4.0';
}

export class ChangelogService {
    private entries: VersionEntry[] = [];
    private filePath: string;

    constructor(customFilePath?: string) {
        this.filePath = customFilePath ?? path.resolve(process.cwd(), 'data', 'changelog.json');
        this.load();
    }

    public getCurrentVersion(): string {
        return resolveBotVersion();
    }

    public getTrackingStartVersion(): string {
        if (this.entries.length > 0) {
            return this.entries[this.entries.length - 1].version;
        }
        return '0.4.0';
    }

    public getAllVersions(): string[] {
        return this.entries.map((entry) => entry.version);
    }

    public hasVersion(version: string): boolean {
        return !!this.getEntry(version);
    }

    public getEntry(version?: string): VersionEntry | undefined {
        const targetVersion = version
            ? normalizeVersion(version)
            : normalizeVersion(this.getCurrentVersion());
        return this.entries.find((entry) => normalizeVersion(entry.version) === targetVersion);
    }

    public addEntry(entry: VersionEntry): void {
        const norm = normalizeVersion(entry.version);
        const index = this.entries.findIndex((e) => normalizeVersion(e.version) === norm);
        if (index >= 0) {
            this.entries[index] = entry;
        } else {
            this.entries.unshift(entry);
        }
    }

    public formatEmbed(entry: VersionEntry): EmbedBuilder {
        const currentVersion = this.getCurrentVersion();
        const isCurrent = normalizeVersion(entry.version) === normalizeVersion(currentVersion);

        const embed = new EmbedBuilder()
            .setTitle(`Komaru the Cat - Changelog v${entry.version}`)
            .setColor(0x6a5acd);

        let desc = '';
        if (entry.title) {
            desc += `**${entry.title}**\n`;
        }
        desc += `Release Date: ${entry.date}${isCurrent ? ' (Current Version)' : ''}\n`;
        if (entry.description) {
            desc += `\n${entry.description}\n`;
        }
        embed.setDescription(desc.trim());

        for (const section of entry.sections) {
            if (section.items && section.items.length > 0) {
                const bulletList = section.items.map((item) => `• ${item}`).join('\n');
                embed.addFields({
                    name: section.title,
                    value: bulletList.slice(0, 1024),
                });
            }
        }

        embed.setFooter({
            text: `Current Version: v${currentVersion} | Use /changelog [version] to view other versions`,
        });

        return embed;
    }

    public formatNotFoundMessage(requestedVersion: string): string {
        const currentVersion = this.getCurrentVersion();
        const startVersion = this.getTrackingStartVersion();
        const available = this.getAllVersions()
            .map((v) => `\`${v}\``)
            .join(', ');

        return (
            `No changelog entry found for version "${requestedVersion}".\n` +
            `Changelog tracking started at version ${startVersion}.\n` +
            `Available version(s): ${available || 'None'}\n` +
            `Use \`/changelog\` to view the current version (${currentVersion}).`
        );
    }

    public formatNotFoundEmbed(requestedVersion: string): EmbedBuilder {
        const currentVersion = this.getCurrentVersion();
        const startVersion = this.getTrackingStartVersion();
        const available = this.getAllVersions()
            .map((v) => `\`${v}\``)
            .join(', ');

        return new EmbedBuilder()
            .setTitle('Changelog: Version Not Found')
            .setColor(0xed4245)
            .setDescription(
                `No changelog entry found for version \`${requestedVersion}\`.\n\n` +
                    `Changelog tracking started at version **${startVersion}**.\n` +
                    `Available version(s): ${available || 'None'}\n\n` +
                    `Use \`/changelog\` without arguments to view the current version (\`v${currentVersion}\`).`,
            );
    }

    public formatText(entry: VersionEntry): string {
        const currentVersion = this.getCurrentVersion();
        const isCurrent = normalizeVersion(entry.version) === normalizeVersion(currentVersion);

        const lines: string[] = [
            `**Komaru the Cat - Changelog v${entry.version}**`,
            `Release Date: ${entry.date}${isCurrent ? ' (Current Version)' : ''}`,
        ];

        if (entry.title) {
            lines.push(`Title: ${entry.title}`);
        }
        if (entry.description) {
            lines.push(`\n${entry.description}`);
        }

        for (const section of entry.sections) {
            if (section.items && section.items.length > 0) {
                lines.push(`\n**${section.title}:**`);
                for (const item of section.items) {
                    lines.push(`• ${item}`);
                }
            }
        }

        lines.push(
            `\nCurrent Version: v${currentVersion} | Use /changelog [version] to view other versions`,
        );
        return lines.join('\n');
    }

    public load(): void {
        this.entries = [...INITIAL_CHANGELOG];

        try {
            if (fs.existsSync(this.filePath)) {
                const raw = fs.readFileSync(this.filePath, 'utf8');
                const parsed = JSON.parse(raw);
                const fileVersions: VersionEntry[] = Array.isArray(parsed)
                    ? parsed
                    : Array.isArray(parsed?.versions)
                      ? parsed.versions
                      : [];

                for (const v of fileVersions) {
                    if (v && v.version && Array.isArray(v.sections)) {
                        this.addEntry(v);
                    }
                }
            }
        } catch (error) {
            logger.warn(`Could not load changelog from ${this.filePath}: ${error}`);
        }
    }

    public save(): void {
        try {
            const dir = path.dirname(this.filePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(
                this.filePath,
                JSON.stringify({ versions: this.entries }, null, 4),
                'utf8',
            );
        } catch (error) {
            logger.error(`Could not save changelog to ${this.filePath}: ${error}`);
        }
    }
}

export const changelogService = new ChangelogService();
