import { EmbedBuilder } from 'discord.js';
import { commandRegistry } from '../commandRegistry';
import { config } from '../config';
import { logger } from '../logger';
import { BotModule } from '../moduleLoader';
import {
    acceptPendingChallenge,
    buildActiveMatchesEmbed,
    buildChallengeActionRow,
    buildChallengeEmbed,
    buildChessRolesConfigEmbed,
    buildGameActionRow,
    buildGameLinkOnlyActionRow,
    buildGameStartedEmbed,
    buildLeaderboardEmbed,
    buildMatchEndedEmbed,
    buildMatchStatusEmbed,
    buildPlayerStatsEmbed,
    cancelPendingChallenge,
    ChessColorPreference,
    clearChannelChallenges,
    createPendingChallenge,
    declinePendingChallenge,
    fetchActiveMatches,
    fetchLeaderboard,
    fetchMatchStatus,
    fetchPlayerStats,
    getGuildChessRoleConfig,
    getLatestMatchForUser,
    getLatestMatchInChannel,
    getPendingChallengeByChallenger,
    getPendingChallengeForUser,
    getPlayerCodeForMatch,
    getTrackedMatchById,
    listTrackedMatches,
    pollAndAnnounceEndedMatches,
    recordPlayerUserMapping,
    removeEloRole,
    resolveMatchResult,
    setChallengeMessageId,
    setEloRoleStacking,
    setFirstMatchRole,
    setTopPlayerRole,
    syncChessRolesAfterMatch,
    syncRolesForPlayer,
    syncTopPlayerRoleForGuild,
    upsertEloRole,
} from '../services/chessService';

let pollIntervalHandle: ReturnType<typeof setInterval> | null = null;
let pollInFlight = false;

export function isChessModerator(interaction: any): boolean {
    if (interaction.user?.id && interaction.user.id === config.env.botOwnerId) {
        return true;
    }

    const member = interaction.member;
    if (!member) {
        return false;
    }

    if (
        interaction.memberPermissions?.has?.('Administrator') ||
        member.permissions?.has?.('Administrator')
    ) {
        return true;
    }

    const configuredRoles = [
        config.env.moderationModeratorRoleId ??
            config.env.moderationModeratorRoleName ??
            'Moderator',
        config.env.moderationAdminRoleId ?? config.env.moderationAdminRoleName ?? 'Administrator',
    ];

    return Boolean(
        member.roles?.cache?.some((role: any) =>
            configuredRoles.some(
                (configuredRole) =>
                    role.id === configuredRole ||
                    role.name?.toLowerCase() === configuredRole.toLowerCase(),
            ),
        ),
    );
}

function formatCodeMessage(
    side: 'white' | 'black',
    code: string,
    gameUrl?: string,
    playUrl?: string,
): string {
    const lines = [
        `Your chess authentication code (${side.toUpperCase()}): \`${code}\``,
        gameUrl ? `Game page: ${gameUrl}` : null,
        playUrl ? `Direct play link: ${playUrl}` : null,
        'Do not share this code with others.',
    ].filter(Boolean);
    return lines.join('\n');
}

async function disableChallengeMessageButtons(
    client: any,
    channelId: string,
    messageId: string | undefined,
    notice: string,
): Promise<void> {
    if (!messageId) {
        return;
    }
    try {
        const channel = await client?.channels?.fetch?.(channelId);
        const msg = await channel?.messages?.fetch?.(messageId);
        if (msg && typeof msg.edit === 'function') {
            await msg.edit({
                content: notice,
                components: [],
            });
        }
    } catch {
        // Non-fatal if original message was deleted or inaccessible
    }
}

const moduleDefinition: BotModule = {
    name: 'chess',
    description:
        'Challenge players to chess on the web app, distribute auth codes, query live updates, and moderate matches',
    help: {
        summary: 'Web-app chess integration with /challenge, /accept, live polling, and moderation',
        description:
            'Create chess matches via /challenge and /accept, receive private authentication codes for the web app, share spectate links, query live match status and leaderboards, and automatically announce finished matches.',
        usage: '/challenge <opponent> | /accept | /chess <action> | /chess_stats | /chess_leaderboard | /chess_mod <action>',
        commands: [
            {
                name: 'challenge',
                description: 'Challenge a server member to a chess match',
                usage: '/challenge <opponent:user> [color:random|white|black]',
            },
            {
                name: 'accept',
                description: 'Accept a pending chess challenge and start the web-app match',
                usage: '/accept [challenger:user]',
            },
            {
                name: 'chess',
                description:
                    'Get your auth code, check live match status, list active games, or cancel a challenge',
                usage: '/chess <action:code|status|active|cancel|stats|leaderboard> [match_id] [user] [username] [limit]',
            },
            {
                name: 'chess_stats',
                description: 'View chess Elo rating and match statistics for a player',
                usage: '/chess_stats [user:user] [username:string]',
            },
            {
                name: 'chess_leaderboard',
                description: 'View the chess Elo leaderboard',
                usage: '/chess_leaderboard [limit:number]',
            },
            {
                name: 'chess_mod',
                description:
                    'Moderator commands to force win/draw, abort matches, or clear pending challenges',
                usage: '/chess_mod <action:force_win|force_draw|abort|list_matches|clear_pending> [match_id] [winner] [reason]',
            },
            {
                name: 'chess_roles',
                description:
                    'Configure automatic chess role rewards (first match, Elo tiers, and #1 top player)',
                usage: '/chess_roles <action:view|set_first_match|clear_first_match|set_top_player|clear_top_player|add_elo_role|remove_elo_role|set_elo_stacking|sync> [role] [min_elo] [stack] [user]',
            },
        ],
        examples: [
            '/challenge opponent:@Friend color:random',
            '/accept',
            '/chess action:code',
            '/chess action:status',
            '/chess_stats',
            '/chess_leaderboard limit:10',
            '/chess_mod action:abort match_id:k9Xp2_mQ8vR1aB4c reason:forfeit',
        ],
    },
    register: async (client: any) => {
        commandRegistry.register({
            name: 'challenge',
            description: 'Challenge a member to a chess match on the web app',
            options: [
                {
                    name: 'opponent',
                    description: 'Member to challenge',
                    type: 6, // USER
                    required: true,
                },
                {
                    name: 'color',
                    description: 'Your preferred color',
                    type: 3, // STRING
                    required: false,
                    choices: [
                        { name: 'Random', value: 'random' },
                        { name: 'White', value: 'white' },
                        { name: 'Black', value: 'black' },
                    ],
                },
            ],
            handler: async (interaction: any) => {
                if (!interaction.guild) {
                    await interaction.reply({
                        content: 'Chess challenges can only be created inside a server.',
                        ephemeral: true,
                    });
                    return;
                }

                const opponentUser = interaction.options?.getUser?.('opponent');
                if (!opponentUser) {
                    await interaction.reply({
                        content: 'Please specify an opponent to challenge.',
                        ephemeral: true,
                    });
                    return;
                }
                if (opponentUser.bot) {
                    await interaction.reply({
                        content: 'You cannot challenge a bot to a chess match.',
                        ephemeral: true,
                    });
                    return;
                }
                if (opponentUser.id === interaction.user.id) {
                    await interaction.reply({
                        content: 'You cannot challenge yourself to a chess match.',
                        ephemeral: true,
                    });
                    return;
                }

                const preferredColor =
                    (interaction.options?.getString?.('color') as ChessColorPreference) || 'random';

                const res = createPendingChallenge(
                    interaction.guild.id,
                    interaction.channelId,
                    {
                        id: interaction.user.id,
                        username: interaction.user.username,
                        displayName:
                            interaction.member?.displayName ||
                            interaction.user.displayName ||
                            interaction.user.username,
                    },
                    {
                        id: opponentUser.id,
                        username: opponentUser.username,
                        displayName: opponentUser.displayName || opponentUser.username,
                    },
                    preferredColor,
                );

                if (!res.success || !res.challenge) {
                    await interaction.reply({
                        content: res.error || 'Could not create challenge.',
                        ephemeral: true,
                    });
                    return;
                }

                const embed = buildChallengeEmbed(res.challenge);
                const row = buildChallengeActionRow(res.challenge.id);

                const reply = await interaction.reply({
                    content: `<@${opponentUser.id}>, you have been challenged to chess by <@${interaction.user.id}>.`,
                    embeds: [embed],
                    components: [row],
                    fetchReply: true,
                });

                if (reply?.id) {
                    setChallengeMessageId(res.challenge.id, reply.id);
                }
            },
        });

        commandRegistry.register({
            name: 'accept',
            description: 'Accept a pending chess challenge in this channel',
            options: [
                {
                    name: 'challenger',
                    description: 'Challenger to accept (optional if only one pending challenge)',
                    type: 6, // USER
                    required: false,
                },
            ],
            handler: async (interaction: any) => {
                if (!interaction.guild) {
                    await interaction.reply({
                        content: 'Chess matches can only be accepted inside a server.',
                        ephemeral: true,
                    });
                    return;
                }

                const challengerUser = interaction.options?.getUser?.('challenger');
                const pending = getPendingChallengeForUser(
                    interaction.channelId,
                    interaction.user.id,
                    challengerUser?.id,
                );

                if (!pending) {
                    await interaction.reply({
                        content:
                            'No pending chess challenge found for you in this channel. Ask someone to run `/challenge`.',
                        ephemeral: true,
                    });
                    return;
                }

                await interaction.deferReply();

                const accepted = await acceptPendingChallenge(pending.id, interaction.user.id);
                if (!accepted.success || !accepted.match) {
                    await interaction.editReply({
                        content: `Failed to start chess match: ${accepted.error || 'Unknown error'}`,
                    });
                    return;
                }

                const match = accepted.match;
                const embed = buildGameStartedEmbed(match, accepted.startResponse);
                const row = buildGameActionRow(match.matchId, match.gameUrl, match.spectateUrl);

                await interaction.editReply({
                    content: `<@${match.white.userId}> (White) vs <@${match.black.userId}> (Black) — match \`${match.matchId}\` is live.`,
                    embeds: [embed],
                    components: [row],
                });

                await disableChallengeMessageButtons(
                    client,
                    pending.channelId,
                    pending.messageId,
                    `Challenge accepted. Match \`${match.matchId}\` started.`,
                );

                const codeRes = await getPlayerCodeForMatch(match.matchId, interaction.user.id);
                if (codeRes.success && codeRes.side && codeRes.code) {
                    await interaction.followUp({
                        content: formatCodeMessage(
                            codeRes.side,
                            codeRes.code,
                            codeRes.gameUrl,
                            codeRes.playUrl,
                        ),
                        ephemeral: true,
                    });
                }
            },
        });

        commandRegistry.register({
            name: 'chess',
            description: 'Query chess matches, retrieve your auth code, or view stats/leaderboard',
            options: [
                {
                    name: 'action',
                    description: 'Chess action to perform',
                    type: 3, // STRING
                    required: true,
                    choices: [
                        { name: 'Get My Auth Code', value: 'code' },
                        { name: 'Match Status', value: 'status' },
                        { name: 'Active Matches', value: 'active' },
                        { name: 'Cancel Challenge', value: 'cancel' },
                        { name: 'Player Stats', value: 'stats' },
                        { name: 'Leaderboard', value: 'leaderboard' },
                    ],
                },
                {
                    name: 'match_id',
                    description: 'Match ID (optional for code/status; defaults to latest)',
                    type: 3, // STRING
                    required: false,
                },
                {
                    name: 'user',
                    description: 'Discord user (for stats)',
                    type: 6, // USER
                    required: false,
                },
                {
                    name: 'username',
                    description: 'Web-app username (for stats)',
                    type: 3, // STRING
                    required: false,
                },
                {
                    name: 'limit',
                    description: 'Number of leaderboard entries (1-25)',
                    type: 4, // INTEGER
                    required: false,
                },
            ],
            handler: async (interaction: any) => {
                if (!interaction.guild) {
                    await interaction.reply({
                        content: 'Chess commands can only be used inside a server.',
                        ephemeral: true,
                    });
                    return;
                }

                const action = interaction.options?.getString?.('action');
                const matchIdArg = interaction.options?.getString?.('match_id') || undefined;

                if (action === 'code') {
                    const targetMatch = matchIdArg
                        ? { matchId: matchIdArg }
                        : getLatestMatchForUser(
                              interaction.guild.id,
                              interaction.user.id,
                              interaction.channelId,
                          );

                    if (!targetMatch) {
                        await interaction.reply({
                            content:
                                'No active or waiting chess match found for you. Provide `match_id` or start a match with `/challenge`.',
                            ephemeral: true,
                        });
                        return;
                    }

                    const codeRes = await getPlayerCodeForMatch(
                        targetMatch.matchId,
                        interaction.user.id,
                    );
                    if (!codeRes.success || !codeRes.side || !codeRes.code) {
                        await interaction.reply({
                            content: codeRes.error || 'Unable to retrieve your auth code.',
                            ephemeral: true,
                        });
                        return;
                    }

                    await interaction.reply({
                        content: formatCodeMessage(
                            codeRes.side,
                            codeRes.code,
                            codeRes.gameUrl,
                            codeRes.playUrl,
                        ),
                        ephemeral: true,
                    });
                    return;
                }

                if (action === 'status') {
                    const tracked = matchIdArg
                        ? undefined
                        : getLatestMatchInChannel(interaction.channelId);
                    const targetMatchId = matchIdArg || tracked?.matchId;

                    if (!targetMatchId) {
                        await interaction.reply({
                            content:
                                'No chess match found in this channel. Provide a `match_id` to query a specific match.',
                            ephemeral: true,
                        });
                        return;
                    }

                    await interaction.deferReply();
                    try {
                        const statusData = await fetchMatchStatus(targetMatchId);
                        const embed = buildMatchStatusEmbed(statusData, tracked);
                        const row = buildGameLinkOnlyActionRow(
                            statusData.gameUrl,
                            statusData.spectateUrl,
                        );
                        await interaction.editReply({ embeds: [embed], components: [row] });
                    } catch (error) {
                        const msg = error instanceof Error ? error.message : String(error);
                        await interaction.editReply({
                            content: `Failed to fetch match status: ${msg}`,
                        });
                    }
                    return;
                }

                if (action === 'active') {
                    await interaction.deferReply();
                    try {
                        const active = await fetchActiveMatches();
                        const embed = buildActiveMatchesEmbed(active.matches || []);
                        await interaction.editReply({ embeds: [embed] });
                    } catch (error) {
                        const msg = error instanceof Error ? error.message : String(error);
                        await interaction.editReply({
                            content: `Failed to fetch active matches: ${msg}`,
                        });
                    }
                    return;
                }

                if (action === 'cancel') {
                    const pending = getPendingChallengeByChallenger(
                        interaction.channelId,
                        interaction.user.id,
                    );
                    if (!pending) {
                        await interaction.reply({
                            content: 'You have no pending chess challenge in this channel.',
                            ephemeral: true,
                        });
                        return;
                    }

                    const cancelled = cancelPendingChallenge(pending.id, interaction.user.id);
                    if (!cancelled.success) {
                        await interaction.reply({
                            content: cancelled.error || 'Could not cancel challenge.',
                            ephemeral: true,
                        });
                        return;
                    }

                    await disableChallengeMessageButtons(
                        client,
                        pending.channelId,
                        pending.messageId,
                        `Challenge cancelled by <@${interaction.user.id}>.`,
                    );

                    await interaction.reply({
                        content: `Cancelled your pending challenge against <@${pending.opponentId}>.`,
                        ephemeral: true,
                    });
                    return;
                }

                if (action === 'stats') {
                    const targetUser = interaction.options?.getUser?.('user') || interaction.user;
                    const usernameArg = interaction.options?.getString?.('username');
                    const targetUsername = usernameArg || targetUser.username;

                    await interaction.deferReply();
                    try {
                        const stats = await fetchPlayerStats(targetUsername);
                        const embed = buildPlayerStatsEmbed(stats);
                        await interaction.editReply({ embeds: [embed] });
                    } catch (error) {
                        const msg = error instanceof Error ? error.message : String(error);
                        await interaction.editReply({
                            content: `Failed to fetch stats for \`${targetUsername}\`: ${msg}`,
                        });
                    }
                    return;
                }

                if (action === 'leaderboard') {
                    const limit = interaction.options?.getInteger?.('limit') || 10;
                    await interaction.deferReply();
                    try {
                        const entries = await fetchLeaderboard(Math.min(25, Math.max(1, limit)));
                        const embed = buildLeaderboardEmbed(entries);
                        await interaction.editReply({ embeds: [embed] });
                    } catch (error) {
                        const msg = error instanceof Error ? error.message : String(error);
                        await interaction.editReply({
                            content: `Failed to fetch leaderboard: ${msg}`,
                        });
                    }
                    return;
                }

                await interaction.reply({
                    content: 'Unknown chess action.',
                    ephemeral: true,
                });
            },
        });

        commandRegistry.register({
            name: 'chess_stats',
            description: 'View chess Elo rating and match statistics',
            options: [
                {
                    name: 'user',
                    description: 'Discord member to look up',
                    type: 6, // USER
                    required: false,
                },
                {
                    name: 'username',
                    description: 'Web-app username to look up directly',
                    type: 3, // STRING
                    required: false,
                },
            ],
            handler: async (interaction: any) => {
                const targetUser = interaction.options?.getUser?.('user') || interaction.user;
                const usernameArg = interaction.options?.getString?.('username');
                const targetUsername = usernameArg || targetUser.username;

                await interaction.deferReply();
                try {
                    const stats = await fetchPlayerStats(targetUsername);
                    const embed = buildPlayerStatsEmbed(stats);
                    await interaction.editReply({ embeds: [embed] });
                } catch (error) {
                    const msg = error instanceof Error ? error.message : String(error);
                    await interaction.editReply({
                        content: `Failed to fetch stats for \`${targetUsername}\`: ${msg}`,
                    });
                }
            },
        });

        commandRegistry.register({
            name: 'chess_leaderboard',
            description: 'View the chess Elo rating leaderboard',
            options: [
                {
                    name: 'limit',
                    description: 'Number of players to display (1-25, default 10)',
                    type: 4, // INTEGER
                    required: false,
                },
            ],
            handler: async (interaction: any) => {
                const limit = interaction.options?.getInteger?.('limit') || 10;
                await interaction.deferReply();
                try {
                    const entries = await fetchLeaderboard(Math.min(25, Math.max(1, limit)));
                    const embed = buildLeaderboardEmbed(entries);
                    await interaction.editReply({ embeds: [embed] });
                } catch (error) {
                    const msg = error instanceof Error ? error.message : String(error);
                    await interaction.editReply({
                        content: `Failed to fetch leaderboard: ${msg}`,
                    });
                }
            },
        });

        commandRegistry.register({
            name: 'chess_mod',
            description: 'Moderation commands for managing chess matches and challenges',
            options: [
                {
                    name: 'action',
                    description: 'Moderation action to perform',
                    type: 3, // STRING
                    required: true,
                    choices: [
                        { name: 'Force Win', value: 'force_win' },
                        { name: 'Force Draw', value: 'force_draw' },
                        { name: 'Abort Match', value: 'abort' },
                        { name: 'List Tracked Matches', value: 'list_matches' },
                        { name: 'Clear Channel Pending Challenges', value: 'clear_pending' },
                    ],
                },
                {
                    name: 'match_id',
                    description: 'Target match ID (for force_win, force_draw, abort)',
                    type: 3, // STRING
                    required: false,
                },
                {
                    name: 'winner',
                    description: 'Winning side (required for force_win)',
                    type: 3, // STRING
                    required: false,
                    choices: [
                        { name: 'White', value: 'white' },
                        { name: 'Black', value: 'black' },
                    ],
                },
                {
                    name: 'reason',
                    description: 'Reason for moderation decision (e.g. forfeit, timeout, admin)',
                    type: 3, // STRING
                    required: false,
                },
            ],
            handler: async (interaction: any) => {
                if (!interaction.guild) {
                    await interaction.reply({
                        content: 'Chess moderation commands can only be used inside a server.',
                        ephemeral: true,
                    });
                    return;
                }

                if (!isChessModerator(interaction)) {
                    await interaction.reply({
                        content: 'You do not have permission to use chess moderation commands.',
                        ephemeral: true,
                    });
                    return;
                }

                const action = interaction.options?.getString?.('action');
                const matchId = interaction.options?.getString?.('match_id');
                const winner = interaction.options?.getString?.('winner') as
                    'white' | 'black' | undefined;
                const reason = interaction.options?.getString?.('reason') || 'admin';

                if (action === 'clear_pending') {
                    const cleared = clearChannelChallenges(interaction.channelId);
                    await interaction.reply({
                        content: `Cleared ${cleared} pending chess challenge(s) in this channel.`,
                        ephemeral: true,
                    });
                    return;
                }

                if (action === 'list_matches') {
                    const matches = listTrackedMatches(interaction.guild.id, false).slice(0, 15);
                    if (matches.length === 0) {
                        await interaction.reply({
                            content: 'No tracked chess matches found in this server.',
                            ephemeral: true,
                        });
                        return;
                    }

                    const lines = matches.map(
                        (m) =>
                            `• \`${m.matchId}\` [${m.status}] — <@${m.white.userId}> (${m.white.username}) vs <@${m.black.userId}> (${m.black.username})`,
                    );
                    const embed = new EmbedBuilder()
                        .setTitle('Tracked Server Chess Matches')
                        .setDescription(lines.join('\n'));
                    await interaction.reply({ embeds: [embed], ephemeral: true });
                    return;
                }

                if (!matchId) {
                    await interaction.reply({
                        content: 'Please provide `match_id` for this moderation action.',
                        ephemeral: true,
                    });
                    return;
                }

                if (action === 'force_win') {
                    if (!winner) {
                        await interaction.reply({
                            content:
                                'Please specify `winner` (`white` or `black`) for `force_win`.',
                            ephemeral: true,
                        });
                        return;
                    }

                    await interaction.deferReply();
                    try {
                        const result = await resolveMatchResult(matchId, { winner, reason });
                        await syncChessRolesAfterMatch(
                            client,
                            interaction.guild.id,
                            result,
                            getTrackedMatchById(matchId),
                        );
                        const embed = buildMatchEndedEmbed(result);
                        logger.info(
                            `Chess mod ${interaction.user.id} declared ${winner} winner for ${matchId} (${reason})`,
                        );
                        await interaction.editReply({
                            content: `Moderator decision applied by <@${interaction.user.id}>: **${winner.toUpperCase()}** wins (${reason}).`,
                            embeds: [embed],
                        });
                    } catch (error) {
                        const msg = error instanceof Error ? error.message : String(error);
                        await interaction.editReply({
                            content: `Failed to resolve match \`${matchId}\`: ${msg}`,
                        });
                    }
                    return;
                }

                if (action === 'force_draw') {
                    await interaction.deferReply();
                    try {
                        const result = await resolveMatchResult(matchId, {
                            winner: 'draw',
                            reason,
                        });
                        await syncChessRolesAfterMatch(
                            client,
                            interaction.guild.id,
                            result,
                            getTrackedMatchById(matchId),
                        );
                        const embed = buildMatchEndedEmbed(result);
                        logger.info(
                            `Chess mod ${interaction.user.id} declared draw for ${matchId} (${reason})`,
                        );
                        await interaction.editReply({
                            content: `Moderator decision applied by <@${interaction.user.id}>: Match declared a **DRAW** (${reason}).`,
                            embeds: [embed],
                        });
                    } catch (error) {
                        const msg = error instanceof Error ? error.message : String(error);
                        await interaction.editReply({
                            content: `Failed to declare draw for \`${matchId}\`: ${msg}`,
                        });
                    }
                    return;
                }

                if (action === 'abort') {
                    await interaction.deferReply();
                    try {
                        const result = await resolveMatchResult(matchId, {
                            winner: 'abort',
                            reason,
                        });
                        const embed = buildMatchEndedEmbed(result);
                        logger.info(
                            `Chess mod ${interaction.user.id} aborted match ${matchId} (${reason})`,
                        );
                        await interaction.editReply({
                            content: `Moderator decision applied by <@${interaction.user.id}>: Match **ABORTED** (${reason}).`,
                            embeds: [embed],
                        });
                    } catch (error) {
                        const msg = error instanceof Error ? error.message : String(error);
                        await interaction.editReply({
                            content: `Failed to abort match \`${matchId}\`: ${msg}`,
                        });
                    }
                    return;
                }

                await interaction.reply({
                    content: 'Unknown moderation action.',
                    ephemeral: true,
                });
            },
        });

        commandRegistry.register({
            name: 'chess_roles',
            description:
                'Configure automatic chess role rewards (first match, Elo tiers, and top player)',
            options: [
                {
                    name: 'action',
                    description: 'Role configuration action',
                    type: 3, // STRING
                    required: true,
                    choices: [
                        { name: 'View Configuration', value: 'view' },
                        { name: 'Set First Match Role', value: 'set_first_match' },
                        { name: 'Clear First Match Role', value: 'clear_first_match' },
                        { name: 'Set Top Player Role (#1)', value: 'set_top_player' },
                        { name: 'Clear Top Player Role', value: 'clear_top_player' },
                        { name: 'Add / Update Elo Role Tier', value: 'add_elo_role' },
                        { name: 'Remove Elo Role Tier', value: 'remove_elo_role' },
                        { name: 'Set Elo Role Stacking Mode', value: 'set_elo_stacking' },
                        { name: 'Sync Roles Now', value: 'sync' },
                    ],
                },
                {
                    name: 'role',
                    description: 'Discord role to award',
                    type: 8, // ROLE
                    required: false,
                },
                {
                    name: 'min_elo',
                    description: 'Minimum Elo required for the Elo role tier (e.g. 1300)',
                    type: 4, // INTEGER
                    required: false,
                },
                {
                    name: 'stack',
                    description:
                        'True to keep all reached Elo roles, false to keep only the highest tier',
                    type: 5, // BOOLEAN
                    required: false,
                },
                {
                    name: 'user',
                    description: 'Specific user to sync roles for (optional for sync)',
                    type: 6, // USER
                    required: false,
                },
            ],
            handler: async (interaction: any) => {
                if (!interaction.guild) {
                    await interaction.reply({
                        content: 'Chess role rewards can only be configured inside a server.',
                        ephemeral: true,
                    });
                    return;
                }

                if (!isChessModerator(interaction)) {
                    await interaction.reply({
                        content: 'You do not have permission to configure chess role rewards.',
                        ephemeral: true,
                    });
                    return;
                }

                const action = interaction.options?.getString?.('action');
                const role = interaction.options?.getRole?.('role');
                const minElo = interaction.options?.getInteger?.('min_elo');
                const stack = interaction.options?.getBoolean?.('stack');
                const targetUser = interaction.options?.getUser?.('user');
                const guildId = interaction.guild.id;

                if (action === 'view') {
                    const cfg = getGuildChessRoleConfig(guildId);
                    const embed = buildChessRolesConfigEmbed(interaction.guild.name, cfg);
                    await interaction.reply({ embeds: [embed], ephemeral: true });
                    return;
                }

                if (action === 'set_first_match') {
                    if (!role) {
                        await interaction.reply({
                            content: 'Please provide a `role` for `set_first_match`.',
                            ephemeral: true,
                        });
                        return;
                    }
                    const cfg = setFirstMatchRole(guildId, role.id);
                    const embed = buildChessRolesConfigEmbed(interaction.guild.name, cfg);
                    await interaction.reply({
                        content: `First-match chess role set to <@&${role.id}>.`,
                        embeds: [embed],
                        ephemeral: true,
                    });
                    return;
                }

                if (action === 'clear_first_match') {
                    const cfg = setFirstMatchRole(guildId, undefined);
                    const embed = buildChessRolesConfigEmbed(interaction.guild.name, cfg);
                    await interaction.reply({
                        content: 'Cleared the first-match chess role reward.',
                        embeds: [embed],
                        ephemeral: true,
                    });
                    return;
                }

                if (action === 'set_top_player') {
                    if (!role) {
                        await interaction.reply({
                            content: 'Please provide a `role` for `set_top_player`.',
                            ephemeral: true,
                        });
                        return;
                    }
                    const cfg = setTopPlayerRole(guildId, role.id);
                    const embed = buildChessRolesConfigEmbed(interaction.guild.name, cfg);
                    await interaction.reply({
                        content: `Top-player (#1) chess role set to <@&${role.id}>.`,
                        embeds: [embed],
                        ephemeral: true,
                    });
                    return;
                }

                if (action === 'clear_top_player') {
                    const cfg = setTopPlayerRole(guildId, undefined);
                    const embed = buildChessRolesConfigEmbed(interaction.guild.name, cfg);
                    await interaction.reply({
                        content: 'Cleared the top-player chess role reward.',
                        embeds: [embed],
                        ephemeral: true,
                    });
                    return;
                }

                if (action === 'add_elo_role') {
                    if (!role || typeof minElo !== 'number' || minElo < 100) {
                        await interaction.reply({
                            content:
                                'Please provide both `min_elo` (>= 100) and `role` for `add_elo_role`.',
                            ephemeral: true,
                        });
                        return;
                    }
                    const cfg = upsertEloRole(guildId, minElo, role.id);
                    const embed = buildChessRolesConfigEmbed(interaction.guild.name, cfg);
                    await interaction.reply({
                        content: `Configured Elo tier: **${minElo}+ Elo** -> <@&${role.id}>.`,
                        embeds: [embed],
                        ephemeral: true,
                    });
                    return;
                }

                if (action === 'remove_elo_role') {
                    if (typeof minElo !== 'number' && !role) {
                        await interaction.reply({
                            content:
                                'Please provide `min_elo` or `role` to remove an Elo role tier.',
                            ephemeral: true,
                        });
                        return;
                    }
                    const { removed, config: cfg } = removeEloRole(
                        guildId,
                        typeof minElo === 'number' ? minElo : undefined,
                        role?.id,
                    );
                    const embed = buildChessRolesConfigEmbed(interaction.guild.name, cfg);
                    await interaction.reply({
                        content: removed
                            ? 'Removed matching Elo role tier(s).'
                            : 'No matching Elo role tier found.',
                        embeds: [embed],
                        ephemeral: true,
                    });
                    return;
                }

                if (action === 'set_elo_stacking') {
                    if (typeof stack !== 'boolean') {
                        await interaction.reply({
                            content:
                                'Please provide `stack` (`True` or `False`) for `set_elo_stacking`.',
                            ephemeral: true,
                        });
                        return;
                    }
                    const cfg = setEloRoleStacking(guildId, stack);
                    const embed = buildChessRolesConfigEmbed(interaction.guild.name, cfg);
                    await interaction.reply({
                        content: `Elo role stacking set to **${stack ? 'Stackable' : 'Highest tier only'}**.`,
                        embeds: [embed],
                        ephemeral: true,
                    });
                    return;
                }

                if (action === 'sync') {
                    await interaction.deferReply({ ephemeral: true });
                    const cfg = getGuildChessRoleConfig(guildId);
                    let syncedUsers = 0;

                    if (targetUser) {
                        recordPlayerUserMapping(guildId, targetUser.id, targetUser.username);
                        try {
                            const stats = await fetchPlayerStats(targetUser.username);
                            await syncRolesForPlayer(
                                interaction.guild,
                                cfg,
                                targetUser.id,
                                stats.elo,
                                (stats.gamesPlayed ?? 0) > 0,
                            );
                            syncedUsers += 1;
                        } catch (error) {
                            const msg = error instanceof Error ? error.message : String(error);
                            await interaction.editReply({
                                content: `Failed to sync roles for <@${targetUser.id}>: ${msg}`,
                            });
                            return;
                        }
                    } else {
                        for (const [username, userId] of Object.entries(cfg.usernameToUserId)) {
                            try {
                                const stats = await fetchPlayerStats(username);
                                await syncRolesForPlayer(
                                    interaction.guild,
                                    cfg,
                                    userId,
                                    stats.elo,
                                    (stats.gamesPlayed ?? 0) > 0,
                                );
                                syncedUsers += 1;
                            } catch {
                                // Skip players not yet ranked on the web app
                            }
                        }
                    }

                    const topRes = await syncTopPlayerRoleForGuild(interaction.guild, guildId);
                    const topSummary = topRes.topUserId
                        ? ` Top player: <@${topRes.topUserId}> (${topRes.topUsername}).`
                        : '';
                    await interaction.editReply({
                        content: `Synced chess roles for ${syncedUsers} player(s).${topSummary}`,
                    });
                    return;
                }

                await interaction.reply({
                    content: 'Unknown chess role action.',
                    ephemeral: true,
                });
            },
        });

        // Button interaction handler for challenge Accept/Decline/Cancel and Get My Code
        client.on('interactionCreate', async (interaction: any) => {
            if (!interaction.isButton?.()) {
                return;
            }

            const customId: string = interaction.customId || '';
            if (!customId.startsWith('chess_')) {
                return;
            }

            if (interaction.guildId && interaction.channelId) {
                if (
                    !config.modules.isModuleEnabled(
                        'chess',
                        interaction.guildId,
                        interaction.channelId,
                    )
                ) {
                    await interaction.reply({
                        content: 'The `chess` module is currently disabled in this channel.',
                        ephemeral: true,
                    });
                    return;
                }
            }

            const userId: string = interaction.user.id;

            try {
                if (customId.startsWith('chess_accept_')) {
                    const challengeId = customId.slice('chess_accept_'.length);
                    await interaction.deferUpdate();

                    const accepted = await acceptPendingChallenge(challengeId, userId);
                    if (!accepted.success || !accepted.match) {
                        await interaction.followUp({
                            content: accepted.error || 'Unable to accept challenge.',
                            ephemeral: true,
                        });
                        return;
                    }

                    const match = accepted.match;
                    const embed = buildGameStartedEmbed(match, accepted.startResponse);
                    const row = buildGameActionRow(match.matchId, match.gameUrl, match.spectateUrl);

                    await interaction.editReply({
                        content: `<@${match.white.userId}> (White) vs <@${match.black.userId}> (Black) — match \`${match.matchId}\` is live.`,
                        embeds: [embed],
                        components: [row],
                    });

                    const codeRes = await getPlayerCodeForMatch(match.matchId, userId);
                    if (codeRes.success && codeRes.side && codeRes.code) {
                        await interaction.followUp({
                            content: formatCodeMessage(
                                codeRes.side,
                                codeRes.code,
                                codeRes.gameUrl,
                                codeRes.playUrl,
                            ),
                            ephemeral: true,
                        });
                    }
                    return;
                }

                if (customId.startsWith('chess_decline_')) {
                    const challengeId = customId.slice('chess_decline_'.length);
                    const declined = declinePendingChallenge(challengeId, userId);
                    if (!declined.success) {
                        await interaction.reply({
                            content: declined.error || 'Unable to decline challenge.',
                            ephemeral: true,
                        });
                        return;
                    }
                    await interaction.update({
                        content: `Challenge declined by <@${userId}>.`,
                        embeds: [],
                        components: [],
                    });
                    return;
                }

                if (customId.startsWith('chess_cancel_')) {
                    const challengeId = customId.slice('chess_cancel_'.length);
                    const cancelled = cancelPendingChallenge(challengeId, userId);
                    if (!cancelled.success) {
                        await interaction.reply({
                            content: cancelled.error || 'Unable to cancel challenge.',
                            ephemeral: true,
                        });
                        return;
                    }
                    await interaction.update({
                        content: `Challenge cancelled by <@${userId}>.`,
                        embeds: [],
                        components: [],
                    });
                    return;
                }

                if (customId.startsWith('chess_code_')) {
                    const matchId = customId.slice('chess_code_'.length);
                    const codeRes = await getPlayerCodeForMatch(matchId, userId);
                    if (!codeRes.success || !codeRes.side || !codeRes.code) {
                        await interaction.reply({
                            content: codeRes.error || 'Unable to retrieve your auth code.',
                            ephemeral: true,
                        });
                        return;
                    }
                    await interaction.reply({
                        content: formatCodeMessage(
                            codeRes.side,
                            codeRes.code,
                            codeRes.gameUrl,
                            codeRes.playUrl,
                        ),
                        ephemeral: true,
                    });
                    return;
                }
            } catch (error) {
                logger.error(`Error handling chess button interaction: ${error}`);
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({
                        content: 'An error occurred while processing that chess action.',
                        ephemeral: true,
                    });
                }
            }
        });

        // Continuous schedule job to poll for ended chess matches
        if (pollIntervalHandle) {
            clearInterval(pollIntervalHandle);
        }
        const intervalMs = config.env.chessPollIntervalSeconds * 1000;
        pollIntervalHandle = setInterval(async () => {
            if (pollInFlight) {
                return;
            }
            pollInFlight = true;
            try {
                await pollAndAnnounceEndedMatches(client);
            } catch (error) {
                logger.error(`Error in chess match polling loop: ${error}`);
            } finally {
                pollInFlight = false;
            }
        }, intervalMs);

        // Allow Node process to exit cleanly if tests register the module
        if (typeof pollIntervalHandle.unref === 'function') {
            pollIntervalHandle.unref();
        }
    },
};

export default moduleDefinition;
export const module = moduleDefinition;
