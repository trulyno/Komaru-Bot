import { ActionRowBuilder, ButtonBuilder, ButtonStyle, Colors, EmbedBuilder } from 'discord.js';
import { config } from '../config';

export interface IssueLoginCodeRequest {
    username: string;
    externalId: string;
    ttlSeconds?: number;
}

export interface LoginCodeResponse {
    code: string;
    username: string;
    externalId: string;
    expiresAt: string;
    loginUrl: string;
}

export interface CreateLobbyRequest {
    name?: string;
    isPrivate?: boolean;
}

export interface CreateLobbyResponse {
    lobbyId: string;
    name: string;
    isPrivate: boolean;
    joinPath: string;
    joinUrl: string;
    createdAt: string;
}

export interface GregTowerLeaderboardEntry {
    rank?: number;
    username?: string;
    player?: string;
    players?: Array<string | { username?: string }>;
    floor?: number;
    wave?: number;
    score?: number;
    level?: number;
    durationSeconds?: number;
    duration?: number | string;
    createdAt?: string;
    endedAt?: string;
}

export class GregTowerApiError extends Error {
    public readonly status: number;

    constructor(status: number, message: string) {
        super(message);
        this.name = 'GregTowerApiError';
        this.status = status;
    }
}

interface ApiTestOverride {
    baseUrl?: string;
    apiKey?: string;
    loginTtlSeconds?: number;
    fetchImpl?: typeof fetch;
}

let apiOverride: ApiTestOverride | null = null;

export function setGregTowerApiConfigForTesting(override: ApiTestOverride): void {
    apiOverride = override;
}

export function resetGregTowerApiConfig(): void {
    apiOverride = null;
}

function getApiBaseUrl(): string {
    return (apiOverride?.baseUrl ?? config.env.gregTowerApiBaseUrl).replace(/\/+$/, '');
}

function getBotApiKey(): string | undefined {
    return apiOverride?.apiKey !== undefined ? apiOverride.apiKey : config.env.gregTowerBotApiKey;
}

function getDefaultLoginTtlSeconds(): number {
    return apiOverride?.loginTtlSeconds ?? config.env.gregTowerLoginTtlSeconds;
}

function getFetchImpl(): typeof fetch {
    return apiOverride?.fetchImpl ?? globalThis.fetch;
}

export function isGregTowerApiConfigured(): boolean {
    return Boolean(getBotApiKey()?.trim());
}

async function apiRequest<T>(
    endpoint: string,
    options: { method?: string; body?: unknown; requireAuth?: boolean } = {},
): Promise<T> {
    const requireAuth = options.requireAuth ?? true;
    const apiKey = getBotApiKey()?.trim();

    if (requireAuth && !apiKey) {
        throw new GregTowerApiError(
            500,
            'GregTower API key is not configured. Set BOT_API_KEY or GREGTOWER_BOT_API_KEY in .env.',
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
        throw new GregTowerApiError(503, `Failed to reach GregTower API: ${String(error)}`);
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
            parsed?.error || parsed?.message || `GregTower API returned HTTP ${response.status}`;
        throw new GregTowerApiError(response.status, message);
    }

    return (parsed ?? {}) as T;
}

export function sanitizeUsername(username: string, fallbackId: string): string {
    const trimmed = username.trim();
    if (trimmed.length > 0) {
        return trimmed.slice(0, 32);
    }
    return `user_${fallbackId}`.slice(0, 32);
}

export async function issueLoginCode(params: IssueLoginCodeRequest): Promise<LoginCodeResponse> {
    const username = sanitizeUsername(params.username, params.externalId);
    const externalId = params.externalId.trim();
    if (!externalId) {
        throw new GregTowerApiError(400, 'Discord user ID is required to issue a login code.');
    }

    const ttlSeconds = Math.max(60, Math.floor(params.ttlSeconds ?? getDefaultLoginTtlSeconds()));

    return apiRequest<LoginCodeResponse>('/bot/auth/code', {
        method: 'POST',
        body: {
            username,
            externalId,
            ttlSeconds,
        },
        requireAuth: true,
    });
}

export async function createGregTowerLobby(
    params: CreateLobbyRequest = {},
): Promise<CreateLobbyResponse> {
    const body: CreateLobbyRequest = {
        isPrivate: Boolean(params.isPrivate),
    };
    const trimmedName = params.name?.trim();
    if (trimmedName) {
        body.name = trimmedName.slice(0, 64);
    }

    return apiRequest<CreateLobbyResponse>('/bot/gregtower/lobbies', {
        method: 'POST',
        body,
        requireAuth: true,
    });
}

export async function fetchGregTowerLeaderboard(): Promise<GregTowerLeaderboardEntry[]> {
    const data = await apiRequest<
        | GregTowerLeaderboardEntry[]
        | {
              leaderboard?: GregTowerLeaderboardEntry[];
              runs?: GregTowerLeaderboardEntry[];
              entries?: GregTowerLeaderboardEntry[];
              players?: GregTowerLeaderboardEntry[];
          }
    >('/gregtower/leaderboard', {
        method: 'GET',
        requireAuth: false,
    });

    if (Array.isArray(data)) {
        return data;
    }

    return data.leaderboard ?? data.runs ?? data.entries ?? data.players ?? [];
}

export function buildLoginEmbed(data: LoginCodeResponse): EmbedBuilder {
    const expiresMs = Date.parse(data.expiresAt);
    const expiryText = Number.isFinite(expiresMs)
        ? `<t:${Math.floor(expiresMs / 1000)}:R> (<t:${Math.floor(expiresMs / 1000)}:t>)`
        : data.expiresAt;

    return new EmbedBuilder()
        .setTitle('GregTower Login Code')
        .setColor(Colors.Blurple)
        .setDescription(
            'Use the button below to log in automatically, or enter your one-time code on the GregTower login prompt so your runs qualify for the Tower Hall of Fame.',
        )
        .addFields(
            { name: 'Username', value: data.username, inline: true },
            { name: 'One-Time Code', value: `\`${data.code}\``, inline: true },
            { name: 'Expires', value: expiryText, inline: true },
        )
        .setFooter({ text: 'Single-use code. Do not share this code or link with anyone.' });
}

export function buildLoginActionRow(loginUrl: string): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setLabel('Login to GregTower')
            .setStyle(ButtonStyle.Link)
            .setURL(loginUrl),
    );
}

export function buildLobbyEmbed(data: CreateLobbyResponse, creatorUsername: string): EmbedBuilder {
    return new EmbedBuilder()
        .setTitle(`GregTower Lobby: ${data.name || data.lobbyId}`)
        .setColor(data.isPrivate ? Colors.DarkGold : Colors.Green)
        .addFields(
            { name: 'Lobby ID', value: `\`${data.lobbyId}\``, inline: true },
            { name: 'Visibility', value: data.isPrivate ? 'Private' : 'Public', inline: true },
            { name: 'Created By', value: creatorUsername, inline: true },
        )
        .setFooter({
            text: data.isPrivate
                ? 'Private lobby. Share the join link only with invited players.'
                : 'Use /login to link your Discord account for the Tower Hall of Fame.',
        });
}

export function buildLobbyActionRow(joinUrl: string): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setLabel('Join Lobby').setStyle(ButtonStyle.Link).setURL(joinUrl),
    );
}

function formatLeaderboardPlayers(entry: GregTowerLeaderboardEntry): string {
    if (entry.username) {
        return entry.username;
    }
    if (entry.player) {
        return entry.player;
    }
    if (Array.isArray(entry.players) && entry.players.length > 0) {
        const names = entry.players
            .map((p) => (typeof p === 'string' ? p : p?.username))
            .filter((name): name is string => Boolean(name));
        if (names.length > 0) {
            return names.join(', ');
        }
    }
    return 'Verified Player';
}

function formatLeaderboardMetrics(entry: GregTowerLeaderboardEntry): string {
    const parts: string[] = [];
    if (typeof entry.floor === 'number') {
        parts.push(`Floor ${entry.floor}`);
    } else if (typeof entry.wave === 'number') {
        parts.push(`Wave ${entry.wave}`);
    } else if (typeof entry.level === 'number') {
        parts.push(`Level ${entry.level}`);
    }
    if (typeof entry.score === 'number') {
        parts.push(`Score ${entry.score}`);
    }
    if (typeof entry.durationSeconds === 'number') {
        const mins = Math.floor(entry.durationSeconds / 60);
        const secs = Math.floor(entry.durationSeconds % 60);
        parts.push(`${mins}m ${secs}s`);
    } else if (entry.duration !== undefined) {
        parts.push(String(entry.duration));
    }
    return parts.length > 0 ? parts.join(' | ') : 'Verified Run';
}

export function buildGregTowerLeaderboardEmbed(
    entries: GregTowerLeaderboardEntry[],
    limit = 10,
): EmbedBuilder {
    const capped = Math.min(25, Math.max(1, Math.floor(limit)));
    const slice = entries.slice(0, capped);

    const embed = new EmbedBuilder()
        .setTitle('GregTower Hall of Fame')
        .setColor(Colors.Gold)
        .setFooter({ text: 'Only verified Discord-logged runs appear on the leaderboard.' });

    if (slice.length === 0) {
        embed.setDescription('No verified GregTower runs recorded yet.');
        return embed;
    }

    const lines = slice.map((entry, idx) => {
        const rank = entry.rank ?? idx + 1;
        const player = formatLeaderboardPlayers(entry);
        const metrics = formatLeaderboardMetrics(entry);
        return `**#${rank}** ${player} — ${metrics}`;
    });

    embed.setDescription(lines.join('\n'));
    return embed;
}
