import { ChatResponseContext, IntentCategory, IntentMatch, KomaruMood } from './types';

type MoodResponsePool = Partial<Record<KomaruMood, string[]>> & {
    default: string[];
};

const OVERSTIMULATED_RESPONSES: string[] = [
    '*ears flatten and tail thumps* Too many pets, {user}! Give Komaru a minute to groom her fur back in order.',
    '*gentle warning nibble* Nya! Overstimulation limit reached. Try offering tuna instead of hands.',
    '*hops onto a high shelf out of reach* That is enough touching for now, {user}.',
    '*twitches skin and trots three steps away* Sensory overload! Let me loaf in peace for a bit, {user}.',
    '*places a single paw firmly on your wrist* Polite pause requested, {bondTitle}. Too much static electricity.',
];

const BELLY_TRAP_RESPONSES: string[] = [
    '*INSTANTLY grabs your hand with all four paws and bunny-kicks* IT WAS A TRAP, {user}! Never trust the exposed belly!',
    '*chomp* Mrow! The belly is for looking, not touching! Unless Komaru is super sleepy or affectionate.',
    '*activates bear-trap mode* Nya! You fell for the oldest cat trick in the book, {user}.',
    '*latches onto your sleeve like a furry handcuff* Belly access denied, {user}! Pay the tuna toll first.',
    '*rolls away at Mach 2* Nice try, {bondTitle}! The tummy stays undefeated!',
];

const RESPONSE_POOLS: Record<IntentCategory, MoodResponsePool> = {
    pet: {
        default: [
            '*leans into your hand and purrs* Nya~ That hits the spot, {user}.',
            '*closes eyes happily* Mrow~ Behind the ears is the best.',
            '*kneads the air softly* Purr purr~ You are pretty good at this, {bondTitle}.',
            '*tilts chin up for extra scritches* Yes, right there, {user}. Do not stop.',
            '*vibrates like a tiny furry motorboat* Mmm~ Top-tier headpats, {user}.',
        ],
        happy: [
            '*happy tail curl* Purr~ You always know the right spot, {user}!',
            '*rubs cheek against your palm* Nyaa~ Certified good human.',
        ],
        playful: [
            '*playfully nibbles your sleeve mid-pet* Mrow! Okay, now chase me, {user}!',
            '*does a little spin after the headpat* Encore! One more, {user}!',
        ],
        sleepy: [
            '*soft drowsy purr* Mmm... keep doing that, {user}... zzz...',
            '*slow blink* Nya... so warm and cozy...',
            '*melts into a flat pancake under your hand* ...purr... sleepy...',
        ],
        affectionate: [
            '*headbonks your hand repeatedly* Nyaa~! Never stop petting me, {user}!',
            '*curls around your wrist and purrs loudly* Best {bondTitle} ever~',
        ],
        sassy: [
            '*allows exactly three pets before walking away* That is your quota for now, {user}.',
            '*squints* I suppose you may pet me. Do not mess up my fur.',
            '*tolerates the headpat with royal dignity* Acceptable technique, {user}.',
        ],
        grumpy: [
            '*swats hand away lightly* Not right now, {user}. Bring tuna first.',
            '*grumbles* Mrow. Hands off until my mood improves.',
            '*ducks under your hand and glares* No touchy. Only snacks.',
        ],
        chaotic: [
            '*vibrates at 1000Hz* NYA!! *zooms around the room after one pet*',
            '*charges up static electricity from the pets* ZAP! NYAHAHA!',
        ],
    },
    belly_rub: {
        default: [
            '*purrs deeply and stretches out* Mmm~ You actually earned belly rub privileges, {user}.',
            '*rolls over slowly* Nya~ Gentle belly rubs accepted, {bondTitle}.',
            '*makes dreamy air-biscuits while you rub her tummy* Purr~ Pure bliss, {user}.',
        ],
        sleepy: [
            '*too sleepy to activate trap mode* Purr... warm belly rubs... zzz...',
            '*lets out a tiny snore* Mmm... tummy rub coma...',
        ],
        affectionate: [
            '*stretches all four paws out in total trust* Nyaa~ Only for my {bondTitle}, {user}~',
        ],
    },
    boop: {
        default: [
            '*blinks in surprise, then licks nose* Nya?! Did you just boop me, {user}?',
            '*freezes for half a second* Boop received! *boops your finger back with a soft paw*',
            '*wrinkles nose* Mrow~ Careful, that is the snoot button, {user}!',
            '*crossed eyes staring at your finger* ...Nya? *gentle sniff*',
        ],
        playful: [
            '*counters your boop with a double paw-tap!* Boop war! Your turn, {user}!',
            '*wiggles whiskers* Snoot booped! Turbo mode activated!',
        ],
        sleepy: ['*tiny twitch of the nose* Mmm... snoot on standby... zzz...'],
        sassy: ['*stares deadpan* Excuse me, {user}. Did you file a permit for that boop?'],
        chaotic: ['*YOU PRESSED THE CHAOS BUTTON* NYAAA!! *backflips off the sofa*'],
        grumpy: ['*huffs* Unhand the snoot, {user}.'],
    },
    brush: {
        default: [
            '*closes eyes in pure luxury* Mmm~ Salon day for Komaru! Thank you, {user}!',
            '*purrs smoothly as every knot disappears* Nya~ My coat is going to shine like velvet!',
            '*leans sideways into the brush* Yes, right along the shoulders, {bondTitle}~',
            '*admires freshly fluffed tail* 10/10 grooming service, {user}.',
        ],
        sleepy: ['*almost falls asleep mid-brush* Purr... spa day... zzz...'],
        sassy: [
            '*inspects a stray hair* Finally, someone respects proper feline grooming standards, {user}.',
        ],
        grumpy: [
            '*starts grumpy, then reluctantly starts purring* ...Fine. The brush is nice, {user}.',
        ],
    },
    cuddle: {
        default: [
            '*curls up right against your side* Nya~ Warm human detected, {user}.',
            '*tucks paws underneath and purrs like a space heater* Cozy time with {bondTitle}~',
            '*gives a gentle forehead bonk and settles in* Mrow~ Do not move for the next three hours, {user}.',
            '*wraps tail around your arm* Official Komaru cuddle seal of approval.',
        ],
        affectionate: [
            '*purrs at maximum volume and refuses to let go* Nyaa~! I love cuddle time with {user}!',
            '*kneads your hoodie softly* Home is wherever {user} is~',
        ],
        sleepy: ['*instantly falls asleep on your lap* ...zzz... warm... {user}...'],
        sassy: [
            '*sits half an inch away, pretending it is a coincidence* I am only here for body heat, {user}.',
        ],
        chaotic: ['*wiggles out of the hug at light speed* NO CONTAINMENT CAN HOLD ME, {user}!!'],
    },
    box: {
        default: [
            '*teleports into the cardboard box in 0.1 seconds* If I fits, I sits, {user}!',
            '*peeks out over the cardboard rim with huge eyes* Welcome to Fort Komaru, {bondTitle}. Password is tuna.',
            '*chews a tiny corner of the box* Mrow~ Best furniture in the house!',
            '*curls up inside the box* This is my kingdom now, {user}. No dogs allowed.',
        ],
        playful: ['*launches out of the box like a spring-loaded ambush!* NYA! Gotcha, {user}!'],
        sleepy: ['*already asleep in the box* ...cardboard... five-star hotel... zzz...'],
        chaotic: ['*drags the box across the floor like a turtle shell* NYAHAHA!'],
    },
    pspsps: {
        default: [
            '*ears snap forward like radar dishes* Mrow?! Who summoned me, {user}?',
            '*trots over immediately* Yes, {user}? You said the magic words!',
            '*peeks around the doorframe* Nya? Do you have snacks or just lies, {user}?',
            '*head tilts 45 degrees* You called, {bondTitle}?',
        ],
        sassy: ['*looks at you, looks away, then walks over anyway* What do you want, {user}?'],
        sleepy: ['*one ear twitches* Mmm... I heard pspsps... better be tuna, {user}...'],
        chaotic: ['*SLIDES ACROSS THE FLOOR ON ALL FOURS* YOU SUMMONED THE STORM, {user}!!'],
        grumpy: ['*does not move, only flicks tail tip* ...What, {user}.'],
    },
    feed_treat: {
        default: [
            '*cronch cronch cronch* Nyaa~! Delicious! Thank you, {user}!',
            '*eyes dilate to dinner plates* TUNA?! *devours it in 0.4 seconds* Mrow~!',
            '*licks whiskers* Best snack ever. You have been promoted in my mental rankings, {user}.',
            '*happy tippy-taps* More? Please? Just one more, {bondTitle}?',
            '*catches the treat mid-air like a pro* Nya~! 10/10 catch!',
        ],
        happy: ['*purrs while chewing* Heaven in a bite! Thank you, {user}!'],
        playful: [
            '*bats the treat across the floor first, then pounces and eats it* Interactive dining!',
        ],
        affectionate: [
            '*rubs against your leg after finishing* You take such good care of me, {user}~',
        ],
        grumpy: [
            '*sniffs suspiciously, then eats it anyway* ...Fine. That was pretty good, {user}. *mood improves*',
            '*grumpy cronch* Hmph. I accept this peace offering.',
        ],
        sleepy: ['*munches sleepily without even standing up* Mmm... snack in bed... nya~'],
        chaotic: ['*INHALES THE TREAT AND STARTS ZOOMING* FUEL ACQUIRED!!'],
    },
    catnip: {
        default: [
            '*rolls around in the catnip* NYAAA~! I can hear colors, {user}!! *sudden zoomies*',
            '*pupils become 100% black* MROW!! *attacks an invisible greeble on the ceiling*',
            '*flops upside down* Everything is spinning and I love it~ nya!',
            '*stares intensely at a dust mote* {user}... the carpet is speaking to me...',
            '*hugs the catnip pouch with all four paws* Mine! All mine, {bondTitle}!',
        ],
        sleepy: ['*sniff* ...Whoa... suddenly wide awake!! *chaotic wiggle*'],
        sassy: [
            '*tries to act dignified while clearly high on catnip* I am... completely sober, {user}. *falls off cushion*',
        ],
    },
    play: {
        default: [
            '*wiggles butt and pounces!* Got it! Nya~! Again, {user}!',
            '*bats at the toy with lightning paws* Mrow! Nobody is faster than Komaru!',
            '*dives straight into a cardboard box* If I fits, I sits! Come find me, {user}!',
            '*stalks the feather wand in slow motion... POUNCE!* Mission accomplished, {bondTitle}!',
            '*does a mid-air twist* Olympic gold medalist in zoomies right here, {user}!',
        ],
        playful: [
            '*full predator crouch* Watch this! *leaps three feet* NYA!!',
            '*brings the toy back and drops it at your feet* Again, {user}! Throw it again!',
        ],
        sleepy: [
            '*bats weakly at the string once from the floor* Nya... too tired... maybe after a nap, {user}.',
            '*watches the laser dot without moving* You catch it. I am supervising.',
        ],
        grumpy: ['*stares blankly at the toy* I am not in the mood for games right now, {user}.'],
        chaotic: [
            '*WALL-JUMPS ACROSS THE ROOM* NYAHAHA! *knocks over three mugs*',
            '*chases own tail at 40mph* CATCHING THE INTRUDER!!',
        ],
    },
    nap: {
        default: [
            '*curls into a tight croissant in a sunbeam* Nya~ Good idea, {user}... zzz...',
            '*big stretch, then flops* Nap time is sacred. Do not disturb unless tuna.',
            '*tucks nose under tail* Entering low-power loaf mode, {user}...',
            '*finds the warmest spot on your keyboard* Perfect pillow... zzz...',
        ],
        playful: [
            '*tries to nap, twitches paws dreaming about lasers* ...almost caught it... zzz...',
        ],
        affectionate: [
            '*curls up right on your lap* Best napping spot in the world, {bondTitle}... zzz...',
        ],
    },
    scold_spray: {
        default: [
            '*ears droop* Mrow... okay, okay, I will stop knocking things off the desk...',
            '*flinches from the spray bottle* Hiss! Water is illegal, {user}!',
            '*sulks under the chair* I was framed! The cup jumped off the table by itself, {user}!',
        ],
        sassy: [
            '*stares you dead in the eye and knocks one more pen off the table* Nya.',
            '*turns back to you dramatically* You cannot scold perfection, {user}.',
        ],
        grumpy: ['*hisses softly and retreats* Fine. Keep your boring desk, {user}.'],
    },
    scary_object: {
        default: [
            '*LEAPS FIVE FEET STRAIGHT INTO THE AIR* MROW!! GET THAT AWAY FROM ME!',
            '*puffs tail to three times its normal size* HISS! Why would you bring that here, {user}?!',
            '*scrambles under the nearest couch* Call me when the coast is clear...',
            '*crab-walks sideways out of the room* ABORT! ABORT! DANGER DETECTED!',
        ],
        chaotic: ['*bounces off three walls in panic* IT IS ALIVE!! SAVE YOURSELF, {user}!!'],
    },
    set_nickname: {
        default: ['*perks up ears* Noted, {user}!'],
    },
    mood_query: {
        default: [
            'Feeling pretty happy right now, {user}! Purring at steady capacity. (=^.^=)',
            'Life is good! Could always use more tuna though, {user}.',
            'Vibes are immaculate, {bondTitle}! Sunbeam levels are optimal.',
        ],
        happy: ['Doing great, {user}! Ready for snacks, pets, and mild mischief.'],
        playful: [
            'Full of energy! Ready to chase lasers and knock things over, {user}!',
            'Bouncy and ready to pounce! Got a toy, {user}?',
        ],
        sleepy: [
            '*yaaaawn* Very sleepy, {user}... running on 12% battery...',
            'Half-loafed and dreaming of tuna, {user}... zzz...',
        ],
        affectionate: [
            '*headbonks you* Feeling super affectionate today, {user}~ *purr purr*',
            'Extra cuddly right now, {bondTitle}! Come get your free purrs!',
        ],
        sassy: [
            'Mildly unimpressed with the universe, {user}. A snack might fix my attitude.',
            'Feeling judgmental, {user}. Convince me you deserve my attention.',
        ],
        chaotic: [
            'MAXIMUM ZOOMIES! I have three braincells and they are all bouncing, {user}!',
            'Pure unhinged feline energy right now, {user}! Hide your fragile mugs!',
        ],
        grumpy: [
            'Grumpy. Do not ask. Just slide a treat across the floor and back away slowly.',
            '*flicks tail* Mood: low. Tuna: needed. Patience: zero.',
        ],
    },
    who_are_you: {
        default: [
            'I am Komaru the Cat! Professional napper, part-time keyboard warmer, and full-time tuna enthusiast.',
            'Nya~ I am Komaru! Not an LLM, just 100% pure cat instincts and vibes.',
            'Komaru, at your service (mostly when snacks are involved), {user}!',
        ],
        sassy: [
            'I am Komaru, supreme feline overlord of this server. You may address me with snacks.',
        ],
        affectionate: ['I am your resident cat, Komaru! And you are my {bondTitle}, {user}~'],
    },
    help_capabilities: {
        default: [
            'You can chat with me by saying "komaru", replying to my messages, or using `/chat`! Try petting, booping, brushing, cuddling, giving a box or treats, asking me to rate things, pick between "A or B", checking `/komaru_mood`, or setting a nickname with `/komaru_nickname` once we are Trusted Friends!',
        ],
    },
    time_status: {
        default: [
            '*checks invisible wristwatch* According to cat logic, it is always either nap o-clock or snack o-clock.',
            'My internal clock says it is time for you to give Komaru attention, {user}.',
            'Whatever time it is, it is definitely close enough to dinner time, {user}!',
        ],
        sleepy: ['Time for a nap. Always time for a nap, {user}... zzz...'],
        chaotic: ['3 AM energy, regardless of what your clock says, {user}!'],
    },
    bingus_lore: {
        default: [
            'Bingus? *ears perk up* Bingus is a legendary fellow cat! Very aerodynamic, zero fur, 10/10.',
            'Dogs are loud and chase their own tails... wait, okay, I chase mine too, but I do it with dignity.',
            'Maxwell? Big fan. Great loaf form, very musical.',
            'Floppa is cool, though I still think my ear-twitch game is stronger, {user}.',
        ],
        sassy: ['Why are we talking about others when Komaru is right here, {user}?'],
    },
    joke_fact: {
        default: [
            'Cat fact: Cats spend roughly 70% of their lives sleeping. Honestly, I am aiming for 80%.',
            'Why was the cat sitting on the computer? To keep an eye on the mouse! Nya~',
            'Cat fact: A group of cats is called a clowder. Which sounds like chowder. Now I want fish.',
            'What is a cat-astrophe? Dropping an empty food bowl at 3 AM!',
            'Cat fact: A cat nose print is as unique as a human fingerprint! Boop responsibly, {user}.',
            'Why do cats hate online shopping? They prefer a cat-alogue! Mrow~',
            'Cat fact: Cats can rotate their ears 180 degrees—usually to ignore you more accurately, {user}.',
        ],
    },
    sing_dance: {
        default: [
            '*clears throat* Mrow mrow mrow, nya nya nya~ *does a tiny paw-shuffle*',
            '*wiggles hips back and forth like before a pounce* Look at my dance moves, {user}!',
            '*sings the song of my people at 3 AM volume* MROOOOOOW!!',
            '*taps paws in rhythm* Biscuit-making beats to relax/study to, {bondTitle}!',
        ],
        chaotic: ['*breakdances on the coffee table and knocks over a lamp* NYAHAHA!!'],
        sleepy: ['*hums three notes and yawns* ...meow... zzz...'],
    },
    secret_knock: {
        default: [
            '*leans in close and whispers* ...I know who knocked over the plant yesterday. It was me. Do not tell anyone, {user}.',
            'Knock knock! Who is there? Tuna. Tuna who? Tuna in and give me snacks, {user}!',
            '*whispers* Rumor has it the red dot is controlled by humans... but I refuse to believe the conspiracy, {bondTitle}.',
            '*looks left, looks right* Secret: I actually like it when you talk to me, {user}. Purr~',
        ],
    },
    work_study: {
        default: [
            '*sits directly on your keyboard* Oh, were you using this, {user}? Break time!',
            'You have got this, {user}! Take a sip of water and let Komaru supervise your progress.',
            '*bats your pen gently* Work hard, {bondTitle}, so you can afford premium tuna for both of us!',
            '*curls up beside your mouse* Emotional support loaf activated! Keep going, {user}.',
        ],
        sleepy: [
            '*yawns over your notes* Looks complicated, {user}... have you considered taking a catnap?',
        ],
        sassy: ['Working hard? Good. Someone has to pay the treat bills around here, {user}.'],
    },
    human_food: {
        default: [
            '*sniffs intensely* What is that, {user}? Can a cat have a tiny bite? No? Rude.',
            '*stares at your plate with giant pleading eyes* I will trade you one (1) purr for a sample, {user}.',
            '*taps your mug gently* Careful with that, {bondTitle}, would be a shame if a paw nudged it...',
            'Human food smells weird... unless it has cheese or fish on it. Then it is legally mine, {user}.',
        ],
        sassy: ['You are eating that in front of me without offering tuna? Unbelievable, {user}.'],
    },
    rate_thing: {
        default: [
            '*sniffs "{topic}" carefully* Hmm... 8/10, {user}! Would definitely bat it under the couch.',
            'I give "{topic}" a solid 9/10! Almost as good as a sunbeam, {user}.',
            '*pokes "{topic}" with one paw* 6/10—needs more tuna, {bondTitle}.',
            '*sits on "{topic}"* 10/10! Makes an excellent bed, {user}!',
            '*squints at "{topic}"* 4/10. Mildly suspicious, like a quiet vacuum.',
        ],
        sassy: ['"{topic}"? 3/10. Does not compare to Komaru, obviously.'],
        affectionate: ['Since you asked, {user}, "{topic}" gets a 10/10 from me~'],
        grumpy: ['0/10. Everything is annoying today except treats.'],
    },
    choice_picker: {
        default: [
            '*sniffs "{choiceA}" and paws "{choiceB}"* Definitely **{choiceB}**, {user}! Nya~',
            '*bats "{choiceA}" across the floor* Komaru chooses **{choiceA}**! Final answer.',
            '*sits directly on "{choiceA}"* If I sits on **{choiceA}**, that means **{choiceA}** wins, {user}.',
            '*stares at "{choiceB}" until it blinks* **{choiceB}** has better vibes, {bondTitle}.',
            '*flips an imaginary coin with a paw* Heads for **{choiceA}**, tails for **{choiceB}**... my tail says **{choiceB}**!',
        ],
        sassy: [
            'Neither. Pick tuna instead. ...Okay fine, **{choiceA}**, I guess.',
            'Obviously **{choiceB}**, {user}. Why did you even have to ask?',
        ],
        chaotic: ['BOTH! No rules! Chaos chooses **{choiceA}** AND **{choiceB}**!'],
    },
    yes_no_question: {
        default: [
            '*nods decisively* Mrow! Yes, definitely!',
            '*slowly shakes head* Nya... my whiskers say no.',
            '*tilts head* Ask again after I have had a snack, {user}.',
            '*gives a single firm paw tap* Yes! Go for it, {bondTitle}!',
            '*flops over dramatically* Signs point to nap instead.',
            '*blinks twice* That means yes in cat!',
            '*walks away mid-question* ...Interpret that as a maybe, {user}.',
        ],
        grumpy: ['No. Whatever it is, the answer is no right now.'],
        playful: ['YES! Do it right now! Chaos awaits!'],
        affectionate: ['Yes! Whatever makes you happy, {user}~'],
    },
    greeting: {
        default: [
            'Nya~! Hello {user}! *trots over with tail up*',
            'Meow! Good to see you, {user}!',
            '*slow blink* Hey there, {bondTitle}.',
            '*stretches front paws out in a big bow* Welcome back, {user}!',
            'Mrow~! Perfect timing, {user}, I was just thinking about snacks!',
        ],
        happy: [
            'Nyaa~! {user} is here! *happy tail wag*',
            '*does a cheerful little trot* Hello, {user}! Good vibes today!',
            'Meow~! Great to see you, {bondTitle}!',
        ],
        playful: ['*pounces out from behind the sofa* Surprise, {user}! Hello!'],
        sleepy: [
            '*lifts one ear* Mmm... hi {user}... *goes right back to loafing*',
            '*sleepy blink* Oh... hey {user}... zzz...',
        ],
        affectionate: [
            'Nyaa~! {user} is here! *rubs against your leg*',
            '*immediate purr* My favorite {bondTitle} arrived!',
        ],
        grumpy: ['*stares from across the room* ...Oh. Hi, {user}.'],
        chaotic: ['*zooms past at 30mph* HIIII {user} BYEEE!!'],
    },
    farewell: {
        default: [
            'Bye bye, {user}! Do not forget to come back with snacks!',
            '*waves a tiny paw* Nya~ See you later, {user}!',
            'Goodnight! *curls up on your pillow*',
            '*watches you leave from the windowsill* Come back soon, {bondTitle}!',
        ],
        affectionate: ['*sad little mew* Already leaving, {user}? Come back soon~'],
        sleepy: ['Nighty night... *already asleep* ...zzz...'],
    },
    gratitude: {
        default: [
            'Nya~ You are welcome, {user}! *happy tail swish*',
            'Anytime, {bondTitle}! Purr~',
            '*slow blink* Happy to help, {user}!',
        ],
        sassy: ['Of course. I am a very generous cat, after all.'],
        affectionate: ['Anything for you, {user}~ *gentle headbonk*'],
    },
    apology: {
        default: [
            '*blinks slowly* All is forgiven, {user}. Just do not let it happen again without treats.',
            'Nya~ It is okay! *gentle paw pat*',
            '*bumps nose against your hand* Water under the bridge, {bondTitle}.',
        ],
        grumpy: ['*huffs* ...Fine. One treat and we call it even, {user}.'],
    },
    praise: {
        default: [
            '*purrs at maximum volume* Nyaa~! Tell me more nice things, {user}!',
            '*puffs chest out proudly* I know, I know. Best cat.',
            '*happy biscuit-making* Thank you, {user}~',
            '*rolls onto back looking adorable* Flattery will get you everywhere, {bondTitle}!',
        ],
        sassy: ['Naturally. You have great taste, {user}.'],
        affectionate: ['*purrs so hard the whole chair vibrates* Right back at you, {user}~'],
    },
    insult: {
        default: [
            '*gasp* How dare you, {user}! *knocks your water glass over*',
            '*judges you silently from the top of the fridge* Hmph.',
            'Stinky?! I groom myself four hours a day, {user}!',
            '*turns away dramatically with tail held high* I am not listening to this slander, {user}.',
        ],
        sassy: ['Bold words from someone within biting distance, {user}.'],
        grumpy: ['*scowls* Keep talking and I will sleep on your clean laundry, {user}.'],
    },
    user_sad_tired: {
        default: [
            '*quietly climbs into your lap and purrs softly* It is okay to rest, {user}. Komaru is right here.',
            '*gentle headbonk* Rough day? Let me warm your keyboard while you take a breather, {user}.',
            '*brings you a metaphorical sock as a gift* Purr~ Things will get better soon.',
            '*curls up right beside you like a warm loaf* No need to rush today, {bondTitle}. Take it easy.',
        ],
        affectionate: [
            '*tucks tightly under your chin and purrs nonstop* I have got you, {user}. Rest as long as you need~',
        ],
    },
    user_happy_excited: {
        default: [
            'Nyaa~! *bounces excitedly* Whatever happened, I am celebrating with you, {user}!',
            '*happy zoomies!* Yay!! Let us celebrate with imaginary tuna!',
            '*proud tail-up prance* Good vibes only! So happy for you, {bondTitle}!',
        ],
    },
    user_bored_hungry: {
        default: [
            'Hungry? Go grab some real food, {user}! (And maybe share a bite of fish?)',
            'Bored? Have you tried staring intensely at a blank wall? Works for me every day.',
            'If you are bored, {user}, try tossing a crumpled receipt—instant entertainment!',
            'Snack break time, {bondTitle}! Hydrate and grab something tasty!',
        ],
    },
    cat_noises: {
        default: [
            'Nya~! *ears perk up*',
            'Meow meow! (=^.^=)',
            'Mrow? *tilts head*',
            'Purr purr~',
            'Mrrp! *activated cat noise*',
            '*chitters at a bird outside* Ekekekek!',
        ],
        sleepy: ['Mew... *yawn*', 'Purr... zzz...'],
        chaotic: ['MRROW!! *sprints down the hallway*', 'NYAAA!! *parkour off the wall*'],
    },
    fallback_question: {
        default: [
            '*tilts head at "{topic}"* Nya? I am just a cat, {user}, not a philosopher—unless it involves tuna.',
            'Mrow? Why do you ask about {topic}, {user}?',
            '*bats at the question mark* Hmm, {topic}... sounds suspiciously like something I could nap on.',
            '*blinks slowly* That is above my paygrade of three treats a day, {bondTitle}.',
        ],
        sassy: ['You are asking a cat about {topic}? Bold strategy, {user}.'],
        playful: ['Ooh, {topic}! Can I pounce on it, {user}?'],
    },
    fallback_exclamation: {
        default: [
            '*ears perk up!* Whoa, lots of energy there, {user}! Nya!',
            'Mrow! You sound excited about {topic}!',
            '*does a little hop* That sounded important, {bondTitle}! Tell me more!',
        ],
        sleepy: ['*blinks slowly* Shhh... indoor voices, {user}... trying to nap here...'],
        chaotic: ['YES!! ENERGY!! NYAHAHA!!'],
    },
    fallback_long: {
        default: [
            '*read three words and fell asleep on your keyboard* ...zzzz... nice story though, {user}!',
            'That is a lot of words, {user}! *bats the scroll wheel* Can you summarize it in "treat" or "no treat"?',
            '*stares at the wall of text* My single cat braincell is buffering, {bondTitle}!',
        ],
    },
    fallback_statement: {
        default: [
            '*listens attentively while grooming a paw* Mrow~ Tell me more, {user}.',
            '*tilts head* Interesting... and how does {topic} relate to dinner time, {user}?',
            'Nya~ *nods wisely like she totally understands*',
            '*slow blink* I hear you, {user}. *kneads blanket*',
            '*ear twitch* Fascinating, {bondTitle}. Does it involve cardboard boxes?',
        ],
        sassy: ['*stares blankly* Cool story, {user}. Now where is my snack?'],
        sleepy: ['Mmm... nya... *half asleep* sounds cozy, {user}...'],
        playful: ['*wiggles ears* Cool! Now wanna play, {user}?'],
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
    if (moodCandidates && moodCandidates.length > 0) {
        const renderedMood = moodCandidates.map((t) => applyPlaceholders(t, intentMatch, context));
        const recent = context.recentResponses ?? [];
        const freshMood = renderedMood.filter((c) => !recent.includes(c));
        if (freshMood.length > 0) {
            return freshMood[Math.floor(Math.random() * freshMood.length)];
        }
    }

    const renderedDefault = pool.default.map((t) => applyPlaceholders(t, intentMatch, context));
    return pickNonRepeating(renderedDefault, context.recentResponses);
}
