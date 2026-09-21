import { MessageFlags } from 'discord.js';
import { commandRegistry } from '../commandRegistry';
import { config } from '../config';
import { logger } from '../logger';
import { BotModule } from '../moduleLoader';
import { canModerate } from '../services/auditLogService';
import {
    buildAnnouncementEmbed,
    buildColorAttachment,
    buildColorOfTheDayEmbed,
    buildTierListActionRow,
    buildTierListEmbed,
    checkAndAdvanceIfNeeded,
    ColorTier,
    getCurrentColor,
    recordVote,
    setGuildChannel,
    TIER_EMOJIS,
    VALID_TIERS,
} from '../services/colorOfTheDayService';

let cycleIntervalHandle: NodeJS.Timeout | null = null;

const moduleDefinition: BotModule = {
    name: 'colorOfTheDay',
    description:
        'Daily Color of the Day selection, user tier ranking, and interactive tier list browser',
    help: {
        summary: 'Daily color rotation, tier list voting, and historical palette gallery',
        description:
            'Every 24 hours, selects a new random color and announces it in configured channels with a generated solid-color preview image. Users can vote on the color tier (S, A, B, C, D, F), and view community historical tier rankings.',
        usage: '/coloroftheday | /rankcoloroftheday <tier> | /colorofthedaytierlist | /set_color_of_the_day_channel <channel>',
        commands: [
            {
                name: 'coloroftheday',
                description: 'View today’s Color of the Day, hex/RGB values, and voting status',
                usage: '/coloroftheday',
            },
            {
                name: 'rankcoloroftheday',
                description: 'Rank today’s Color of the Day in a tier list (S, A, B, C, D, F)',
                usage: '/rankcoloroftheday <tier:S|A|B|C|D|F>',
            },
            {
                name: 'colorofthedaytierlist',
                description: 'Browse the historical Color of the Day community tier list',
                usage: '/colorofthedaytierlist',
            },
            {
                name: 'set_color_of_the_day_channel',
                description:
                    'Set the channel where the daily Color of the Day is announced (Moderator only)',
                usage: '/set_color_of_the_day_channel <channel:channel>',
            },
        ],
        examples: [
            '/coloroftheday',
            '/rankcoloroftheday tier:S',
            '/rankcoloroftheday tier:A',
            '/colorofthedaytierlist',
            '/set_color_of_the_day_channel channel:#general',
        ],
    },
    register: async (client: any) => {
        // Setup channel configuration command
        commandRegistry.register({
            name: 'set_color_of_the_day_channel',
            description: 'Set the channel used for daily Color of the Day announcements',
            options: [
                {
                    name: 'channel',
                    description: 'Text channel for Color of the Day announcements',
                    type: 7, // CHANNEL
                    required: true,
                },
            ],
            handler: async (interaction: any) => {
                if (!interaction.guild || !canModerate(interaction.member)) {
                    await interaction.reply({
                        content:
                            'Meow! 🐾 You do not have permission to configure Color of the Day settings.',
                        ephemeral: true,
                    });
                    return;
                }

                const channel = interaction.options.getChannel('channel');
                if (!channel?.isTextBased?.()) {
                    await interaction.reply({
                        content: 'Please select a text-based channel for announcements.',
                        ephemeral: true,
                    });
                    return;
                }

                setGuildChannel(interaction.guild.id, channel.id);

                // Send initial announcement if no color was announced in this channel yet
                const color = getCurrentColor();
                const attachment = buildColorAttachment(color.hex);
                const embed = buildAnnouncementEmbed(color, null);

                try {
                    await channel.send({
                        content: '🎨 **Color of the Day has been configured for this channel!** 🐾',
                        embeds: [embed],
                        files: [attachment],
                    });
                } catch (sendErr) {
                    logger.warn(
                        `Failed to send test announcement to channel ${channel.id}: ${sendErr}`,
                    );
                }

                await interaction.reply({
                    content: `Meow! 🐾 Color of the Day announcements will now be posted in <#${channel.id}> every 24 hours!`,
                    ephemeral: true,
                });
            },
        });

        // Current Color of the Day command
        commandRegistry.register({
            name: 'coloroftheday',
            description: 'View today’s Color of the Day and voting status',
            handler: async (interaction: any) => {
                const color = getCurrentColor();
                const attachment = buildColorAttachment(color.hex);
                const embed = buildColorOfTheDayEmbed(color);

                await interaction.reply({
                    embeds: [embed],
                    files: [attachment],
                });
            },
        });

        // Vote / Rank Color of the Day command
        commandRegistry.register({
            name: 'rankcoloroftheday',
            description: 'Rank today’s Color of the Day on a tier list (S, A, B, C, D, F)',
            options: [
                {
                    name: 'tier',
                    description: 'The tier to award today’s color (S, A, B, C, D, F)',
                    type: 3, // STRING
                    required: true,
                    choices: [
                        { name: 'S - Extraordinary / Masterpiece', value: 'S' },
                        { name: 'A - Excellent / Beautiful', value: 'A' },
                        { name: 'B - Good / Solid', value: 'B' },
                        { name: 'C - Average / Neutral', value: 'C' },
                        { name: 'D - Below Average / Meh', value: 'D' },
                        { name: 'F - Terrible / Ugly', value: 'F' },
                    ],
                },
            ],
            handler: async (interaction: any) => {
                const tierInput = interaction.options.getString('tier');
                const result = recordVote(interaction.user.id, tierInput);

                if (!result.success || !result.tier) {
                    await interaction.reply({
                        content: `Invalid tier specified. Please choose one of: ${VALID_TIERS.join(', ')}.`,
                        ephemeral: true,
                    });
                    return;
                }

                const emoji = TIER_EMOJIS[result.tier];
                let replyMessage = '';

                if (result.oldTier && result.oldTier !== result.tier) {
                    replyMessage = `Meow! 🐾 You changed your vote from **Tier ${result.oldTier}** ${TIER_EMOJIS[result.oldTier]} to **Tier ${result.tier}** ${emoji} for today's color **${result.color.hex}**! Purr-fect choice!`;
                } else {
                    replyMessage = `Meow! 🐾 You ranked today's color **${result.color.hex}** as ${emoji} **Tier ${result.tier}**! (${result.totalVotes} vote${result.totalVotes === 1 ? '' : 's'} recorded today)`;
                }

                await interaction.reply({
                    content: replyMessage,
                    ephemeral: true,
                });
            },
        });

        // Historical Tier List command
        commandRegistry.register({
            name: 'colorofthedaytierlist',
            description: 'View the historical Color of the Day tier list and browse colors by tier',
            handler: async (interaction: any) => {
                const embed = buildTierListEmbed('all');
                const actionRow = buildTierListActionRow('all', interaction.user.id);

                await interaction.reply({
                    embeds: [embed],
                    components: [actionRow],
                });
            },
        });

        // Interaction listener for interactive Tier List Select Menu
        client.on('interactionCreate', async (interaction: any) => {
            try {
                if (!interaction.isStringSelectMenu?.()) {
                    return;
                }

                if (
                    !config.modules.isModuleEnabled(
                        'colorOfTheDay',
                        interaction.guildId,
                        interaction.channelId,
                    )
                ) {
                    return;
                }

                const customId = interaction.customId || '';
                if (!customId.startsWith('cotd_tier_select:')) {
                    return;
                }

                const parts = customId.split(':');
                const authorId = parts[1];

                if (authorId && authorId !== 'any' && interaction.user.id !== authorId) {
                    await interaction.reply({
                        content:
                            'Meow! 🐾 Use `/colorofthedaytierlist` to open your own interactive tier list browser!',
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }

                const selectedValue = interaction.values?.[0] || 'all';
                const selectedTier =
                    selectedValue === 'all' ? 'all' : (selectedValue.toUpperCase() as ColorTier);

                const embed = buildTierListEmbed(selectedTier);
                const actionRow = buildTierListActionRow(selectedTier, authorId);

                await interaction.update({
                    embeds: [embed],
                    components: [actionRow],
                });
            } catch (error) {
                logger.error(`Error handling Color of the Day select menu interaction: ${error}`);
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({
                        content: 'Failed to update tier list view.',
                        flags: MessageFlags.Ephemeral,
                    });
                }
            }
        });

        // Initial cycle check on client ready
        if (client.isReady?.()) {
            checkAndAdvanceIfNeeded(client).catch((err) =>
                logger.error(`Error in initial Color of the Day cycle check: ${err}`),
            );
        } else {
            client.once('ready', () => {
                checkAndAdvanceIfNeeded(client).catch((err) =>
                    logger.error(`Error in Color of the Day ready check: ${err}`),
                );
            });
        }

        // Periodic background interval check (every 60 seconds)
        if (cycleIntervalHandle) {
            clearInterval(cycleIntervalHandle);
        }
        cycleIntervalHandle = setInterval(() => {
            checkAndAdvanceIfNeeded(client).catch((err) =>
                logger.error(`Error in periodic Color of the Day cycle check: ${err}`),
            );
        }, 60 * 1000);
    },
};

export default moduleDefinition;
export const module = moduleDefinition;
