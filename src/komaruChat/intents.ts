import { IntentCategory, IntentMatch } from './types';

const CONTRACTIONS: Array<[RegExp, string]> = [
    [/\bwhat's\b/g, 'what is'],
    [/\bwho's\b/g, 'who is'],
    [/\bhow's\b/g, 'how is'],
    [/\bwhere's\b/g, 'where is'],
    [/\bwhen's\b/g, 'when is'],
    [/\bthat's\b/g, 'that is'],
    [/\bthere's\b/g, 'there is'],
    [/\bhere's\b/g, 'here is'],
    [/\bi'm\b/g, 'i am'],
    [/\bi've\b/g, 'i have'],
    [/\bi'll\b/g, 'i will'],
    [/\bi'd\b/g, 'i would'],
    [/\byou're\b/g, 'you are'],
    [/\byou've\b/g, 'you have'],
    [/\byou'll\b/g, 'you will'],
    [/\bwe're\b/g, 'we are'],
    [/\bthey're\b/g, 'they are'],
    [/\bit's\b/g, 'it is'],
    [/\blet's\b/g, 'let us'],
    [/\bcan't\b/g, 'can not'],
    [/\bwon't\b/g, 'will not'],
    [/\bdon't\b/g, 'do not'],
    [/\bdoesn't\b/g, 'does not'],
    [/\bdidn't\b/g, 'did not'],
    [/\bisn't\b/g, 'is not'],
    [/\baren't\b/g, 'are not'],
    [/\bwasn't\b/g, 'was not'],
    [/\bweren't\b/g, 'were not'],
    [/\bhaven't\b/g, 'have not'],
    [/\bhasn't\b/g, 'has not'],
    [/\bwouldn't\b/g, 'would not'],
    [/\bcouldn't\b/g, 'could not'],
    [/\bshouldn't\b/g, 'should not'],
    [/\bgonna\b/g, 'going to'],
    [/\bwanna\b/g, 'want to'],
    [/\bgotta\b/g, 'got to'],
    [/\bdunno\b/g, 'do not know'],
];

/**
 * Strips leading/trailing "komaru" address while preserving original casing when needed.
 */
function stripKomaruAddress(raw: string): string {
    let text = raw
        .trim()
        .replace(/<@!?\d+>/g, ' ')
        .trim();
    text = text.replace(/^(?:hey|hi|yo|dear)?\s*\bkomaru\b[,:!\s]*/i, '').trim();
    text = text.replace(/[,!\s]*\bkomaru\b[.?!]*$/i, '').trim();
    return text.replace(/\s+/g, ' ').trim();
}

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
    excludePatterns?: RegExp[];
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
        intent: 'boop',
        confidence: 0.95,
        patterns: [/\bboop(?:s|ing)?(?:\s+(?:your|the)\s+nose)?\b/, /\bnose\s+boop\b/],
    },
    {
        intent: 'brush',
        confidence: 0.94,
        patterns: [
            /\b(?:brush|brushes|brushing|groom|grooming|comb|combing)\b(?:\s+(?:your|my|the)?\s*fur)?/,
        ],
    },
    {
        intent: 'cuddle',
        confidence: 0.94,
        patterns: [
            /\b(?:hug|hugs|hugging|cuddle|cuddles|cuddling|snuggle|snuggles|snuggling|smooch)\b/,
            /\bhold\s+you\b/,
        ],
    },
    {
        intent: 'pet',
        confidence: 0.94,
        patterns: [
            /\b(?:pet|pets|petting|pat|pats|patting|headpat|headpats|scritch|scritches)\b/,
            /\bscratch(?:es|ing)?\s+(?:behind\s+)?(?:your|the)?\s*ears?\b/,
        ],
    },
    {
        intent: 'catnip',
        confidence: 0.95,
        patterns: [/\bcatnip\b/, /\bnip\b/],
    },
    {
        intent: 'box',
        confidence: 0.93,
        patterns: [
            /\b(?:cardboard\s*box|empty\s*box|amazon\s*box|delivery\s*box)\b/,
            /\b(?:give|get|have|sit\s+in)\s+(?:a\s+)?box\b/,
            /^box[?!.]*$/,
        ],
    },
    {
        intent: 'pspsps',
        confidence: 0.93,
        patterns: [
            /\bps(?:ps)+s?\b/,
            /\bpst(?:pst)+\b/,
            /\bhere\s+kitty(?:\s+kitty)?\b/,
            /\bkitty\s+kitty\b/,
        ],
    },
    {
        intent: 'feed_treat',
        confidence: 0.93,
        patterns: [
            /\b(?:treat|treats|tuna|salmon|fish|fishy|snack|snacks|kibble|feed|feeding|milk|chicken|shrimp|sardine|sardines|cat\s+food)\b/,
            /\bgive(?:s|ing)?\s+(?:you|komaru)\s+food\b/,
        ],
    },
    {
        intent: 'play',
        confidence: 0.92,
        patterns: [
            /\b(?:play|playing|laser|yarn|string|feather|toy|toys|chase|pounce|zoomies|mouse\s+toy)\b/,
        ],
    },
    {
        intent: 'nap',
        confidence: 0.91,
        patterns: [
            /\b(?:take\s+a\s+nap|go\s+to\s+sleep|nap\s*time|sleepy\s+time|sunbeam|sunspot|catnap|eepy)\b/,
        ],
    },
    {
        intent: 'scary_object',
        confidence: 0.95,
        patterns: [
            /\b(?:cucumber|zucchini|vacuum|roomba|bath|vet|thunder|fireworks|hairdryer|blender)\b/,
        ],
    },
    {
        intent: 'scold_spray',
        confidence: 0.92,
        patterns: [
            /\b(?:bad\s+cat|bad\s+kitty|spray\s*bottle|squirt\s*bottle|shoo|stop\s+it|no\s+biting|get\s+off\s+the\s+table)\b/,
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
            /\bwhat\s+is\s+up\b/,
            /\bhru\b/,
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
            /\b(?:help\s+me|need\s+help|commands?)\b/,
            /^help[?!.]*$/,
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
        patterns: [/\b(?:bingus|floppa|dog|dogs|puppy|puppies|woof|bark|maxwell)\b/],
    },
    {
        intent: 'joke_fact',
        confidence: 0.88,
        patterns: [
            /\b(?:tell\s+me\s+a\s+joke|joke|cat\s+fact|fun\s+fact|say\s+something\s+funny|make\s+me\s+laugh)\b/,
        ],
    },
    {
        intent: 'sing_dance',
        confidence: 0.87,
        patterns: [/\b(?:sing|dance|dancing|meow\s+a\s+song|vibe|vibing|party|boogie)\b/],
    },
    {
        intent: 'secret_knock',
        confidence: 0.88,
        patterns: [
            /\bknock\s+knock\b/,
            /\btell\s+me\s+a\s+secret\b/,
            /\bspill\s+the\s+tea\b/,
            /\bgossip\b/,
        ],
    },
    {
        intent: 'praise',
        confidence: 0.87,
        patterns: [
            /\b(?:good\s+cat|good\s+kitty|good\s+girl|good\s+boy|best\s+cat|cute|adorable|fluffy|precious|sweet\s+cat|love\s+you|luv\s+u|ily)\b/,
        ],
    },
    {
        intent: 'insult',
        confidence: 0.86,
        patterns: [
            /\b(?:stupid|dumb|useless|ugly|annoying|stinky|evil|shut\s+up|hate\s+you|mean\s+cat|worst\s+cat)\b/,
        ],
        excludePatterns: [
            /\b(?:not|do\s+not|never|can\s+not)\s+(?:stupid|dumb|useless|ugly|annoying|stinky|evil|hate\s+you|mean\s+cat)\b/,
        ],
    },
    {
        intent: 'user_sad_tired',
        confidence: 0.86,
        patterns: [
            /\b(?:i\s+am|feeling|feel)\s+(?:(?:so|very|really|super|pretty|extremely|a\s+bit|kind\s+of|kinda)\s+)?(?:sad|tired|exhausted|stressed|lonely|depressed|anxious|burnt\s+out|sleepy|down|overwhelmed)\b/,
            /\b(?:bad\s+day|rough\s+day|hard\s+day|want\s+to\s+cry|crying)\b/,
        ],
    },
    {
        intent: 'user_happy_excited',
        confidence: 0.85,
        patterns: [
            /\b(?:i\s+am|feeling|feel)\s+(?:(?:so|very|really|super|pretty|extremely)\s+)?(?:happy|excited|great|amazing|awesome|hyped|thrilled)\b/,
            /\b(?:yay|poggers|let\s+us\s+go|i\s+won|i\s+passed|good\s+news)\b/,
        ],
    },
    {
        intent: 'user_bored_hungry',
        confidence: 0.84,
        patterns: [
            /\b(?:i\s+am|feeling|feel)\s+(?:(?:so|very|really|super|pretty|extremely|a\s+bit|kind\s+of|kinda)\s+)?(?:bored|hungry|starving|famished)\b/,
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
            /\b(?:bye|goodbye|cya|see\s+ya|see\s+you|gtg|got\s+to\s+go|good\s+night|gn|bedtime)\b/,
        ],
    },
    {
        intent: 'greeting',
        confidence: 0.85,
        patterns: [
            /\b(?:hi|hello|hey|yo|sup|howdy|good\s+morning|gm|good\s+afternoon|good\s+evening|greetings|hiya|hewwo)\b/,
        ],
    },
    {
        intent: 'cat_noises',
        confidence: 0.82,
        patterns: [/\b(?:nya+h?|meow+|mew+|mrow+|purr+|miau+|nyan)\b/],
    },
];

const TOPIC_INTENT_RULES: IntentRule[] = [
    {
        intent: 'work_study',
        confidence: 0.86,
        patterns: [
            /\b(?:homework|studying|study|exam|midterm|finals|coding|debugging|programming|deadline|assignment|essay)\b/,
            /\bat\s+work\b/,
            /\bworking\s+(?:on|hard|late)\b/,
        ],
    },
    {
        intent: 'human_food',
        confidence: 0.85,
        patterns: [
            /\b(?:coffee|espresso|latte|matcha|boba|tea|pizza|ramen|sushi|burger|pasta|tacos?|ice\s+cream|cake|cookie|cookies|chocolate)\b/,
        ],
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

function matchRuleList(rules: IntentRule[], normalized: string): IntentMatch | undefined {
    for (const rule of rules) {
        if (rule.excludePatterns?.some((ex) => ex.test(normalized))) {
            continue;
        }
        for (const pattern of rule.patterns) {
            if (pattern.test(normalized)) {
                return { intent: rule.intent, confidence: rule.confidence };
            }
        }
    }
    return undefined;
}

/**
 * Matches user input against rule-based intents, choice pickers, yes/no questions, and fallbacks.
 */
export function matchIntent(raw: string): IntentMatch {
    const rawStripped = stripKomaruAddress(raw);
    const normalized = normalizeText(raw);

    if (!normalized) {
        return { intent: 'cat_noises', confidence: 0.7 };
    }

    // 0. Nickname request ("call me X", "my nickname is X") preserving original casing
    const nicknameMatch = rawStripped.match(
        /^(?:please\s+)?(?:you\s+can\s+)?(?:call\s+me|my\s+nickname\s+is|nickname\s+me)\s+["']?(.+?)["']?[.!]*$/i,
    );
    if (nicknameMatch && nicknameMatch[1]) {
        const nickname = nicknameMatch[1].trim();
        if (nickname.length > 0) {
            return {
                intent: 'set_nickname',
                confidence: 0.96,
                extracted: { nickname },
            };
        }
    }

    // 1. Direct rule matching
    const primaryMatch = matchRuleList(INTENT_RULES, normalized);
    if (primaryMatch) {
        return primaryMatch;
    }

    // 2. Rating / opinion request ("rate X", "do you like X", "what do you think of X")
    const rateMatch = normalized.match(
        /^(?:please\s+)?(?:rate|how\s+much\s+do\s+you\s+like|do\s+you\s+like|what\s+(?:is|are)\s+your\s+(?:opinion|thoughts)\s+on|what\s+do\s+you\s+think\s+(?:of|about))\s+(.+?)[?!.]*$/i,
    );
    if (rateMatch && rateMatch[1]) {
        const topic = rateMatch[1].trim().slice(0, 40);
        if (topic.length > 0) {
            return {
                intent: 'rate_thing',
                confidence: 0.87,
                extracted: { topic },
            };
        }
    }

    // 3. Choice picker ("X or Y", "X vs Y", "pick between X and Y")
    const betweenMatch = normalized.match(
        /^(?:please\s+)?(?:pick|choose)\s+between\s+(.+?)\s+and\s+(.+?)[?!.]*$/i,
    );
    if (betweenMatch && betweenMatch[1] && betweenMatch[2]) {
        const choiceA = betweenMatch[1].trim().slice(0, 40);
        const choiceB = betweenMatch[2].trim().slice(0, 40);
        if (choiceA.length > 0 && choiceB.length > 0) {
            return {
                intent: 'choice_picker',
                confidence: 0.88,
                extracted: { choiceA, choiceB },
            };
        }
    }

    const choiceMatch = normalized.match(
        /^(?:(?:should\s+i\s+(?:pick|choose|do|eat|get|watch|play)|which\s+(?:is\s+better|one\s+should\s+i\s+\w+))[:,]?\s+)?(?:between\s+)?(.+?)\s+(?:or|vs\.?|versus)\s+(.+?)[?!.]*$/i,
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

    // 4. Topic-based rules (checked after choice_picker / rate_thing so "pizza or sushi?" picks a choice)
    const topicMatch = matchRuleList(TOPIC_INTENT_RULES, normalized);
    if (topicMatch) {
        return topicMatch;
    }

    // 5. Yes/No questions
    const yesNoPrefix =
        /^(?:should|am|is|are|was|were|will|would|can|could|do|does|did|have|has|may|might|shall)\s+/i;
    if (yesNoPrefix.test(normalized) || normalized.endsWith('?')) {
        if (yesNoPrefix.test(normalized)) {
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

    // 5. Long wall of text
    if (normalized.length >= 160) {
        return {
            intent: 'fallback_long',
            confidence: 0.65,
        };
    }

    // 6. Exclamation
    if (raw.trim().endsWith('!')) {
        return {
            intent: 'fallback_exclamation',
            confidence: 0.6,
            extracted: { topic: extractTopic(normalized) },
        };
    }

    // 7. General statement fallback
    return {
        intent: 'fallback_statement',
        confidence: 0.5,
        extracted: { topic: extractTopic(normalized) },
    };
}
