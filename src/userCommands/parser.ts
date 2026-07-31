import {
    ActionValue,
    ComplexValue,
    UserCommandAction,
    UserCommandJson,
    UserCommandMetadata,
    UserCommandTrigger,
} from './types';

export function parseUserCommand(
    rawContent: string,
    authorId: string,
    mediaFiles?: Array<{ filename: string; path: string }>,
): UserCommandJson {
    // Strip comments (# ...) outside quotes
    const cleanedText = stripComments(rawContent);
    const lines = cleanedText
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0);

    let name = '';
    let description = '';
    let trigger: UserCommandTrigger | null = null;
    const actions: UserCommandAction[] = [];
    const varAliases: Record<string, number> = {};

    let i = 0;
    while (i < lines.length) {
        const line = lines[i];

        // Metadata: name "..."
        const nameMatch = line.match(/^name\s+"([^"]+)"$/i);
        if (nameMatch) {
            name = nameMatch[1];
            i++;
            continue;
        }

        // Metadata: description "..."
        const descMatch = line.match(/^description\s+"([^"]+)"$/i);
        if (descMatch) {
            description = descMatch[1];
            i++;
            continue;
        }

        // Vars block: vars { ... }
        if (line.match(/^vars\s*\{/i)) {
            if (line.includes('}')) {
                // Single line vars block
                const inner = line.substring(line.indexOf('{') + 1, line.lastIndexOf('}')).trim();
                parseVarsLines(inner.split(';'), varAliases);
            } else {
                // Multiline vars block
                i++;
                const varLines: string[] = [];
                while (i < lines.length && !lines[i].includes('}')) {
                    varLines.push(lines[i]);
                    i++;
                }
                parseVarsLines(varLines, varAliases);
            }
            i++;
            continue;
        }

        // Trigger: when (I|someone) (say|says) ...
        const triggerMatch = line.match(/^when\s+(I|someone)\s+(say|says)\s+(.+)$/i);
        if (triggerMatch) {
            const scope = triggerMatch[1].toLowerCase() === 'i' ? 'author' : 'everyone';
            const expr = triggerMatch[3].trim();

            if (expr.startsWith('/') && expr.endsWith('/') && expr.length > 2) {
                const regexVal = expr.slice(1, -1);
                trigger = {
                    type: 'regex',
                    value: regexVal,
                    scope,
                };
            } else {
                let strVal = expr;
                if (strVal.startsWith('"') && strVal.endsWith('"') && strVal.length >= 2) {
                    strVal = strVal.slice(1, -1);
                }
                trigger = {
                    type: 'string',
                    value: strVal,
                    scope,
                };
            }
            i++;
            continue;
        }

        // Actions
        // Triple-quoted multiline strings across lines: """ ... """
        let fullActionLine = line;
        if (
            fullActionLine.includes('"""') &&
            (fullActionLine.match(/"""/g) || []).length % 2 !== 0
        ) {
            let multilineAcc = fullActionLine;
            i++;
            while (i < lines.length) {
                multilineAcc += '\n' + lines[i];
                if (lines[i].includes('"""')) {
                    break;
                }
                i++;
            }
            fullActionLine = multilineAcc;
        }

        const action = parseActionLine(fullActionLine, varAliases);
        if (action) {
            actions.push(action);
        }

        i++;
    }

    // Default values if not specified
    const creationDate = new Date().toISOString();
    const finalName = name || `Cmd-${Date.now()}`;
    const finalDesc = description || 'User defined command';
    const finalTrigger: UserCommandTrigger = trigger || {
        type: 'string',
        value: finalName.toLowerCase(),
        scope: 'everyone',
    };

    const storageUsed = Buffer.byteLength(rawContent, 'utf-8');

    // Build media mapping
    const mediaMap: Record<string, any> = {};
    if (mediaFiles) {
        mediaFiles.forEach((file, idx) => {
            const indexNumber = idx + 1;
            mediaMap[file.filename] = {
                id: `${finalName}_${indexNumber}`,
                filename: file.filename,
                path: file.path,
                index: indexNumber,
            };
            mediaMap[`&${indexNumber}`] = mediaMap[file.filename];
        });
    }

    const metadata: UserCommandMetadata = {
        author: authorId,
        storage_used: storageUsed,
        creation_date: creationDate,
        name: finalName,
        description: finalDesc,
        raw: `${finalName}.md`,
    };

    const json: UserCommandJson = {
        metadata,
        media: mediaMap,
        trigger: finalTrigger,
        actions,
    };

    if (Object.keys(varAliases).length > 0) {
        json.varAliases = varAliases;
    }

    return json;
}

const parseVarsLines = (varLines: string[], varAliases: Record<string, number>): void => {
    for (const vline of varLines) {
        const trimmed = vline.trim();
        if (!trimmed) continue;
        const match = trimmed.match(/^(\d+)\s*-\s*([a-zA-Z0-9_-]+)$/);
        if (match) {
            const slot = parseInt(match[1], 10);
            const alias = match[2];
            varAliases[alias] = slot;
        }
    }
};

const stripComments = (text: string): string => {
    const lines = text.split('\n');
    return lines
        .map((line) => {
            let inQuotes = false;
            let quoteChar = '';
            for (let i = 0; i < line.length; i++) {
                const char = line[i];
                if ((char === '"' || char === "'") && (i === 0 || line[i - 1] !== '\\')) {
                    if (!inQuotes) {
                        inQuotes = true;
                        quoteChar = char;
                    } else if (quoteChar === char) {
                        inQuotes = false;
                    }
                } else if (char === '#' && !inQuotes) {
                    return line.substring(0, i);
                }
            }
            return line;
        })
        .join('\n');
};

const parseActionLine = (
    line: string,
    varAliases: Record<string, number>,
): UserCommandAction | null => {
    // 1. Memorize action: memorize [0|alias] <value>
    const memMatch = line.match(/^memorize\s+\[([a-zA-Z0-9_-]+)\]\s+(.+)$/i);
    if (memMatch) {
        const slotRef = memMatch[1];
        const slot = resolveSlotRef(slotRef, varAliases);
        const valExpr = memMatch[2].trim();
        const value = parseValueExpr(valExpr);
        return {
            type: 'memorize',
            targetSlot: slot,
            value,
        };
    }

    // 2. Output actions: (you say|say|you reply|reply|you whisper|whisper|you wisper|wisper|you send|send) <value>
    const actMatch = line.match(/^(you\s+)?(say|reply|whisper|wisper|send)\s+(.+)$/i);
    if (actMatch) {
        let actionType = actMatch[2].toLowerCase();
        if (actionType === 'wisper') actionType = 'whisper';
        const valExpr = actMatch[3].trim();
        const value = parseValueExpr(valExpr);
        return {
            type: actionType as any,
            value,
        };
    }

    return null;
};

const resolveSlotRef = (ref: string, aliases: Record<string, number>): number => {
    const num = parseInt(ref, 10);
    if (!isNaN(num)) return num;
    if (ref in aliases) return aliases[ref];
    return 0;
};

const parseValueExpr = (expr: string): ActionValue => {
    let trimmed = expr.trim();

    // Check choice block: {choice {"a", "b"}} or choice {"a", "b"}
    const choiceMatch = trimmed.match(/^\{?\s*choice\s*\{([^}]+)\}\s*\}?$/i);
    if (choiceMatch) {
        const optsStr = choiceMatch[1];
        const matches = Array.from(optsStr.matchAll(/"([^"\\]*(?:\\.[^"\\]*)*)"/g)).map(
            (m: any) => m[1],
        );
        const complexVal: ComplexValue = {
            type: 'choice',
            value: matches,
        };
        return complexVal;
    }

    // Check random block: {random {1, 10}} or random {1, 10}
    const randMatch = trimmed.match(/^\{?\s*random\s*\{(\d+)\s*,\s*(\d+)\}\s*\}?$/i);
    if (randMatch) {
        const min = parseInt(randMatch[1], 10);
        const max = parseInt(randMatch[2], 10);
        const complexVal: ComplexValue = {
            type: 'random',
            min,
            max,
        };
        return complexVal;
    }

    // Check calc block: {calc {1 + 1}} or calc {1 + 1}
    const calcMatch = trimmed.match(/^\{?\s*calc\s*\{([^}]+)\}\s*\}?$/i);
    if (calcMatch) {
        const mathExpr = calcMatch[1].trim();
        const complexVal: ComplexValue = {
            type: 'calc',
            value: mathExpr,
        };
        return complexVal;
    }

    // Strip triple quotes if present: """hello""" -> hello
    if (trimmed.startsWith('"""') && trimmed.endsWith('"""') && trimmed.length >= 6) {
        return trimmed.slice(3, -3);
    }

    // Strip single quotes if present: "hello" -> hello
    if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) {
        return trimmed.slice(1, -1);
    }

    return trimmed;
};
