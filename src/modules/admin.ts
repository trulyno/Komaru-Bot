import { logger } from '../logger';
import { cleanAndSyncCommands, restartBot, stopBot, syncCommands } from '../commandHandlers';
import { commandRegistry } from '../commandRegistry';
import { config } from '../config';

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
                    const guildId = config.env.discordGuildId;
                    await syncCommands(config.env.discordToken, client?.user?.id, guildId);
                    await interaction.editReply('Slash commands synced.');
                } catch (error) {
                    logger.error(`Failed to sync commands: ${error}`);
                    await interaction.editReply('Unable to sync commands.');
                }
            },
        });

        commandRegistry.register({
            name: 'cleancommands',
            description: 'Clean all slash commands and re-register from command registry',
            handler: async (interaction: any) => {
                await interaction.deferReply({ ephemeral: true });
                try {
                    const guildId = config.env.discordGuildId;
                    await cleanAndSyncCommands(
                        config.env.discordToken,
                        client?.user?.id,
                        guildId,
                    );
                    await interaction.editReply('Slash commands cleaned and re-registered.');
                } catch (error) {
                    logger.error(`Failed to clean and re-register commands: ${error}`);
                    await interaction.editReply('Unable to clean and re-register commands.');
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
