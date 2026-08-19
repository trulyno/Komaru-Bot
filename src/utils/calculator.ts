const DEFAULT_TIMEOUT_MS = 2000;

export class ExpressionTimeoutError extends Error {
    constructor(message = 'Calculation timed out') {
        super(message);
        this.name = 'ExpressionTimeoutError';
    }
}

export const CAT_MESSAGES = [
    'Purr-fectly calculated, human.',
    'The cat has done the math for you.',
    'A tiny paw-sitive result just arrived.',
    'This one was whisker-thin to solve.',
];

function isSafeToken(token: string): boolean {
    return /^[0-9a-zA-Z.+\-*/^()\s,!%]+$/.test(token);
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

function factorial(n: number): number {
    if (!Number.isFinite(n)) {
        throw new Error('factorial() requires a finite number');
    }
    if (!Number.isInteger(n)) {
        throw new Error('factorial() requires an integer');
    }
    if (n < 0) {
        throw new Error('factorial() is undefined for negative numbers');
    }
    if (n > 170) {
        throw new Error('factorial() input is too large');
    }

    let result = 1;
    for (let i = 2; i <= n; i += 1) {
        result *= i;
    }
    return result;
}

interface MathFunctionSpec {
    minArgs: number;
    maxArgs: number;
    apply: (args: number[]) => number;
}

const FUNCTIONS: Record<string, MathFunctionSpec> = {
    // Trigonometry (radians)
    sin: { minArgs: 1, maxArgs: 1, apply: (args) => Math.sin(args[0]) },
    cos: { minArgs: 1, maxArgs: 1, apply: (args) => Math.cos(args[0]) },
    tan: { minArgs: 1, maxArgs: 1, apply: (args) => Math.tan(args[0]) },
    asin: { minArgs: 1, maxArgs: 1, apply: (args) => Math.asin(args[0]) },
    acos: { minArgs: 1, maxArgs: 1, apply: (args) => Math.acos(args[0]) },
    atan: { minArgs: 1, maxArgs: 1, apply: (args) => Math.atan(args[0]) },
    atan2: { minArgs: 2, maxArgs: 2, apply: (args) => Math.atan2(args[0], args[1]) },
    sinh: { minArgs: 1, maxArgs: 1, apply: (args) => Math.sinh(args[0]) },
    cosh: { minArgs: 1, maxArgs: 1, apply: (args) => Math.cosh(args[0]) },
    tanh: { minArgs: 1, maxArgs: 1, apply: (args) => Math.tanh(args[0]) },

    // Roots / powers
    sqrt: {
        minArgs: 1,
        maxArgs: 1,
        apply: (args) => {
            if (args[0] < 0) {
                throw new Error('sqrt() of a negative number is undefined');
            }
            return Math.sqrt(args[0]);
        },
    },
    cbrt: { minArgs: 1, maxArgs: 1, apply: (args) => Math.cbrt(args[0]) },
    pow: { minArgs: 2, maxArgs: 2, apply: (args) => Math.pow(args[0], args[1]) },

    // Logarithms / exponentials
    log: {
        minArgs: 1,
        maxArgs: 2,
        apply: (args) => {
            const x = args[0];
            if (x <= 0) {
                throw new Error('log() requires a positive number');
            }
            if (args.length === 1) {
                return Math.log10(x);
            }
            const base = args[1];
            if (base <= 0 || base === 1) {
                throw new Error('log() base must be positive and not equal to 1');
            }
            return Math.log(x) / Math.log(base);
        },
    },
    ln: {
        minArgs: 1,
        maxArgs: 1,
        apply: (args) => {
            if (args[0] <= 0) {
                throw new Error('ln() requires a positive number');
            }
            return Math.log(args[0]);
        },
    },
    log2: {
        minArgs: 1,
        maxArgs: 1,
        apply: (args) => {
            if (args[0] <= 0) {
                throw new Error('log2() requires a positive number');
            }
            return Math.log2(args[0]);
        },
    },
    exp: { minArgs: 1, maxArgs: 1, apply: (args) => Math.exp(args[0]) },

    // Rounding
    floor: { minArgs: 1, maxArgs: 1, apply: (args) => Math.floor(args[0]) },
    ceil: { minArgs: 1, maxArgs: 1, apply: (args) => Math.ceil(args[0]) },
    round: { minArgs: 1, maxArgs: 1, apply: (args) => Math.round(args[0]) },
    trunc: { minArgs: 1, maxArgs: 1, apply: (args) => Math.trunc(args[0]) },

    // Misc
    abs: { minArgs: 1, maxArgs: 1, apply: (args) => Math.abs(args[0]) },
    sign: { minArgs: 1, maxArgs: 1, apply: (args) => Math.sign(args[0]) },
    factorial: { minArgs: 1, maxArgs: 1, apply: (args) => factorial(args[0]) },

    // Variadic
    min: { minArgs: 1, maxArgs: Infinity, apply: (args) => Math.min(...args) },
    max: { minArgs: 1, maxArgs: Infinity, apply: (args) => Math.max(...args) },
    hypot: { minArgs: 1, maxArgs: Infinity, apply: (args) => Math.hypot(...args) },
    sum: {
        minArgs: 1,
        maxArgs: Infinity,
        apply: (args) => args.reduce((total, value) => total + value, 0),
    },
    avg: {
        minArgs: 1,
        maxArgs: Infinity,
        apply: (args) => args.reduce((total, value) => total + value, 0) / args.length,
    },
};

const CONSTANTS: Record<string, number> = {
    pi: Math.PI,
    e: Math.E,
};

export type VariableValues = Record<string, number | string> | Array<number | string>;

function resolveSlot(ref: string, aliases?: Record<string, number>): number {
    const num = parseInt(ref, 10);
    if (!isNaN(num)) {
        return num;
    }
    if (aliases && ref in aliases) {
        return aliases[ref];
    }
    return 0;
}

function replaceBracketVars(
    expr: string,
    variables?: VariableValues,
    varAliases?: Record<string, number>,
): string {
    const resolveValue = (ref: string): string => {
        if (Array.isArray(variables)) {
            const slot = resolveSlot(ref, varAliases);
            const val = variables[slot];
            const num = typeof val === 'number' ? val : parseFloat(String(val ?? '0'));
            return Number.isFinite(num) ? `(${num})` : '0';
        } else if (variables && typeof variables === 'object') {
            if (ref in variables) {
                const val = variables[ref];
                const num = typeof val === 'number' ? val : parseFloat(String(val ?? '0'));
                return Number.isFinite(num) ? `(${num})` : '0';
            }
            if (varAliases && ref in varAliases) {
                const slot = varAliases[ref];
                const val = (variables as any)[slot];
                const num = typeof val === 'number' ? val : parseFloat(String(val ?? '0'));
                return Number.isFinite(num) ? `(${num})` : '0';
            }
            return '0';
        } else if (varAliases && ref in varAliases) {
            return '0';
        }
        return '0';
    };

    let result = expr.replace(/remember\s*\[([a-zA-Z0-9_-]+)\]/gi, (_, ref) => resolveValue(ref));
    result = result.replace(/\[([a-zA-Z0-9_-]+)\]/gi, (_, ref) => resolveValue(ref));
    return result;
}

export function evaluateExpression(
    expression: string,
    variables?: VariableValues,
    varAliases?: Record<string, number>,
    timeoutMs: number = DEFAULT_TIMEOUT_MS,
): number {
    const sanitized = expression.trim();
    if (!sanitized) {
        throw new Error('No expression supplied');
    }

    const prepared = replaceBracketVars(sanitized, variables, varAliases);
    const tokens = tokenize(prepared);
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

    const parseIdentifierName = (): string => {
        const start = index;
        while (index < normalized.length && /[a-zA-Z0-9_]/.test(normalized[index])) {
            checkDeadline();
            index += 1;
        }
        return normalized.slice(start, index);
    };

    const parseArgumentList = (): number[] => {
        const args: number[] = [];
        if (normalized[index] === ')') {
            return args;
        }

        args.push(parseAddition());
        while (normalized[index] === ',') {
            consume(',');
            args.push(parseAddition());
        }
        return args;
    };

    const parseIdentifier = (): number => {
        const rawName = parseIdentifierName();
        const name = rawName.toLowerCase();

        if (normalized[index] === '(') {
            consume('(');
            const args = parseArgumentList();
            if (index >= normalized.length) {
                throw new Error('Unexpected end of expression');
            }
            consume(')');

            const fn = FUNCTIONS[name];
            if (!fn) {
                throw new Error(`Unknown function: ${name}`);
            }
            if (args.length < fn.minArgs || args.length > fn.maxArgs) {
                throw new Error(`${name}() received an unexpected number of arguments`);
            }
            return fn.apply(args);
        }

        if (name in CONSTANTS) {
            return CONSTANTS[name];
        }

        if (variables) {
            if (!Array.isArray(variables) && typeof variables === 'object') {
                if (rawName in variables) {
                    const val = Number(variables[rawName]);
                    if (Number.isFinite(val)) return val;
                }
                if (name in variables) {
                    const val = Number(variables[name]);
                    if (Number.isFinite(val)) return val;
                }
            }
            if (Array.isArray(variables)) {
                if (varAliases && (rawName in varAliases || name in varAliases)) {
                    const slot = varAliases[rawName] ?? varAliases[name];
                    const val = Number(variables[slot]);
                    if (Number.isFinite(val)) return val;
                }
            }
        }

        if (varAliases && (rawName in varAliases || name in varAliases)) {
            const slot = varAliases[rawName] ?? varAliases[name];
            if (Array.isArray(variables)) {
                const val = Number(variables[slot]);
                if (Number.isFinite(val)) return val;
            }
        }

        throw new Error(`Unknown identifier: ${rawName}`);
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

        if (/[a-zA-Z_]/.test(char)) {
            return parseIdentifier();
        }

        throw new Error(`Unsupported character: ${char}`);
    };

    const parsePostfix = (): number => {
        let value = parsePrimary();

        while (index < normalized.length && normalized[index] === '!') {
            checkDeadline();
            consume('!');
            value = factorial(value);
        }

        return value;
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
        const left = parsePostfix();

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
