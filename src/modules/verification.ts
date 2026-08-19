
import {
    ActionRowBuilder,
    Colors,
    EmbedBuilder,
    ModalBuilder,
    ModalSubmitInteraction,
    PermissionFlagsBits,
    TextInputBuilder,
    TextInputStyle,
} from 'discord.js';
import { commandRegistry } from '../commandRegistry';
import { logger } from '../logger';

// Default configuration constants (can be overridden via process.env)
const verificationChannelsAllowed = ['screenshots', 'panoramas'];
const verificationChannelId = 'verification_channel';
const verifierRoleId = 'verifier_role';
const stargateRoleIds = [
    { name: 'Legacy CSG', value: 'legacy_csg_role' },
    { name: 'ASG', value: 'asg_role' },
    { name: 'DSG', value: 'dsg_role' },
];

export function getConfiguredAllowedChannels(): string[] {
    if (process.env.VERIFICATION_CHANNELS_ALLOWED) {
        return process.env.VERIFICATION_CHANNELS_ALLOWED.split(',')
            .map((c) => c.trim().toLowerCase())
            .filter(Boolean);
    }
    return verificationChannelsAllowed.map((c) => c.toLowerCase());
}

export function isVerificationChannel(channel: any): boolean {
    if (!channel) return false;
    const allowedList = getConfiguredAllowedChannels();
    const verifChannelId = (
        process.env.VERIFICATION_CHANNEL_ID ?? verificationChannelId
    ).toLowerCase();

    const channelId = channel.id?.toLowerCase();
    const channelName = channel.name?.toLowerCase();
    const parentId = channel.parentId?.toLowerCase();
    const parentName = channel.parent?.name?.toLowerCase();

    if (
        allowedList.includes(channelId) ||
        allowedList.includes(channelName) ||
        channelId === verifChannelId ||
        channelName === verifChannelId
    ) {
        return true;
    }

    if (
        (parentId && (allowedList.includes(parentId) || parentId === verifChannelId)) ||
        (parentName && (allowedList.includes(parentName) || parentName === verifChannelId))
    ) {
        return true;
    }

    return false;
}

export function isVerifier(member: any, _guild?: any): boolean {
    if (!member) return false;

    if (
        member.permissions?.has?.(PermissionFlagsBits.Administrator) ||
        member.permissions?.has?.(PermissionFlagsBits.ManageRoles)
    ) {
        return true;
    }

    const envRoleId = process.env.VERIFIER_ROLE_ID ?? verifierRoleId;
    const envRoleName = (process.env.VERIFIER_ROLE_NAME ?? 'verifier').toLowerCase();

    if (!member.roles?.cache) return true;

    const checkRole = (role: any) => {
        const rName = role.name?.toLowerCase() ?? '';
        return role.id === envRoleId || rName === envRoleName || rName.includes('verifier');
    };

    if (typeof member.roles.cache.some === 'function') {
        return member.roles.cache.some(checkRole);
    } else if (Array.isArray(member.roles.cache)) {
        return member.roles.cache.some(checkRole);
    }

    return false;
}

export function resolveStargateRole(guild: any, roleValue: string): any {
    if (!guild?.roles?.cache) return null;

    const envMap: Record<string, string | undefined> = {
        legacy_csg_role: process.env.LEGACY_CSG_ROLE_ID,
        asg_role: process.env.ASG_ROLE_ID,
        dsg_role: process.env.DSG_ROLE_ID,
    };

    const envRoleId = envMap[roleValue];
    if (envRoleId && typeof guild.roles.cache.get === 'function') {
        const roleByEnv = guild.roles.cache.get(envRoleId);
        if (roleByEnv) return roleByEnv;
    }

    const choice = stargateRoleIds.find(
        (r) => r.value === roleValue || r.name.toLowerCase() === roleValue.toLowerCase(),
    );
    const targetName = (choice?.name ?? roleValue).toLowerCase();

    if (typeof guild.roles.cache.get === 'function') {
        const byId = guild.roles.cache.get(roleValue);
        if (byId) return byId;
    }

    const matchRole = (role: any) =>
        role.id === roleValue ||
        role.name?.toLowerCase() === targetName ||
        role.name?.toLowerCase() === roleValue.toLowerCase();

    if (typeof guild.roles.cache.find === 'function') {
        return guild.roles.cache.find(matchRole) ?? null;
    } else if (Array.isArray(guild.roles.cache)) {
        return guild.roles.cache.find(matchRole) ?? null;
    }

    return null;
}

export const buildVerificationForm = (): ModalBuilder => {
    const modal = new ModalBuilder()
        .setCustomId('verification_form')
        .setTitle('📝 Gate Run Verification')
        .setComponents([
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId('role')
                    .setLabel('What are you verifying for?')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setPlaceholder('Legacy CSG, ASG, or DSG'),
            ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId('modifications')
                    .setLabel('Did you modify the modpack in any way?')
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true)
                    .setPlaceholder(
                        'If yes, please list all modifications made (or "no modifications")',
                    ),
            ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId('versions')
                    .setLabel('In what version(s) did you play?')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setPlaceholder('Ex. Theta 1, Eta 3 updated to Theta 1, etc.'),
            ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId('method')
                    .setLabel('Did you play on a server or singleplayer?')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setPlaceholder('Ex. server, singleplayer, etc.'),
            ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId('playtime')
                    .setLabel("Playtime & teammates' playtime")
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true)
                    .setPlaceholder(
                        'Ex. trulyno - 12.5d, komaru - 10.5d (/leaderboard time_played)',
                    ),
            ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId('cheats')
                    .setLabel('Did you or teammates cheat items in?')
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true)
                    .setPlaceholder('Ex. nothing, cheated in building blocks, etc.'),
            ),
        ]);

    return modal;
};

export function getFieldValues(interaction: ModalSubmitInteraction): Record<string, string> {
    return {
        role: interaction.fields.getTextInputValue('role').trim(),
        modifications: interaction.fields.getTextInputValue('modifications').trim(),
        versions: interaction.fields.getTextInputValue('versions').trim(),
        method: interaction.fields.getTextInputValue('method').trim(),
        playtime: interaction.fields.getTextInputValue('playtime').trim(),
        cheats: interaction.fields.getTextInputValue('cheats').trim(),
    };
}

export async function handleVerificationForm(interaction: ModalSubmitInteraction): Promise<void> {
    try {
        const values = getFieldValues(interaction);

        const embed = new EmbedBuilder()
            .setTitle('📝 Gate Run Verification Request')
            .setColor(Colors.Purple)
            .setAuthor({
                name: interaction.user.tag,
                iconURL: interaction.user.displayAvatarURL(),
            })
            .addFields(
                { name: '👤 User', value: `<@${interaction.user.id}>`, inline: true },
                { name: '🏆 Role Requested', value: values.role, inline: true },
                { name: '🎮 Play Method', value: values.method, inline: true },
                { name: '📦 Version(s)', value: values.versions, inline: false },
                { name: '🛠️ Modifications', value: values.modifications, inline: false },
                { name: '⏱️ Playtime', value: values.playtime, inline: false },
                { name: '⚠️ Cheats / Spawning', value: values.cheats, inline: false },
            )
            .setFooter({ text: `User ID: ${interaction.user.id}` })
            .setTimestamp();

        const verifierRoleIdConfig = process.env.VERIFIER_ROLE_ID ?? verifierRoleId;
        const verifierPing = verifierRoleIdConfig ? `<@&${verifierRoleIdConfig}>` : 'verifiers';

        await interaction.reply({
            content: `🔔 **Verification Request** submitted by ${interaction.user} for **${values.role}**! Calling ${verifierPing}!`,
            embeds: [embed],
        });

        const targetChannelId = process.env.VERIFICATION_CHANNEL_ID ?? verificationChannelId;
        if (
            interaction.guild &&
            targetChannelId &&
            targetChannelId !== interaction.channelId
        ) {
            try {
                let notifyChannel: any = interaction.guild.channels.cache.get(targetChannelId);
                if (!notifyChannel && interaction.client) {
                    notifyChannel = await interaction.client.channels
                        .fetch(targetChannelId)
                        .catch(() => null);
                }
                if (notifyChannel && notifyChannel.isTextBased()) {
                    await notifyChannel.send({
                        content: `🔔 New verification request submitted by ${interaction.user} in <#${interaction.channelId}>! ${verifierPing}`,
                        embeds: [embed],
                    });
                }
            } catch (err) {
                logger.error(`Failed to send notification to verification channel: ${err}`);
            }
        }
    } catch (error) {
        logger.error(`Error processing verification form submission: ${error}`);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: 'An error occurred while processing your verification request.',
                ephemeral: true,
            });
        }
    }
}

const moduleDefinition = {
    name: 'verification',
    description: 'Verification for stargate roles',
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

                const targetChannelId =
                    process.env.VERIFICATION_CHANNEL_ID ?? verificationChannelId;
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

            if (interaction.customId === 'verification_form') {
                await handleVerificationForm(interaction);
            }
        });
    },
};

export default moduleDefinition;
export const module = moduleDefinition;