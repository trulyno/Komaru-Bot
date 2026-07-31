import { commandRegistry } from '../commandRegistry';

const moduleDefinition = {
    name: 'ping',
    description: 'Ping command',
    register: async (client: any) => {
        commandRegistry.register({
            name: 'ping',
            description: 'Ping the bot',
            handler: async (interaction: any) => {
                await interaction.reply({ content: 'Pong!', ephemeral: true });
            },
        });
    },
};

export default moduleDefinition;
export const module = moduleDefinition;
