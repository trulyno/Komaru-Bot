import fs from 'node:fs';
import path from 'node:path';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, Colors, EmbedBuilder } from 'discord.js';
import { config } from '../config';
import { logger } from '../logger';

export type ChessColorPreference = 'random' | 'white' | 'black';
export type ApiMatchStatus = 'waiting' | 'active' | 'finished' | 'aborted';

export interface DiscordChessUser {
    id: string;
    username: string;
    displayName?: string;
}

export interface PendingChallenge {
    id: string;
    guildId: string;
    channelId: string;
    challengerId: string;
    challengerUsername: string;
    challengerDisplayName: string;
    opponentId: string;
    opponentUsername: string;
    opponentDisplayName: string;
    preferredColor: ChessColorPreference;
    messageId?: string;
    createdAt: number;
}

export interface TrackedMatchPlayer {
    userId: string;
    username: string;
    displayName?: string;
    code?: string;
    url?: string;
}

export interface TrackedMatch {
    matchId: string;
    guildId: string;
    channelId: string;
    messageId?: string;
    gameUrl: string;
    spectateUrl: string;
    status: ApiMatchStatus;
    white: TrackedMatchPlayer;
    black: TrackedMatchPlayer;
    createdAt: string;
    endedAt?: string | null;
    announcedEnd: boolean;
}

export interface ChessStore {
    challenges: PendingChallenge[];
    matches: TrackedMatch[];
}

export interface ApiPlayerStartInfo {
    playerId: string;
    code: string;
    username: string;
    elo: number;
    url: string;
}

export interface StartGameResponse {
    matchId: string;
    game: string;
    status: ApiMatchStatus;
    gameUrl: string;
    spectateUrl: string;
    players: {
        white: ApiPlayerStartInfo;
        black: ApiPlayerStartInfo;
    };
    createdAt: string;
}

export interface MatchCodesResponse {
    matchId: string;
    game: string;
    gameUrl: string;
    players: {
        white: { username: string; code: string };
        black: { username: string; code: string };
    };
}

export interface ApiPlayerStatusInfo {
    username: string;
    elo?: number;
    eloBefore?: number;
    eloAfter?: number | null;
}

export interface MatchStateSnapshot {
    fen?: string;
    pgn?: string;
    moveCount?: number;
    turn?: 'w' | 'b';
    inCheck?: boolean;
    lastMove?: {
        from: string;
        to: string;
        san: string;
        piece: string;
        color: 'w' | 'b';
    } | null;
}

export interface MatchResultInfo {
    winner?: 'white' | 'black' | 'draw' | 'abort' | null;
    reason?: string | null;
}

export interface MatchStatusResponse {
    matchId: string;
    game: string;
    status: ApiMatchStatus;
    players: {
        white: ApiPlayerStatusInfo;
        black: ApiPlayerStatusInfo;
    };
    state?: MatchStateSnapshot;
    result?: MatchResultInfo | null;
    gameUrl: string;
    spectateUrl: string;
    createdAt: string;
    startedAt?: string | null;
    endedAt?: string | null;
}

export interface BotMatchesResponse {
    matches: MatchStatusResponse[];
}

export interface MatchResultRequest {
    winner?: 'white' | 'black' | 'draw' | 'abort';
    winnerPlayerId?: string;
    winnerUsername?: string;
    reason?: string;
}

export interface LeaderboardEntry {
    username: string;
    elo: number;
    wins?: number;
    losses?: number;
    draws?: number;
    gamesPlayed?: number;
    winRate?: number;
}

export interface LeaderboardResponse {
    leaderboard?: LeaderboardEntry[];
    players?: LeaderboardEntry[];
}

export interface PlayerStatsResponse {
    username: string;
    elo: number;
    peakElo?: number;
    highestElo?: number;
    gamesPlayed?: number;
    wins?: number;
    losses?: number;
    draws?: number;
    currentStreak?: number;
    bestStreak?: number;
    recentMatches?: Array<{
        matchId: string;
        opponent?: string;
        result?: string;
        eloChange?: number;
        endedAt?: string;
    }>;
}

export interface ActiveMatchesResponse {
    matches: MatchStatusResponse[];
}

export class ChessApiError extends Error {
    public readonly status: number;

    constructor(status: number, message: string) {
        super(message);
        this.name = 'ChessApiError';
        this.status = status;
    }
}

export interface EloRoleTier {
    minElo: number;
    roleId: string;
}

export interface GuildChessRoleConfig {
    firstMatchRoleId?: string;
    topPlayerRoleId?: string;
    currentTopPlayerUserId?: string;
    stackEloRoles: boolean;
    eloTiers: EloRoleTier[];
    usernameToUserId: Record<string, string>;
}

export interface ChessRolesStore {
    guilds: Record<string, GuildChessRoleConfig>;
}

const DEFAULT_DATA_DIR = path.resolve(__dirname, '../../data/chess');
const MATCHES_FILE_NAME = 'matches.json';
const ROLES_FILE_NAME = 'roles.json';

let chessDataDir = DEFAULT_DATA_DIR;
let chessMatchesFile = path.join(DEFAULT_DATA_DIR, MATCHES_FILE_NAME);
let chessRolesFile = path.join(DEFAULT_DATA_DIR, ROLES_FILE_NAME);

interface ApiTestOverride {
    baseUrl?: string;
    apiKey?: string;
    fetchImpl?: typeof fetch;
}

let apiOverride: ApiTestOverride | null = null;

export function setChessDataDirForTesting(customDir: string): void {
    chessDataDir = customDir;
    chessMatchesFile = path.join(customDir, MATCHES_FILE_NAME);
    chessRolesFile = path.join(customDir, ROLES_FILE_NAME);
    if (!fs.existsSync(chessDataDir)) {
        fs.mkdirSync(chessDataDir, { recursive: true });
    }
}

export function resetChessDataDir(): void {
    chessDataDir = DEFAULT_DATA_DIR;
    chessMatchesFile = path.join(DEFAULT_DATA_DIR, MATCHES_FILE_NAME);
    chessRolesFile = path.join(DEFAULT_DATA_DIR, ROLES_FILE_NAME);
    if (!fs.existsSync(chessDataDir)) {
        fs.mkdirSync(chessDataDir, { recursive: true });
    }
}

export function setChessApiConfigForTesting(override: ApiTestOverride): void {
    apiOverride = override;
}

export function resetChessApiConfig(): void {
    apiOverride = null;
}

function getApiBaseUrl(): string {
    return (apiOverride?.baseUrl ?? config.env.chessApiBaseUrl).replace(/\/+$/, '');
}

function getBotApiKey(): string | undefined {
    return apiOverride?.apiKey !== undefined ? apiOverride.apiKey : config.env.chessBotApiKey;
}

function getFetchImpl(): typeof fetch {
    return apiOverride?.fetchImpl ?? globalThis.fetch;
}

export function isChessApiConfigured(): boolean {
    return Boolean(getBotApiKey()?.trim());
}

export function loadChessStore(): ChessStore {
    try {
        if (!fs.existsSync(chessDataDir)) {
            fs.mkdirSync(chessDataDir, { recursive: true });
        }
        if (!fs.existsSync(chessMatchesFile)) {
            const initial: ChessStore = { challenges: [], matches: [] };
            fs.writeFileSync(chessMatchesFile, JSON.stringify(initial, null, 2), 'utf-8');
            return initial;
        }
        const raw = fs.readFileSync(chessMatchesFile, 'utf-8');
        const parsed = JSON.parse(raw) as Partial<ChessStore>;
        return {
            challenges: Array.isArray(parsed.challenges) ? parsed.challenges : [],
            matches: Array.isArray(parsed.matches) ? parsed.matches : [],
        };
    } catch (error) {
        logger.error(`Failed to load chess store: ${error}`);
        return { challenges: [], matches: [] };
    }
}

export function saveChessStore(store: ChessStore): void {
    try {
        if (!fs.existsSync(chessDataDir)) {
            fs.mkdirSync(chessDataDir, { recursive: true });
        }
        fs.writeFileSync(chessMatchesFile, JSON.stringify(store, null, 2), 'utf-8');
    } catch (error) {
        logger.error(`Failed to save chess store: ${error}`);
    }
}

async function apiRequest<T>(
    endpoint: string,
    options: { method?: string; body?: unknown; requireAuth?: boolean } = {},
): Promise<T> {
    const requireAuth = options.requireAuth ?? true;
    const apiKey = getBotApiKey();

    if (requireAuth && !apiKey) {
        throw new ChessApiError(
            500,
            'Chess API key is not configured. Set CHESS_BOT_API_KEY in .env.',
        );
    }

    const headers: Record<string, string> = {
        Accept: 'application/json',
    };
    if (options.body !== undefined) {
        headers['Content-Type'] = 'application/json';
    }
    if (requireAuth && apiKey) {
        headers.Authorization = `Bearer ${apiKey}`;
    }

    const fetchFn = getFetchImpl();
    const url = `${getApiBaseUrl()}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

    let response: Response;
    try {
        response = await fetchFn(url, {
            method: options.method ?? 'GET',
            headers,
            body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        });
    } catch (error) {
        throw new ChessApiError(503, `Failed to reach chess API: ${String(error)}`);
    }

    const text = await response.text();
    let parsed: any = null;
    if (text) {
        try {
            parsed = JSON.parse(text);
        } catch {
            parsed = null;
        }
    }

    if (!response.ok) {
        const message =
            parsed?.error || parsed?.message || `Chess API returned HTTP ${response.status}`;
        throw new ChessApiError(response.status, message);
    }

    return (parsed ?? {}) as T;
}

export function createPendingChallenge(
    guildId: string,
    channelId: string,
    challenger: DiscordChessUser,
    opponent: DiscordChessUser,
    preferredColor: ChessColorPreference = 'random',
): { success: boolean; challenge?: PendingChallenge; error?: string } {
    if (challenger.id === opponent.id) {
        return { success: false, error: 'You cannot challenge yourself to a chess match.' };
    }

    const store = loadChessStore();
    const duplicate = store.challenges.find(
        (c) =>
            c.channelId === channelId &&
            ((c.challengerId === challenger.id && c.opponentId === opponent.id) ||
                (c.challengerId === opponent.id && c.opponentId === challenger.id)),
    );

    if (duplicate) {
        return {
            success: false,
            error: 'There is already a pending challenge between you and that player in this channel.',
        };
    }

    const challenge: PendingChallenge = {
        id: `chg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        guildId,
        channelId,
        challengerId: challenger.id,
        challengerUsername: challenger.username,
        challengerDisplayName: challenger.displayName || challenger.username,
        opponentId: opponent.id,
        opponentUsername: opponent.username,
        opponentDisplayName: opponent.displayName || opponent.username,
        preferredColor,
        createdAt: Date.now(),
    };

    store.challenges.push(challenge);
    saveChessStore(store);
    recordPlayerUserMapping(guildId, challenger.id, challenger.username);
    recordPlayerUserMapping(guildId, opponent.id, opponent.username);
    return { success: true, challenge };
}

export function setChallengeMessageId(challengeId: string, messageId: string): void {
    const store = loadChessStore();
    const challenge = store.challenges.find((c) => c.id === challengeId);
    if (challenge) {
        challenge.messageId = messageId;
        saveChessStore(store);
    }
}

export function getPendingChallengeById(challengeId: string): PendingChallenge | undefined {
    const store = loadChessStore();
    return store.challenges.find((c) => c.id === challengeId);
}

export function getPendingChallengeForUser(
    channelId: string,
    opponentId: string,
    challengerId?: string,
): PendingChallenge | undefined {
    const store = loadChessStore();
    const matches = store.challenges.filter(
        (c) =>
            c.channelId === channelId &&
            c.opponentId === opponentId &&
            (!challengerId || c.challengerId === challengerId),
    );
    return matches[matches.length - 1];
}

export function getPendingChallengeByChallenger(
    channelId: string,
    challengerId: string,
): PendingChallenge | undefined {
    const store = loadChessStore();
    const matches = store.challenges.filter(
        (c) => c.channelId === channelId && c.challengerId === challengerId,
    );
    return matches[matches.length - 1];
}

export function cancelPendingChallenge(
    challengeId: string,
    userId: string,
): { success: boolean; challenge?: PendingChallenge; error?: string } {
    const store = loadChessStore();
    const idx = store.challenges.findIndex((c) => c.id === challengeId);
    if (idx === -1) {
        return { success: false, error: 'Pending challenge not found.' };
    }
    const challenge = store.challenges[idx];
    if (challenge.challengerId !== userId) {
        return { success: false, error: 'Only the challenger can cancel this challenge.' };
    }
    store.challenges.splice(idx, 1);
    saveChessStore(store);
    return { success: true, challenge };
}

export function declinePendingChallenge(
    challengeId: string,
    userId: string,
): { success: boolean; challenge?: PendingChallenge; error?: string } {
    const store = loadChessStore();
    const idx = store.challenges.findIndex((c) => c.id === challengeId);
    if (idx === -1) {
        return { success: false, error: 'Pending challenge not found.' };
    }
    const challenge = store.challenges[idx];
    if (challenge.opponentId !== userId) {
        return { success: false, error: 'Only the challenged player can decline this challenge.' };
    }
    store.challenges.splice(idx, 1);
    saveChessStore(store);
    return { success: true, challenge };
}

export function clearChannelChallenges(channelId: string): number {
    const store = loadChessStore();
    const before = store.challenges.length;
    store.challenges = store.challenges.filter((c) => c.channelId !== channelId);
    const removed = before - store.challenges.length;
    if (removed > 0) {
        saveChessStore(store);
    }
    return removed;
}

export async function acceptPendingChallenge(
    challengeId: string,
    userId: string,
): Promise<{
    success: boolean;
    match?: TrackedMatch;
    startResponse?: StartGameResponse;
    error?: string;
}> {
    const store = loadChessStore();
    const idx = store.challenges.findIndex((c) => c.id === challengeId);
    if (idx === -1) {
        return { success: false, error: 'Pending challenge not found or already resolved.' };
    }

    const challenge = store.challenges[idx];
    if (challenge.opponentId !== userId) {
        return {
            success: false,
            error: 'Only the challenged player can accept this challenge.',
        };
    }

    const challengerPlayer = {
        username: challenge.challengerUsername,
        externalId: challenge.challengerId,
    };
    const opponentPlayer = {
        username: challenge.opponentUsername,
        externalId: challenge.opponentId,
    };

    const assignColors = challenge.preferredColor === 'random' ? 'random' : 'ordered';
    const player1 = challenge.preferredColor === 'black' ? opponentPlayer : challengerPlayer;
    const player2 = challenge.preferredColor === 'black' ? challengerPlayer : opponentPlayer;

    let startResponse: StartGameResponse;
    try {
        startResponse = await apiRequest<StartGameResponse>('/games/start', {
            method: 'POST',
            body: {
                game: 'chess',
                player1,
                player2,
                assignColors,
                metadata: {
                    guildId: challenge.guildId,
                    channelId: challenge.channelId,
                },
            },
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { success: false, error: message };
    }

    const whiteIsChallenger =
        startResponse.players.white.username.toLowerCase() ===
        challenge.challengerUsername.toLowerCase();

    const whiteUser: TrackedMatchPlayer = whiteIsChallenger
        ? {
              userId: challenge.challengerId,
              username: startResponse.players.white.username,
              displayName: challenge.challengerDisplayName,
              code: startResponse.players.white.code,
              url: startResponse.players.white.url,
          }
        : {
              userId: challenge.opponentId,
              username: startResponse.players.white.username,
              displayName: challenge.opponentDisplayName,
              code: startResponse.players.white.code,
              url: startResponse.players.white.url,
          };

    const blackUser: TrackedMatchPlayer = whiteIsChallenger
        ? {
              userId: challenge.opponentId,
              username: startResponse.players.black.username,
              displayName: challenge.opponentDisplayName,
              code: startResponse.players.black.code,
              url: startResponse.players.black.url,
          }
        : {
              userId: challenge.challengerId,
              username: startResponse.players.black.username,
              displayName: challenge.challengerDisplayName,
              code: startResponse.players.black.code,
              url: startResponse.players.black.url,
          };

    const match: TrackedMatch = {
        matchId: startResponse.matchId,
        guildId: challenge.guildId,
        channelId: challenge.channelId,
        gameUrl: startResponse.gameUrl,
        spectateUrl: startResponse.spectateUrl,
        status: startResponse.status,
        white: whiteUser,
        black: blackUser,
        createdAt: startResponse.createdAt || new Date().toISOString(),
        endedAt: null,
        announcedEnd: false,
    };

    // Reload store before mutating in case concurrent updates happened during the API call
    const freshStore = loadChessStore();
    freshStore.challenges = freshStore.challenges.filter((c) => c.id !== challenge.id);
    freshStore.matches.push(match);
    saveChessStore(freshStore);
    recordPlayerUserMapping(challenge.guildId, whiteUser.userId, whiteUser.username);
    recordPlayerUserMapping(challenge.guildId, blackUser.userId, blackUser.username);

    return { success: true, match, startResponse };
}

export function getTrackedMatchById(matchId: string): TrackedMatch | undefined {
    const store = loadChessStore();
    return store.matches.find((m) => m.matchId === matchId);
}

export function listTrackedMatches(guildId?: string, onlyOpen = false): TrackedMatch[] {
    const store = loadChessStore();
    return store.matches
        .filter((m) => !guildId || m.guildId === guildId)
        .filter((m) => !onlyOpen || m.status === 'waiting' || m.status === 'active')
        .slice()
        .reverse();
}

export function getLatestMatchInChannel(
    channelId: string,
    onlyOpen = false,
): TrackedMatch | undefined {
    const store = loadChessStore();
    const filtered = store.matches.filter(
        (m) =>
            m.channelId === channelId &&
            (!onlyOpen || m.status === 'waiting' || m.status === 'active'),
    );
    return filtered[filtered.length - 1];
}

export function getLatestMatchForUser(
    guildId: string,
    userId: string,
    channelId?: string,
): TrackedMatch | undefined {
    const store = loadChessStore();
    const matches = store.matches.filter(
        (m) =>
            m.guildId === guildId &&
            (!channelId || m.channelId === channelId) &&
            (m.status === 'waiting' || m.status === 'active') &&
            (m.white.userId === userId || m.black.userId === userId),
    );
    if (matches.length > 0) {
        return matches[matches.length - 1];
    }
    if (channelId) {
        const guildMatches = store.matches.filter(
            (m) =>
                m.guildId === guildId &&
                (m.status === 'waiting' || m.status === 'active') &&
                (m.white.userId === userId || m.black.userId === userId),
        );
        return guildMatches[guildMatches.length - 1];
    }
    return undefined;
}

export async function getPlayerCodeForMatch(
    matchId: string,
    userId: string,
): Promise<{
    success: boolean;
    side?: 'white' | 'black';
    code?: string;
    playUrl?: string;
    gameUrl?: string;
    error?: string;
}> {
    const store = loadChessStore();
    const match = store.matches.find((m) => m.matchId === matchId);
    if (!match) {
        return { success: false, error: `Match \`${matchId}\` was not found in bot records.` };
    }

    let side: 'white' | 'black' | undefined;
    if (match.white.userId === userId) {
        side = 'white';
    } else if (match.black.userId === userId) {
        side = 'black';
    }

    if (!side) {
        return { success: false, error: 'You are not a player in this match.' };
    }

    const player = side === 'white' ? match.white : match.black;
    if (player.code) {
        return {
            success: true,
            side,
            code: player.code,
            playUrl: player.url,
            gameUrl: match.gameUrl,
        };
    }

    try {
        const codesRes = await apiRequest<MatchCodesResponse>(`/games/${matchId}/codes`);
        const fetchedCode =
            side === 'white' ? codesRes.players.white.code : codesRes.players.black.code;
        player.code = fetchedCode;
        saveChessStore(store);

        return {
            success: true,
            side,
            code: fetchedCode,
            playUrl: player.url,
            gameUrl: codesRes.gameUrl || match.gameUrl,
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { success: false, error: message };
    }
}

export async function fetchMatchStatus(matchId: string): Promise<MatchStatusResponse> {
    return apiRequest<MatchStatusResponse>(`/games/${encodeURIComponent(matchId)}`);
}

export async function fetchActiveMatches(): Promise<ActiveMatchesResponse> {
    return apiRequest<ActiveMatchesResponse>('/games/chess/matches/active', {
        requireAuth: false,
    });
}

export async function fetchLeaderboard(limit = 10, offset = 0): Promise<LeaderboardEntry[]> {
    const safeLimit = Math.min(50, Math.max(1, limit));
    const safeOffset = Math.max(0, offset);
    const data = await apiRequest<LeaderboardResponse | LeaderboardEntry[]>(
        `/games/chess/leaderboard?limit=${safeLimit}&offset=${safeOffset}`,
        { requireAuth: false },
    );
    if (Array.isArray(data)) {
        return data;
    }
    return data.leaderboard ?? data.players ?? [];
}

export async function fetchPlayerStats(username: string): Promise<PlayerStatsResponse> {
    return apiRequest<PlayerStatsResponse>(
        `/games/chess/players/${encodeURIComponent(username)}/stats`,
        { requireAuth: false },
    );
}

export async function resolveMatchResult(
    matchId: string,
    payload: MatchResultRequest,
    markAnnounced = true,
): Promise<MatchStatusResponse> {
    const response = await apiRequest<MatchStatusResponse>(
        `/games/${encodeURIComponent(matchId)}/result`,
        {
            method: 'POST',
            body: payload,
        },
    );

    const store = loadChessStore();
    const tracked = store.matches.find((m) => m.matchId === matchId);
    if (tracked) {
        tracked.status = response.status || (payload.winner === 'abort' ? 'aborted' : 'finished');
        tracked.endedAt = response.endedAt || new Date().toISOString();
        if (markAnnounced) {
            tracked.announcedEnd = true;
        }
        saveChessStore(store);
    }

    return response;
}

export async function pollAndAnnounceEndedMatches(client: any): Promise<number> {
    if (!isChessApiConfigured()) {
        return 0;
    }

    const store = loadChessStore();
    const openMatches = store.matches.filter(
        (m) => !m.announcedEnd && (m.status === 'waiting' || m.status === 'active'),
    );

    if (openMatches.length === 0) {
        return 0;
    }

    const earliestCreatedMs = openMatches.reduce((min, m) => {
        const ts = Date.parse(m.createdAt);
        return Number.isFinite(ts) && ts < min ? ts : min;
    }, Date.now());
    const sinceIso = new Date(Math.max(0, earliestCreatedMs - 60_000)).toISOString();

    let botMatches: MatchStatusResponse[] = [];
    try {
        const res = await apiRequest<BotMatchesResponse>(
            `/bot/matches?status=active,finished,aborted&since=${encodeURIComponent(sinceIso)}&limit=100`,
        );
        botMatches = Array.isArray(res.matches) ? res.matches : [];
    } catch (error) {
        logger.warn(`Chess poll failed: ${error}`);
        return 0;
    }

    const byId = new Map<string, MatchStatusResponse>();
    for (const m of botMatches) {
        byId.set(m.matchId, m);
    }

    let announcedCount = 0;
    let storeDirty = false;

    for (const tracked of openMatches) {
        let summary = byId.get(tracked.matchId);
        if (!summary) {
            try {
                summary = await fetchMatchStatus(tracked.matchId);
            } catch {
                continue;
            }
        }

        if (summary.status !== tracked.status) {
            tracked.status = summary.status;
            storeDirty = true;
        }

        if (summary.status === 'finished' || summary.status === 'aborted') {
            let fullStatus = summary;
            if (!fullStatus.state && !fullStatus.result) {
                try {
                    fullStatus = await fetchMatchStatus(tracked.matchId);
                } catch {
                    // Use summary if detail fetch fails
                }
            }

            try {
                const channel = await client?.channels?.fetch?.(tracked.channelId);
                if (channel && typeof channel.send === 'function') {
                    const embed = buildMatchEndedEmbed(fullStatus, tracked);
                    const row = buildGameLinkOnlyActionRow(
                        fullStatus.gameUrl || tracked.gameUrl,
                        fullStatus.spectateUrl || tracked.spectateUrl,
                    );
                    await channel.send({
                        content: `<@${tracked.white.userId}> <@${tracked.black.userId}> Chess match \`${tracked.matchId}\` has ended.`,
                        embeds: [embed],
                        components: [row],
                    });
                }
            } catch (error) {
                logger.error(
                    `Failed to announce ended chess match ${tracked.matchId} in channel ${tracked.channelId}: ${error}`,
                );
            }

            if (summary.status === 'finished') {
                try {
                    await syncChessRolesAfterMatch(client, tracked.guildId, fullStatus, tracked);
                } catch (error) {
                    logger.error(
                        `Failed to sync chess roles for finished match ${tracked.matchId}: ${error}`,
                    );
                }
            }

            tracked.announcedEnd = true;
            tracked.endedAt = fullStatus.endedAt || new Date().toISOString();
            storeDirty = true;
            announcedCount += 1;
        }
    }

    if (storeDirty) {
        saveChessStore(store);
    }

    return announcedCount;
}

export function buildChallengeEmbed(challenge: PendingChallenge): EmbedBuilder {
    const colorLabel =
        challenge.preferredColor === 'white'
            ? 'White'
            : challenge.preferredColor === 'black'
              ? 'Black'
              : 'Random';

    return new EmbedBuilder()
        .setColor(Colors.Blue)
        .setTitle('Chess Challenge Issued')
        .setDescription(
            `<@${challenge.challengerId}> has challenged <@${challenge.opponentId}> to a chess match.\n\n` +
                `**Challenger:** <@${challenge.challengerId}> (${challenge.challengerDisplayName})\n` +
                `**Opponent:** <@${challenge.opponentId}> (${challenge.opponentDisplayName})\n` +
                `**Challenger Color Preference:** ${colorLabel}\n\n` +
                `Click **Accept** below or run \`/accept\` to start the match and receive your authentication codes.`,
        )
        .setFooter({ text: `Challenge ID: ${challenge.id}` });
}

export function buildChallengeActionRow(challengeId: string): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(`chess_accept_${challengeId}`)
            .setLabel('Accept')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`chess_decline_${challengeId}`)
            .setLabel('Decline')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId(`chess_cancel_${challengeId}`)
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Secondary),
    );
}

export function buildGameStartedEmbed(
    match: TrackedMatch,
    startResponse?: StartGameResponse,
): EmbedBuilder {
    const whiteElo = startResponse?.players.white.elo ?? 1200;
    const blackElo = startResponse?.players.black.elo ?? 1200;

    return new EmbedBuilder()
        .setColor(Colors.Green)
        .setTitle('Chess Match Created')
        .setURL(match.gameUrl)
        .setDescription(
            `A new chess match is ready on the web app.\n\n` +
                `**White:** <@${match.white.userId}> (${match.white.username}, Elo ${whiteElo})\n` +
                `**Black:** <@${match.black.userId}> (${match.black.username}, Elo ${blackElo})\n` +
                `**Match ID:** \`${match.matchId}\`\n\n` +
                `Players: click **Get My Code** below (or run \`/chess action:code\`) to receive your private authentication code.\n` +
                `Spectators: open the game link or spectate link below to watch live.`,
        )
        .addFields(
            { name: 'Game Link', value: match.gameUrl, inline: false },
            { name: 'Spectate Link', value: match.spectateUrl, inline: false },
        )
        .setFooter({ text: 'Komaru Chess • Enter your code on the game page to join' });
}

export function buildGameActionRow(
    matchId: string,
    gameUrl: string,
    spectateUrl: string,
): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setLabel('Open Game').setStyle(ButtonStyle.Link).setURL(gameUrl),
        new ButtonBuilder().setLabel('Spectate').setStyle(ButtonStyle.Link).setURL(spectateUrl),
        new ButtonBuilder()
            .setCustomId(`chess_code_${matchId}`)
            .setLabel('Get My Code')
            .setStyle(ButtonStyle.Primary),
    );
}

export function buildGameLinkOnlyActionRow(
    gameUrl: string,
    spectateUrl: string,
): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setLabel('View Match').setStyle(ButtonStyle.Link).setURL(gameUrl),
        new ButtonBuilder().setLabel('Spectate').setStyle(ButtonStyle.Link).setURL(spectateUrl),
    );
}

function formatEloDelta(before?: number, after?: number | null): string {
    if (typeof before !== 'number' || typeof after !== 'number') {
        return '';
    }
    const delta = after - before;
    const sign = delta >= 0 ? '+' : '';
    return ` (${before} -> ${after}, ${sign}${delta})`;
}

export function buildMatchStatusEmbed(
    status: MatchStatusResponse,
    tracked?: TrackedMatch,
): EmbedBuilder {
    const whiteMention = tracked
        ? `<@${tracked.white.userId}> (${status.players.white.username})`
        : status.players.white.username;
    const blackMention = tracked
        ? `<@${tracked.black.userId}> (${status.players.black.username})`
        : status.players.black.username;
    const turnLabel = status.state?.turn === 'b' ? 'Black' : 'White';
    const moveCount = status.state?.moveCount ?? 0;
    const lastMove = status.state?.lastMove?.san ?? 'None';
    const inCheck = status.state?.inCheck ? 'Yes' : 'No';

    const embed = new EmbedBuilder()
        .setColor(
            status.status === 'finished' || status.status === 'aborted'
                ? Colors.Gold
                : Colors.Blurple,
        )
        .setTitle(`Chess Match Status: ${status.matchId}`)
        .setURL(status.gameUrl)
        .addFields(
            { name: 'Status', value: status.status.toUpperCase(), inline: true },
            { name: 'Turn', value: turnLabel, inline: true },
            { name: 'Moves', value: String(moveCount), inline: true },
            {
                name: 'White',
                value: `${whiteMention} | Elo: ${status.players.white.elo ?? status.players.white.eloBefore ?? 1200}`,
                inline: true,
            },
            {
                name: 'Black',
                value: `${blackMention} | Elo: ${status.players.black.elo ?? status.players.black.eloBefore ?? 1200}`,
                inline: true,
            },
            {
                name: 'Last Move / Check',
                value: `${lastMove} (In check: ${inCheck})`,
                inline: true,
            },
        );

    if (status.result?.winner) {
        embed.addFields({
            name: 'Result',
            value: `${status.result.winner.toUpperCase()}${status.result.reason ? ` (${status.result.reason})` : ''}`,
            inline: false,
        });
    }

    if (status.state?.pgn) {
        const pgnPreview =
            status.state.pgn.length > 900
                ? `${status.state.pgn.slice(0, 897)}...`
                : status.state.pgn;
        embed.addFields({ name: 'PGN', value: `\`\`\`\n${pgnPreview}\n\`\`\``, inline: false });
    }

    embed.setFooter({ text: `Game URL: ${status.gameUrl}` });
    return embed;
}

export function buildMatchEndedEmbed(
    status: MatchStatusResponse,
    tracked?: TrackedMatch,
): EmbedBuilder {
    const winner = status.result?.winner;
    const reason = status.result?.reason || 'completed';

    let headline = 'Match Ended';
    if (status.status === 'aborted' || winner === 'abort') {
        headline = 'Match Aborted';
    } else if (winner === 'white') {
        headline = `White Wins (${status.players.white.username})`;
    } else if (winner === 'black') {
        headline = `Black Wins (${status.players.black.username})`;
    } else if (winner === 'draw') {
        headline = 'Match Drawn';
    }

    const whiteDelta = formatEloDelta(
        status.players.white.eloBefore,
        status.players.white.eloAfter,
    );
    const blackDelta = formatEloDelta(
        status.players.black.eloBefore,
        status.players.black.eloAfter,
    );

    const whiteLabel = tracked
        ? `<@${tracked.white.userId}> (${status.players.white.username})${whiteDelta}`
        : `${status.players.white.username}${whiteDelta}`;
    const blackLabel = tracked
        ? `<@${tracked.black.userId}> (${status.players.black.username})${blackDelta}`
        : `${status.players.black.username}${blackDelta}`;

    return new EmbedBuilder()
        .setColor(winner === 'draw' || status.status === 'aborted' ? Colors.Grey : Colors.Gold)
        .setTitle(`Chess Result: ${headline}`)
        .setURL(status.gameUrl || tracked?.gameUrl || null)
        .addFields(
            { name: 'Match ID', value: `\`${status.matchId}\``, inline: true },
            { name: 'Reason', value: reason, inline: true },
            { name: 'Moves', value: String(status.state?.moveCount ?? 0), inline: true },
            { name: 'White', value: whiteLabel, inline: false },
            { name: 'Black', value: blackLabel, inline: false },
        )
        .setFooter({ text: 'Komaru Chess • Standings updated on the web app' });
}

export function buildActiveMatchesEmbed(matches: MatchStatusResponse[]): EmbedBuilder {
    const embed = new EmbedBuilder()
        .setColor(Colors.Blurple)
        .setTitle('Active & Waiting Chess Matches');

    if (matches.length === 0) {
        embed.setDescription('No active or waiting chess matches found right now.');
        return embed;
    }

    const lines = matches.slice(0, 15).map((m) => {
        const moves = m.state?.moveCount ?? 0;
        return `• \`${m.matchId}\` — **${m.players.white.username}** vs **${m.players.black.username}** (${m.status}, ${moves} moves) — [Open](${m.gameUrl})`;
    });

    embed.setDescription(lines.join('\n'));
    return embed;
}

export function buildLeaderboardEmbed(entries: LeaderboardEntry[]): EmbedBuilder {
    const embed = new EmbedBuilder().setColor(Colors.Gold).setTitle('Chess Elo Leaderboard');

    if (entries.length === 0) {
        embed.setDescription('No ranked chess players found yet.');
        return embed;
    }

    const lines = entries.map((entry, idx) => {
        const w = entry.wins ?? 0;
        const l = entry.losses ?? 0;
        const d = entry.draws ?? 0;
        return `**#${idx + 1}** \`${entry.username}\` — **${entry.elo}** Elo (${w}W / ${l}L / ${d}D)`;
    });

    embed.setDescription(lines.join('\n'));
    return embed;
}

export function buildPlayerStatsEmbed(stats: PlayerStatsResponse): EmbedBuilder {
    const peak = stats.peakElo ?? stats.highestElo ?? stats.elo;
    const wins = stats.wins ?? 0;
    const losses = stats.losses ?? 0;
    const draws = stats.draws ?? 0;
    const games = stats.gamesPlayed ?? wins + losses + draws;

    return new EmbedBuilder()
        .setColor(Colors.Blue)
        .setTitle(`Chess Stats: ${stats.username}`)
        .addFields(
            { name: 'Elo', value: String(stats.elo), inline: true },
            { name: 'Peak Elo', value: String(peak), inline: true },
            { name: 'Games Played', value: String(games), inline: true },
            { name: 'Record (W/L/D)', value: `${wins} / ${losses} / ${draws}`, inline: true },
            { name: 'Current Streak', value: String(stats.currentStreak ?? 0), inline: true },
            { name: 'Best Streak', value: String(stats.bestStreak ?? 0), inline: true },
        );
}

function createDefaultGuildRoleConfig(): GuildChessRoleConfig {
    return {
        stackEloRoles: true,
        eloTiers: [],
        usernameToUserId: {},
    };
}

export function loadChessRolesStore(): ChessRolesStore {
    try {
        if (!fs.existsSync(chessDataDir)) {
            fs.mkdirSync(chessDataDir, { recursive: true });
        }
        if (!fs.existsSync(chessRolesFile)) {
            const initial: ChessRolesStore = { guilds: {} };
            fs.writeFileSync(chessRolesFile, JSON.stringify(initial, null, 2), 'utf-8');
            return initial;
        }
        const raw = fs.readFileSync(chessRolesFile, 'utf-8');
        const parsed = JSON.parse(raw) as Partial<ChessRolesStore>;
        return {
            guilds: parsed.guilds && typeof parsed.guilds === 'object' ? parsed.guilds : {},
        };
    } catch (error) {
        logger.error(`Failed to load chess roles store: ${error}`);
        return { guilds: {} };
    }
}

export function saveChessRolesStore(store: ChessRolesStore): void {
    try {
        if (!fs.existsSync(chessDataDir)) {
            fs.mkdirSync(chessDataDir, { recursive: true });
        }
        fs.writeFileSync(chessRolesFile, JSON.stringify(store, null, 2), 'utf-8');
    } catch (error) {
        logger.error(`Failed to save chess roles store: ${error}`);
    }
}

export function getGuildChessRoleConfig(guildId: string): GuildChessRoleConfig {
    const store = loadChessRolesStore();
    const existing = store.guilds[guildId];
    if (!existing) {
        return createDefaultGuildRoleConfig();
    }
    return {
        firstMatchRoleId: existing.firstMatchRoleId,
        topPlayerRoleId: existing.topPlayerRoleId,
        currentTopPlayerUserId: existing.currentTopPlayerUserId,
        stackEloRoles: existing.stackEloRoles ?? true,
        eloTiers: Array.isArray(existing.eloTiers)
            ? existing.eloTiers.slice().sort((a, b) => a.minElo - b.minElo)
            : [],
        usernameToUserId:
            existing.usernameToUserId && typeof existing.usernameToUserId === 'object'
                ? existing.usernameToUserId
                : {},
    };
}

function mutateGuildRoleConfig(
    guildId: string,
    mutator: (cfg: GuildChessRoleConfig) => void,
): GuildChessRoleConfig {
    const store = loadChessRolesStore();
    const cfg = getGuildChessRoleConfig(guildId);
    mutator(cfg);
    cfg.eloTiers.sort((a, b) => a.minElo - b.minElo);
    store.guilds[guildId] = cfg;
    saveChessRolesStore(store);
    return cfg;
}

export function recordPlayerUserMapping(guildId: string, userId: string, username: string): void {
    const key = username.trim().toLowerCase();
    if (!key || !userId) {
        return;
    }
    mutateGuildRoleConfig(guildId, (cfg) => {
        cfg.usernameToUserId[key] = userId;
    });
}

export function setFirstMatchRole(guildId: string, roleId?: string): GuildChessRoleConfig {
    return mutateGuildRoleConfig(guildId, (cfg) => {
        cfg.firstMatchRoleId = roleId;
    });
}

export function setTopPlayerRole(guildId: string, roleId?: string): GuildChessRoleConfig {
    return mutateGuildRoleConfig(guildId, (cfg) => {
        cfg.topPlayerRoleId = roleId;
        if (!roleId) {
            cfg.currentTopPlayerUserId = undefined;
        }
    });
}

export function upsertEloRole(
    guildId: string,
    minElo: number,
    roleId: string,
): GuildChessRoleConfig {
    return mutateGuildRoleConfig(guildId, (cfg) => {
        const existingIdx = cfg.eloTiers.findIndex((t) => t.minElo === minElo);
        if (existingIdx >= 0) {
            cfg.eloTiers[existingIdx] = { minElo, roleId };
        } else {
            cfg.eloTiers.push({ minElo, roleId });
        }
    });
}

export function removeEloRole(
    guildId: string,
    minElo?: number,
    roleId?: string,
): { removed: boolean; config: GuildChessRoleConfig } {
    let removed = false;
    const updated = mutateGuildRoleConfig(guildId, (cfg) => {
        const before = cfg.eloTiers.length;
        cfg.eloTiers = cfg.eloTiers.filter((t) => {
            if (typeof minElo === 'number' && t.minElo === minElo) {
                return false;
            }
            if (roleId && t.roleId === roleId) {
                return false;
            }
            return true;
        });
        removed = cfg.eloTiers.length < before;
    });
    return { removed, config: updated };
}

export function setEloRoleStacking(guildId: string, stack: boolean): GuildChessRoleConfig {
    return mutateGuildRoleConfig(guildId, (cfg) => {
        cfg.stackEloRoles = stack;
    });
}

function hasAnyRoleRewardConfigured(cfg: GuildChessRoleConfig): boolean {
    return Boolean(cfg.firstMatchRoleId || cfg.topPlayerRoleId || cfg.eloTiers.length > 0);
}

export async function resolveDiscordUserIdForUsername(
    guild: any,
    guildId: string,
    username: string,
): Promise<string | undefined> {
    const key = username.trim().toLowerCase();
    if (!key) {
        return undefined;
    }

    const roleCfg = getGuildChessRoleConfig(guildId);
    if (roleCfg.usernameToUserId[key]) {
        return roleCfg.usernameToUserId[key];
    }

    const matches = listTrackedMatches(guildId, false);
    for (const m of matches) {
        if (m.white.username.toLowerCase() === key && m.white.userId) {
            return m.white.userId;
        }
        if (m.black.username.toLowerCase() === key && m.black.userId) {
            return m.black.userId;
        }
    }

    const cachedMember = guild?.members?.cache?.find?.(
        (member: any) => member.user?.username?.toLowerCase() === key,
    );
    if (cachedMember?.id) {
        recordPlayerUserMapping(guildId, cachedMember.id, username);
        return cachedMember.id;
    }

    return undefined;
}

export async function syncRolesForPlayer(
    guild: any,
    roleConfig: GuildChessRoleConfig,
    userId: string,
    elo: number | undefined,
    grantFirstMatch: boolean,
): Promise<string[]> {
    let member: any;
    try {
        member = await guild?.members?.fetch?.(userId);
    } catch {
        return [];
    }
    if (!member?.roles) {
        return [];
    }

    const addedRoleIds: string[] = [];

    if (grantFirstMatch && roleConfig.firstMatchRoleId) {
        if (!member.roles.cache?.has?.(roleConfig.firstMatchRoleId)) {
            try {
                await member.roles.add(roleConfig.firstMatchRoleId);
                addedRoleIds.push(roleConfig.firstMatchRoleId);
            } catch (error) {
                logger.warn(
                    `Failed to add first-match chess role ${roleConfig.firstMatchRoleId} to ${userId}: ${error}`,
                );
            }
        }
    }

    if (roleConfig.eloTiers.length > 0 && typeof elo === 'number') {
        const eligible = roleConfig.eloTiers.filter((t) => elo >= t.minElo);

        if (roleConfig.stackEloRoles) {
            for (const tier of eligible) {
                if (!member.roles.cache?.has?.(tier.roleId)) {
                    try {
                        await member.roles.add(tier.roleId);
                        addedRoleIds.push(tier.roleId);
                    } catch (error) {
                        logger.warn(
                            `Failed to add Elo role ${tier.roleId} (${tier.minElo}) to ${userId}: ${error}`,
                        );
                    }
                }
            }
        } else {
            const highest = eligible.length > 0 ? eligible[eligible.length - 1] : undefined;
            const protectedIds = new Set<string>(
                [roleConfig.firstMatchRoleId, roleConfig.topPlayerRoleId].filter(
                    (id): id is string => Boolean(id),
                ),
            );

            for (const tier of roleConfig.eloTiers) {
                if (
                    tier.roleId !== highest?.roleId &&
                    !protectedIds.has(tier.roleId) &&
                    member.roles.cache?.has?.(tier.roleId)
                ) {
                    try {
                        await member.roles.remove(tier.roleId);
                    } catch (error) {
                        logger.warn(
                            `Failed to remove Elo role ${tier.roleId} from ${userId}: ${error}`,
                        );
                    }
                }
            }

            if (highest && !member.roles.cache?.has?.(highest.roleId)) {
                try {
                    await member.roles.add(highest.roleId);
                    addedRoleIds.push(highest.roleId);
                } catch (error) {
                    logger.warn(
                        `Failed to add Elo role ${highest.roleId} (${highest.minElo}) to ${userId}: ${error}`,
                    );
                }
            }
        }
    }

    return addedRoleIds;
}

export async function syncTopPlayerRoleForGuild(
    guild: any,
    guildId: string,
): Promise<{ topUsername?: string; topUserId?: string }> {
    const roleConfig = getGuildChessRoleConfig(guildId);
    if (!roleConfig.topPlayerRoleId) {
        return {};
    }

    let entries: LeaderboardEntry[] = [];
    try {
        entries = await fetchLeaderboard(5, 0);
    } catch (error) {
        logger.warn(`Failed to fetch leaderboard for top-player role sync: ${error}`);
        return {};
    }

    if (entries.length === 0) {
        return {};
    }

    let topUserId: string | undefined;
    let topUsername: string | undefined;
    for (const entry of entries) {
        const resolved = await resolveDiscordUserIdForUsername(guild, guildId, entry.username);
        if (resolved) {
            topUserId = resolved;
            topUsername = entry.username;
            break;
        }
    }

    const topRoleId = roleConfig.topPlayerRoleId;

    // Remove top player role from anyone who is no longer the top player
    try {
        const role = await guild?.roles?.fetch?.(topRoleId);
        if (role?.members) {
            for (const [memberId, member] of role.members) {
                if (memberId !== topUserId) {
                    try {
                        await member.roles.remove(topRoleId);
                    } catch (error) {
                        logger.warn(
                            `Failed to remove top player role ${topRoleId} from ${memberId}: ${error}`,
                        );
                    }
                }
            }
        } else if (
            roleConfig.currentTopPlayerUserId &&
            roleConfig.currentTopPlayerUserId !== topUserId
        ) {
            const prevMember = await guild?.members
                ?.fetch?.(roleConfig.currentTopPlayerUserId)
                .catch(() => null);
            if (prevMember?.roles?.cache?.has?.(topRoleId)) {
                await prevMember.roles.remove(topRoleId).catch(() => {});
            }
        }
    } catch (error) {
        logger.warn(`Failed to inspect top player role ${topRoleId}: ${error}`);
    }

    if (topUserId) {
        try {
            const topMember = await guild?.members?.fetch?.(topUserId);
            if (topMember && !topMember.roles?.cache?.has?.(topRoleId)) {
                await topMember.roles.add(topRoleId);
            }
        } catch (error) {
            logger.warn(`Failed to assign top player role ${topRoleId} to ${topUserId}: ${error}`);
        }
    }

    mutateGuildRoleConfig(guildId, (cfg) => {
        cfg.currentTopPlayerUserId = topUserId;
    });

    return { topUsername, topUserId };
}

export async function syncChessRolesAfterMatch(
    client: any,
    guildId: string,
    status: MatchStatusResponse,
    tracked?: TrackedMatch,
): Promise<void> {
    if (status.status !== 'finished') {
        return;
    }

    const roleConfig = getGuildChessRoleConfig(guildId);
    if (!hasAnyRoleRewardConfigured(roleConfig)) {
        return;
    }

    let guild: any;
    try {
        guild = await client?.guilds?.fetch?.(guildId);
    } catch {
        return;
    }
    if (!guild) {
        return;
    }

    const sides: Array<{
        info: ApiPlayerStatusInfo;
        trackedUserId?: string;
    }> = [
        { info: status.players.white, trackedUserId: tracked?.white.userId },
        { info: status.players.black, trackedUserId: tracked?.black.userId },
    ];

    for (const side of sides) {
        const userId =
            side.trackedUserId ||
            (await resolveDiscordUserIdForUsername(guild, guildId, side.info.username));
        if (!userId) {
            continue;
        }

        let elo = side.info.eloAfter ?? side.info.elo;
        if (typeof elo !== 'number' && roleConfig.eloTiers.length > 0) {
            try {
                const stats = await fetchPlayerStats(side.info.username);
                elo = stats.elo;
            } catch {
                elo = undefined;
            }
        }

        await syncRolesForPlayer(guild, roleConfig, userId, elo, true);
    }

    await syncTopPlayerRoleForGuild(guild, guildId);
}

export function buildChessRolesConfigEmbed(
    guildName: string,
    cfg: GuildChessRoleConfig,
): EmbedBuilder {
    const firstMatchText = cfg.firstMatchRoleId ? `<@&${cfg.firstMatchRoleId}>` : 'Not set';
    const topPlayerText = cfg.topPlayerRoleId ? `<@&${cfg.topPlayerRoleId}>` : 'Not set';
    const eloTiersText =
        cfg.eloTiers.length > 0
            ? cfg.eloTiers.map((t) => `• **${t.minElo}+ Elo** -> <@&${t.roleId}>`).join('\n')
            : 'No Elo role tiers configured.';

    return new EmbedBuilder()
        .setColor(Colors.Blurple)
        .setTitle(`Chess Role Rewards: ${guildName}`)
        .addFields(
            { name: 'First Match Role', value: firstMatchText, inline: true },
            { name: 'Top Player Role (#1)', value: topPlayerText, inline: true },
            {
                name: 'Elo Role Mode',
                value: cfg.stackEloRoles ? 'Stackable (keep all reached)' : 'Highest tier only',
                inline: true,
            },
            { name: 'Elo Thresholds', value: eloTiersText, inline: false },
        )
        .setFooter({ text: 'Use /chess_roles to configure or sync role rewards' });
}
