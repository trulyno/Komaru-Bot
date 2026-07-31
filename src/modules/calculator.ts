import { commandRegistry } from '../commandRegistry';

const DEFAULT_TIMEOUT_MS = 2000;

class ExpressionTimeoutError extends Error {
    constructor(message = 'Calculation timed out') {
        super(message);
        this.name = 'ExpressionTimeoutError';
    }
}

const CAT_MESSAGES = [
    'Purr-fectly calculated, human.',
    'The cat has done the math for you.',
    'A tiny paw-sitive result just arrived.',
    'This one was whisker-thin to solve.',
];

function isSafeToken(token: string): boolean {
    return /^[0-9.+\-*/^()\s]+$/.test(token);
}

function tokenize(input: string): string[] {
    const sanitized = input.replace(/\s+/g, '');
    if (!sanitized) {
        throw new Error('No expression supplied');
    }

    if (!isSafeToken(sanitized)) {
        throw new Error('Unsupported character in expression');
    }

    return [sanitized];
}

export function evaluateExpression(
    expression: string,
    timeoutMs: number = DEFAULT_TIMEOUT_MS,
): number {
    const sanitized = expression.trim();
    if (!sanitized) {
        throw new Error('No expression supplied');
    }

    const tokens = tokenize(sanitized);
    const normalized = tokens.join('');

    let index = 0;
    const deadline = Date.now() + timeoutMs;

    const checkDeadline = (): void => {
        if (Date.now() > deadline) {
            throw new ExpressionTimeoutError();
        }
    };

    const consume = (expected?: string): string => {
        checkDeadline();
        const char = normalized[index];
        if (expected && char !== expected) {
            throw new Error(`Expected ${expected}`);
        }
        index += 1;
        return char ?? '';
    };

    const parseNumber = (): number => {
        const start = index;
        while (index < normalized.length && /[0-9.]/.test(normalized[index])) {
            checkDeadline();
            index += 1;
        }

        const fragment = normalized.slice(start, index);
        if (!fragment) {
            throw new Error('Unexpected end of expression');
        }

        const value = Number.parseFloat(fragment);
        if (!Number.isFinite(value)) {
            throw new Error('Invalid number');
        }

        return value;
    };

    const parsePrimary = (): number => {
        if (index >= normalized.length) {
            throw new Error('Unexpected end of expression');
        }

        const char = normalized[index];
        if (char === '(') {
            consume('(');
            const value = parseAddition();
            if (index >= normalized.length) {
                throw new Error('Unexpected end of expression');
            }
            consume(')');
            return value;
        }

        if (/[0-9.]/.test(char)) {
            return parseNumber();
        }

        throw new Error(`Unsupported character: ${char}`);
    };

    const parseUnary = (): number => {
        if (index >= normalized.length) {
            throw new Error('Unexpected end of expression');
        }

        const char = normalized[index];
        if (char === '+') {
            consume('+');
            return parseUnary();
        }

        if (char === '-') {
            consume('-');
            return -parseUnary();
        }

        return parsePower();
    };

    const parsePower = (): number => {
        const left = parsePrimary();

        if (index < normalized.length && normalized[index] === '^') {
            consume('^');
            const right = parseUnary();
            return Math.pow(left, right);
        }

        return left;
    };

    const parseMultiplication = (): number => {
        let value = parseUnary();

        while (index < normalized.length) {
            const char = normalized[index];
            if (char === '*') {
                consume('*');
                value *= parseUnary();
            } else if (char === '/') {
                consume('/');
                const divisor = parseUnary();
                if (divisor === 0) {
                    throw new Error('Division by zero');
                }
                value /= divisor;
            } else if (char === '%') {
                consume('%');
                const divisor = parseUnary();
                if (divisor === 0) {
                    throw new Error('Division by zero');
                }
                value %= divisor;
            } else {
                break;
            }
        }

        return value;
    };

    const parseAddition = (): number => {
        let value = parseMultiplication();

        while (index < normalized.length) {
            const char = normalized[index];
            if (char === '+') {
                consume('+');
                value += parseMultiplication();
            } else if (char === '-') {
                consume('-');
                value -= parseMultiplication();
            } else {
                break;
            }
        }

        return value;
    };

    const result = parseAddition();
    if (index < normalized.length) {
        const remaining = normalized[index];
        if (remaining === ')') {
            throw new Error('Unexpected closing parenthesis');
        }
        throw new Error(`Unexpected token: ${remaining}`);
    }

    return result;
}

export function extractExpressionFromMessage(content: string): string | null {
    const trimmed = content.trim();
    if (!trimmed) {
        return null;
    }

    const match = trimmed.match(/^!calc\s+(.+)$/i);
    if (!match) {
        return null;
    }

    return match[1].trim();
}

export function formatCatifiedResult(expression: string, result: number): string {
    const catMessage = CAT_MESSAGES[Math.floor(Math.random() * CAT_MESSAGES.length)];
    return `${catMessage}\n\`${expression}\` = **${result}**`;
}

const moduleDefinition = {
    name: 'calculator',
    description: 'Safely evaluates expressions and replies with a cat-ified result',
    register: async (client: any) => {
        commandRegistry.register({
            name: 'calc',
            description: 'Evaluate a math expression safely',
            options: [
                {
                    name: 'expression',
                    description: 'Expression to evaluate',
                    type: 3,
                    required: true,
                },
            ],
            handler: async (interaction: any) => {
                const expression = interaction.options?.getString?.('expression')?.trim();
                if (!expression) {
                    await interaction.reply({
                        content: 'Usage: /calc <expression>',
                        ephemeral: true,
                    });
                    return;
                }

                try {
                    const result = evaluateExpression(expression);
                    await interaction.reply({ content: formatCatifiedResult(expression, result) });
                } catch (error) {
                    const message =
                        error instanceof ExpressionTimeoutError
                            ? `The math cat gave up after ${DEFAULT_TIMEOUT_MS / 1000}s — that expression was too much to chase.`
                            : `The math cat could not parse that expression. ${error instanceof Error ? error.message : String(error)}`;
                    await interaction.reply({ content: message, ephemeral: true });
                }
            },
        });

        client.on('messageCreate', async (message: any) => {
            if (!message || message.author?.bot) {
                return;
            }

            const expression = extractExpressionFromMessage(message.content ?? '');
            if (!expression) {
                return;
            }

            try {
                const result = evaluateExpression(expression);
                await message.reply(formatCatifiedResult(expression, result));
            } catch (error) {
                const msg =
                    error instanceof ExpressionTimeoutError
                        ? `The math cat gave up after ${DEFAULT_TIMEOUT_MS / 1000}s — that expression was too much to chase.`
                        : `The math cat could not parse that expression. ${error instanceof Error ? error.message : String(error)}`;
                await message.reply(msg);
            }
        });
    },
};

export default moduleDefinition;
export const module = moduleDefinition;
