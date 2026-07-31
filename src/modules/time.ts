import fs from 'node:fs';
import path from 'node:path';
import { logger } from '../logger';
import { commandRegistry } from '../commandRegistry';

export type TimeCommand = 'time' | 'mytime';

export interface ParsedTimeExpression {
    command: TimeCommand;
    offsetMs: number;
}

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

export function parseTimeExpression(input: string): ParsedTimeExpression | null {
    const trimmed = input.trim();
    if (!trimmed) {
        return null;
    }

    const match = trimmed.match(/^!?(time|mytime)(.*)$/i);
    if (!match) {
        return null;
    }

    const command = match[1].toLowerCase() as TimeCommand;
    const suffix = (match[2] ?? '').trim();
    let offsetMs = 0;

    if (suffix) {
        const tokens = suffix.match(/[+-]\d+(?:h|m|s)?/gi) ?? [];
        for (const token of tokens) {
            const sign = token.startsWith('-') ? -1 : 1;
            const rawValue = token.slice(1);
            const multiplier = rawValue.endsWith('h')
                ? 60 * 60 * 1000
                : rawValue.endsWith('m')
                  ? 60 * 1000
                  : rawValue.endsWith('s')
                    ? 1000
                    : 60 * 60 * 1000;

            const numericValue = Number.parseInt(rawValue.replace(/[hms]/gi, ''), 10);
            if (!Number.isNaN(numericValue)) {
                offsetMs += sign * numericValue * multiplier;
            }
        }
    }

    return { command, offsetMs };
}

export function formatTimeForTimezone(date: Date, timezone: string): string {
    const formatter = new Intl.DateTimeFormat('en-GB', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    });

    return `${formatter.format(date)} (${timezone})`;
}

function isValidTimezone(timezone: string): boolean {
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
        return true;
    } catch {
        return false;
    }
}

function buildTimeReply(command: ParsedTimeExpression, timezone?: string | null): string {
    const baseDate = new Date(Date.now() + command.offsetMs);

    if (command.command === 'mytime' && timezone) {
        return `Current time for you (${timezone}): ${formatTimeForTimezone(baseDate, timezone)}`;
    }

    if (command.command === 'mytime') {
        return 'You have not registered a timezone yet. Use !settimezone <IANA timezone> to register one.';
    }

    return `Current time: ${baseDate.toISOString()}`;
}

const timezoneStore = new UserTimezoneStore();

const moduleDefinition = {
    name: 'time',
    description: 'Get the current time or a user-specific time',
    register: async (client: any) => {
        commandRegistry.register({
            name: 'settimezone',
            description: 'Set your timezone for !mytime replies',
            options: [
                { name: 'timezone', description: 'Your IANA timezone', type: 3, required: true },
            ],
            handler: async (interaction: any) => {
                const timezone = interaction.options?.getString?.('timezone')?.trim();
                if (!timezone) {
                    await interaction.reply({
                        content: 'Usage: /settimezone <IANA timezone>',
                        ephemeral: true,
                    });
                    return;
                }

                if (!isValidTimezone(timezone)) {
                    await interaction.reply({
                        content:
                            'That does not look like a valid IANA timezone. Try something like America/New_York.',
                        ephemeral: true,
                    });
                    return;
                }

                timezoneStore.setUserTimezone(interaction.user.id, timezone);
                await interaction.reply({
                    content: `Your timezone has been set to ${timezone}.`,
                    ephemeral: true,
                });
            },
        });

        client.on('messageCreate', async (message: any) => {
            if (!message || message.author?.bot) {
                return;
            }

            const content = message.content ?? '';
            const match = content.match(/!time[^\n\r]*/i) ?? content.match(/!mytime[^\n\r]*/i);
            if (!match) {
                if (content.trim().startsWith('!settimezone')) {
                    const timezone = content.slice('!settimezone'.length).trim();
                    if (!timezone) {
                        await message.reply('Usage: !settimezone <IANA timezone>');
                        return;
                    }

                    if (!isValidTimezone(timezone)) {
                        await message.reply(
                            'That does not look like a valid IANA timezone. Try something like America/New_York.',
                        );
                        return;
                    }

                    timezoneStore.setUserTimezone(message.author.id, timezone);
                    await message.reply(`Your timezone has been set to ${timezone}.`);
                }
                return;
            }

            const expression = parseTimeExpression(match[0]);
            if (!expression) {
                return;
            }

            if (expression.command === 'mytime') {
                const timezone = timezoneStore.getUserTimezone(message.author.id);
                if (!timezone) {
                    await message.reply(
                        'You have not registered a timezone yet. Use !settimezone <IANA timezone> to register one.',
                    );
                    return;
                }

                await message.reply(buildTimeReply(expression, timezone));
                return;
            }

            await message.reply(buildTimeReply(expression));
        });
    },
};

export default moduleDefinition;
export const module = moduleDefinition;
