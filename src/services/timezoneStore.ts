import fs from 'node:fs';
import path from 'node:path';
import { logger } from '../logger';

export class UserTimezoneStore {
    private data: Record<string, string> = {};

    constructor(
        private readonly filePath: string = path.resolve(
            process.cwd(),
            'data',
            'user_timezones.json',
        ),
    ) {
        this.load();
    }

    getUserTimezone(userId: string): string | null {
        return this.data[userId] ?? null;
    }

    setUserTimezone(userId: string, timezone: string): string {
        this.data[userId] = timezone;
        this.save();
        return timezone;
    }

    private load(): void {
        try {
            if (!fs.existsSync(this.filePath)) {
                return;
            }

            const raw = fs.readFileSync(this.filePath, 'utf8');
            if (!raw.trim()) {
                return;
            }

            const parsed = JSON.parse(raw) as Record<string, string>;
            if (parsed && typeof parsed === 'object') {
                this.data = parsed;
            }
        } catch (error) {
            logger.warn(`Unable to load user timezones from ${this.filePath}: ${error}`);
        }
    }

    private save(): void {
        try {
            fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
            fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
        } catch (error) {
            logger.error(`Unable to save user timezones to ${this.filePath}: ${error}`);
        }
    }
}
