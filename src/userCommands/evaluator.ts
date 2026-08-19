import { PipelineData, PipelineStep } from './types';

export interface EvaluationContext {
    userMention: string; // Nickname / display name (non-pinging)
    username: string;
    userId: string;
    channelName: string;
    serverName: string;
    timeStr: string;
    dateStr: string;
    input: string;
    matchGroups: string[];
    variables: Array<string | number>;
    varAliases?: Record<string, number>;
}

export function evaluateCalc(
    expression: string,
    variables: Array<string | number> = [],
    varAliases?: Record<string, number>,
): number {
    let sanitized = expression.trim();

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

type MathToken =
    | { type: 'number'; value: number }
    | { type: 'op'; value: string }
    | { type: 'paren'; value: string };

function tokenizeMath(expr: string): MathToken[] {
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
}

function shuntingYard(tokens: MathToken[]): MathToken[] {
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
}

function evaluatePostfix(postfix: MathToken[]): number {
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
}

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

    // Replace {user} with non-pinging nickname / display name
    result = result.replace(/\{user\}/gi, ctx.userMention);

    // Replace system context variables
    result = result.replace(/\{channel\}/gi, ctx.channelName);
    result = result.replace(/\{server\}/gi, ctx.serverName);
    result = result.replace(/\{time\}/gi, ctx.timeStr);
    result = result.replace(/\{date\}/gi, ctx.dateStr);

    // Replace {input}
    result = result.replace(/\{input\}/gi, ctx.input);

    // Replace {match [1]}, {match [2]}, etc.
    result = result.replace(/\{match\s*\[(\d+)\]\}/gi, (_, idxStr) => {
        const idx = parseInt(idxStr, 10);
        return ctx.matchGroups && ctx.matchGroups[idx] !== undefined ? ctx.matchGroups[idx] : '';
    });

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

// -------------------------------------------------------------
// Boolean Expression Evaluator for `ponder` and `filter`
// -------------------------------------------------------------
export function evaluateBooleanExpr(
    expr: string,
    ctx: EvaluationContext,
    extraItem?: string,
): boolean {
    let evalStr = expr.trim();
    if (extraItem !== undefined) {
        evalStr = evalStr.replace(/\bitem\b/gi, `"${extraItem}"`);
    }

    // Replace bare word input or {input}
    evalStr = evalStr.replace(/\{input\}/gi, `"${ctx.input}"`);
    evalStr = evalStr.replace(/\binput\b/gi, `"${ctx.input}"`);

    // Replace bare or curly match [x]
    evalStr = evalStr.replace(/\{?\bmatch\s*\[(\d+)\]\}?/gi, (_, idxStr) => {
        const idx = parseInt(idxStr, 10);
        const val =
            ctx.matchGroups && ctx.matchGroups[idx] !== undefined ? ctx.matchGroups[idx] : '';
        return `"${val}"`;
    });

    evalStr = interpolateString(evalStr, ctx);
    evalStr = stripOuterParens(evalStr);

    // Handle logical OR at top level
    const orParts = splitTopLevel(evalStr, ' or ');
    if (orParts) {
        return evaluateBooleanExpr(orParts[0], ctx, extraItem) || evaluateBooleanExpr(orParts[1], ctx, extraItem);
    }

    // Handle logical AND at top level
    const andParts = splitTopLevel(evalStr, ' and ');
    if (andParts) {
        return evaluateBooleanExpr(andParts[0], ctx, extraItem) && evaluateBooleanExpr(andParts[1], ctx, extraItem);
    }

    // Handle logical NOT
    if (evalStr.toLowerCase().startsWith('not ')) {
        const inner = evalStr.slice(4).trim();
        return !evaluateBooleanExpr(inner, ctx, extraItem);
    }

    // Comparison operators
    if (evalStr.includes(' contains ')) {
        const [a, b] = splitTwo(evalStr, ' contains ');
        return cleanVal(a).includes(cleanVal(b));
    }
    if (evalStr.includes(' starts with ')) {
        const [a, b] = splitTwo(evalStr, ' starts with ');
        return cleanVal(a).startsWith(cleanVal(b));
    }
    if (evalStr.includes(' ends with ')) {
        const [a, b] = splitTwo(evalStr, ' ends with ');
        return cleanVal(a).endsWith(cleanVal(b));
    }
    if (evalStr.includes(' is not ')) {
        const [a, b] = splitTwo(evalStr, ' is not ');
        return cleanVal(a) !== cleanVal(b);
    }
    if (evalStr.includes(' is ')) {
        const [a, b] = splitTwo(evalStr, ' is ');
        return cleanVal(a) === cleanVal(b);
    }
    if (evalStr.includes('>=')) {
        const [a, b] = splitTwo(evalStr, '>=');
        return parseFloat(cleanVal(a)) >= parseFloat(cleanVal(b));
    }
    if (evalStr.includes('<=')) {
        const [a, b] = splitTwo(evalStr, '<=');
        return parseFloat(cleanVal(a)) <= parseFloat(cleanVal(b));
    }
    if (evalStr.includes('>')) {
        const [a, b] = splitTwo(evalStr, '>');
        return parseFloat(cleanVal(a)) > parseFloat(cleanVal(b));
    }
    if (evalStr.includes('<')) {
        const [a, b] = splitTwo(evalStr, '<');
        return parseFloat(cleanVal(a)) < parseFloat(cleanVal(b));
    }

    // Truthy check for single non-empty string or non-zero number
    const finalClean = cleanVal(evalStr);
    if (finalClean === 'true') return true;
    if (finalClean === 'false') return false;
    const num = parseFloat(finalClean);
    if (!isNaN(num)) return num !== 0;
    return finalClean.length > 0;
}

function stripOuterParens(str: string): string {
    let s = str.trim();
    while (
        (s.startsWith('{') && s.endsWith('}')) ||
        (s.startsWith('(') && s.endsWith(')'))
    ) {
        let depth = 0;
        let outerMatched = false;
        for (let i = 0; i < s.length; i++) {
            const ch = s[i];
            if (ch === '(' || ch === '{') depth++;
            else if (ch === ')' || ch === '}') depth--;
            if (depth === 0) {
                if (i === s.length - 1) {
                    outerMatched = true;
                }
                break;
            }
        }
        if (outerMatched) {
            s = s.slice(1, -1).trim();
        } else {
            break;
        }
    }
    return s;
}

function splitTopLevel(str: string, delimiter: string): string[] | null {
    const lower = str.toLowerCase();
    const delimLower = delimiter.toLowerCase();
    let depth = 0;

    for (let i = 0; i <= str.length - delimLower.length; i++) {
        const ch = str[i];
        if (ch === '(' || ch === '{') depth++;
        else if (ch === ')' || ch === '}') depth--;

        if (depth === 0 && lower.substring(i, i + delimLower.length) === delimLower) {
            const part1 = str.substring(0, i);
            const part2 = str.substring(i + delimLower.length);
            return [part1, part2];
        }
    }
    return null;
}

function splitTwo(str: string, delimiter: string): [string, string] {
    const idx = str.indexOf(delimiter);
    if (idx === -1) return [str, ''];
    return [str.slice(0, idx).trim(), str.slice(idx + delimiter.length).trim()];
}

function cleanVal(str: string): string {
    let s = str.trim();
    if (
        (s.startsWith('"') && s.endsWith('"')) ||
        (s.startsWith("'") && s.endsWith("'"))
    ) {
        s = s.slice(1, -1);
    }
    return s;
}

// -------------------------------------------------------------
// Pipeline Runner (`scratch pole`)
// -------------------------------------------------------------
export function executePipeline(pipeData: PipelineData, ctx: EvaluationContext): string {
    let currentVal: string | string[] = interpolateString(pipeData.source, ctx);

    for (const step of pipeData.steps) {
        currentVal = applyPipelineStep(step, currentVal, ctx);
    }

    if (Array.isArray(currentVal)) {
        return currentVal.join(' ');
    }
    return String(currentVal);
}

function applyPipelineStep(
    step: PipelineStep,
    val: string | string[],
    ctx: EvaluationContext,
): string | string[] {
    switch (step.type) {
        case 'split': {
            const str = Array.isArray(val) ? val.join(' ') : String(val);
            const delimiter = step.arg ? cleanVal(interpolateString(step.arg, ctx)) : ' ';
            if (delimiter.startsWith('/') && delimiter.endsWith('/') && delimiter.length > 2) {
                const reg = new RegExp(delimiter.slice(1, -1));
                return str.split(reg);
            }
            return str.split(delimiter);
        }
        case 'filter': {
            const arr = Array.isArray(val) ? val : [String(val)];
            const cond = step.condition || 'true';
            return arr.filter((item) => evaluateBooleanExpr(cond, ctx, item));
        }
        case 'join': {
            const arr = Array.isArray(val) ? val : [String(val)];
            const sep = step.arg !== undefined ? cleanVal(interpolateString(step.arg, ctx)) : '';
            return arr.join(sep);
        }
        case 'save': {
            const slot = step.varSlot ?? 0;
            const resStr = Array.isArray(val) ? val.join(' ') : String(val);
            ctx.variables[slot] = resStr;
            return val;
        }
        case 'first': {
            const arr = Array.isArray(val) ? val : [String(val)];
            return arr.length > 0 ? arr[0] : '';
        }
        case 'last': {
            const arr = Array.isArray(val) ? val : [String(val)];
            return arr.length > 0 ? arr[arr.length - 1] : '';
        }
        case 'trim': {
            if (Array.isArray(val)) return val.map((s) => s.trim());
            return String(val).trim();
        }
        case 'lower': {
            if (Array.isArray(val)) return val.map((s) => s.toLowerCase());
            return String(val).toLowerCase();
        }
        case 'upper': {
            if (Array.isArray(val)) return val.map((s) => s.toUpperCase());
            return String(val).toUpperCase();
        }
        case 'as_number': {
            const str = Array.isArray(val) ? val.join('') : String(val);
            const num = parseFloat(str);
            return isNaN(num) ? '0' : String(num);
        }
        case 'reverse': {
            if (Array.isArray(val)) return [...val].reverse();
            return String(val).split('').reverse().join('');
        }
        case 'sort': {
            const arr = Array.isArray(val) ? [...val] : String(val).split('');
            return arr.sort();
        }
        case 'sort_reverse': {
            const arr = Array.isArray(val) ? [...val] : String(val).split('');
            return arr.sort().reverse();
        }
        case 'shuffle': {
            const arr = Array.isArray(val) ? [...val] : String(val).split('');
            for (let i = arr.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [arr[i], arr[j]] = [arr[j], arr[i]];
            }
            return arr;
        }
        default:
            return val;
    }
}
