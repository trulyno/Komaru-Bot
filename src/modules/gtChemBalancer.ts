import { commandRegistry } from '../commandRegistry';
import {
    balanceChemicalEquation,
    isBalancedChemicalEquation,
} from '../services/gtChemBalancerService';

export { balanceChemicalEquation, isBalancedChemicalEquation };

const moduleDefinition = {
    name: 'gtChemBalancer',
    description: 'Balances GT Chemistry equations with dust/fluid/catalyst support',
    register: async (client: any) => {
        commandRegistry.register({
            name: 'balance',
            description: 'Check or balance a chemical equation',
            options: [
                {
                    name: 'equation',
                    description: 'Chemical equation to check or balance',
                    type: 3,
                    required: true,
                },
            ],
            handler: async (interaction: any) => {
                await interaction.deferReply({ ephemeral: true });
                const equation = interaction.options.getString('equation');
                if (!equation) {
                    await interaction.editReply('Please provide an equation to balance.');
                    return;
                }

                const result = balanceChemicalEquation(equation);
                await interaction.editReply(`${result.reason}\n\n${result.balancedEquation}`);
            },
        });

        client.on('messageCreate', async (message: any) => {
            if (message.author.bot || !message.content.startsWith('!balance')) {
                return;
            }

            const equation = message.content.replace(/^!balance\s*/i, '').trim();
            if (!equation) {
                await message.reply('Usage: !balance <equation>');
                return;
            }

            const result = balanceChemicalEquation(equation);
            await message.reply(`${result.reason}\n\n${result.balancedEquation}`);
        });
    },
};

export default moduleDefinition;
export const module = moduleDefinition;
