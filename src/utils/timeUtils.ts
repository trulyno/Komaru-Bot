export type TimeCommand = 'time' | 'mytime';

export interface ParsedTimeExpression {
    command: TimeCommand;
    offsetMs: number;
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
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    });

    return `${formatter.format(date)} (${timezone})`;
}

export function isValidTimezone(timezone: string): boolean {
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
        return true;
    } catch {
        return false;
    }
}

export function buildTimeReply(command: ParsedTimeExpression, timezone?: string | null): string {
    const baseDate = new Date(Date.now() + command.offsetMs);

    if (command.command === 'mytime') {
        return timezone
            ? `Current time for you: ${formatTimeForTimezone(baseDate, timezone)}`
            : 'You have not registered a timezone yet. Use !settimezone <IANA timezone> to register one.';
    }

    return `Current time: ${formatTimeForTimezone(baseDate, 'UTC')}`;
}
