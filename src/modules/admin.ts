import { logger } from '../logger';
import { restartBot, stopBot, syncCommands } from '../commandHandlers';
import { commandRegistry } from '../commandRegistry';

const moduleDefinition = {
    name: 'admin',
    description: 'Admin commands for bot control and command syncing',
    register: async (client: any) => {
        commandRegistry.register({
            name: 'synccommands',
            description: 'Sync slash commands',
            handler: async (interaction: any) => {
                await interaction.deferReply({ ephemeral: true });
                try {
                    const guildId = process.env.DISCORD_GUILD_ID;
                    await syncCommands(process.env.DISCORD_TOKEN!, client?.user?.id, guildId);
                    await interaction.editReply('Slash commands synced.');
                } catch (error) {
                    logger.error(`Failed to sync commands: ${error}`);
                    await interaction.editReply('Unable to sync commands.');
                }
            },
        });

        commandRegistry.register({
            name: 'restartbot',
            description: 'Restart the bot',
            handler: async (interaction: any) => {
                await interaction.reply({ content: 'Restarting bot...', ephemeral: true });
                await restartBot();
            },
        });

        commandRegistry.register({
            name: 'stopbot',
            description: 'Stop the bot',
            handler: async (interaction: any) => {
                await interaction.reply({ content: 'Stopping bot...', ephemeral: true });
                await stopBot();
            },
        });
    },
};

export default moduleDefinition;
export const module = moduleDefinition;
