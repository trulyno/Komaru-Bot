import {
    ActionValue,
    ComplexValue,
    EmbedData,
    EmbedField,
    PipelineData,
    PipelineStep,
    PonderBranch,
    PonderData,
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
    const aliases: string[] = [];
    const coauthors: string[] = [];
    let cooldown: number | undefined;
    let roles: string[] | undefined;
    let channels: string[] | undefined;
    let enabled: boolean | undefined;

    let i = 0;

    // Check Quick Command Creation (`qt`)
    if (lines.length > 0 && lines[0].toLowerCase().startsWith('qt')) {
        return parseQuickCommand(lines, authorId, mediaFiles);
    }

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

        // Alias: alias "p", "pong"
        const aliasMatch = line.match(/^alias\s+(.+)$/i);
        if (aliasMatch) {
            const matches = Array.from(aliasMatch[1].matchAll(/"([^"\\]*(?:\\.[^"\\]*)*)"/g)).map(
                (m: any) => m[1],
            );
            aliases.push(...matches);
            i++;
            continue;
        }

        // Coauthor: coauthor "123", "456"
        const coauthorMatch = line.match(/^coauthor\s+(.+)$/i);
        if (coauthorMatch) {
            const matches = Array.from(coauthorMatch[1].matchAll(/"([^"\\]*(?:\\.[^"\\]*)*)"/g)).map(
                (m: any) => m[1],
            );
            coauthors.push(...matches);
            i++;
            continue;
        }

        // Meta directives: meta cooldown 5, meta roles r1, r2, meta channels c1, c2, meta enabled true
        if (line.toLowerCase().startsWith('meta ')) {
            const metaRest = line.substring(5).trim();
            if (metaRest.toLowerCase().startsWith('cooldown ')) {
                cooldown = parseFloat(metaRest.substring(9).trim());
            } else if (metaRest.toLowerCase().startsWith('roles ')) {
                roles = metaRest
                    .substring(6)
                    .split(',')
                    .map((r) => r.trim().replace(/^<@&?(\d+)>$/, '$1').replace(/^["']|["']$/g, '').trim())
                    .filter((r) => r.length > 0);
            } else if (metaRest.toLowerCase().startsWith('channels ')) {
                channels = metaRest
                    .substring(9)
                    .split(',')
                    .map((c) => c.trim().replace(/^<#(\d+)>$/, '$1').replace(/^["']|["']$/g, '').trim())
                    .filter((c) => c.length > 0);
            } else if (metaRest.toLowerCase().startsWith('enabled ')) {
                enabled = metaRest.substring(8).trim().toLowerCase() === 'true';
            }
            i++;
            continue;
        }

        // Vars block: vars { ... }
        if (line.match(/^vars\s*\{/i)) {
            if (line.includes('}')) {
                const inner = line.substring(line.indexOf('{') + 1, line.lastIndexOf('}')).trim();
                parseVarsLines(inner.split(';'), varAliases);
            } else {
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
                trigger = {
                    type: 'regex',
                    value: expr.slice(1, -1),
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

        // Action: you embed { ... }
        if (line.match(/^you\s+embed\s*\{/i)) {
            const { action, nextIndex } = parseEmbedAction(lines, i, varAliases);
            actions.push(action);
            i = nextIndex;
            continue;
        }

        // Action: ponder {cond} { ... }
        if (line.match(/^ponder\s+/i)) {
            const { action, nextIndex } = parsePonderAction(lines, i, varAliases);
            actions.push(action);
            i = nextIndex;
            continue;
        }

        // Action: scratch pole <source>
        if (line.match(/^scratch\s+pole\s+/i)) {
            const { action, nextIndex } = parsePipelineAction(lines, i, varAliases);
            actions.push(action);
            i = nextIndex;
            continue;
        }

        // Standard actions (say, reply, whisper, send, memorize)
        let fullActionLine = line;
        if (fullActionLine.includes('"""') && (fullActionLine.match(/"""/g) || []).length % 2 !== 0) {
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

    const creationDate = new Date().toISOString();
    const finalName = name || `Cmd-${Date.now()}`;
    const finalDesc = description || 'User defined command';
    const finalTrigger: UserCommandTrigger = trigger || {
        type: 'string',
        value: finalName.toLowerCase(),
        scope: 'everyone',
    };

    const storageUsed = Buffer.byteLength(rawContent, 'utf-8');

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
        cooldown: cooldown ?? 5,
        roles,
        channels,
        enabled: enabled ?? true,
    };

    const json: UserCommandJson = {
        metadata,
        media: mediaMap,
        trigger: finalTrigger,
        actions,
    };

    if (Object.keys(varAliases).length > 0) json.varAliases = varAliases;
    if (aliases.length > 0) json.aliases = aliases;
    if (coauthors.length > 0) json.coauthors = coauthors;

    return json;
}

function parseQuickCommand(
    lines: string[],
    authorId: string,
    mediaFiles?: Array<{ filename: string; path: string }>,
): UserCommandJson {
    const firstLine = lines[0].trim();
    // qt "trigger" OR qt i "trigger" OR qt /regex/ OR qt i /regex/
    const qtMatch = firstLine.match(/^qt\s+(i\s+)?(.+)$/i);

    let scope: 'author' | 'everyone' = 'everyone';
    let expr = '';

    if (qtMatch) {
        if (qtMatch[1]) scope = 'author';
        expr = qtMatch[2].trim();
    }

    let trigger: UserCommandTrigger;
    if (expr.startsWith('/') && expr.endsWith('/') && expr.length > 2) {
        trigger = { type: 'regex', value: expr.slice(1, -1), scope };
    } else {
        let strVal = expr;
        if (strVal.startsWith('"') && strVal.endsWith('"') && strVal.length >= 2) {
            strVal = strVal.slice(1, -1);
        }
        trigger = { type: 'string', value: strVal, scope };
    }

    const bodyLines = lines.slice(1);
    const bodyText = bodyLines.join('\n').trim();

    const actions: UserCommandAction[] = [];
    if (bodyText) {
        actions.push({
            type: 'reply',
            value: bodyText,
        });
    }

    // Attach media actions if files are attached
    if (mediaFiles && mediaFiles.length > 0) {
        mediaFiles.forEach((_, idx) => {
            actions.push({
                type: 'send',
                value: `&${idx + 1}`,
            });
        });
    }

    const finalName = `qt-${Date.now()}`;
    const rawContent = lines.join('\n');
    const storageUsed = Buffer.byteLength(rawContent, 'utf-8');

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

    return {
        metadata: {
            author: authorId,
            storage_used: storageUsed,
            creation_date: new Date().toISOString(),
            name: finalName,
            description: 'Quick created command',
            raw: `${finalName}.md`,
            cooldown: 5,
            enabled: true,
        },
        media: mediaMap,
        trigger,
        actions,
    };
}

function parseEmbedAction(
    lines: string[],
    startIndex: number,
    varAliases: Record<string, number>,
): { action: UserCommandAction; nextIndex: number } {
    let i = startIndex + 1;
    const embedData: EmbedData = { fields: [] };

    while (i < lines.length && !lines[i].startsWith('}')) {
        const line = lines[i].trim();

        const titleMatch = line.match(/^title\s+"([^"]+)"$/i);
        if (titleMatch) {
            embedData.title = titleMatch[1];
            i++;
            continue;
        }

        const descMatch = line.match(/^description\s+"([^"]+)"$/i);
        if (descMatch) {
            embedData.description = descMatch[1];
            i++;
            continue;
        }

        const colorMatch = line.match(/^color\s+"([^"]+)"$/i);
        if (colorMatch) {
            embedData.color = colorMatch[1];
            i++;
            continue;
        }

        const fieldMatch = line.match(/^field\s+"([^"]+)"\s*-\s*"([^"]+)"$/i);
        if (fieldMatch) {
            embedData.fields?.push({
                name: fieldMatch[1],
                value: fieldMatch[2],
            });
            i++;
            continue;
        }

        i++;
    }

    return {
        action: {
            type: 'embed',
            value: embedData,
        },
        nextIndex: i + 1,
    };
}

function parsePonderAction(
    lines: string[],
    startIndex: number,
    varAliases: Record<string, number>,
): { action: UserCommandAction; nextIndex: number } {
    let i = startIndex;
    const branches: PonderBranch[] = [];
    let otherwiseActions: UserCommandAction[] | undefined;

    while (i < lines.length) {
        const line = lines[i].trim();

        if (line.match(/^ponder\s+/i) || line.match(/^ponder\s+again\s+/i)) {
            // ponder {cond} {
            const condMatch = line.match(/^ponder(?:\s+again)?\s*\{([^}]+)\}\s*\{/i);
            if (condMatch) {
                const condition = condMatch[1].trim();
                i++;
                const branchLines: string[] = [];
                while (i < lines.length && !lines[i].startsWith('}')) {
                    branchLines.push(lines[i]);
                    i++;
                }
                const bActions: UserCommandAction[] = [];
                for (const bLine of branchLines) {
                    const act = parseActionLine(bLine, varAliases);
                    if (act) bActions.push(act);
                }
                branches.push({ condition, actions: bActions });
                i++; // past '}'
                continue;
            }
        }

        if (line.match(/^otherwise\s*\{/i)) {
            i++;
            const otherwiseLines: string[] = [];
            while (i < lines.length && !lines[i].startsWith('}')) {
                otherwiseLines.push(lines[i]);
                i++;
            }
            otherwiseActions = [];
            for (const oLine of otherwiseLines) {
                const act = parseActionLine(oLine, varAliases);
                if (act) otherwiseActions.push(act);
            }
            i++; // past '}'
            break;
        }

        break;
    }

    const ponderData: PonderData = {
        branches,
        otherwise: otherwiseActions,
    };

    return {
        action: {
            type: 'ponder',
            value: ponderData,
        },
        nextIndex: i,
    };
}

function parsePipelineAction(
    lines: string[],
    startIndex: number,
    varAliases: Record<string, number>,
): { action: UserCommandAction; nextIndex: number } {
    const firstLine = lines[startIndex].trim();
    const source = firstLine.substring('scratch pole'.length).trim();
    const steps: PipelineStep[] = [];

    let i = startIndex + 1;
    while (i < lines.length && lines[i].trim().startsWith('|>')) {
        const stepLine = lines[i].trim().substring(2).trim();

        if (stepLine.toLowerCase().startsWith('split on ')) {
            steps.push({ type: 'split', arg: stepLine.substring(9).trim() });
        } else if (stepLine.toLowerCase().startsWith('filter ')) {
            steps.push({ type: 'filter', condition: stepLine.substring(7).trim() });
        } else if (stepLine.toLowerCase().startsWith('join on ')) {
            steps.push({ type: 'join', arg: stepLine.substring(8).trim() });
        } else if (stepLine.toLowerCase().startsWith('save [')) {
            const match = stepLine.match(/^save\s*\[([a-zA-Z0-9_-]+)\]/i);
            if (match) {
                const slot = resolveSlotRef(match[1], varAliases);
                steps.push({ type: 'save', varSlot: slot });
            }
        } else if (stepLine.toLowerCase() === 'first') {
            steps.push({ type: 'first' });
        } else if (stepLine.toLowerCase() === 'last') {
            steps.push({ type: 'last' });
        } else if (stepLine.toLowerCase() === 'trim') {
            steps.push({ type: 'trim' });
        } else if (stepLine.toLowerCase() === 'lower') {
            steps.push({ type: 'lower' });
        } else if (stepLine.toLowerCase() === 'upper') {
            steps.push({ type: 'upper' });
        } else if (stepLine.toLowerCase() === 'as number') {
            steps.push({ type: 'as_number' });
        } else if (stepLine.toLowerCase() === 'reverse') {
            steps.push({ type: 'reverse' });
        } else if (stepLine.toLowerCase() === 'sort') {
            steps.push({ type: 'sort' });
        } else if (stepLine.toLowerCase() === 'sort reverse') {
            steps.push({ type: 'sort_reverse' });
        } else if (stepLine.toLowerCase() === 'shuffle') {
            steps.push({ type: 'shuffle' });
        }

        i++;
    }

    const pipeData: PipelineData = {
        source,
        steps,
    };

    return {
        action: {
            type: 'pipeline',
            value: pipeData,
        },
        nextIndex: i,
    };
}

function parseVarsLines(varLines: string[], varAliases: Record<string, number>): void {
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
}

function stripComments(text: string): string {
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
}

function parseActionLine(
    line: string,
    varAliases: Record<string, number>,
): UserCommandAction | null {
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
}

function resolveSlotRef(ref: string, aliases: Record<string, number>): number {
    const num = parseInt(ref, 10);
    if (!isNaN(num)) return num;
    if (ref in aliases) return aliases[ref];
    return 0;
}

function parseValueExpr(expr: string): ActionValue {
    const trimmed = expr.trim();

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

    const calcMatch = trimmed.match(/^\{?\s*calc\s*\{([^}]+)\}\s*\}?$/i);
    if (calcMatch) {
        const mathExpr = calcMatch[1].trim();
        const complexVal: ComplexValue = {
            type: 'calc',
            value: mathExpr,
        };
        return complexVal;
    }

    if (trimmed.startsWith('"""') && trimmed.endsWith('"""') && trimmed.length >= 6) {
        return trimmed.slice(3, -3);
    }

    if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) {
        return trimmed.slice(1, -1);
    }

    return trimmed;
}
