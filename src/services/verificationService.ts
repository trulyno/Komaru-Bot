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
import { logger } from '../logger';
import { config } from '../config';

// Default configuration constants (can be overridden via process.env / config)
export const verificationChannelsAllowed = config.env.verificationChannelsAllowed;
export const verificationChannelId = config.env.verificationChannelId;
export const verifierRoleId = config.env.verifierRoleId;
export const stargateRoleIds = [
    { name: 'Legacy CSG', value: 'legacy_csg_role' },
    { name: 'ASG', value: 'asg_role' },
    { name: 'DSG', value: 'dsg_role' },
];

export function getConfiguredAllowedChannels(): string[] {
    return config.env.verificationChannelsAllowed;
}

/**
 * Searches for a channel in a guild or client cache by ID or name.
 */
function findGuildChannel(guildOrClient: any, identifier: string): any {
    if (!guildOrClient) return null;
    const channels = guildOrClient.channels?.cache ?? guildOrClient.channels;
    if (!channels) return null;

    const trimmed = identifier
        .trim()
        .replace(/^<#|>$/g, '')
        .replace(/^#/, '');

    // Check by ID
    if (typeof channels.get === 'function') {
        const byId = channels.get(trimmed);
        if (byId) return byId;
    } else if (Array.isArray(channels)) {
        const byId = channels.find((c: any) => c.id === trimmed);
        if (byId) return byId;
    }

    // Check by name
    const lower = trimmed.toLowerCase();
    if (typeof channels.find === 'function') {
        const byName = channels.find((c: any) => c.name?.toLowerCase() === lower);
        if (byName) return byName;
    } else if (Array.isArray(channels)) {
        const byName = channels.find((c: any) => c.name?.toLowerCase() === lower);
        if (byName) return byName;
    }

    return null;
}

/**
 * Formats a channel identifier (ID, name, or mention) for Discord markdown output.
 * If numeric snowflake ID, formats as <#ID>.
 * If channel name and found in guild cache, resolves to <#ID>.
 * Otherwise falls back to #channel-name.
 */
export function formatChannelIdentifier(entry: string, guildOrClient?: any): string {
    const raw = entry.trim();
    if (!raw) return '';

    // If it's already a channel mention <#123456789>
    const mentionMatch = raw.match(/^<#(\d+)>$/);
    if (mentionMatch) {
        return raw;
    }

    // If it's a numeric snowflake ID
    if (/^\d+$/.test(raw)) {
        return `<#${raw}>`;
    }

    // Try resolving from guild/client
    const found = findGuildChannel(guildOrClient, raw);
    if (found && found.id) {
        return `<#${found.id}>`;
    }

    // Fallback: format with leading #
    const cleaned = raw.replace(/^#/, '');
    return `#${cleaned}`;
}

/**
 * Formats all configured allowed verification channels into a human-readable list of Discord mentions.
 */
export function formatAllowedVerificationChannels(guildOrClient?: any): string {
    const allowed = getConfiguredAllowedChannels();
    const mainId = config.env.verificationChannelId;

    const allEntries: string[] = [...allowed];
    if (mainId && mainId !== 'verification_channel' && !allEntries.includes(mainId)) {
        allEntries.push(mainId);
    }

    if (allEntries.length === 0) {
        return 'designated verification channels';
    }

    const formattedList: string[] = [];
    const seen = new Set<string>();

    for (const entry of allEntries) {
        const formatted = formatChannelIdentifier(entry, guildOrClient);
        if (formatted && !seen.has(formatted)) {
            seen.add(formatted);
            formattedList.push(formatted);
        }
    }

    if (formattedList.length === 0) {
        return 'designated verification channels';
    }

    return formattedList.join(', ');
}

export function isVerificationChannel(channel: any): boolean {
    if (!channel) return false;
    const allowedList = getConfiguredAllowedChannels();
    const verifChannelId = config.env.verificationChannelId.toLowerCase();

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

    const envRoleId = config.env.verifierRoleId;
    const envRoleName = config.env.verifierRoleName.toLowerCase();

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
        legacy_csg_role: config.env.legacyCsgRoleId,
        asg_role: config.env.asgRoleId,
        dsg_role: config.env.dsgRoleId,
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
                    .setCustomId('modifications')
                    .setLabel('Modifications to modpack or cheated items?')
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true)
                    .setPlaceholder('List any modpack modifications or cheated items (or "none")'),
            ),
        ]);

    return modal;
};

export function getFieldValues(interaction: ModalSubmitInteraction): Record<string, string> {
    const getSafe = (customId: string) => {
        try {
            return interaction.fields.getTextInputValue(customId)?.trim() ?? '';
        } catch {
            return '';
        }
    };

    return {
        role: getSafe('role'),
        modifications: getSafe('modifications'),
        versions: getSafe('versions'),
        method: getSafe('method'),
        playtime: getSafe('playtime'),
        cheats: getSafe('cheats'),
    };
}

export async function handleVerificationForm(interaction: ModalSubmitInteraction): Promise<void> {
    try {
        const values = getFieldValues(interaction);

        const modsAndCheats =
            values.modifications && values.cheats
                ? `Modifications: ${values.modifications}\nCheats: ${values.cheats}`
                : values.modifications || values.cheats || 'None';

        const embed = new EmbedBuilder()
            .setTitle('📝 Gate Run Verification Request')
            .setColor(Colors.Purple)
            .setAuthor({
                name: interaction.user.tag,
                iconURL: interaction.user.displayAvatarURL(),
            })
            .addFields(
                { name: '👤 User', value: `<@${interaction.user.id}>`, inline: true },
                { name: '🏆 Role Requested', value: values.role || 'None', inline: true },
                { name: '🎮 Play Method', value: values.method || 'None', inline: true },
                { name: '📦 Version(s)', value: values.versions || 'None', inline: false },
                { name: '⏱️ Playtime', value: values.playtime || 'None', inline: false },
                { name: '🛠️ Modifications / Cheats', value: modsAndCheats, inline: false },
            )
            .setFooter({ text: `User ID: ${interaction.user.id}` })
            .setTimestamp();

        const verifierRoleIdConfig = config.env.verifierRoleId;
        const verifierPing = verifierRoleIdConfig ? `<@&${verifierRoleIdConfig}>` : 'verifiers';

        await interaction.reply({
            content: `🔔 **Verification Request** submitted by ${interaction.user} for **${values.role}**! Calling ${verifierPing}!`,
            embeds: [embed],
        });

        const targetChannelId = config.env.verificationChannelId;
        if (interaction.guild && targetChannelId && targetChannelId !== interaction.channelId) {
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
