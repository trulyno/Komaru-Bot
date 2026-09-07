import { EmbedBuilder } from 'discord.js';
import { commandRegistry } from '../commandRegistry';
import { moduleConfigService } from '../services/moduleConfigService';
import { BotModule, ModuleHelp, ModuleHelpProvider, moduleLoader } from '../moduleLoader';

function addChunkedFields(embed: EmbedBuilder, baseTitle: string, lines: string[]): void {
    if (lines.length === 0) {
        embed.addFields({ name: baseTitle, value: 'None' });
        return;
    }

    const chunks: string[] = [];
    let currentChunk = '';

    for (const line of lines) {
        if (!currentChunk) {
            currentChunk = line;
        } else if (currentChunk.length + line.length + 1 <= 1000) {
            currentChunk += '\n' + line;
        } else {
            chunks.push(currentChunk);
            currentChunk = line;
        }
    }
    if (currentChunk) {
        chunks.push(currentChunk);
    }

    chunks.forEach((chunk, index) => {
        const title = index === 0 ? baseTitle : `${baseTitle} (cont. ${index + 1})`;
        embed.addFields({ name: title, value: chunk });
    });
}

function formatModuleHelpEmbed(
    moduleObj: BotModule,
    helpData: ModuleHelp | string,
    guildId?: string | null,
    channelId?: string | null,
): EmbedBuilder {
    const isGuildEnabled = moduleConfigService.isModuleEnabled(moduleObj.name, guildId);
    const isChannelEnabled = moduleConfigService.isModuleEnabled(
        moduleObj.name,
        guildId,
        channelId,
    );

    let statusText = '🟢 Enabled';
    if (!isGuildEnabled) {
        statusText = '🔴 Disabled (Server-wide)';
    } else if (!isChannelEnabled) {
        statusText = '🟡 Disabled in this channel';
    }

    const embed = new EmbedBuilder()
        .setTitle(`Module Help: ${moduleObj.name}`)
        .setColor(isGuildEnabled && isChannelEnabled ? 0x57f287 : 0xed4245);

    if (typeof helpData === 'string') {
        embed.setDescription(`${helpData}\n\n**Status**: ${statusText}`);
        return embed;
    }

    const description = helpData.description || helpData.summary || moduleObj.description;
    embed.setDescription(`${description}\n\n**Status in this channel**: ${statusText}`);

    if (helpData.usage) {
        embed.addFields({ name: 'Usage', value: helpData.usage.slice(0, 1024) });
    }

    if (helpData.commands && helpData.commands.length > 0) {
        const cmdLines = helpData.commands.map((cmd) => {
            const usageStr = cmd.usage ? `\n  \`${cmd.usage}\`` : '';
            return `• **\`/${cmd.name}\`**: ${cmd.description}${usageStr}`;
        });
        addChunkedFields(embed, 'Commands', cmdLines);
    }

    if (helpData.examples && helpData.examples.length > 0) {
        const exLines = helpData.examples.map((ex) => `• ${ex}`);
        addChunkedFields(embed, 'Examples', exLines);
    }

    if (helpData.details) {
        embed.addFields({ name: 'Details', value: helpData.details.slice(0, 1024) });
    }

    return embed;
}

const moduleDefinition: BotModule = {
    name: 'help',
    description: 'Dynamic help command providing module summaries and detailed command guides',
    help: {
        summary: 'View general bot help or detailed help for any loaded module',
        description:
            'The help module inspects all bot features and modules dynamically, providing context-aware help and command listings.',
        usage: '/help [module]',
        commands: [
            {
                name: 'help',
                description: 'Show bot help overview or detailed module guide',
                usage: '/help [module:module_name]',
            },
        ],
        examples: ['/help', '/help module:chess', '/help module:auditLog'],
    },
    register: async () => {
        commandRegistry.register({
            name: 'help',
            description: 'Display bot modules and command help',
            options: [
                {
                    name: 'module',
                    description: 'Specific module name to view help for',
                    type: 3, // STRING
                    required: false,
                },
            ],
            handler: async (interaction: any) => {
                const moduleQuery = interaction.options?.getString?.('module')?.trim();
                const guildId = interaction.guildId;
                const channelId = interaction.channelId;

                if (moduleQuery) {
                    const targetModule = moduleLoader.getModule(moduleQuery);
                    if (!targetModule) {
                        const allMods = moduleLoader
                            .getAllModules()
                            .map((m) => `\`${m.name}\``)
                            .join(', ');
                        await interaction.reply({
                            content: `Module \`${moduleQuery}\` was not found.\nAvailable modules: ${allMods}`,
                            ephemeral: true,
                        });
                        return;
                    }

                    const helpContent = await moduleLoader.getModuleHelp(targetModule.name, {
                        guildId,
                        channelId,
                    });

                    const embed = formatModuleHelpEmbed(
                        targetModule,
                        helpContent ?? targetModule.description,
                        guildId,
                        channelId,
                    );
                    await interaction.reply({ embeds: [embed] });
                    return;
                }

                // General Help overview listing all modules
                const modules = moduleLoader
                    .getAllModules()
                    .sort((a, b) => a.name.localeCompare(b.name));
                const embed = new EmbedBuilder()
                    .setTitle('Komaru Bot — Modules & Help')
                    .setDescription(
                        'Here are the loaded modules for Komaru Bot. Use `/help [module]` to view detailed commands and instructions for any specific module.',
                    )
                    .setColor(0x6a5acd);

                const moduleLines = modules.map((mod) => {
                    const isGuildEnabled = moduleConfigService.isModuleEnabled(mod.name, guildId);
                    const isChannelEnabled = moduleConfigService.isModuleEnabled(
                        mod.name,
                        guildId,
                        channelId,
                    );

                    let statusIcon = '🟢';
                    if (!isGuildEnabled) {
                        statusIcon = '🔴';
                    } else if (!isChannelEnabled) {
                        statusIcon = '🟡';
                    }

                    return `${statusIcon} **${mod.name}**: ${mod.description}`;
                });

                addChunkedFields(embed, 'Available Modules', moduleLines);

                embed.setFooter({
                    text: 'Legend: 🟢 Enabled | 🟡 Disabled in Channel | 🔴 Disabled Server-wide',
                });

                await interaction.reply({ embeds: [embed] });
            },
        });
    },
};

export default moduleDefinition;
export const module = moduleDefinition;
