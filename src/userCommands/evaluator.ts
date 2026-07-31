export interface EvaluationContext {
    userMention: string;
    username: string;
    userId: string;
    variables: Array<string | number>;
    varAliases?: Record<string, number>;
}

export function evaluateCalc(
    expression: string,
    variables: Array<string | number> = [],
    varAliases?: Record<string, number>,
): number {
    let sanitized = expression.trim();
    // Replace variable references like remember [0] or remember [alias] or [0] in calc expression if present
    sanitized = sanitized.replace(/remember\s*\[([a-zA-Z0-9_-]+)\]/gi, (_, ref) => {
        const slot = resolveSlot(ref, varAliases);
        const val = variables[slot];
        return val !== undefined ? String(val) : '0';
    });

    sanitized = sanitized.replace(/\[([a-zA-Z0-9_-]+)\]/gi, (_, ref) => {
        const slot = resolveSlot(ref, varAliases);
        const val = variables[slot];
        return val !== undefined ? String(val) : '0';
    });

    const tokens = tokenizeMath(sanitized);
    const postfix = shuntingYard(tokens);
    return evaluatePostfix(postfix);
}

const resolveSlot = (ref: string, aliases?: Record<string, number>): number => {
    const num = parseInt(ref, 10);
    if (!isNaN(num)) {
        return num;
    }
    if (aliases && ref in aliases) {
        return aliases[ref];
    }
    return 0;
};

type MathToken =
    | { type: 'number'; value: number }
    | { type: 'op'; value: string }
    | { type: 'paren'; value: string };

const tokenizeMath = (expr: string): MathToken[] => {
    const tokens: MathToken[] = [];
    let i = 0;

    while (i < expr.length) {
        const char = expr[i];

        if (/\s/.test(char)) {
            i++;
            continue;
        }

        if (/[0-9.]/.test(char)) {
            let numStr = '';
            while (i < expr.length && /[0-9.]/.test(expr[i])) {
                numStr += expr[i];
                i++;
            }
            const val = parseFloat(numStr);
            if (isNaN(val)) {
                throw new Error(`Invalid number in calc: ${numStr}`);
            }
            tokens.push({ type: 'number', value: val });
            continue;
        }

        if (['+', '-', '*', '/', '%'].includes(char)) {
            // Handle unary minus / plus if preceded by op or start of expr
            if (
                (char === '-' || char === '+') &&
                (tokens.length === 0 ||
                    tokens[tokens.length - 1].type === 'op' ||
                    (tokens[tokens.length - 1].type === 'paren' &&
                        tokens[tokens.length - 1].value === '('))
            ) {
                let numStr = char;
                i++;
                while (i < expr.length && /\s/.test(expr[i])) i++;
                if (i < expr.length && /[0-9.]/.test(expr[i])) {
                    while (i < expr.length && /[0-9.]/.test(expr[i])) {
                        numStr += expr[i];
                        i++;
                    }
                    tokens.push({ type: 'number', value: parseFloat(numStr) });
                    continue;
                }
            }
            tokens.push({ type: 'op', value: char });
            i++;
            continue;
        }

        if (char === '(' || char === ')') {
            tokens.push({ type: 'paren', value: char });
            i++;
            continue;
        }

        throw new Error(`Unexpected character in calc: '${char}'`);
    }

    return tokens;
};

const shuntingYard = (tokens: MathToken[]): MathToken[] => {
    const output: MathToken[] = [];
    const stack: MathToken[] = [];

    const precedence: Record<string, number> = {
        '+': 1,
        '-': 1,
        '*': 2,
        '/': 2,
        '%': 2,
    };

    for (const token of tokens) {
        if (token.type === 'number') {
            output.push(token);
        } else if (token.type === 'op') {
            while (
                stack.length > 0 &&
                stack[stack.length - 1].type === 'op' &&
                precedence[(stack[stack.length - 1] as any).value] >= precedence[token.value]
            ) {
                output.push(stack.pop()!);
            }
            stack.push(token);
        } else if (token.type === 'paren' && token.value === '(') {
            stack.push(token);
        } else if (token.type === 'paren' && token.value === ')') {
            while (
                stack.length > 0 &&
                !(stack[stack.length - 1].type === 'paren' && stack[stack.length - 1].value === '(')
            ) {
                output.push(stack.pop()!);
            }
            if (
                stack.length > 0 &&
                stack[stack.length - 1].type === 'paren' &&
                stack[stack.length - 1].value === '('
            ) {
                stack.pop();
            } else {
                throw new Error('Mismatched parentheses in calc');
            }
        }
    }

    while (stack.length > 0) {
        const top = stack.pop()!;
        if (top.type === 'paren') {
            throw new Error('Mismatched parentheses in calc');
        }
        output.push(top);
    }

    return output;
};

const evaluatePostfix = (postfix: MathToken[]): number => {
    const stack: number[] = [];

    for (const token of postfix) {
        if (token.type === 'number') {
            stack.push(token.value);
        } else if (token.type === 'op') {
            if (stack.length < 2) {
                throw new Error('Invalid math expression syntax');
            }
            const b = stack.pop()!;
            const a = stack.pop()!;
            let res = 0;
            switch (token.value) {
                case '+':
                    res = a + b;
                    break;
                case '-':
                    res = a - b;
                    break;
                case '*':
                    res = a * b;
                    break;
                case '/':
                    res = b === 0 ? 0 : a / b;
                    break;
                case '%':
                    res = b === 0 ? 0 : a % b;
                    break;
            }
            stack.push(res);
        }
    }

    return stack.length > 0 ? stack[0] : 0;
};

export function evaluateChoice(options: string[]): string {
    if (options.length === 0) return '';
    const idx = Math.floor(Math.random() * options.length);
    return options[idx];
}

export function evaluateRandom(min: number, max: number): number {
    const lower = Math.min(min, max);
    const upper = Math.max(min, max);
    return Math.floor(Math.random() * (upper - lower + 1)) + lower;
}

export function interpolateString(template: string, ctx: EvaluationContext): string {
    let result = template;

    // Replace {user}
    result = result.replace(/\{user\}/gi, ctx.userMention);

    // Replace {remember [slot_or_alias]}
    result = result.replace(/\{remember\s*\[([a-zA-Z0-9_-]+)\]\}/gi, (_, ref) => {
        const slot = resolveSlot(ref, ctx.varAliases);
        const val = ctx.variables[slot];
        return val !== undefined ? String(val) : '';
    });

    // Replace {calc {expr}}
    result = result.replace(/\{calc\s*\{([^}]+)\}\}/gi, (_, expr) => {
        try {
            return String(evaluateCalc(expr, ctx.variables, ctx.varAliases));
        } catch {
            return '0';
        }
    });

    // Replace {choice {"a", "b"}}
    result = result.replace(/\{choice\s*\{([^}]+)\}\}/gi, (_, optsStr) => {
        const matches = Array.from(optsStr.matchAll(/"([^"\\]*(?:\\.[^"\\]*)*)"/g)).map(
            (m: any) => m[1],
        );
        if (matches.length > 0) {
            return evaluateChoice(matches);
        }
        return '';
    });

    // Replace {random {min, max}}
    result = result.replace(/\{random\s*\{(\d+)\s*,\s*(\d+)\}\}/gi, (_, minStr, maxStr) => {
        return String(evaluateRandom(parseInt(minStr, 10), parseInt(maxStr, 10)));
    });

    return result;
}
