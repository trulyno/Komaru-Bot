import { logger } from '../logger';
import {
    evaluateCalc,
    evaluateChoice,
    evaluateRandom,
    EvaluationContext,
    interpolateString,
} from './evaluator';
import { UserCommandStorage } from './storage';
import { ActionValue, ComplexValue, UserCommandJson } from './types';

export class TriggerPool {
    private commands: Map<string, UserCommandJson> = new Map();

    constructor(private storage: UserCommandStorage) {}

    public loadFromStorage(): void {
        const loaded = this.storage.loadAllCommands();
        this.commands.clear();
        for (const cmd of loaded) {
            this.commands.set(cmd.metadata.name, cmd);
        }
        logger.info(`TriggerPool initialized with ${this.commands.size} user commands.`);
    }

    public registerCommand(cmd: UserCommandJson): void {
        this.commands.set(cmd.metadata.name, cmd);
        logger.info(`Registered user command "${cmd.metadata.name}" in TriggerPool.`);
    }

    public unregisterCommand(name: string): boolean {
        const existed = this.commands.delete(name);
        if (existed) {
            logger.info(`Unregistered user command "${name}" from TriggerPool.`);
        }
        return existed;
    }

    public getCommand(name: string): UserCommandJson | undefined {
        return this.commands.get(name);
    }

    public getAllCommands(): UserCommandJson[] {
        return Array.from(this.commands.values());
    }

    public async handleMessage(message: any): Promise<boolean> {
        if (!message || !message.content || message.author?.bot) {
            return false;
        }

        const content = message.content.trim();
        const authorId = message.author.id;

        // Iterate over commands to find the first matching trigger
        for (const cmd of this.commands.values()) {
            if (this.isTriggerMatch(cmd, content, authorId)) {
                try {
                    await this.executeCommand(cmd, message);
                    return true;
                } catch (error) {
                    logger.error(`Error executing user command "${cmd.metadata.name}": ${error}`);
                    return false;
                }
            }
        }

        return false;
    }

    private isTriggerMatch(cmd: UserCommandJson, content: string, authorId: string): boolean {
        const { trigger, metadata } = cmd;

        // Check scope requirement
        if (trigger.scope === 'author' && metadata.author !== authorId) {
            return false;
        }

        if (trigger.type === 'string') {
            return content.toLowerCase() === trigger.value.toLowerCase();
        } else if (trigger.type === 'regex') {
            try {
                const reg = new RegExp(trigger.value, 'i');
                return reg.test(content);
            } catch (err) {
                logger.error(`Invalid regex trigger in command "${metadata.name}": ${err}`);
                return false;
            }
        }

        return false;
    }

    private async executeCommand(cmd: UserCommandJson, message: any): Promise<void> {
        const variables: Array<string | number> = new Array(10);
        const aliases = cmd.varAliases;

        const ctx: EvaluationContext = {
            userMention: `<@${message.author.id}>`,
            username: message.author.username || message.author.tag || 'User',
            userId: message.author.id,
            variables,
            varAliases: aliases,
        };

        for (const action of cmd.actions) {
            const evaluatedValue = this.evaluateActionValue(action.value, ctx);

            switch (action.type) {
                case 'memorize': {
                    const slot = action.targetSlot ?? 0;
                    if (slot >= 0 && slot < 10) {
                        variables[slot] = evaluatedValue;
                    }
                    break;
                }
                case 'say': {
                    const strContent = String(evaluatedValue);
                    if (strContent) {
                        await message.channel.send(strContent);
                    }
                    break;
                }
                case 'reply': {
                    const strContent = String(evaluatedValue);
                    if (strContent) {
                        await message.reply(strContent);
                    }
                    break;
                }
                case 'whisper': {
                    const strContent = String(evaluatedValue);
                    if (strContent) {
                        const isInteraction =
                            typeof message.isChatInputCommand === 'function' ||
                            Boolean(message.interaction);
                        if (isInteraction) {
                            try {
                                if (message.replied || message.deferred) {
                                    await message.followUp({
                                        content: strContent,
                                        ephemeral: true,
                                    });
                                } else {
                                    await message.reply({ content: strContent, ephemeral: true });
                                }
                            } catch (err: any) {
                                logger.error(
                                    `Could not send ephemeral whisper interaction: ${err?.message || err}`,
                                );
                            }
                        } else {
                            try {
                                await message.author.send(strContent);
                            } catch (dmError: any) {
                                logger.warn(
                                    `Could not send DM whisper to user ${message.author?.id}: ${dmError?.message || dmError}`,
                                );
                                await message.channel.send(
                                    `*(Could not whisper to ${ctx.userMention}: DMs are disabled or blocked in Discord privacy settings)*`,
                                );
                            }
                        }
                    }
                    break;
                }
                case 'send': {
                    const fileRef = String(evaluatedValue).trim();
                    const mediaItem = cmd.media[fileRef];
                    if (mediaItem && mediaItem.path) {
                        await message.channel.send({
                            files: [mediaItem.path],
                        });
                    } else {
                        logger.warn(
                            `Media file reference "${fileRef}" not found in command "${cmd.metadata.name}"`,
                        );
                    }
                    break;
                }
            }
        }
    }

    private evaluateActionValue(val: ActionValue, ctx: EvaluationContext): string | number {
        if (typeof val === 'string') {
            return interpolateString(val, ctx);
        }

        const complex = val as ComplexValue;
        if (!complex) return '';

        switch (complex.type) {
            case 'choice': {
                const choiceStr = evaluateChoice(complex.value || []);
                return interpolateString(choiceStr, ctx);
            }
            case 'random': {
                return evaluateRandom(complex.min ?? 1, complex.max ?? 10);
            }
            case 'calc': {
                const mathExpr = String(complex.value || '');
                return evaluateCalc(mathExpr, ctx.variables, ctx.varAliases);
            }
            case 'remember': {
                const slot = complex.slot ?? 0;
                const v = ctx.variables[slot];
                return v !== undefined ? v : '';
            }
            case 'literal': {
                return interpolateString(String(complex.value || ''), ctx);
            }
            default:
                return '';
        }
    }
}
