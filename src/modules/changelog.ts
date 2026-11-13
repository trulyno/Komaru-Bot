import { commandRegistry } from '../commandRegistry';
import { config } from '../config';
import { logger } from '../logger';
import { BotModule } from '../moduleLoader';
import { changelogService } from '../services/changelogService';

const moduleDefinition: BotModule = {
    name: 'changelog',
    description: 'Display bot version and release notes / changelog',
    help: {
        summary: 'Bot version information and release changelog',
        description:
            'Displays the changes and release notes for the current bot version or any specified previous version.',
        usage: '/changelog [version:string] or !changelog [version]',
        commands: [
            {
                name: 'changelog',
                description: 'View changes and release notes for the bot',
                usage: '/changelog [version:string]',
            },
        ],
        examples: ['/changelog', '/changelog version:0.4.0', '!changelog', '!changelog 0.4.0'],
    },
    register: async (client: any) => {
        commandRegistry.register({
            name: 'changelog',
            description: 'View bot version and release notes',
            options: [
                {
                    name: 'version',
                    description:
                        'Specific version to view (e.g. 0.4.0). Defaults to current version.',
                    type: 3,
                    required: false,
                },
            ],
            handler: async (interaction: any) => {
                const requestedVersion = interaction.options?.getString?.('version')?.trim();

                const entry = changelogService.getEntry(requestedVersion);
                if (!entry) {
                    const notFoundEmbed = changelogService.formatNotFoundEmbed(
                        requestedVersion || 'unknown',
                    );
                    await interaction.reply({
                        embeds: [notFoundEmbed],
                        ephemeral: true,
                    });
                    return;
                }

                const embed = changelogService.formatEmbed(entry);
                await interaction.reply({ embeds: [embed] });
            },
        });

        client.on('messageCreate', async (message: any) => {
            if (!message || message.author?.bot) {
                return;
            }

            if (!message.content || !message.content.startsWith('!changelog')) {
                return;
            }

            if (!config.modules.isModuleEnabled('changelog', message.guildId, message.channelId)) {
                return;
            }

            const parts = message.content.trim().split(/\s+/);
            if (parts[0].toLowerCase() !== '!changelog') {
                return;
            }

            const requestedVersion = parts[1]?.trim();
            const entry = changelogService.getEntry(requestedVersion);

            if (!entry) {
                const notFoundEmbed = changelogService.formatNotFoundEmbed(
                    requestedVersion || 'unknown',
                );
                try {
                    await message.reply({ embeds: [notFoundEmbed] });
                } catch (error) {
                    logger.error(`Failed to send changelog not-found reply: ${error}`);
                }
                return;
            }

            const embed = changelogService.formatEmbed(entry);
            try {
                await message.reply({ embeds: [embed] });
            } catch (error) {
                logger.error(`Failed to send changelog reply: ${error}`);
            }
        });
    },
};

export default moduleDefinition;
export const module = moduleDefinition;
