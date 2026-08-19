import { evaluateExpression, VariableValues } from '../utils/calculator';

export interface EvaluationContext {
    userMention: string;
    username: string;
    userId: string;
    variables: Array<string | number>;
    varAliases?: Record<string, number>;
}

export function evaluateCalc(
    expression: string,
    variables: VariableValues = [],
    varAliases?: Record<string, number>,
): number {
    return evaluateExpression(expression, variables, varAliases);
}

export const resolveSlot = (ref: string, aliases?: Record<string, number>): number => {
    const num = parseInt(ref, 10);
    if (!isNaN(num)) {
        return num;
    }
    if (aliases && ref in aliases) {
        return aliases[ref];
    }
    return 0;
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
