import { commandRegistry } from '../commandRegistry';
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