import { KomaruMood, MoodAction, MoodStats } from './types';

export const DEFAULT_MOOD_STATS: MoodStats = {
    happiness: 65,
    energy: 70,
    hunger: 30,
    overstimulation: 0,
    lastUpdatedAt: Date.now(),
};

export function clampStat(value: number, min = 0, max = 100): number {
    return Math.max(min, Math.min(max, Math.round(value)));
}

/**
 * Lazily drifts mood stats toward natural baselines based on elapsed time.
 */
export function applyTimeDecay(
    stats: MoodStats,
    now: number,
    decayIntervalMinutes = 15,
): MoodStats {
    const elapsedMs = Math.max(0, now - stats.lastUpdatedAt);
    const intervalMs = Math.max(1, decayIntervalMinutes) * 60 * 1000;
    const steps = elapsedMs / intervalMs;

    if (steps < 0.05) {
        return { ...stats };
    }

    // Happiness drifts gently toward baseline 60
    const happinessDiff = 60 - stats.happiness;
    const happinessStep = Math.sign(happinessDiff) * Math.min(Math.abs(happinessDiff), steps * 2.5);

    // Energy recovers over time up to 80
    const energyGain = stats.energy < 80 ? Math.min(80 - stats.energy, steps * 4) : 0;

    // Hunger rises slowly over time up to 90
    const hungerGain = stats.hunger < 90 ? Math.min(90 - stats.hunger, steps * 2.5) : 0;

    // Overstimulation cools down quickly
    const overstimDrop = Math.min(stats.overstimulation, steps * 18);

    return {
        happiness: clampStat(stats.happiness + happinessStep),
        energy: clampStat(stats.energy + energyGain),
        hunger: clampStat(stats.hunger + hungerGain),
        overstimulation: clampStat(stats.overstimulation - overstimDrop),
        lastUpdatedAt: now,
    };
}

/**
 * Derives Komaru's discrete mood from current stats and subtle time-of-day bias.
 */
export function deriveMood(stats: MoodStats, now = Date.now()): KomaruMood {
    if (stats.overstimulation >= 75 || stats.happiness <= 25) {
        return 'grumpy';
    }

    if (stats.hunger >= 75 && stats.happiness < 65) {
        return 'sassy';
    }

    if (stats.energy <= 25) {
        return 'sleepy';
    }

    if (stats.energy >= 85 && stats.happiness >= 70) {
        const hour = new Date(now).getHours();
        if (hour >= 22 || hour <= 4) {
            return 'chaotic';
        }
        return 'playful';
    }

    if (stats.happiness >= 80 && stats.energy >= 40) {
        return 'affectionate';
    }

    if (stats.happiness <= 45) {
        return 'sassy';
    }

    // Subtle time-of-day flavor when stats are balanced
    const hour = new Date(now).getHours();
    if (hour >= 13 && hour <= 15 && stats.energy <= 55) {
        return 'sleepy';
    }
    if ((hour >= 23 || hour <= 3) && stats.energy >= 60) {
        return 'chaotic';
    }

    return 'happy';
}

export interface MoodUpdateResult {
    stats: MoodStats;
    mood: KomaruMood;
    overstimulated: boolean;
    bellyTrapTriggered: boolean;
    affinityDelta: number;
}

/**
 * Applies a user interaction or chat event to Komaru's mood stats.
 */
export function applyInteraction(
    currentStats: MoodStats,
    action: MoodAction,
    now = Date.now(),
    decayIntervalMinutes = 15,
): MoodUpdateResult {
    const decayed = applyTimeDecay(currentStats, now, decayIntervalMinutes);
    const next: MoodStats = { ...decayed, lastUpdatedAt: now };
    let overstimulated = false;
    let bellyTrapTriggered = false;
    let affinityDelta = 1;

    switch (action) {
        case 'pet': {
            if (decayed.overstimulation >= 65) {
                overstimulated = true;
                next.happiness = clampStat(decayed.happiness - 10);
                next.overstimulation = clampStat(decayed.overstimulation + 20);
                affinityDelta = 0;
            } else {
                next.happiness = clampStat(decayed.happiness + 8);
                next.overstimulation = clampStat(decayed.overstimulation + 18);
                affinityDelta = 2;
            }
            break;
        }
        case 'belly_rub': {
            const currentMood = deriveMood(decayed, now);
            // Classic cat trap unless already very affectionate and not overstimulated
            const safeToRub =
                (currentMood === 'affectionate' || currentMood === 'sleepy') &&
                decayed.overstimulation < 40;
            if (!safeToRub) {
                bellyTrapTriggered = true;
                next.happiness = clampStat(decayed.happiness - 8);
                next.overstimulation = clampStat(decayed.overstimulation + 30);
                next.energy = clampStat(decayed.energy - 5);
                affinityDelta = 0;
            } else {
                next.happiness = clampStat(decayed.happiness + 12);
                next.overstimulation = clampStat(decayed.overstimulation + 15);
                affinityDelta = 3;
            }
            break;
        }
        case 'treat': {
            next.hunger = clampStat(decayed.hunger - 30);
            next.happiness = clampStat(decayed.happiness + 15);
            next.overstimulation = clampStat(decayed.overstimulation - 20);
            next.energy = clampStat(decayed.energy + 5);
            affinityDelta = 4;
            break;
        }
        case 'catnip': {
            next.happiness = clampStat(decayed.happiness + 20);
            next.energy = clampStat(decayed.energy + 35);
            next.overstimulation = clampStat(decayed.overstimulation + 10);
            affinityDelta = 3;
            break;
        }
        case 'play': {
            if (decayed.energy < 15) {
                next.happiness = clampStat(decayed.happiness - 4);
                affinityDelta = 1;
            } else {
                next.happiness = clampStat(decayed.happiness + 12);
                next.energy = clampStat(decayed.energy - 18);
                next.hunger = clampStat(decayed.hunger + 8);
                next.overstimulation = clampStat(decayed.overstimulation - 10);
                affinityDelta = 3;
            }
            break;
        }
        case 'nap': {
            next.energy = clampStat(decayed.energy + 30);
            next.overstimulation = clampStat(decayed.overstimulation - 35);
            next.happiness = clampStat(decayed.happiness + 5);
            affinityDelta = 1;
            break;
        }
        case 'scold': {
            next.happiness = clampStat(decayed.happiness - 15);
            next.overstimulation = clampStat(decayed.overstimulation + 15);
            affinityDelta = -2;
            break;
        }
        case 'cucumber': {
            next.happiness = clampStat(decayed.happiness - 20);
            next.energy = clampStat(decayed.energy + 15);
            next.overstimulation = clampStat(decayed.overstimulation + 25);
            affinityDelta = -3;
            break;
        }
        case 'chat':
        default: {
            next.happiness = clampStat(decayed.happiness + 2);
            next.energy = clampStat(decayed.energy - 2);
            next.hunger = clampStat(decayed.hunger + 1);
            affinityDelta = 1;
            break;
        }
    }

    return {
        stats: next,
        mood: deriveMood(next, now),
        overstimulated,
        bellyTrapTriggered,
        affinityDelta,
    };
}

export function getBondTitle(affinity: number): string {
    if (affinity >= 100) return 'Supreme Tuna Provider';
    if (affinity >= 50) return 'Favorite Human';
    if (affinity >= 20) return 'Trusted Friend';
    if (affinity >= 5) return 'Acquaintance';
    return 'Stranger';
}

export function getMoodHint(mood: KomaruMood, stats: MoodStats): string {
    if (stats.hunger >= 75) {
        return 'Komaru is eyeing the tuna cabinet. Offering a treat would help.';
    }
    if (stats.overstimulation >= 65) {
        return 'Komaru is overstimulated. Give her space or let her nap.';
    }

    switch (mood) {
        case 'grumpy':
            return 'Komaru is grumpy. A treat or gentle nap will calm her down.';
        case 'sassy':
            return 'Komaru is feeling sassy and judgmental. Proceed with treats.';
        case 'sleepy':
            return 'Komaru is drowsy and looking for a warm sunbeam.';
        case 'playful':
            return 'Komaru has energy to burn! Try playing with her.';
        case 'chaotic':
            return 'Komaru has the zoomies. Nothing on the table is safe.';
        case 'affectionate':
            return 'Komaru is purring loudly and loves pets right now.';
        case 'happy':
        default:
            return 'Komaru is content and happy to chat.';
    }
}
