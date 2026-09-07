import { Colors, EmbedBuilder } from 'discord.js';
import { commandRegistry } from '../commandRegistry';
import { logger, logError } from '../logger';
import {
    addReactionRole,
    buildReactionRoleListEmbed,
    canManageRole,
    clearReactionRoleMessage,
    getReactionRolesForGuild,
    handleReactionAdd,
    handleReactionRemove,
    isAdmin,
    parseEmoji,
    parseMessageReference,
    removeReactionRole,
} from '../services/reactionRoleService';

import { config } from '../config';
import { BotModule } from '../moduleLoader';

const moduleDefinition: BotModule = {
    name: 'reactionRoles',
    description: 'Reaction-based role assignment and removal',
    help: {
        summary: 'Interactive emoji reaction roles on Discord messages',
        description:
            'Create or bind reactions to roles on messages, automatically granting or revoking roles when members react or unreact.',
        usage: '/reaction_role_add | /reaction_role_create | /reaction_role_remove | /reaction_role_list | /reaction_role_clear',
        commands: [
            {
                name: 'reaction_role_add',
                description: 'Bind a reaction emoji to a role on an existing message',
                usage: '/reaction_role_add <message_id:string> <emoji:string> <role:role>',
            },
            {
                name: 'reaction_role_create',
                description: 'Post a new embed message with a bound reaction role',
                usage: '/reaction_role_create <role:role> <emoji:string> <title:string> <description:string> [channel:channel]',
            },
            {
                name: 'reaction_role_remove',
                description: 'Unbind a reaction role from a message',
                usage: '/reaction_role_remove <message_id:string> <emoji:string>',
            },
            {
                name: 'reaction_role_list',
                description: 'List all configured reaction roles for this guild',
                usage: '/reaction_role_list',
            },
            {
                name: 'reaction_role_clear',
                description: 'Clear all reaction roles from a message',
                usage: '/reaction_role_clear <message_id:string>',
            },
        ],
        examples: [
            '/reaction_role_add message_id:123456789 emoji:🎮 role:@Gamers',
            '/reaction_role_list',
        ],
    },
    register: async (client: any) => {
        // 1. Register slash commands

        commandRegistry.register({
            name: 'reaction_role_add',
            description: 'Bind a reaction emoji to a role on an existing message',
            options: [
                {
                    name: 'message_id',
                    description: 'Message ID or message jump URL',
                    type: 3, // STRING
                    required: true,
                },
                {
                    name: 'emoji',
                    description: 'The emoji to react with (e.g. 🐱 or custom emoji)',
                    type: 3, // STRING
                    required: true,
                },
                {
                    name: 'role',
                    description: 'The role to assign upon reacting',
                    type: 8, // ROLE
                    required: true,
                },
                {
                    name: 'channel',
                    description:
                        'Channel containing the message (optional if using URL or current channel)',
                    type: 7, // CHANNEL
                    required: false,
                },
            ],
            handler: async (interaction: any) => {
                if (!interaction.guild) {
                    await interaction.reply({
                        content: '❌ This command can only be used in a server.',
                        ephemeral: true,
                    });
                    return;
                }

                if (!isAdmin(interaction.member)) {
                    await interaction.reply({
                        content:
                            '❌ You do not have permission to configure reaction roles (requires Administrator or Manage Roles).',
                        ephemeral: true,
                    });
                    return;
                }

                await interaction.deferReply({ ephemeral: true });

                const rawMsgRef = interaction.options.getString('message_id', true);
                const emojiInput = interaction.options.getString('emoji', true);
                const role = interaction.options.getRole('role', true);
                const channelOption = interaction.options.getChannel('channel');

                const parsedRef = parseMessageReference(rawMsgRef);
                if (!parsedRef) {
                    await interaction.editReply(
                        '❌ Invalid message reference. Provide a message snowflake ID or a Discord jump URL.',
                    );
                    return;
                }

                const targetChannelId =
                    parsedRef.channelId || channelOption?.id || interaction.channelId;
                const targetChannel = await interaction.guild.channels
                    .fetch(targetChannelId)
                    .catch(() => null);
                if (!targetChannel || !targetChannel.isTextBased?.()) {
                    await interaction.editReply('❌ Could not locate the specified text channel.');
                    return;
                }

                const targetMessage = await targetChannel.messages
                    .fetch(parsedRef.messageId)
                    .catch(() => null);
                if (!targetMessage) {
                    await interaction.editReply(
                        `❌ Could not find message with ID \`${parsedRef.messageId}\` in <#${targetChannelId}>.`,
                    );
                    return;
                }

                const roleValidation = canManageRole(interaction.guild, role);
                if (!roleValidation.canManage) {
                    await interaction.editReply(`❌ ${roleValidation.reason}`);
                    return;
                }

                const parsedEmoji = parseEmoji(emojiInput);
                const reactPayload = parsedEmoji.id ? parsedEmoji.id : parsedEmoji.name;

                try {
                    await targetMessage.react(reactPayload);
                } catch (error) {
                    logger.warn(`Could not react with emoji "${emojiInput}" on message: ${error}`);
                    await interaction.editReply(
                        `⚠️ Could not automatically react to the message with \`${emojiInput}\`. Ensure the bot has "Add Reactions" and "Use External Emojis" permissions and the emoji is valid.`,
                    );
                    return;
                }

                addReactionRole({
                    messageId: targetMessage.id,
                    channelId: targetChannel.id,
                    guildId: interaction.guild.id,
                    emojiInput,
                    roleId: role.id,
                    roleName: role.name,
                });

                const jumpUrl = `https://discord.com/channels/${interaction.guild.id}/${targetChannel.id}/${targetMessage.id}`;
                const successEmbed = new EmbedBuilder()
                    .setTitle('✅ Reaction Role Added')
                    .setColor(Colors.Green)
                    .setDescription(
                        `Successfully linked ${parsedEmoji.raw} to <@&${role.id}> on [this message](${jumpUrl})!`,
                    )
                    .addFields(
                        { name: 'Channel', value: `<#${targetChannel.id}>`, inline: true },
                        { name: 'Role', value: `${role.name} (\`${role.id}\`)`, inline: true },
                        { name: 'Emoji', value: parsedEmoji.raw, inline: true },
                    )
                    .setTimestamp();

                await interaction.editReply({ embeds: [successEmbed] });
            },
        });

        commandRegistry.register({
            name: 'reaction_role_create',
            description: 'Create a new reaction role embed message in a channel',
            options: [
                {
                    name: 'channel',
                    description: 'The channel to send the prompt message in',
                    type: 7, // CHANNEL
                    required: true,
                },
                {
                    name: 'title',
                    description: 'Title for the prompt message',
                    type: 3, // STRING
                    required: true,
                },
                {
                    name: 'description',
                    description: 'Instructions or description for the prompt',
                    type: 3, // STRING
                    required: true,
                },
                {
                    name: 'emoji',
                    description: 'Initial emoji to react with',
                    type: 3, // STRING
                    required: false,
                },
                {
                    name: 'role',
                    description: 'Initial role to assign for the emoji',
                    type: 8, // ROLE
                    required: false,
                },
            ],
            handler: async (interaction: any) => {
                if (!interaction.guild) {
                    await interaction.reply({
                        content: '❌ This command can only be used in a server.',
                        ephemeral: true,
                    });
                    return;
                }

                if (!isAdmin(interaction.member)) {
                    await interaction.reply({
                        content: '❌ You do not have permission to create reaction roles.',
                        ephemeral: true,
                    });
                    return;
                }

                await interaction.deferReply({ ephemeral: true });

                const targetChannel = interaction.options.getChannel('channel', true);
                const title = interaction.options.getString('title', true);
                const description = interaction.options.getString('description', true);
                const emojiInput = interaction.options.getString('emoji');
                const role = interaction.options.getRole('role');

                const fetchedChannel = await interaction.guild.channels
                    .fetch(targetChannel.id)
                    .catch(() => null);
                if (!fetchedChannel || !fetchedChannel.isTextBased?.()) {
                    await interaction.editReply(
                        '❌ The selected channel is not a valid text channel.',
                    );
                    return;
                }

                if (role) {
                    const roleValidation = canManageRole(interaction.guild, role);
                    if (!roleValidation.canManage) {
                        await interaction.editReply(`❌ ${roleValidation.reason}`);
                        return;
                    }
                }

                const promptEmbed = new EmbedBuilder()
                    .setTitle(title)
                    .setDescription(description)
                    .setColor(Colors.Purple)
                    .setFooter({ text: 'React to claim or remove roles' });

                let sentMessage: any;
                try {
                    sentMessage = await fetchedChannel.send({ embeds: [promptEmbed] });
                } catch (error) {
                    logger.error(
                        `Failed to send reaction role message in ${targetChannel.id}: ${error}`,
                    );
                    await interaction.editReply(
                        '❌ Failed to send message in the target channel. Check bot permissions.',
                    );
                    return;
                }

                if (emojiInput && role) {
                    const parsedEmoji = parseEmoji(emojiInput);
                    const reactPayload = parsedEmoji.id ? parsedEmoji.id : parsedEmoji.name;

                    try {
                        await sentMessage.react(reactPayload);
                    } catch (error) {
                        logger.warn(`Failed to seed reaction ${emojiInput}: ${error}`);
                    }

                    addReactionRole({
                        messageId: sentMessage.id,
                        channelId: fetchedChannel.id,
                        guildId: interaction.guild.id,
                        emojiInput,
                        roleId: role.id,
                        roleName: role.name,
                    });
                }

                const jumpUrl = `https://discord.com/channels/${interaction.guild.id}/${fetchedChannel.id}/${sentMessage.id}`;
                await interaction.editReply({
                    content: `✅ Reaction role message created! [View Message](${jumpUrl})\nMessage ID: \`${sentMessage.id}\`${
                        emojiInput && role
                            ? `\nConfigured initial role: <@&${role.id}> with ${emojiInput}`
                            : ''
                    }`,
                });
            },
        });

        commandRegistry.register({
            name: 'reaction_role_remove',
            description: 'Remove a specific emoji reaction role binding from a message',
            options: [
                {
                    name: 'message_id',
                    description: 'Message ID or message jump URL',
                    type: 3, // STRING
                    required: true,
                },
                {
                    name: 'emoji',
                    description: 'Emoji to unbind',
                    type: 3, // STRING
                    required: true,
                },
            ],
            handler: async (interaction: any) => {
                if (!interaction.guild) {
                    await interaction.reply({
                        content: '❌ This command can only be used in a server.',
                        ephemeral: true,
                    });
                    return;
                }

                if (!isAdmin(interaction.member)) {
                    await interaction.reply({
                        content: '❌ You do not have permission to manage reaction roles.',
                        ephemeral: true,
                    });
                    return;
                }

                const rawMsgRef = interaction.options.getString('message_id', true);
                const emojiInput = interaction.options.getString('emoji', true);
                const parsedRef = parseMessageReference(rawMsgRef);
                if (!parsedRef) {
                    await interaction.reply({
                        content: '❌ Invalid message reference.',
                        ephemeral: true,
                    });
                    return;
                }

                const result = removeReactionRole({
                    messageId: parsedRef.messageId,
                    emojiInput,
                });

                if (!result.success) {
                    await interaction.reply({
                        content: `❌ Could not find an active reaction role for emoji \`${emojiInput}\` on message \`${parsedRef.messageId}\`.`,
                        ephemeral: true,
                    });
                    return;
                }

                await interaction.reply({
                    content: `✅ Removed reaction role binding for ${result.removed?.emojiRaw ?? emojiInput} (was <@&${result.removed?.roleId}>) on message \`${parsedRef.messageId}\`.`,
                    ephemeral: true,
                });
            },
        });

        commandRegistry.register({
            name: 'reaction_role_list',
            description: 'List all configured reaction role messages in this server',
            handler: async (interaction: any) => {
                if (!interaction.guild) {
                    await interaction.reply({
                        content: '❌ This command can only be used in a server.',
                        ephemeral: true,
                    });
                    return;
                }

                if (!isAdmin(interaction.member)) {
                    await interaction.reply({
                        content: '❌ You do not have permission to view reaction role settings.',
                        ephemeral: true,
                    });
                    return;
                }

                const messages = getReactionRolesForGuild(interaction.guild.id);
                const embed = buildReactionRoleListEmbed(interaction.guild, messages);
                await interaction.reply({ embeds: [embed], ephemeral: true });
            },
        });

        commandRegistry.register({
            name: 'reaction_role_clear',
            description: 'Clear all reaction role bindings for a message',
            options: [
                {
                    name: 'message_id',
                    description: 'Message ID or message jump URL to clear',
                    type: 3, // STRING
                    required: true,
                },
            ],
            handler: async (interaction: any) => {
                if (!interaction.guild) {
                    await interaction.reply({
                        content: '❌ This command can only be used in a server.',
                        ephemeral: true,
                    });
                    return;
                }

                if (!isAdmin(interaction.member)) {
                    await interaction.reply({
                        content: '❌ You do not have permission to manage reaction roles.',
                        ephemeral: true,
                    });
                    return;
                }

                const rawMsgRef = interaction.options.getString('message_id', true);
                const parsedRef = parseMessageReference(rawMsgRef);
                if (!parsedRef) {
                    await interaction.reply({
                        content: '❌ Invalid message reference.',
                        ephemeral: true,
                    });
                    return;
                }

                const cleared = clearReactionRoleMessage(parsedRef.messageId);
                if (!cleared) {
                    await interaction.reply({
                        content: `❌ No reaction roles found configured for message \`${parsedRef.messageId}\`.`,
                        ephemeral: true,
                    });
                    return;
                }

                await interaction.reply({
                    content: `✅ Cleared all reaction roles for message \`${parsedRef.messageId}\`.`,
                    ephemeral: true,
                });
            },
        });

        // 2. Attach Discord Gateway event listeners
        client.on('messageReactionAdd', async (reaction: any, user: any) => {
            try {
                if (
                    !config.modules.isModuleEnabled(
                        'reactionRoles',
                        reaction?.message?.guildId,
                        reaction?.message?.channelId,
                    )
                ) {
                    return;
                }
                await handleReactionAdd(reaction, user);
            } catch (error) {
                logError(error, 'Error in messageReactionAdd listener');
            }
        });

        client.on('messageReactionRemove', async (reaction: any, user: any) => {
            try {
                if (
                    !config.modules.isModuleEnabled(
                        'reactionRoles',
                        reaction?.message?.guildId,
                        reaction?.message?.channelId,
                    )
                ) {
                    return;
                }
                await handleReactionRemove(reaction, user);
            } catch (error) {
                logError(error, 'Error in messageReactionRemove listener');
            }
        });
    },
};

export default moduleDefinition;
export const module = moduleDefinition;
