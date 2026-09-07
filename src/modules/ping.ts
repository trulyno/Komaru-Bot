import { commandRegistry } from '../commandRegistry';
import { BotModule } from '../moduleLoader';

const moduleDefinition: BotModule = {
    name: 'ping',
    description: 'Ping healthcheck command',
    help: {
        summary: 'Bot connectivity and responsiveness check',
        description: 'Sends a ping to the bot to verify gateway connection and responsiveness.',
        usage: '/ping',
        commands: [
            {
                name: 'ping',
                description: 'Responds with Pong!',
                usage: '/ping',
            },
        ],
        examples: ['/ping'],
    },
    register: async () => {
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
