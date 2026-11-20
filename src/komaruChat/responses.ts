import { ChatResponseContext, IntentCategory, IntentMatch, KomaruMood } from './types';

type MoodResponsePool = Partial<Record<KomaruMood, string[]>> & {
    default: string[];
};

const OVERSTIMULATED_RESPONSES: string[] = [
    '*ears flatten and tail thumps* Too many pets, {user}! Give Komaru a minute to groom her fur back in order.',
    '*gentle warning nibble* Nya! Overstimulation limit reached. Try offering tuna instead of hands.',
    '*hops onto a high shelf out of reach* That is enough touching for now, {user}.',
];

const BELLY_TRAP_RESPONSES: string[] = [
    '*INSTANTLY grabs your hand with all four paws and bunny-kicks* IT WAS A TRAP, {user}! Never trust the exposed belly!',
    '*chomp* Mrow! The belly is for looking, not touching! Unless Komaru is super sleepy or affectionate.',
    '*activates bear-trap mode* Nya! You fell for the oldest cat trick in the book, {user}.',
];

const RESPONSE_POOLS: Record<IntentCategory, MoodResponsePool> = {
    pet: {
        default: [
            '*leans into your hand and purrs* Nya~ That hits the spot, {user}.',
            '*closes eyes happily* Mrow~ Behind the ears is the best.',
            '*kneads the air softly* Purr purr~ You are pretty good at this, {bondTitle}.',
        ],
        sleepy: [
            '*soft drowsy purr* Mmm... keep doing that, {user}... zzz...',
            '*slow blink* Nya... so warm and cozy...',
        ],
        sassy: [
            '*allows exactly three pets before walking away* That is your quota for now, {user}.',
            '*squints* I suppose you may pet me. Do not mess up my fur.',
        ],
        grumpy: [
            '*swats hand away lightly* Not right now, {user}. Bring tuna first.',
            '*grumbles* Mrow. Hands off until my mood improves.',
        ],
        chaotic: ['*vibrates at 1000Hz* NYA!! *zooms around the room after one pet*'],
    },
    belly_rub: {
        default: [
            '*purrs deeply and stretches out* Mmm~ You actually earned belly rub privileges, {user}.',
            '*rolls over slowly* Nya~ Gentle belly rubs accepted, {bondTitle}.',
        ],
        sleepy: ['*too sleepy to activate trap mode* Purr... warm belly rubs... zzz...'],
    },
    feed_treat: {
        default: [
            '*cronch cronch cronch* Nyaa~! Delicious! Thank you, {user}!',
            '*eyes dilate to dinner plates* TUNA?! *devours it in 0.4 seconds* Mrow~!',
            '*licks whiskers* Best snack ever. You have been promoted in my mental rankings, {user}.',
        ],
        grumpy: [
            '*sniffs suspiciously, then eats it anyway* ...Fine. That was pretty good, {user}. *mood improves*',
            '*grumpy cronch* Hmph. I accept this peace offering.',
        ],
        sleepy: ['*munches sleepily without even standing up* Mmm... snack in bed... nya~'],
    },
    catnip: {
        default: [
            '*rolls around in the catnip* NYAAA~! I can hear colors, {user}!! *sudden zoomies*',
            '*pupils become 100% black* MROW!! *attacks an invisible greeble on the ceiling*',
            '*flops upside down* Everything is spinning and I love it~ nya!',
        ],
    },
    play: {
        default: [
            '*wiggles butt and pounces!* Got it! Nya~! Again, {user}!',
            '*bats at the toy with lightning paws* Mrow! Nobody is faster than Komaru!',
            '*dives straight into a cardboard box* If I fits, I sits! Come find me, {user}!',
        ],
        sleepy: [
            '*bats weakly at the string once from the floor* Nya... too tired... maybe after a nap, {user}.',
            '*watches the laser dot without moving* You catch it. I am supervising.',
        ],
        grumpy: ['*stares blankly at the toy* I am not in the mood for games right now, {user}.'],
        chaotic: ['*WALL-JUMPS ACROSS THE ROOM* NYAHAHA! *knocks over three mugs*'],
    },
    nap: {
        default: [
            '*curls into a tight croissant in a sunbeam* Nya~ Good idea, {user}... zzz...',
            '*big stretch, then flops* Nap time is sacred. Do not disturb unless tuna.',
        ],
    },
    scold_spray: {
        default: [
            '*ears droop* Mrow... okay, okay, I will stop knocking things off the desk...',
            '*flinches from the spray bottle* Hiss! Water is illegal, {user}!',
        ],
        sassy: [
            '*stares you dead in the eye and knocks one more pen off the table* Nya.',
            '*turns back to you dramatically* You cannot scold perfection, {user}.',
        ],
    },
    scary_object: {
        default: [
            '*LEAPS FIVE FEET STRAIGHT INTO THE AIR* MROW!! GET THAT AWAY FROM ME!',
            '*puffs tail to three times its normal size* HISS! Why would you bring that here, {user}?!',
            '*scrambles under the nearest couch* Call me when the coast is clear...',
        ],
    },
    mood_query: {
        default: [
            'Feeling pretty happy right now, {user}! Purring at steady capacity. (=^.^=)',
            'Life is good! Could always use more tuna though, {user}.',
        ],
        playful: ['Full of energy! Ready to chase lasers and knock things over, {user}!'],
        sleepy: ['*yaaaawn* Very sleepy, {user}... running on 12% battery...'],
        affectionate: ['*headbonks you* Feeling super affectionate today, {user}~ *purr purr*'],
        sassy: ['Mildly unimpressed with the universe, {user}. A snack might fix my attitude.'],
        chaotic: ['MAXIMUM ZOOMIES! I have three braincells and they are all bouncing, {user}!'],
        grumpy: ['Grumpy. Do not ask. Just slide a treat across the floor and back away slowly.'],
    },
    who_are_you: {
        default: [
            'I am Komaru the Cat! Professional napper, part-time keyboard warmer, and full-time tuna enthusiast.',
            'Nya~ I am Komaru! Not an LLM, just 100% pure cat instincts and vibes.',
        ],
        sassy: [
            'I am Komaru, supreme feline overlord of this server. You may address me with snacks.',
        ],
    },
    help_capabilities: {
        default: [
            'You can chat with me by saying "komaru", replying to my messages, or using `/chat`! Try petting me, giving treats, asking me to pick between "A or B", or checking `/komaru_mood`.',
        ],
    },
    time_status: {
        default: [
            '*checks invisible wristwatch* According to cat logic, it is always either nap o-clock or snack o-clock.',
            'My internal clock says it is time for you to give Komaru attention, {user}.',
        ],
    },
    bingus_lore: {
        default: [
            'Bingus? *ears perk up* Bingus is a legendary fellow cat! Very aerodynamic, zero fur, 10/10.',
            'Dogs are loud and chase their own tails... wait, okay, I chase mine too, but I do it with dignity.',
        ],
        sassy: ['Why are we talking about others when Komaru is right here, {user}?'],
    },
    joke_fact: {
        default: [
            'Cat fact: Cats spend roughly 70% of their lives sleeping. Honestly, I am aiming for 80%.',
            'Why was the cat sitting on the computer? To keep an eye on the mouse! Nya~',
            'Cat fact: A group of cats is called a clowder. Which sounds like chowder. Now I want fish.',
            'What is a cat-astrophe? Dropping an empty food bowl at 3 AM!',
        ],
    },
    choice_picker: {
        default: [
            '*sniffs "{choiceA}" and paws "{choiceB}"* Definitely **{choiceB}**, {user}! Nya~',
            '*bats "{choiceA}" across the floor* Komaru chooses **{choiceA}**! Final answer.',
            '*sits directly on "{choiceA}"* If I sits on **{choiceA}**, that means **{choiceA}** wins, {user}.',
        ],
        sassy: ['Neither. Pick tuna instead. ...Okay fine, **{choiceA}**, I guess.'],
    },
    yes_no_question: {
        default: [
            '*nods decisively* Mrow! Yes, definitely!',
            '*slowly shakes head* Nya... my whiskers say no.',
            '*tilts head* Ask again after I have had a snack, {user}.',
            '*gives a single firm paw tap* Yes! Go for it!',
            '*flops over dramatically* Signs point to nap instead.',
        ],
        grumpy: ['No. Whatever it is, the answer is no right now.'],
        playful: ['YES! Do it right now! Chaos awaits!'],
    },
    greeting: {
        default: [
            'Nya~! Hello {user}! *trots over with tail up*',
            'Meow! Good to see you, {user}!',
            '*slow blink* Hey there, {bondTitle}.',
        ],
        sleepy: ['*lifts one ear* Mmm... hi {user}... *goes right back to loafing*'],
        affectionate: ['Nyaa~! {user} is here! *rubs against your leg*'],
        grumpy: ['*stares from across the room* ...Oh. Hi, {user}.'],
    },
    farewell: {
        default: [
            'Bye bye, {user}! Do not forget to come back with snacks!',
            '*waves a tiny paw* Nya~ See you later, {user}!',
            'Goodnight! *curls up on your pillow*',
        ],
    },
    gratitude: {
        default: [
            'Nya~ You are welcome, {user}! *happy tail swish*',
            'Anytime, {bondTitle}! Purr~',
        ],
        sassy: ['Of course. I am a very generous cat, after all.'],
    },
    apology: {
        default: [
            '*blinks slowly* All is forgiven, {user}. Just do not let it happen again without treats.',
            'Nya~ It is okay! *gentle paw pat*',
        ],
    },
    praise: {
        default: [
            '*purrs at maximum volume* Nyaa~! Tell me more nice things, {user}!',
            '*puffs chest out proudly* I know, I know. Best cat.',
            '*happy biscuit-making* Thank you, {user}~',
        ],
        sassy: ['Naturally. You have great taste, {user}.'],
    },
    insult: {
        default: [
            '*gasp* How dare you, {user}! *knocks your water glass over*',
            '*judges you silently from the top of the fridge* Hmph.',
            'Stinky?! I groom myself four hours a day, {user}!',
        ],
    },
    user_sad_tired: {
        default: [
            '*quietly climbs into your lap and purrs softly* It is okay to rest, {user}. Komaru is right here.',
            '*gentle headbonk* Rough day? Let me warm your keyboard while you take a breather, {user}.',
            '*brings you a metaphorical sock as a gift* Purr~ Things will get better soon.',
        ],
    },
    user_happy_excited: {
        default: [
            'Nyaa~! *bounces excitedly* Whatever happened, I am celebrating with you, {user}!',
            '*happy zoomies!* Yay!! Let us celebrate with imaginary tuna!',
        ],
    },
    user_bored_hungry: {
        default: [
            'Hungry? Go grab some real food, {user}! (And maybe share a bite of fish?)',
            'Bored? Have you tried staring intensely at a blank wall? Works for me every day.',
        ],
    },
    cat_noises: {
        default: ['Nya~! *ears perk up*', 'Meow meow! (=^.^=)', 'Mrow? *tilts head*', 'Purr purr~'],
        sleepy: ['Mew... *yawn*'],
        chaotic: ['MRROW!! *sprints down the hallway*'],
    },
    fallback_question: {
        default: [
            '*tilts head at "{topic}"* Nya? I am just a cat, {user}, not a philosopher—unless it involves tuna.',
            'Mrow? Why do you ask about {topic}, {user}?',
            '*bats at the question mark* Hmm, {topic}... sounds suspiciously like something I could nap on.',
        ],
        sassy: ['You are asking a cat about {topic}? Bold strategy, {user}.'],
    },
    fallback_exclamation: {
        default: [
            '*ears perk up!* Whoa, lots of energy there, {user}! Nya!',
            'Mrow! You sound excited about {topic}!',
        ],
        sleepy: ['*blinks slowly* Shhh... indoor voices, {user}... trying to nap here...'],
    },
    fallback_long: {
        default: [
            '*read three words and fell asleep on your keyboard* ...zzzz... nice story though, {user}!',
            'That is a lot of words, {user}! *bats the scroll wheel* Can you summarize it in "treat" or "no treat"?',
        ],
    },
    fallback_statement: {
        default: [
            '*listens attentively while grooming a paw* Mrow~ Tell me more, {user}.',
            '*tilts head* Interesting... and how does {topic} relate to dinner time, {user}?',
            'Nya~ *nods wisely like she totally understands*',
            '*slow blink* I hear you, {user}. *kneads blanket*',
        ],
        sassy: ['*stares blankly* Cool story, {user}. Now where is my snack?'],
        sleepy: ['Mmm... nya... *half asleep* sounds cozy, {user}...'],
    },
};

function applyPlaceholders(
    template: string,
    intentMatch: IntentMatch,
    context: ChatResponseContext,
): string {
    const topic = intentMatch.extracted?.topic ?? 'that';
    const choiceA = intentMatch.extracted?.choiceA ?? 'the first one';
    const choiceB = intentMatch.extracted?.choiceB ?? 'the second one';

    return template
        .replace(/\{user\}/g, context.userName)
        .replace(/\{bondTitle\}/g, context.bondTitle)
        .replace(/\{topic\}/g, topic)
        .replace(/\{choiceA\}/g, choiceA)
        .replace(/\{choiceB\}/g, choiceB);
}

function pickNonRepeating(candidates: string[], recent: string[] = []): string {
    const filtered = candidates.filter((c) => !recent.includes(c));
    const pool = filtered.length > 0 ? filtered : candidates;
    return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Selects a mood-appropriate, non-repetitive Komaru response.
 */
export function selectResponse(
    intentMatch: IntentMatch,
    mood: KomaruMood,
    context: ChatResponseContext,
): string {
    if (context.overstimulated) {
        const rendered = OVERSTIMULATED_RESPONSES.map((t) =>
            applyPlaceholders(t, intentMatch, context),
        );
        return pickNonRepeating(rendered, context.recentResponses);
    }

    if (context.bellyTrapTriggered) {
        const rendered = BELLY_TRAP_RESPONSES.map((t) =>
            applyPlaceholders(t, intentMatch, context),
        );
        return pickNonRepeating(rendered, context.recentResponses);
    }

    const pool = RESPONSE_POOLS[intentMatch.intent];
    const moodCandidates = pool[mood];
    const candidates = moodCandidates && moodCandidates.length > 0 ? moodCandidates : pool.default;
    const rendered = candidates.map((t) => applyPlaceholders(t, intentMatch, context));

    return pickNonRepeating(rendered, context.recentResponses);
}
