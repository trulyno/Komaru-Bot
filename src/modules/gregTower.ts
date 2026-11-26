import { commandRegistry } from '../commandRegistry';
import { logger } from '../logger';
import { BotModule } from '../moduleLoader';
import {
    buildGregTowerLeaderboardEmbed,
    buildLobbyActionRow,
    buildLobbyEmbed,
    buildLoginActionRow,
    buildLoginEmbed,
    createGregTowerLobby,
    fetchGregTowerLeaderboard,
    GregTowerApiError,
    isGregTowerApiConfigured,
    issueLoginCode,
} from '../services/gregTowerService';

async function handleLoginInteraction(interaction: any): Promise<void> {
    if (!isGregTowerApiConfigured()) {
        await interaction.reply({
            content:
                'GregTower login is currently unavailable: API key is not configured on the bot.',
            ephemeral: true,
        });
        return;
    }

    const discordUser = interaction.user;
    if (!discordUser?.id) {
        await interaction.reply({
            content: 'Unable to identify your Discord account for GregTower login.',
            ephemeral: true,
        });
        return;
    }

    await interaction.deferReply({ ephemeral: true });

    try {
        const result = await issueLoginCode({
            username: discordUser.username || discordUser.globalName || `user_${discordUser.id}`,
            externalId: discordUser.id,
        });

        const embed = buildLoginEmbed(result);
        const components = result.loginUrl ? [buildLoginActionRow(result.loginUrl)] : [];

        await interaction.editReply({
            embeds: [embed],
            components,
        });
    } catch (error) {
        logger.error(`GregTower login failed for user ${discordUser.id}: ${error}`);
        const message =
            error instanceof GregTowerApiError
                ? `Failed to generate GregTower login code: ${error.message}`
                : 'Failed to generate GregTower login code due to an unexpected error.';

        await interaction.editReply({
            content: message,
        });
    }
}

async function handleLobbyInteraction(interaction: any): Promise<void> {
    if (!isGregTowerApiConfigured()) {
        await interaction.reply({
            content:
                'GregTower lobby creation is currently unavailable: API key is not configured on the bot.',
            ephemeral: true,
        });
        return;
    }

    const name = interaction.options?.getString?.('name') ?? undefined;
    const isPrivate = interaction.options?.getBoolean?.('private') ?? false;

    await interaction.deferReply({ ephemeral: Boolean(isPrivate) });

    try {
        const lobby = await createGregTowerLobby({ name, isPrivate });
        const creator =
            interaction.user?.globalName || interaction.user?.username || 'Discord Player';
        const embed = buildLobbyEmbed(lobby, creator);
        const components = lobby.joinUrl ? [buildLobbyActionRow(lobby.joinUrl)] : [];

        await interaction.editReply({
            embeds: [embed],
            components,
        });
    } catch (error) {
        logger.error(`GregTower lobby creation failed: ${error}`);
        const message =
            error instanceof GregTowerApiError
                ? `Failed to create GregTower lobby: ${error.message}`
                : 'Failed to create GregTower lobby due to an unexpected error.';

        await interaction.editReply({
            content: message,
        });
    }
}

async function handleLeaderboardInteraction(interaction: any): Promise<void> {
    const limit = interaction.options?.getInteger?.('limit') ?? 10;

    await interaction.deferReply();

    try {
        const entries = await fetchGregTowerLeaderboard();
        const embed = buildGregTowerLeaderboardEmbed(entries, limit);
        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        logger.error(`GregTower leaderboard fetch failed: ${error}`);
        const message =
            error instanceof GregTowerApiError
                ? `Failed to fetch GregTower leaderboard: ${error.message}`
                : 'Failed to fetch GregTower leaderboard due to an unexpected error.';

        await interaction.editReply({
            content: message,
        });
    }
}

const moduleDefinition: BotModule = {
    name: 'gregtower',
    description:
        'Issue one-time Discord login codes for GregTower, create co-op lobbies, and view the Tower Hall of Fame',
    help: {
        summary: 'GregTower Discord login, co-op lobbies, and Hall of Fame leaderboard',
        description:
            'Authenticate with GregTower using one-time ephemeral login codes so your runs qualify for the Tower Hall of Fame, create co-op lobbies, and inspect the leaderboard.',
        usage: '/login | /gregtower <action:login|lobby|leaderboard> [name] [private] [limit]',
        commands: [
            {
                name: 'login',
                description: 'Generate a private one-time login code and link for GregTower',
                usage: '/login',
            },
            {
                name: 'gregtower',
                description:
                    'Log in to GregTower, create a co-op lobby, or view the Tower Hall of Fame leaderboard',
                usage: '/gregtower <action:login|lobby|leaderboard> [name] [private] [limit]',
            },
        ],
        examples: [
            '/login',
            '/gregtower action:login',
            '/gregtower action:lobby name:ZPM Raid Squad private:false',
            '/gregtower action:leaderboard limit:10',
        ],
    },
    register: async () => {
        commandRegistry.register({
            name: 'login',
            description: 'Generate a private one-time login code for GregTower',
            handler: handleLoginInteraction,
        });

        commandRegistry.register({
            name: 'gregtower',
            description: 'GregTower login, co-op lobby creation, and leaderboard',
            options: [
                {
                    name: 'action',
                    description: 'Action to perform',
                    type: 3, // STRING
                    required: true,
                    choices: [
                        { name: 'Login (Get one-time code)', value: 'login' },
                        { name: 'Create Co-op Lobby', value: 'lobby' },
                        { name: 'Hall of Fame Leaderboard', value: 'leaderboard' },
                    ],
                },
                {
                    name: 'name',
                    description: 'Lobby name (for lobby action)',
                    type: 3, // STRING
                    required: false,
                },
                {
                    name: 'private',
                    description: 'Whether the lobby is private (for lobby action)',
                    type: 5, // BOOLEAN
                    required: false,
                },
                {
                    name: 'limit',
                    description: 'Number of leaderboard entries to show (1-25)',
                    type: 4, // INTEGER
                    required: false,
                },
            ],
            handler: async (interaction: any) => {
                const action = interaction.options?.getString?.('action');
                if (action === 'login') {
                    await handleLoginInteraction(interaction);
                    return;
                }
                if (action === 'lobby') {
                    await handleLobbyInteraction(interaction);
                    return;
                }
                if (action === 'leaderboard') {
                    await handleLeaderboardInteraction(interaction);
                    return;
                }

                await interaction.reply({
                    content: 'Unknown GregTower action. Choose login, lobby, or leaderboard.',
                    ephemeral: true,
                });
            },
        });
    },
};

export default moduleDefinition;
export const module = moduleDefinition;
