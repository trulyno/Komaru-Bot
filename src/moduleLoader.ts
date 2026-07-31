import fs from 'node:fs';
import path from 'node:path';
import { logger } from './logger';

function loadModuleFromFile(modulePath: string): BotModule {
    // ts-node in CommonJS mode supports require() for loading TypeScript files.
    // Using dynamic import(.) here would fail for .ts extensions in this runtime.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const loaded = require(modulePath) as { default?: BotModule; module?: BotModule };
    return (loaded.default ?? loaded.module) as BotModule;
}

export interface BotModule {
    name: string;
    description: string;
    register: (client: any, context: ModuleContext) => void | Promise<void>;
}

export interface ModuleContext {
    enableModule: (moduleName: string) => Promise<void>;
    disableModule: (moduleName: string) => Promise<void>;
    reloadModule: (moduleName: string) => Promise<void>;
    listModules: () => string[];
}

export class ModuleLoader {
    private modules = new Map<string, BotModule>();
    private enabledModules = new Set<string>();

    constructor(private readonly moduleDir: string) {}

    async loadAll(): Promise<void> {
        if (!fs.existsSync(this.moduleDir)) {
            logger.warn(`Module directory not found: ${this.moduleDir}`);
            return;
        }

        const entries = fs.readdirSync(this.moduleDir, { withFileTypes: true });
        for (const entry of entries) {
            if (!entry.isFile() || (!entry.name.endsWith('.ts') && !entry.name.endsWith('.js'))) {
                continue;
            }

            const moduleName = path.basename(entry.name, path.extname(entry.name));
            const modulePath = path.join(this.moduleDir, entry.name);
            try {
                const moduleExport = await loadModuleFromFile(modulePath);
                if (!moduleExport) {
                    continue;
                }

                this.modules.set(moduleName, moduleExport as BotModule);
                this.enabledModules.add(moduleName);
                logger.info(`Discovered module: ${moduleName}`);
            } catch (error) {
                logger.error(`Failed to load module ${moduleName}: ${error}`);
            }
        }
    }

    async registerAll(client: any): Promise<void> {
        const context: ModuleContext = {
            enableModule: async (moduleName: string) => this.enableModule(moduleName, client),
            disableModule: async (moduleName: string) => this.disableModule(moduleName),
            reloadModule: async (moduleName: string) => this.reloadModule(moduleName, client),
            listModules: () => Array.from(this.modules.keys()),
        };

        for (const moduleName of this.enabledModules) {
            const module = this.modules.get(moduleName);
            if (!module) {
                continue;
            }

            try {
                await module.register(client, context);
                logger.info(`Registered module: ${module.name}`);
            } catch (error) {
                logger.error(`Failed to register module ${moduleName}: ${error}`);
            }
        }
    }

    async enableModule(moduleName: string, client: any): Promise<void> {
        const module = this.modules.get(moduleName);
        if (!module) {
            throw new Error(`Unknown module: ${moduleName}`);
        }

        if (!this.enabledModules.has(moduleName)) {
            this.enabledModules.add(moduleName);
            await module.register(client, this.createContext(client));
            logger.info(`Enabled module: ${moduleName}`);
        }
    }

    async disableModule(moduleName: string): Promise<void> {
        this.enabledModules.delete(moduleName);
        logger.info(`Disabled module: ${moduleName}`);
    }

    async reloadModule(moduleName: string, client: any): Promise<void> {
        const modulePath = this.resolveModulePath(moduleName);
        if (!modulePath) {
            throw new Error(`Unable to find module: ${moduleName}`);
        }

        delete require.cache[require.resolve(modulePath)];

        const moduleExport = await loadModuleFromFile(modulePath);
        if (!moduleExport) {
            throw new Error(`Unable to reload module: ${moduleName}`);
        }

        this.modules.set(moduleName, moduleExport as BotModule);
        if (this.enabledModules.has(moduleName)) {
            await moduleExport.register(client, this.createContext(client));
        }
        logger.info(`Reloaded module: ${moduleName}`);
    }

    private resolveModulePath(moduleName: string): string | null {
        const candidates = [
            path.join(this.moduleDir, `${moduleName}.ts`),
            path.join(this.moduleDir, `${moduleName}.js`),
        ];
        return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
    }

    createContext(client: any): ModuleContext {
        return {
            enableModule: async (moduleName: string) => this.enableModule(moduleName, client),
            disableModule: async (moduleName: string) => this.disableModule(moduleName),
            reloadModule: async (moduleName: string) => this.reloadModule(moduleName, client),
            listModules: () => Array.from(this.modules.keys()),
        };
    }
}
