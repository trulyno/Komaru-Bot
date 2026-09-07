import fs from 'node:fs';
import path from 'node:path';
import { logger } from '../logger';

export function loadJsonConfigFile<T>(filePath: string, defaultConfig: T): T {
    try {
        if (!fs.existsSync(filePath)) {
            const dir = path.dirname(filePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(filePath, JSON.stringify(defaultConfig, null, 2), 'utf8');
            return defaultConfig;
        }

        const raw = fs.readFileSync(filePath, 'utf8');
        const parsed = JSON.parse(raw) as Partial<T>;
        return {
            ...defaultConfig,
            ...parsed,
        };
    } catch (error) {
        logger.warn(
            `Failed to load JSON config from ${filePath}, falling back to defaults: ${error}`,
        );
        return defaultConfig;
    }
}
