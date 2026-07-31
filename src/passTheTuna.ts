import fs from 'node:fs';
import path from 'node:path';
import { logger } from './logger';

export interface PassTheTunaEventConfig {
    id: string;
    name: string;
    description: string;
    type: string;
    chance: number;
    hidden?: boolean;
    multiplier?: number;
    bonusAmount?: number;
}

export interface PassTheTunaConfig {
    passBaseScore: number;
    takeBaseScore: number;
    gracePeriodSeconds: number;
    deliciousThresholdMin: number;
    deliciousThresholdMax: number;
    idlePenaltyThresholdHours: number;
    idlePenaltyMultiplier: number;
    announcementTurnsBeforeDelicious: number;
    passGifPath: string;
    takeGifPath: string;
    events: PassTheTunaEventConfig[];
}

export interface PassTheTunaUserStats {
    totalScore: number;
    highestScore: number;
    highestChainLengthTake: number;
    passesMade: number;
    takesMade: number;
}

export interface PassTheTunaChainState {
    id: number;
    channelId: string;
    guildId: string;
    createdAt: number;
    lastActionAt: number;
    lastActionByUserId: string | null;
    chainLength: number;
    deliciousThreshold: number;
    deliciousAnnouncementTriggered: boolean;
    participants: string[];
    configSnapshot: PassTheTunaConfig;
}

export interface PassTheTunaState {
    active: boolean;
    chainId: number;
    nextChainId: number;
    currentChain: PassTheTunaChainState | null;
    leaderboard: Record<string, PassTheTunaUserStats>;
}

export interface PassTheTunaActionContext {
    userId: string;
    action: 'pass' | 'take';
    now: number;
}

export interface PassTheTunaActionResult {
    action: 'pass' | 'take';
    blocked: boolean;
    reason?: 'no_active_chain' | 'grace_period' | 'same_user' | 'invalid_action';
    chainLength: number;
    score: number;
    penaltyApplied: boolean;
    event?: PassTheTunaEventConfig;
    chainEnded: boolean;
    message: string;
    gifPath?: string;
    nextChainId?: number;
    newChainCreated?: boolean;
}

function defaultConfig(): PassTheTunaConfig {
    return {
        passBaseScore: 10,
        takeBaseScore: 12,
        gracePeriodSeconds: 5,
        deliciousThresholdMin: 25,
        deliciousThresholdMax: 75,
        idlePenaltyThresholdHours: 1,
        idlePenaltyMultiplier: 0.5,
        announcementTurnsBeforeDelicious: 2,
        passGifPath: 'pass.gif',
        takeGifPath: 'take.gif',
        events: [
            {
                id: 'score_boost',
                name: 'Score Boost',
                description: 'The take gets a 2x score boost.',
                type: 'score_boost',
                chance: 0.12,
                multiplier: 2,
            },
            {
                id: 'chain_bonus',
                name: 'Chain Bonus',
                description: 'Everyone in the chain except the taker gets a small bonus.',
                type: 'chain_bonus',
                chance: 0.1,
                bonusAmount: 5,
            },
            {
                id: 'golden_tuna',
                name: 'Golden Tuna',
                description: 'The taker receives a 3x multiplier.',
                type: 'score_boost',
                chance: 0.08,
                multiplier: 3,
            },
            {
                id: 'spicy_tuna',
                name: 'Spicy Tuna',
                description: 'A spicy twist awards the taker extra points.',
                type: 'score_boost',
                chance: 0.07,
                multiplier: 2.5,
            },
            {
                id: 'soggy_tuna',
                name: 'Soggy Tuna',
                description: 'The take is a little slippery and awards only a small bonus.',
                type: 'score_boost',
                chance: 0.05,
                multiplier: 1.5,
            },
            {
                id: 'rotten_tuna',
                name: 'Rotten Tuna',
                description: 'The tuna is spoiled and awards no score.',
                type: 'rotten',
                chance: 0.04,
                hidden: true,
            },
            {
                id: 'frozen_tuna',
                name: 'Frozen Tuna',
                description: 'The take is canceled and turned into a pass.',
                type: 'frozen',
                chance: 0.03,
                hidden: true,
            },
            {
                id: 'tide_turn',
                name: 'Tide Turn',
                description: 'The chain swells with a bonus for the last pass.',
                type: 'chain_bonus',
                chance: 0.06,
                bonusAmount: 8,
            },
        ],
    };
}

export function resolvePassTheTunaDataDir(dataDir?: string): string {
    if (dataDir) return path.resolve(dataDir);
    return path.resolve(__dirname, '../../data/pass_the_tuna');
}

function ensureDir(dir: string): void {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function resolveConfigValue<T extends keyof PassTheTunaConfig>(
    config: Partial<PassTheTunaConfig> | undefined,
    key: T,
): PassTheTunaConfig[T] {
    return config?.[key] ?? defaultConfig()[key];
}

function mergeConfig(config?: Partial<PassTheTunaConfig>): PassTheTunaConfig {
    const base = defaultConfig();
    if (!config) return base;
    return {
        ...base,
        ...config,
        events: config.events ?? base.events,
    };
}

export function loadPassTheTunaConfig(dataDir?: string): PassTheTunaConfig {
    const dir = resolvePassTheTunaDataDir(dataDir);
    ensureDir(dir);
    const configPath = path.join(dir, 'config.json');
    if (!fs.existsSync(configPath)) {
        const config = defaultConfig();
        savePassTheTunaConfig(config, dir);
        return config;
    }

    const raw = fs.readFileSync(configPath, 'utf8');
    try {
        const parsed = JSON.parse(raw) as Partial<PassTheTunaConfig>;
        return mergeConfig(parsed);
    } catch (error) {
        logger.warn(`Failed to parse Pass the Tuna config: ${error}`);
        const config = defaultConfig();
        savePassTheTunaConfig(config, dir);
        return config;
    }
}

export function savePassTheTunaConfig(
    config: PassTheTunaConfig,
    dataDir?: string,
): PassTheTunaConfig {
    const dir = resolvePassTheTunaDataDir(dataDir);
    ensureDir(dir);
    const configPath = path.join(dir, 'config.json');
    const normalized = mergeConfig(config);
    fs.writeFileSync(configPath, JSON.stringify(normalized, null, 2));
    return normalized;
}

export function loadPassTheTunaState(dataDir?: string): PassTheTunaState {
    const dir = resolvePassTheTunaDataDir(dataDir);
    ensureDir(dir);
    const statePath = path.join(dir, 'state.json');
    if (!fs.existsSync(statePath)) {
        return {
            active: false,
            chainId: 0,
            nextChainId: 1,
            currentChain: null,
            leaderboard: {},
        };
    }

    try {
        const parsed = JSON.parse(fs.readFileSync(statePath, 'utf8')) as PassTheTunaState;
        return {
            active: parsed.active ?? false,
            chainId: parsed.chainId ?? 0,
            nextChainId: parsed.nextChainId ?? 1,
            currentChain: parsed.currentChain ?? null,
            leaderboard: parsed.leaderboard ?? {},
        };
    } catch (error) {
        logger.warn(`Failed to parse Pass the Tuna state: ${error}`);
        return {
            active: false,
            chainId: 0,
            nextChainId: 1,
            currentChain: null,
            leaderboard: {},
        };
    }
}

export function savePassTheTunaState(state: PassTheTunaState, dataDir?: string): PassTheTunaState {
    const dir = resolvePassTheTunaDataDir(dataDir);
    ensureDir(dir);
    const statePath = path.join(dir, 'state.json');
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
    return state;
}

function ensureUserStats(
    leaderboard: Record<string, PassTheTunaUserStats>,
    userId: string,
): PassTheTunaUserStats {
    if (!leaderboard[userId]) {
        leaderboard[userId] = {
            totalScore: 0,
            highestScore: 0,
            highestChainLengthTake: 0,
            passesMade: 0,
            takesMade: 0,
        };
    }
    return leaderboard[userId];
}

function maybeApplyIdlePenalty(
    chain: PassTheTunaChainState,
    config: PassTheTunaConfig,
    now: number,
): { penaltyApplied: boolean; multiplier: number } {
    const idleThresholdMs = config.idlePenaltyThresholdHours * 60 * 60 * 1000;
    const sinceLastAction = now - chain.lastActionAt;
    if (chain.lastActionAt > 0 && sinceLastAction > idleThresholdMs) {
        return { penaltyApplied: true, multiplier: config.idlePenaltyMultiplier };
    }
    return { penaltyApplied: false, multiplier: 1 };
}

function pickEvent(config: PassTheTunaConfig): PassTheTunaEventConfig | undefined {
    const visibleEvents = config.events.filter((event) => !event.hidden);
    if (visibleEvents.length === 0) {
        return undefined;
    }

    const roll = Math.random();
    let cumulative = 0;
    for (const event of visibleEvents) {
        cumulative += event.chance;
        if (roll <= cumulative) {
            return event;
        }
    }
    return visibleEvents[visibleEvents.length - 1];
}

function selectEvent(config: PassTheTunaConfig): PassTheTunaEventConfig | undefined {
    const events = config.events.filter((event) => event.chance > 0);
    if (events.length === 0) {
        return undefined;
    }

    const roll = Math.random();
    let cumulative = 0;
    for (const event of events) {
        cumulative += Math.min(event.chance, 1);
        if (roll <= cumulative) {
            return event;
        }
    }
    return events[events.length - 1];
}

function buildLeaderboardSummary(leaderboard: Record<string, PassTheTunaUserStats>): string {
    if (Object.keys(leaderboard).length === 0) {
        return 'No scores yet.';
    }

    const totalScores = Object.entries(leaderboard)
        .sort((a, b) => b[1].totalScore - a[1].totalScore)
        .slice(0, 5)
        .map(
            ([userId, stats]) =>
                `<@${userId}> — total ${stats.totalScore}, best ${stats.highestScore}`,
        )
        .join('\n');

    return `Top scorers:\n${totalScores}`;
}

export function createPassTheTunaEngine(dataDir?: string) {
    const resolvedDataDir = resolvePassTheTunaDataDir(dataDir);

    return {
        startChain(args: {
            channelId: string;
            guildId: string;
            now: number;
            config?: Partial<PassTheTunaConfig>;
        }): PassTheTunaChainState {
            const state = loadPassTheTunaState(resolvedDataDir);
            const config = mergeConfig(args.config);
            const chainId = state.nextChainId ?? 1;
            const chain: PassTheTunaChainState = {
                id: chainId,
                channelId: args.channelId,
                guildId: args.guildId,
                createdAt: args.now,
                lastActionAt: args.now,
                lastActionByUserId: null,
                chainLength: 0,
                deliciousThreshold:
                    Math.floor(
                        Math.random() *
                            (config.deliciousThresholdMax - config.deliciousThresholdMin + 1),
                    ) + config.deliciousThresholdMin,
                deliciousAnnouncementTriggered: false,
                participants: [],
                configSnapshot: config,
            };

            const nextState: PassTheTunaState = {
                active: true,
                chainId,
                nextChainId: chainId + 1,
                currentChain: chain,
                leaderboard: state.leaderboard ?? {},
            };
            savePassTheTunaState(nextState, resolvedDataDir);
            return chain;
        },

        handleAction(args: PassTheTunaActionContext): PassTheTunaActionResult {
            const state = loadPassTheTunaState(resolvedDataDir);
            if (!state.active || !state.currentChain) {
                return {
                    action: args.action,
                    blocked: true,
                    reason: 'no_active_chain',
                    chainLength: 0,
                    score: 0,
                    penaltyApplied: false,
                    chainEnded: false,
                    message: 'No active Pass the Tuna chain is running.',
                };
            }

            const chain = state.currentChain;
            const config = chain.configSnapshot;
            const gracePeriodMs = config.gracePeriodSeconds * 1000;
            const now = args.now;

            if (chain.lastActionByUserId === args.userId && chain.lastActionAt > 0) {
                if (now - chain.lastActionAt < gracePeriodMs) {
                    return {
                        action: args.action,
                        blocked: true,
                        reason: 'grace_period',
                        chainLength: chain.chainLength,
                        score: 0,
                        penaltyApplied: false,
                        chainEnded: false,
                        message: `Please wait ${config.gracePeriodSeconds} seconds before acting again.`,
                    };
                }

                return {
                    action: args.action,
                    blocked: true,
                    reason: 'same_user',
                    chainLength: chain.chainLength,
                    score: 0,
                    penaltyApplied: false,
                    chainEnded: false,
                    message: 'The same user cannot take two actions in a row. Please wait for another player.',
                };
            }

            const penalty = maybeApplyIdlePenalty(chain, config, now);
            const multiplier = penalty.penaltyApplied ? config.idlePenaltyMultiplier : 1;
            const userStats = ensureUserStats(state.leaderboard, args.userId);

            if (args.action === 'pass') {
                const nextChainLength = chain.chainLength + 1;
                const score = Math.round(config.passBaseScore * nextChainLength * multiplier);
                chain.chainLength = nextChainLength;
                chain.lastActionAt = now;
                chain.lastActionByUserId = args.userId;
                if (!chain.participants.includes(args.userId)) {
                    chain.participants.push(args.userId);
                }
                userStats.totalScore += score;
                userStats.highestScore = Math.max(userStats.highestScore, score);
                userStats.passesMade += 1;

                let announcementMessage = '';
                if (
                    !chain.deliciousAnnouncementTriggered &&
                    nextChainLength >=
                        chain.deliciousThreshold - config.announcementTurnsBeforeDelicious
                ) {
                    chain.deliciousAnnouncementTriggered = true;
                    announcementMessage = `The tuna is starting to smell delicious. Only a couple more passes and the take will be worth scoring.`;
                }

                const message = penalty.penaltyApplied
                    ? `The tuna sat untouched for too long, so the next pass was penalized. ${score} points awarded.`
                    : `${announcementMessage ? `${announcementMessage} ` : ''}${score} points for passing the tuna. Chain length is now ${nextChainLength}.`;

                savePassTheTunaState({ ...state, currentChain: chain }, resolvedDataDir);
                return {
                    action: 'pass',
                    blocked: false,
                    chainLength: nextChainLength,
                    score,
                    penaltyApplied: penalty.penaltyApplied,
                    chainEnded: false,
                    message,
                    gifPath: path.join(resolvedDataDir, config.passGifPath),
                };
            }

            const takeChainLength = chain.chainLength;
            let score = 0;
            let event: PassTheTunaEventConfig | undefined;
            let eventMessage = '';
            let effectiveAction: 'pass' | 'take' = 'take';

            event = selectEvent(config);
            if (event && (event.type === 'frozen' || event.type === 'rotten')) {
                effectiveAction = event.type === 'frozen' ? 'pass' : 'take';
                score = 0;
                eventMessage = `${event.name}: ${event.description}`;
            } else if (takeChainLength >= chain.deliciousThreshold) {
                if (event && event.type === 'score_boost') {
                    score = Math.round(
                        config.takeBaseScore * takeChainLength * (event.multiplier ?? 1),
                    );
                    eventMessage = `${event.name}: ${event.description}`;
                } else if (event && event.type === 'chain_bonus') {
                    score = Math.round(config.takeBaseScore * takeChainLength);
                    eventMessage = `${event.name}: ${event.description}`;
                } else {
                    score = Math.round(config.takeBaseScore * takeChainLength);
                    eventMessage = `${event?.name ?? 'The tuna'} was worth taking.`;
                }
            } else {
                eventMessage = `The tuna is still too fresh to reward a take. The chain length was ${takeChainLength} and the delicious threshold is ${chain.deliciousThreshold}.`;
            }

            if (effectiveAction === 'take' && penalty.penaltyApplied) {
                score = Math.round(score * config.idlePenaltyMultiplier);
            }

            userStats.takesMade += 1;
            userStats.totalScore += score;
            userStats.highestScore = Math.max(userStats.highestScore, score);
            userStats.highestChainLengthTake = Math.max(
                userStats.highestChainLengthTake,
                takeChainLength,
            );

            if (effectiveAction === 'take' && event?.type === 'chain_bonus') {
                const bonusAmount = event.bonusAmount ?? 5;
                for (const participantId of chain.participants) {
                    if (participantId === args.userId) continue;
                    const bonusStats = ensureUserStats(state.leaderboard, participantId);
                    bonusStats.totalScore += bonusAmount;
                    bonusStats.highestScore = Math.max(bonusStats.highestScore, bonusAmount);
                }
            }

            const summary = [
                `The chain ended at length ${takeChainLength}.`,
                `The take was worth ${score} points.`,
                eventMessage,
            ]
                .filter(Boolean)
                .join(' ');

            const newChainConfig = loadPassTheTunaConfig(resolvedDataDir);
            const nextChain = {
                ...state,
                active: true,
                chainId: state.chainId + 1,
                nextChainId: state.nextChainId + 1,
                currentChain: {
                    id: state.chainId + 1,
                    channelId: chain.channelId,
                    guildId: chain.guildId,
                    createdAt: now,
                    lastActionAt: now,
                    lastActionByUserId: null,
                    chainLength: 0,
                    deliciousThreshold:
                        Math.floor(
                            Math.random() *
                                (newChainConfig.deliciousThresholdMax -
                                    newChainConfig.deliciousThresholdMin +
                                    1),
                        ) + newChainConfig.deliciousThresholdMin,
                    deliciousAnnouncementTriggered: false,
                    participants: [],
                    configSnapshot: newChainConfig,
                },
            };

            savePassTheTunaState(nextChain, resolvedDataDir);
            return {
                action: effectiveAction,
                blocked: false,
                chainLength: takeChainLength,
                score,
                penaltyApplied: penalty.penaltyApplied,
                event,
                chainEnded: true,
                message: summary,
                gifPath: path.join(resolvedDataDir, config.takeGifPath),
                nextChainId: nextChain.currentChain?.id,
                newChainCreated: true,
            };
        },

        getStatus(): string {
            const state = loadPassTheTunaState(resolvedDataDir);
            if (!state.active || !state.currentChain) {
                return 'No active Pass the Tuna chain is running.';
            }

            const chain = state.currentChain;
            return [
                `Pass the Tuna is active in <#${chain.channelId}>.`,
                `Chain length: ${chain.chainLength}`,
                `Delicious threshold: ${chain.deliciousThreshold}`,
                `Last action at: ${new Date(chain.lastActionAt).toISOString()}`,
            ].join('\n');
        },

        getLeaderboards(): string {
            const state = loadPassTheTunaState(resolvedDataDir);
            return buildLeaderboardSummary(state.leaderboard);
        },
    };
}

const defaultDataDir = resolvePassTheTunaDataDir();
const engine = createPassTheTunaEngine(defaultDataDir);

function isAdmin(interaction: any): boolean {
    const memberPermissions = interaction.memberPermissions?.has?.('Administrator');
    if (memberPermissions) {
        return true;
    }
    if (process.env.BOT_OWNER_ID && interaction.user?.id === process.env.BOT_OWNER_ID) {
        return true;
    }
    return false;
}
