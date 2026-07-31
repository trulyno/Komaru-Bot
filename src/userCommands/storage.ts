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
        if (!fs.existsSync(jsonPath)) {
            return null;
        }
        try {
            const content = fs.readFileSync(jsonPath, 'utf-8');
            return JSON.parse(content) as UserCommandJson;
        } catch {
            return null;
        }
    }

    public getRawCommand(name: string): string | null {
        const mdPath = path.join(this.baseDir, `${name}.md`);
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

    public getCommandsByAuthor(authorId: string): UserCommandJson[] {
        const all = this.loadAllCommands();
        return all.filter((cmd) => cmd.metadata.author === authorId);
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
