import { logger } from './logger';

export interface CommandOption {
    name: string;
    description: string;
    type: number; // 3: STRING, 4: INTEGER, 5: BOOLEAN, 6: USER, 10: NUMBER
    required?: boolean;
    choices?: Array<{ name: string; value: string | number }>;
}

export interface CommandDefinition {
    name: string;
    description: string;
    options?: CommandOption[];
    handler: (interaction: any) => Promise<void>;
}

class CommandRegistry {
    private commands = new Map<string, CommandDefinition>();

    register(command: CommandDefinition): void {
        if (this.commands.has(command.name)) {
            logger.warn(`Command ${command.name} already registered, overwriting`);
        }
        this.commands.set(command.name, command);
    }

    getAll(): CommandDefinition[] {
        return Array.from(this.commands.values());
    }

    get(name: string): CommandDefinition | undefined {
        return this.commands.get(name);
    }

    toSlashCommandData(): Array<{ name: string; description: string; options?: CommandOption[] }> {
        return this.getAll().map((cmd) => {
            const data: any = {
                name: cmd.name,
                description: cmd.description,
            };
            if (cmd.options && cmd.options.length > 0) {
                data.options = cmd.options;
            }
            return data;
        });
    }
}

export const commandRegistry = new CommandRegistry();
