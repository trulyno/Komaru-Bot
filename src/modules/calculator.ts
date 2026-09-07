import { commandRegistry } from '../commandRegistry';
import { config } from '../config';
import { BotModule } from '../moduleLoader';
import {
    evaluateExpression,
    extractExpressionFromMessage,
    formatCatifiedResult,
    ExpressionTimeoutError,
} from '../utils/calculator';

const DEFAULT_TIMEOUT_MS = 2000;

export {
    evaluateExpression,
    extractExpressionFromMessage,
    formatCatifiedResult,
    ExpressionTimeoutError,
};

const moduleDefinition: BotModule = {
    name: 'calculator',
    description: 'Safely evaluates math expressions and replies with cat-ified results',
    help: {
        summary: 'Safe mathematical expression evaluator with cat flair',
        description:
            'Evaluates mathematical expressions with support for operators, variables, functions, and cat-themed formatting.',
        usage: '/calc <expression> or passive chat expression parsing',
        commands: [
            {
                name: 'calc',
                description: 'Evaluate a mathematical expression safely',
                usage: '/calc <expression>',
            },
        ],
        examples: [
            '/calc expression:2 + 2',
            '/calc expression:sqrt(144) * 3',
            'calc: (10 + 5) / 3',
        ],
    },
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

            if (!config.modules.isModuleEnabled('calculator', message.guildId, message.channelId)) {
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
