import { IntentCategory, IntentMatch } from './types';

const CONTRACTIONS: Array<[RegExp, string]> = [
    [/\bwhat's\b/g, 'what is'],
    [/\bwho's\b/g, 'who is'],
    [/\bhow's\b/g, 'how is'],
    [/\bi'm\b/g, 'i am'],
    [/\byou're\b/g, 'you are'],
    [/\bcan't\b/g, 'can not'],
    [/\bwon't\b/g, 'will not'],
    [/\bdon't\b/g, 'do not'],
    [/\bit's\b/g, 'it is'],
    [/\bi'll\b/g, 'i will'],
];

/**
 * Normalizes user text for deterministic pattern matching.
 */
export function normalizeText(raw: string): string {
    let text = raw.toLowerCase().trim();
    // Remove Discord user/role mentions like <@123456> or <@!123456>
    text = text.replace(/<@!?\d+>/g, ' ').trim();
    // Collapse 3+ repeated letters down to 2 (e.g., helloooo -> helloo, nyaaa -> nyaa)
    text = text.replace(/([a-z])\1{2,}/g, '$1$1');

    for (const [pattern, replacement] of CONTRACTIONS) {
        text = text.replace(pattern, replacement);
    }

    // Strip leading/trailing "komaru" address for cleaner intent matching
    text = text.replace(/^(?:hey|hi|yo|dear)?\s*\bkomaru\b[,:!\s]*/i, '').trim();
    text = text.replace(/[,!\s]*\bkomaru\b[.?!]*$/i, '').trim();

    return text.replace(/\s+/g, ' ').trim();
}

interface IntentRule {
    intent: IntentCategory;
    confidence: number;
    patterns: RegExp[];
}

const INTENT_RULES: IntentRule[] = [
    {
        intent: 'belly_rub',
        confidence: 0.96,
        patterns: [
            /\bbelly\s*rubs?\b/,
            /\brub(?:s|bing)?\s+(?:your|komaru(?:'s)?|the)\s+belly\b/,
            /\btummy\s*rubs?\b/,
            /\bscratch(?:es|ing)?\s+(?:your|the)\s+belly\b/,
        ],
    },
    {
        intent: 'pet',
        confidence: 0.94,
        patterns: [
            /\b(?:pet|pets|petting|pat|pats|patting|headpat|headpats|scritch|scritches)\b/,
            /\bscratch(?:es|ing)?\s+(?:behind\s+)?(?:your|the)?\s*ears?\b/,
            /\bboop(?:s|ing)?\b/,
        ],
    },
    {
        intent: 'catnip',
        confidence: 0.95,
        patterns: [/\bcatnip\b/, /\bnip\b/],
    },
    {
        intent: 'feed_treat',
        confidence: 0.93,
        patterns: [
            /\b(?:treat|treats|tuna|salmon|fish|fishy|snack|snacks|kibble|feed|feeding|milk|chicken|shrimp)\b/,
            /\bgive(?:s|ing)?\s+(?:you|komaru)\s+food\b/,
        ],
    },
    {
        intent: 'play',
        confidence: 0.92,
        patterns: [
            /\b(?:play|playing|laser|yarn|string|feather|toy|toys|cardboard\s*box|box|chase|pounce)\b/,
            /\bpsps+\b/,
        ],
    },
    {
        intent: 'nap',
        confidence: 0.91,
        patterns: [
            /\b(?:take\s+a\s+nap|go\s+to\s+sleep|nap\s*time|sleepy\s+time|sunbeam|sunspot)\b/,
        ],
    },
    {
        intent: 'scary_object',
        confidence: 0.95,
        patterns: [/\b(?:cucumber|zucchini|vacuum|roomba|bath|vet|thunder|fireworks)\b/],
    },
    {
        intent: 'scold_spray',
        confidence: 0.92,
        patterns: [
            /\b(?:bad\s+cat|bad\s+kitty|spray\s*bottle|squirt\s*bottle|shoo|stop\s+it|no\s+biting)\b/,
        ],
    },
    {
        intent: 'mood_query',
        confidence: 0.9,
        patterns: [
            /\bhow\s+(?:are|r)\s+(?:you|u)\b/,
            /\bhow\s+(?:you|u)\s+doin(?:g)?\b/,
            /\bwhat\s+is\s+your\s+mood\b/,
            /\bhow\s+(?:do\s+)?you\s+feel\b/,
            /\byou\s+(?:okay|ok|alright|good)\b/,
            /\bwhat(?:'s|\s+is)\s+up\b/,
        ],
    },
    {
        intent: 'who_are_you',
        confidence: 0.9,
        patterns: [
            /\bwho\s+(?:are|r)\s+(?:you|u)\b/,
            /\bwhat\s+(?:are|r)\s+(?:you|u)\b/,
            /\btell\s+me\s+about\s+yourself\b/,
            /\bare\s+you\s+(?:a\s+bot|real|ai|human|cat)\b/,
        ],
    },
    {
        intent: 'help_capabilities',
        confidence: 0.89,
        patterns: [
            /\bwhat\s+can\s+you\s+do\b/,
            /\bhow\s+do\s+i\s+(?:use|talk\s+to)\s+you\b/,
            /\bhelp\b/,
        ],
    },
    {
        intent: 'time_status',
        confidence: 0.88,
        patterns: [
            /\bwhat\s+time\s+is\s+it\b/,
            /\bwhat\s+day\s+is\s+it\b/,
            /\bwhat\s+is\s+the\s+weather\b/,
        ],
    },
    {
        intent: 'bingus_lore',
        confidence: 0.9,
        patterns: [/\b(?:bingus|floppa|dog|dogs|puppy|woof|bark)\b/],
    },
    {
        intent: 'joke_fact',
        confidence: 0.88,
        patterns: [
            /\b(?:tell\s+me\s+a\s+joke|joke|cat\s+fact|fun\s+fact|say\s+something\s+funny)\b/,
        ],
    },
    {
        intent: 'praise',
        confidence: 0.87,
        patterns: [
            /\b(?:good\s+cat|good\s+kitty|good\s+girl|good\s+boy|best\s+cat|cute|adorable|fluffy|precious|love\s+you|luv\s+u)\b/,
        ],
    },
    {
        intent: 'insult',
        confidence: 0.86,
        patterns: [
            /\b(?:stupid|dumb|useless|ugly|annoying|stinky|evil|shut\s+up|hate\s+you|mean\s+cat)\b/,
        ],
    },
    {
        intent: 'user_sad_tired',
        confidence: 0.86,
        patterns: [
            /\b(?:i\s+am|feeling|feel)\s+(?:(?:so|very|really|super|pretty|extremely|a\s+bit|kind\s+of|kinda)\s+)?(?:sad|tired|exhausted|stressed|lonely|depressed|anxious|burnt\s+out|sleepy|down)\b/,
            /\b(?:bad\s+day|rough\s+day|hard\s+day|want\s+to\s+cry|crying)\b/,
        ],
    },
    {
        intent: 'user_happy_excited',
        confidence: 0.85,
        patterns: [
            /\b(?:i\s+am|feeling|feel)\s+(?:(?:so|very|really|super|pretty|extremely)\s+)?(?:happy|excited|great|amazing|awesome|hyped)\b/,
            /\b(?:yay|poggers|lets\s+go|let's\s+go|i\s+won|i\s+passed)\b/,
        ],
    },
    {
        intent: 'user_bored_hungry',
        confidence: 0.84,
        patterns: [
            /\b(?:i\s+am|feeling|feel)\s+(?:(?:so|very|really|super|pretty|extremely|a\s+bit|kind\s+of|kinda)\s+)?(?:bored|hungry|starving)\b/,
            /\bnothing\s+to\s+do\b/,
        ],
    },
    {
        intent: 'gratitude',
        confidence: 0.86,
        patterns: [/\b(?:thank\s+you|thanks|thx|ty|tysm|appreciate\s+it)\b/],
    },
    {
        intent: 'apology',
        confidence: 0.85,
        patterns: [/\b(?:sorry|apologies|my\s+bad|forgive\s+me)\b/],
    },
    {
        intent: 'farewell',
        confidence: 0.86,
        patterns: [
            /\b(?:bye|goodbye|cya|see\s+ya|see\s+you|gtg|gotta\s+go|good\s+night|gn|bedtime)\b/,
        ],
    },
    {
        intent: 'greeting',
        confidence: 0.85,
        patterns: [
            /\b(?:hi|hello|hey|yo|sup|howdy|good\s+morning|gm|good\s+afternoon|good\s+evening|greetings)\b/,
        ],
    },
    {
        intent: 'cat_noises',
        confidence: 0.82,
        patterns: [/\b(?:nya+h?|meow+|mew+|mrow+|purr+|miau+|nyan)\b/],
    },
];

function extractTopic(normalized: string): string | undefined {
    const cleaned = normalized
        .replace(
            /^(?:why|what|how|when|where|who|do|does|did|is|are|can|could|would|should)\s+/i,
            '',
        )
        .replace(/^(?:you\s+think\s+about|about|is|are)\s+/i, '')
        .replace(/[?!.]+$/g, '')
        .trim();

    if (!cleaned || cleaned.length < 2) {
        return undefined;
    }

    const words = cleaned.split(/\s+/).slice(0, 5);
    return words.join(' ');
}

/**
 * Matches user input against rule-based intents, choice pickers, yes/no questions, and fallbacks.
 */
export function matchIntent(raw: string): IntentMatch {
    const normalized = normalizeText(raw);

    if (!normalized) {
        return { intent: 'cat_noises', confidence: 0.7 };
    }

    // 1. Direct rule matching
    for (const rule of INTENT_RULES) {
        for (const pattern of rule.patterns) {
            if (pattern.test(normalized)) {
                return { intent: rule.intent, confidence: rule.confidence };
            }
        }
    }

    // 2. Choice picker ("X or Y")
    const choiceMatch = normalized.match(
        /^(?:should i (?:pick|choose|do|eat|get)\s+)?(.+?)\s+or\s+(.+?)[?!.]*$/i,
    );
    if (choiceMatch && choiceMatch[1] && choiceMatch[2]) {
        const choiceA = choiceMatch[1].trim().slice(0, 40);
        const choiceB = choiceMatch[2].trim().slice(0, 40);
        if (choiceA.length > 0 && choiceB.length > 0) {
            return {
                intent: 'choice_picker',
                confidence: 0.88,
                extracted: { choiceA, choiceB },
            };
        }
    }

    // 3. Yes/No questions
    if (
        /^(?:should|am|is|are|will|would|can|could|do|does|did|have|has)\s+/i.test(normalized) ||
        normalized.endsWith('?')
    ) {
        if (/^(?:should|am|is|are|will|would|can|could|do|does|did)\s+/i.test(normalized)) {
            return {
                intent: 'yes_no_question',
                confidence: 0.8,
                extracted: { topic: extractTopic(normalized) },
            };
        }
        return {
            intent: 'fallback_question',
            confidence: 0.6,
            extracted: { topic: extractTopic(normalized) },
        };
    }

    // 4. Long wall of text
    if (normalized.length >= 160) {
        return {
            intent: 'fallback_long',
            confidence: 0.65,
        };
    }

    // 5. Exclamation
    if (raw.trim().endsWith('!')) {
        return {
            intent: 'fallback_exclamation',
            confidence: 0.6,
            extracted: { topic: extractTopic(normalized) },
        };
    }

    // 6. General statement fallback
    return {
        intent: 'fallback_statement',
        confidence: 0.5,
        extracted: { topic: extractTopic(normalized) },
    };
}
