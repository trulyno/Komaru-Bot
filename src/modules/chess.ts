import { Colors, EmbedBuilder } from 'discord.js';
import { commandRegistry } from '../commandRegistry';
import { logger } from '../logger';
import {
    acceptChallenge,
    buildActiveGameActionRow,
    buildChallengeActionRow,
    buildChessBoardEmbed,
    buildDrawOfferActionRow,
    buildLeaderboardEmbed,
    buildLegalMovesEmbed,
    buildPlayerStatsEmbed,
    cancelChallenge,
    createGameChallenge,
    declineChallenge,
    declineDraw,
    executeMove,
    getActiveGameInChannel,
    getGameById,
    getNotationGuideEmbed,
    getPendingChallengeInChannel,
    getPlayerStats,
    offerDraw,
    resignGame,
} from '../services/chessService';

const moduleDefinition = {
    name: 'chess',
    description:
        'Play 2-player chess matches using chess notation with interactive helpers and rule validation',
    register: async (client: any, context?: any) => {
        // Register slash command /chess
        commandRegistry.register({
            name: 'chess',
            description:
                'Play a 2-player chess match with Standard Algebraic Notation and notation assistance meow!',
            options: [
                {
                    name: 'action',
                    description: 'Chess action to perform',
                    type: 3, // STRING
                    required: true,
                    choices: [
                        { name: 'Challenge Player ⚔️', value: 'challenge' },
                        { name: 'Make Move ♟️', value: 'move' },
                        { name: 'Legal Moves 💡', value: 'moves' },
                        { name: 'Notation Guide 📘', value: 'guide' },
                        { name: 'Show Board 🔍', value: 'board' },
                        { name: 'Offer / Accept Draw 🤝', value: 'draw' },
                        { name: 'Resign Match 🏳️', value: 'resign' },
                        { name: 'Cancel Challenge ❌', value: 'cancel' },
                        { name: 'Player Statistics 📊', value: 'stats' },
                        { name: 'Leaderboard 🏆', value: 'leaderboard' },
                    ],
                },
                {
                    name: 'opponent',
                    description: 'Member to challenge (for challenge action)',
                    type: 6, // USER
                    required: false,
                },
                {
                    name: 'color',
                    description: 'Your preferred color (for challenge action)',
                    type: 3, // STRING
                    required: false,
                    choices: [
                        { name: 'White ♔', value: 'white' },
                        { name: 'Black ♚', value: 'black' },
                        { name: 'Random 🎲', value: 'random' },
                    ],
                },
                {
                    name: 'notation',
                    description:
                        'Move in Standard Algebraic Notation (e.g. e4, Nf3, O-O, exd5, e8=Q)',
                    type: 3, // STRING
                    required: false,
                },
                {
                    name: 'square',
                    description: 'Square to check legal moves for (e.g. e2, c1)',
                    type: 3, // STRING
                    required: false,
                },
            ],
            handler: async (interaction: any) => {
                if (!interaction.guild) {
                    await interaction.reply({
                        content:
                            'Meow! 🐾 Chess matches can only be played within a Discord server!',
                        ephemeral: true,
                    });
                    return;
                }

                const action = interaction.options?.getString?.('action');
                const channelId = interaction.channelId;
                const guildId = interaction.guild.id;
                const userId = interaction.user.id;
                const username = interaction.user.username;
                const displayName =
                    interaction.member?.displayName || interaction.user.displayName || username;

                if (action === 'guide') {
                    const embed = getNotationGuideEmbed();
                    await interaction.reply({ embeds: [embed], ephemeral: true });
                    return;
                }

                if (action === 'challenge') {
                    const opponentUser = interaction.options?.getUser?.('opponent');
                    if (!opponentUser) {
                        await interaction.reply({
                            content:
                                '❌ Please specify an opponent to challenge using the `opponent` option!',
                            ephemeral: true,
                        });
                        return;
                    }

                    if (opponentUser.bot) {
                        await interaction.reply({
                            content:
                                '🐾 You cannot challenge a bot to a chess match! Challenge another server member.',
                            ephemeral: true,
                        });
                        return;
                    }

                    if (opponentUser.id === userId) {
                        await interaction.reply({
                            content: '❌ You cannot challenge yourself to a chess match!',
                            ephemeral: true,
                        });
                        return;
                    }

                    const preferredColor =
                        (interaction.options?.getString?.('color') as
                            'white' | 'black' | 'random') || 'random';

                    const challengerPlayer = { id: userId, username, displayName };
                    const opponentPlayer = {
                        id: opponentUser.id,
                        username: opponentUser.username,
                        displayName: opponentUser.displayName || opponentUser.username,
                    };

                    const result = createGameChallenge(
                        guildId,
                        channelId,
                        challengerPlayer,
                        opponentPlayer,
                        preferredColor,
                    );

                    if (!result.success || !result.game) {
                        await interaction.reply({
                            content: `❌ ${result.error}`,
                            ephemeral: true,
                        });
                        return;
                    }

                    const game = result.game;
                    const challengerColor =
                        game.whitePlayer.id === challengerPlayer.id ? 'White ♔' : 'Black ♚';

                    const challengeEmbed = new EmbedBuilder()
                        .setColor(Colors.Blue)
                        .setTitle('⚔️ Chess Challenge Issued!')
                        .setDescription(
                            `**${displayName}** has challenged <@${opponentUser.id}> to a 2-player chess match!\n\n` +
                                `• **Challenger**: <@${challengerPlayer.id}> (${challengerColor})\n` +
                                `• **Opponent**: <@${opponentPlayer.id}>\n\n` +
                                `Click **Accept Match** below to begin playing with Standard Algebraic Notation (e.g. \`e4\`, \`Nf3\`, \`O-O\`).`,
                        )
                        .setFooter({
                            text: 'Komaru Bot Chess • Matches must be accepted by the challenged user',
                        });

                    const row = buildChallengeActionRow(game.id);

                    await interaction.reply({
                        content: `<@${opponentUser.id}>, you have been challenged to chess!`,
                        embeds: [challengeEmbed],
                        components: [row],
                    });
                    return;
                }

                // For actions requiring an active game
                const activeGame = getActiveGameInChannel(channelId);

                if (action === 'board') {
                    if (!activeGame) {
                        await interaction.reply({
                            content:
                                'There is no active chess match in this channel! Start one with `/chess challenge`.',
                            ephemeral: true,
                        });
                        return;
                    }

                    const embed = buildChessBoardEmbed(activeGame);
                    const row = buildActiveGameActionRow(activeGame.id);
                    await interaction.reply({ embeds: [embed], components: [row] });
                    return;
                }

                if (action === 'moves') {
                    if (!activeGame) {
                        await interaction.reply({
                            content:
                                'There is no active chess match in this channel to view legal moves for!',
                            ephemeral: true,
                        });
                        return;
                    }

                    const square = interaction.options?.getString?.('square') || undefined;
                    const embed = buildLegalMovesEmbed(activeGame, square);
                    await interaction.reply({ embeds: [embed], ephemeral: true });
                    return;
                }

                if (action === 'move') {
                    if (!activeGame) {
                        await interaction.reply({
                            content:
                                'There is no active chess match in this channel! Challenge someone with `/chess challenge`.',
                            ephemeral: true,
                        });
                        return;
                    }

                    const notation = interaction.options?.getString?.('notation');
                    if (!notation) {
                        await interaction.reply({
                            content:
                                '❌ Please provide a move notation! For example: `/chess move notation:e4` or `/chess move notation:Nf3`.\nUse `/chess guide` if you need help with notation.',
                            ephemeral: true,
                        });
                        return;
                    }

                    const moveResult = executeMove(activeGame.id, userId, notation);
                    if (!moveResult.success) {
                        let responseText = `❌ ${moveResult.error}`;
                        if (moveResult.diagnostic) {
                            responseText += `\n\n${moveResult.diagnostic}`;
                        }
                        await interaction.reply({
                            content: responseText,
                            ephemeral: true,
                        });
                        return;
                    }

                    const updatedGame = moveResult.game!;
                    const embed = buildChessBoardEmbed(updatedGame);

                    if (updatedGame.status === 'completed') {
                        await interaction.reply({
                            content: `♟️ Move **${moveResult.move?.san}** played!`,
                            embeds: [embed],
                            components: [],
                        });
                    } else {
                        const row = buildActiveGameActionRow(updatedGame.id);
                        await interaction.reply({
                            content: `♟️ Move **${moveResult.move?.san}** played! It is now <@${
                                updatedGame.turn === 'w'
                                    ? updatedGame.whitePlayer.id
                                    : updatedGame.blackPlayer.id
                            }>'s turn.`,
                            embeds: [embed],
                            components: [row],
                        });
                    }
                    return;
                }

                if (action === 'resign') {
                    if (!activeGame) {
                        await interaction.reply({
                            content:
                                'There is no active chess match in this channel to resign from!',
                            ephemeral: true,
                        });
                        return;
                    }

                    const resignResult = resignGame(activeGame.id, userId);
                    if (!resignResult.success || !resignResult.game) {
                        await interaction.reply({
                            content: `❌ ${resignResult.error}`,
                            ephemeral: true,
                        });
                        return;
                    }

                    const embed = buildChessBoardEmbed(resignResult.game);
                    await interaction.reply({
                        content: `🏳️ <@${userId}> has resigned from the chess match.`,
                        embeds: [embed],
                        components: [],
                    });
                    return;
                }

                if (action === 'draw') {
                    if (!activeGame) {
                        await interaction.reply({
                            content: 'There is no active chess match in this channel!',
                            ephemeral: true,
                        });
                        return;
                    }

                    const drawResult = offerDraw(activeGame.id, userId);
                    if (!drawResult.success || !drawResult.game) {
                        await interaction.reply({
                            content: `❌ ${drawResult.error}`,
                            ephemeral: true,
                        });
                        return;
                    }

                    if (drawResult.accepted) {
                        const embed = buildChessBoardEmbed(drawResult.game);
                        await interaction.reply({
                            content: '🤝 Draw accepted! The match has ended in a mutual draw.',
                            embeds: [embed],
                            components: [],
                        });
                    } else {
                        const otherPlayerId =
                            activeGame.whitePlayer.id === userId
                                ? activeGame.blackPlayer.id
                                : activeGame.whitePlayer.id;

                        const row = buildDrawOfferActionRow(activeGame.id);
                        await interaction.reply({
                            content: `🤝 <@${userId}> has offered a draw! <@${otherPlayerId}>, do you accept?`,
                            components: [row],
                        });
                    }
                    return;
                }

                if (action === 'cancel') {
                    const pending = getPendingChallengeInChannel(channelId);
                    if (!pending) {
                        await interaction.reply({
                            content:
                                'There is no pending chess challenge in this channel to cancel.',
                            ephemeral: true,
                        });
                        return;
                    }

                    const cancelResult = cancelChallenge(pending.id, userId);
                    if (!cancelResult.success) {
                        await interaction.reply({
                            content: `❌ ${cancelResult.error}`,
                            ephemeral: true,
                        });
                        return;
                    }

                    await interaction.reply({
                        content: '🛑 Chess challenge cancelled.',
                    });
                    return;
                }

                if (action === 'stats') {
                    const targetUser =
                        interaction.options?.getUser?.('opponent') || interaction.user;
                    const targetName = targetUser.username;
                    const targetDisplay = targetUser.displayName || targetName;
                    const stats = getPlayerStats(targetUser.id, targetName, targetDisplay);
                    const embed = buildPlayerStatsEmbed(stats);
                    await interaction.reply({ embeds: [embed] });
                    return;
                }

                if (action === 'leaderboard') {
                    const embed = buildLeaderboardEmbed(interaction.guild?.name);
                    await interaction.reply({ embeds: [embed] });
                    return;
                }

                await interaction.reply({
                    content:
                        'Unknown chess action. Use `/chess` with one of the available actions.',
                    ephemeral: true,
                });
            },
        });

        // Register dedicated /chess_stats command
        commandRegistry.register({
            name: 'chess_stats',
            description: 'View chess rating and match records for yourself or another member meow!',
            options: [
                {
                    name: 'user',
                    description: 'Member to view chess statistics for (leave blank for yourself)',
                    type: 6, // USER
                    required: false,
                },
            ],
            handler: async (interaction: any) => {
                const targetUser = interaction.options?.getUser?.('user') || interaction.user;
                const targetName = targetUser.username;
                const targetDisplay = targetUser.displayName || targetName;
                const stats = getPlayerStats(targetUser.id, targetName, targetDisplay);
                const embed = buildPlayerStatsEmbed(stats);
                await interaction.reply({ embeds: [embed] });
            },
        });

        // Register dedicated /chess_leaderboard command
        commandRegistry.register({
            name: 'chess_leaderboard',
            description: 'View top chess players ranked by rating and wins meow!',
            options: [
                {
                    name: 'limit',
                    description: 'Number of top players to display (default: 10)',
                    type: 4, // INTEGER
                    required: false,
                },
            ],
            handler: async (interaction: any) => {
                const limit = interaction.options?.getInteger?.('limit') || 10;
                const embed = buildLeaderboardEmbed(interaction.guild?.name, limit);
                await interaction.reply({ embeds: [embed] });
            },
        });

        // Listen for button interactions (Accept, Decline, Guide, Moves, Draw, Resign)
        client.on('interactionCreate', async (interaction: any) => {
            try {
                if (!interaction || !interaction.isButton?.()) return;

                const customId: string = interaction.customId || '';

                if (customId === 'chess_guide') {
                    const embed = getNotationGuideEmbed();
                    await interaction.reply({ embeds: [embed], ephemeral: true });
                    return;
                }

                if (customId.startsWith('chess_moves_')) {
                    const gameId = customId.replace('chess_moves_', '');
                    const game = getGameById(gameId);
                    if (!game || game.status !== 'active') {
                        await interaction.reply({
                            content: 'This chess match is no longer active.',
                            ephemeral: true,
                        });
                        return;
                    }

                    const embed = buildLegalMovesEmbed(game);
                    await interaction.reply({ embeds: [embed], ephemeral: true });
                    return;
                }

                if (customId.startsWith('chess_accept_')) {
                    const gameId = customId.replace('chess_accept_', '');
                    const result = acceptChallenge(gameId, interaction.user.id);

                    if (!result.success || !result.game) {
                        await interaction.reply({
                            content: `❌ ${result.error}`,
                            ephemeral: true,
                        });
                        return;
                    }

                    const game = result.game;
                    const embed = buildChessBoardEmbed(game);
                    const row = buildActiveGameActionRow(game.id);

                    await interaction.reply({
                        content: `⚔️ Challenge accepted! <@${game.whitePlayer.id}> plays White (♔) and has the first move!`,
                        embeds: [embed],
                        components: [row],
                    });
                    return;
                }

                if (customId.startsWith('chess_decline_')) {
                    const gameId = customId.replace('chess_decline_', '');
                    const result = declineChallenge(gameId, interaction.user.id);

                    if (!result.success) {
                        await interaction.reply({
                            content: `❌ ${result.error}`,
                            ephemeral: true,
                        });
                        return;
                    }

                    await interaction.reply({
                        content: `🏳️ Chess challenge declined by <@${interaction.user.id}>.`,
                    });
                    return;
                }

                if (customId.startsWith('chess_draw_accept_')) {
                    const gameId = customId.replace('chess_draw_accept_', '');
                    const result = offerDraw(gameId, interaction.user.id);

                    if (!result.success || !result.game) {
                        await interaction.reply({
                            content: `❌ ${result.error}`,
                            ephemeral: true,
                        });
                        return;
                    }

                    const embed = buildChessBoardEmbed(result.game);
                    await interaction.reply({
                        content: '🤝 Draw offer accepted! The match is drawn.',
                        embeds: [embed],
                        components: [],
                    });
                    return;
                }

                if (customId.startsWith('chess_draw_decline_')) {
                    const gameId = customId.replace('chess_draw_decline_', '');
                    const result = declineDraw(gameId, interaction.user.id);

                    if (!result.success) {
                        await interaction.reply({
                            content: `❌ ${result.error}`,
                            ephemeral: true,
                        });
                        return;
                    }

                    await interaction.reply({
                        content: `❌ <@${interaction.user.id}> declined the draw offer. Match continues!`,
                    });
                    return;
                }

                if (customId.startsWith('chess_draw_')) {
                    const gameId = customId.replace('chess_draw_', '');
                    const game = getGameById(gameId);

                    if (!game || game.status !== 'active') {
                        await interaction.reply({
                            content: 'This match is not active.',
                            ephemeral: true,
                        });
                        return;
                    }

                    const result = offerDraw(gameId, interaction.user.id);
                    if (!result.success) {
                        await interaction.reply({
                            content: `❌ ${result.error}`,
                            ephemeral: true,
                        });
                        return;
                    }

                    const otherPlayerId =
                        game.whitePlayer.id === interaction.user.id
                            ? game.blackPlayer.id
                            : game.whitePlayer.id;

                    const row = buildDrawOfferActionRow(gameId);
                    await interaction.reply({
                        content: `🤝 <@${interaction.user.id}> has offered a draw! <@${otherPlayerId}>, do you accept?`,
                        components: [row],
                    });
                    return;
                }

                if (customId.startsWith('chess_resign_')) {
                    const gameId = customId.replace('chess_resign_', '');
                    const result = resignGame(gameId, interaction.user.id);

                    if (!result.success || !result.game) {
                        await interaction.reply({
                            content: `❌ ${result.error}`,
                            ephemeral: true,
                        });
                        return;
                    }

                    const embed = buildChessBoardEmbed(result.game);
                    await interaction.reply({
                        content: `🏳️ <@${interaction.user.id}> has resigned.`,
                        embeds: [embed],
                        components: [],
                    });
                    return;
                }
            } catch (error) {
                logger.error(`Error handling chess button interaction: ${error}`);
            }
        });

        // Fast-play message listener for in-channel moves (e.g. "!m e4" or "!move Nf3" or "!chess move e4")
        client.on('messageCreate', async (message: any) => {
            try {
                if (!message || message.author?.bot || !message.guild) return;

                const content = message.content?.trim() ?? '';
                const match = content.match(/^!(?:m|move|chess\s+move)\s+(\S+)/i);
                if (!match) return;

                const notation = match[1];
                const activeGame = getActiveGameInChannel(message.channel.id);
                if (!activeGame) return;

                // Check if it is author's turn
                const isWhiteTurn = activeGame.turn === 'w';
                const currentTurnPlayerId = isWhiteTurn
                    ? activeGame.whitePlayer.id
                    : activeGame.blackPlayer.id;

                if (message.author.id !== currentTurnPlayerId) {
                    return;
                }

                const result = executeMove(activeGame.id, message.author.id, notation);
                if (!result.success) {
                    let text = `❌ **${result.error}**`;
                    if (result.diagnostic) {
                        text += `\n\n${result.diagnostic}`;
                    }
                    await message.reply(text);
                    return;
                }

                const updatedGame = result.game!;
                const embed = buildChessBoardEmbed(updatedGame);

                if (updatedGame.status === 'completed') {
                    await message.reply({
                        content: `♟️ Move **${result.move?.san}** played!`,
                        embeds: [embed],
                        components: [],
                    });
                } else {
                    const row = buildActiveGameActionRow(updatedGame.id);
                    await message.reply({
                        content: `♟️ Move **${result.move?.san}** played! It is now <@${
                            updatedGame.turn === 'w'
                                ? updatedGame.whitePlayer.id
                                : updatedGame.blackPlayer.id
                        }>'s turn.`,
                        embeds: [embed],
                        components: [row],
                    });
                }
            } catch (error) {
                logger.error(`Error in chess message listener: ${error}`);
            }
        });
    },
};

export default moduleDefinition;
export const module = moduleDefinition;
