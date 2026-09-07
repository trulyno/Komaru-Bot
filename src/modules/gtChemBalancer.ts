import { commandRegistry } from '../commandRegistry';
import { config } from '../config';
import { BotModule } from '../moduleLoader';
import {
    balanceChemicalEquation,
    isBalancedChemicalEquation,
} from '../services/gtChemBalancerService';

export { balanceChemicalEquation, isBalancedChemicalEquation };

const moduleDefinition: BotModule = {
    name: 'gtChemBalancer',
    description: 'Balances GT Chemistry equations with dust/fluid/catalyst support',
    help: {
        summary: 'GregTech chemical stoichiometry and equation balancer',
        description:
            'Parses reactants, products, states (dust, fluid, gas), and catalysts to balance linear chemical reactions.',
        usage: '/balance <equation> or !balance <equation>',
        commands: [
            {
                name: 'balance',
                description: 'Check or balance a chemical equation',
                usage: '/balance <equation:equation>',
            },
        ],
        examples: [
            '/balance equation:2H2 + O2 -> 2H2O',
            '!balance CH4 + 2O2 -> CO2 + 2H2O',
            '!balance Fe + Cl2 -> FeCl3',
        ],
    },
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

            if (
                !config.modules.isModuleEnabled(
                    'gtChemBalancer',
                    message.guildId,
                    message.channelId,
                )
            ) {
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
