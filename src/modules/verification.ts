import { Colors, EmbedBuilder } from 'discord.js';
import { commandRegistry } from '../commandRegistry';
import { logger } from '../logger';
import { config } from '../config';
import {
    buildVerificationForm,
    getConfiguredAllowedChannels,
    getFieldValues,
    handleVerificationForm,
    isVerificationChannel,
    isVerifier,
    resolveStargateRole,
    stargateRoleIds,
    verificationChannelId,
} from '../services/verificationService';

export {
    getConfiguredAllowedChannels,
    isVerificationChannel,
    isVerifier,
    resolveStargateRole,
    buildVerificationForm,
    getFieldValues,
    handleVerificationForm,
};

import { BotModule } from '../moduleLoader';

const moduleDefinition: BotModule = {
    name: 'verification',
    description: 'Verification for stargate milestone roles',
    help: {
        summary: 'Stargate milestone progression verification and role assignment',
        description:
            'Allows players to submit completion proof for progression milestones (CSG, ASG, DSG) via modal forms, enabling verifiers to review and award stargate roles.',
        usage: '/verify | /complete_verification',
        commands: [
            {
                name: 'verify',
                description: 'Open a modal form to request stargate progression verification',
                usage: '/verify',
            },
            {
                name: 'complete_verification',
                description: 'Award a user their verified stargate role',
                usage: '/complete_verification <user:user> <role:role>',
            },
        ],
        examples: ['/verify', '/complete_verification user:@Player role:@CSG'],
    },
    register: async (client: any) => {
        commandRegistry.register({
            name: 'verify',
            description: 'Requests a gate run verification',
            handler: async (interaction: any) => {
                if (!isVerificationChannel(interaction.channel)) {
                    const allowed = getConfiguredAllowedChannels();
                    const channelNames =
                        allowed.length > 0
                            ? allowed.map((c) => `#${c}`).join(', ')
                            : 'designated verification channels';
                    await interaction.reply({
                        content: `❌ Verification requests can only be made in ${channelNames}.`,
                        ephemeral: true,
                    });
                    return;
                }

                const modal = buildVerificationForm();
                await interaction.showModal(modal);
            },
        });

        commandRegistry.register({
            name: 'complete_verification',
            description: 'Awards a user a stargate role',
            options: [
                {
                    name: 'user',
                    description: 'The user to award the role to',
                    type: 6,
                    required: true,
                },
                {
                    name: 'role',
                    description: 'The role to award the user',
                    type: 3,
                    required: true,
                    choices: stargateRoleIds,
                },
            ],
            handler: async (interaction: any) => {
                if (!interaction.guild) {
                    await interaction.reply({
                        content: '❌ This command can only be used within a server.',
                        ephemeral: true,
                    });
                    return;
                }

                if (!isVerifier(interaction.member, interaction.guild)) {
                    await interaction.reply({
                        content:
                            '❌ You must have the verifier role or manage roles permission to complete verifications.',
                        ephemeral: true,
                    });
                    return;
                }

                const targetUser = interaction.options.getUser('user', true);
                const roleValue = interaction.options.getString('role', true);

                const member = await interaction.guild.members
                    .fetch(targetUser.id)
                    .catch(() => null);
                if (!member) {
                    await interaction.reply({
                        content: `❌ Member ${targetUser} could not be found in this server.`,
                        ephemeral: true,
                    });
                    return;
                }

                const role = resolveStargateRole(interaction.guild, roleValue);
                if (!role) {
                    await interaction.reply({
                        content: `❌ Could not find the role matching \`${roleValue}\` on this server.`,
                        ephemeral: true,
                    });
                    return;
                }

                try {
                    await member.roles.add(role);
                } catch (err) {
                    logger.error(
                        `Failed to assign role ${role.name} to user ${targetUser.id}: ${err}`,
                    );
                    await interaction.reply({
                        content: `❌ Failed to assign role **${role.name}** to ${targetUser}. Please check bot permissions.`,
                        ephemeral: true,
                    });
                    return;
                }

                const embed = new EmbedBuilder()
                    .setTitle('✅ Gate Run Verification Complete!')
                    .setColor(Colors.Green)
                    .setDescription(
                        `Successfully verified and awarded the **${role.name}** role to ${targetUser}!`,
                    )
                    .addFields(
                        { name: '👤 User', value: `<@${targetUser.id}>`, inline: true },
                        { name: '🏆 Role Awarded', value: `${role}`, inline: true },
                        { name: '🛡️ Verifier', value: `<@${interaction.user.id}>`, inline: true },
                    )
                    .setTimestamp();

                await interaction.reply({ embeds: [embed] });

                const targetChannelId = config.env.verificationChannelId;
                if (targetChannelId && targetChannelId !== interaction.channelId) {
                    try {
                        let notifyChannel: any =
                            interaction.guild.channels.cache.get(targetChannelId);
                        if (!notifyChannel && interaction.client) {
                            notifyChannel = await interaction.client.channels
                                .fetch(targetChannelId)
                                .catch(() => null);
                        }
                        if (notifyChannel && notifyChannel.isTextBased()) {
                            await notifyChannel.send({
                                content: `🎉 Verification complete! ${targetUser} has been awarded the **${role.name}** role by ${interaction.user}.`,
                                embeds: [embed],
                            });
                        }
                    } catch (err) {
                        logger.error(
                            `Failed to send completion notification to verification channel: ${err}`,
                        );
                    }
                }
            },
        });

        client.on('interactionCreate', async (interaction: any) => {
            if (!interaction.isModalSubmit()) {
                return;
            }

            if (
                !config.modules.isModuleEnabled(
                    'verification',
                    interaction.guildId,
                    interaction.channelId,
                )
            ) {
                return;
            }

            if (interaction.customId === 'verification_form') {
                await handleVerificationForm(interaction);
            }
        });
    },
};

export default moduleDefinition;
export const module = moduleDefinition;
