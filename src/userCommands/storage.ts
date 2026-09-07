import fs from 'node:fs';
import path from 'node:path';
import { logger } from '../logger';
import { UserCommandJson, UserCommandTrigger } from './types';

export class UserCommandStorage {
    private baseDir: string;
    private mediaDir: string;

    constructor(baseDir?: string) {
        this.baseDir = baseDir || path.resolve(process.cwd(), 'data', 'user_commands');
        this.mediaDir = path.join(this.baseDir, 'media');
        this.ensureDirectories();
    }

    private ensureDirectories(): void {
        if (!fs.existsSync(this.baseDir)) {
            fs.mkdirSync(this.baseDir, { recursive: true });
        }
        if (!fs.existsSync(this.mediaDir)) {
            fs.mkdirSync(this.mediaDir, { recursive: true });
        }
    }

    public saveCommand(
        cmdJson: UserCommandJson,
        rawContent: string,
        mediaFiles?: Array<{ filename: string; buffer: Buffer }>,
    ): void {
        this.ensureDirectories();
        const cmdName = cmdJson.metadata.name;

        // Save media files if attached
        if (mediaFiles && mediaFiles.length > 0) {
            const cmdMediaFolder = path.join(this.mediaDir, cmdName);
            if (!fs.existsSync(cmdMediaFolder)) {
                fs.mkdirSync(cmdMediaFolder, { recursive: true });
            }

            mediaFiles.forEach((file, idx) => {
                const indexNum = idx + 1;
                const filePath = path.join(cmdMediaFolder, file.filename);
                fs.writeFileSync(filePath, file.buffer);

                const mediaItem = {
                    id: `${cmdName}_${indexNum}`,
                    filename: file.filename,
                    path: filePath,
                    index: indexNum,
                };
                cmdJson.media[file.filename] = mediaItem;
                cmdJson.media[`&${indexNum}`] = mediaItem;
            });
        }

        // Save raw .md file
        const mdPath = path.join(this.baseDir, `${cmdName}.md`);
        fs.writeFileSync(mdPath, rawContent, 'utf-8');

        // Save .json file
        const jsonPath = path.join(this.baseDir, `${cmdName}.json`);
        fs.writeFileSync(jsonPath, JSON.stringify(cmdJson, null, 4), 'utf-8');

        logger.info(`Saved user command: ${cmdName} to ${jsonPath}`);
    }

    public loadAllCommands(): UserCommandJson[] {
        this.ensureDirectories();
        const commands: UserCommandJson[] = [];

        try {
            const files = fs.readdirSync(this.baseDir);
            for (const file of files) {
                if (file.endsWith('.json')) {
                    const jsonPath = path.join(this.baseDir, file);
                    try {
                        const content = fs.readFileSync(jsonPath, 'utf-8');
                        const parsed = JSON.parse(content) as UserCommandJson;
                        commands.push(parsed);
                    } catch (err) {
                        logger.error(`Error reading user command file ${file}: ${err}`);
                    }
                }
            }
        } catch (err) {
            logger.error(`Failed to list user commands directory: ${err}`);
        }

        return commands;
    }

    public getCommand(name: string): UserCommandJson | null {
        const jsonPath = path.join(this.baseDir, `${name}.json`);
        if (fs.existsSync(jsonPath)) {
            try {
                const content = fs.readFileSync(jsonPath, 'utf-8');
                return JSON.parse(content) as UserCommandJson;
            } catch {
                return null;
            }
        }

        // Check if name is an alias
        const allCmds = this.loadAllCommands();
        const foundByAlias = allCmds.find(
            (c) => c.aliases && c.aliases.some((a) => a.toLowerCase() === name.toLowerCase()),
        );
        return foundByAlias || null;
    }

    public getRawCommand(name: string): string | null {
        const cmd = this.getCommand(name);
        if (!cmd) return null;

        const mdPath = path.join(this.baseDir, `${cmd.metadata.name}.md`);
        if (!fs.existsSync(mdPath)) {
            return null;
        }
        try {
            return fs.readFileSync(mdPath, 'utf-8');
        } catch {
            return null;
        }
    }

    public deleteCommand(name: string): boolean {
        let deletedAny = false;

        const jsonPath = path.join(this.baseDir, `${name}.json`);
        if (fs.existsSync(jsonPath)) {
            fs.unlinkSync(jsonPath);
            deletedAny = true;
        }

        const mdPath = path.join(this.baseDir, `${name}.md`);
        if (fs.existsSync(mdPath)) {
            fs.unlinkSync(mdPath);
            deletedAny = true;
        }

        const cmdMediaFolder = path.join(this.mediaDir, name);
        if (fs.existsSync(cmdMediaFolder)) {
            fs.rmSync(cmdMediaFolder, { recursive: true, force: true });
        }

        return deletedAny;
    }

    public updateTrigger(name: string, newTrigger: UserCommandTrigger): boolean {
        const cmd = this.getCommand(name);
        if (!cmd) return false;

        cmd.trigger = newTrigger;
        const raw = this.getRawCommand(name) || '';

        // Replace trigger line in raw content
        const triggerStr =
            newTrigger.scope === 'author'
                ? `when I say ${newTrigger.type === 'regex' ? `/${newTrigger.value}/` : `"${newTrigger.value}"`}`
                : `when someone says ${newTrigger.type === 'regex' ? `/${newTrigger.value}/` : `"${newTrigger.value}"`}`;

        const lines = raw.split('\n');
        let found = false;
        const updatedLines = lines.map((l) => {
            if (l.trim().toLowerCase().startsWith('when ')) {
                found = true;
                return triggerStr;
            }
            return l;
        });

        const newRaw = found ? updatedLines.join('\n') : `${raw}\n${triggerStr}`;
        this.saveCommand(cmd, newRaw);
        return true;
    }

    public addAliasToCommand(name: string, newAlias: string): boolean {
        const cmd = this.getCommand(name);
        if (!cmd) return false;

        const aliases = cmd.aliases || [];
        if (aliases.some((a) => a.toLowerCase() === newAlias.toLowerCase())) {
            return true;
        }

        aliases.push(newAlias);
        cmd.aliases = aliases;

        const raw = this.getRawCommand(name) || '';
        const aliasLine = `alias "${newAlias}"`;
        const newRaw = `${raw}\n${aliasLine}`;

        this.saveCommand(cmd, newRaw);
        return true;
    }

    public getCommandsByAuthor(authorId: string): UserCommandJson[] {
        const all = this.loadAllCommands();
        return all.filter((cmd) => cmd.metadata.author === authorId);
    }

    public findCommandsByTrigger(
        trigger: string,
    ): Array<{ commandName: string; triggerValue: string }> {
        const normalizedInput = trigger.trim().toLowerCase();
        if (!normalizedInput) {
            return [];
        }

        const all = this.loadAllCommands();
        const exactMatches = all.filter((cmd) => {
            const triggerValue = cmd.trigger.value.toLowerCase();
            return triggerValue === normalizedInput;
        });

        const scoredMatches = all
            .map((cmd) => {
                const triggerValue = cmd.trigger.value.toLowerCase();
                const similarity = this.getTriggerSimilarity(normalizedInput, triggerValue);
                return {
                    commandName: cmd.metadata.name,
                    triggerValue: cmd.trigger.value,
                    similarity,
                };
            })
            .filter((match) => match.similarity > 0)
            .sort((a, b) => b.similarity - a.similarity);

        const dedupedMatches = new Map<string, { commandName: string; triggerValue: string }>();
        for (const match of exactMatches) {
            dedupedMatches.set(match.metadata.name, {
                commandName: match.metadata.name,
                triggerValue: match.trigger.value,
            });
        }

        for (const match of scoredMatches) {
            if (!dedupedMatches.has(match.commandName)) {
                dedupedMatches.set(match.commandName, {
                    commandName: match.commandName,
                    triggerValue: match.triggerValue,
                });
            }
        }

        return Array.from(dedupedMatches.values()).slice(0, 10);
    }

    private getTriggerSimilarity(input: string, candidate: string): number {
        if (!input || !candidate) {
            return 0;
        }

        if (candidate === input) {
            return 1000;
        }

        const inputWords = input.split(/\s+/).filter(Boolean);
        const candidateWords = candidate.split(/\s+/).filter(Boolean);

        if (inputWords.length === 0 || candidateWords.length === 0) {
            return 0;
        }

        let score = 0;
        const normalizedInput = inputWords.join(' ');
        const normalizedCandidate = candidateWords.join(' ');

        if (
            normalizedInput.includes(normalizedCandidate) ||
            normalizedCandidate.includes(normalizedInput)
        ) {
            score += 200;
        }

        for (const word of inputWords) {
            if (candidate.includes(word)) {
                score += 40;
            }
        }

        for (const word of candidateWords) {
            if (input.includes(word)) {
                score += 20;
            }
        }

        const commonPrefixLength = this.getCommonPrefixLength(input, candidate);
        if (commonPrefixLength > 0) {
            score += commonPrefixLength * 10;
        }

        return score;
    }

    private getCommonPrefixLength(a: string, b: string): number {
        let i = 0;
        while (i < a.length && i < b.length && a[i] === b[i]) {
            i++;
        }
        return i;
    }

    public calculateUserStorage(authorId: string): number {
        const authorCmds = this.getCommandsByAuthor(authorId);
        let totalBytes = 0;

        for (const cmd of authorCmds) {
            const name = cmd.metadata.name;
            const mdPath = path.join(this.baseDir, `${name}.md`);
            if (fs.existsSync(mdPath)) {
                totalBytes += fs.statSync(mdPath).size;
            }

            const jsonPath = path.join(this.baseDir, `${name}.json`);
            if (fs.existsSync(jsonPath)) {
                totalBytes += fs.statSync(jsonPath).size;
            }

            const cmdMediaFolder = path.join(this.mediaDir, name);
            if (fs.existsSync(cmdMediaFolder)) {
                const files = fs.readdirSync(cmdMediaFolder);
                for (const f of files) {
                    const fPath = path.join(cmdMediaFolder, f);
                    if (fs.existsSync(fPath) && fs.statSync(fPath).isFile()) {
                        totalBytes += fs.statSync(fPath).size;
                    }
                }
            }
        }

        return totalBytes;
    }

    public wipeUserCommands(authorId: string): number {
        const authorCmds = this.getCommandsByAuthor(authorId);
        let count = 0;
        for (const cmd of authorCmds) {
            if (this.deleteCommand(cmd.metadata.name)) {
                count++;
            }
        }
        return count;
    }
}
