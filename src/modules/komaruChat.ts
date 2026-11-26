import { commandRegistry } from '../commandRegistry';
import { BotModule } from '../moduleLoader';
import { komaruChatService } from '../services/komaruChatService';

const moduleDefinition: BotModule = {
    name: 'komaruChat',
    description: 'Rule-based Komaru the Cat conversational chatbot with mood and bond system',
    help: {
        summary: 'Chat with Komaru the Cat (mood-driven, non-LLM)',
        description:
            'Talk to Komaru by mentioning "komaru" in chat, replying to her messages, or using /chat. Komaru reacts based on her current mood (happy, playful, sleepy, affectionate, sassy, chaotic, grumpy) and tracks your bond.',
        usage: '/chat <message> | /komaru_mood | /komaru_interact <action> | /komaru_nickname [nickname] | /komaru_channel <mode>',
        commands: [
            {
                name: 'chat',
                description: 'Send a message directly to Komaru the Cat',
                usage: '/chat <message>',
            },
            {
                name: 'komaru_mood',
                description: "Check Komaru's current mood, stats, and your bond level",
                usage: '/komaru_mood',
            },
            {
                name: 'komaru_interact',
                description:
                    'Interact with Komaru (pet, belly_rub, boop, brush, cuddle, box, treat, play, catnip, nap)',
                usage: '/komaru_interact <action>',
            },
            {
                name: 'komaru_nickname',
                description:
                    'Set, view, or clear your custom nickname from Komaru (unlocks at Trusted Friend)',
                usage: '/komaru_nickname [nickname] [clear]',
            },
            {
                name: 'komaru_channel',
                description: 'Enable or disable passive Komaru chat in this channel (Admin/Mod)',
                usage: '/komaru_channel <enable|disable|status>',
            },
        ],
        examples: [
            'komaru, how are you?',
            'komaru pizza or tacos?',
            '/chat give komaru a treat',
            '/komaru_interact action:treat',
            '/komaru_mood',
        ],
    },
    register: async (client: any) => {
        commandRegistry.register({
            name: 'chat',
            description: 'Talk directly to Komaru the Cat',
            options: [
                {
                    name: 'message',
                    description: 'What do you want to say to Komaru?',
                    type: 3, // STRING
                    required: true,
                },
            ],
            handler: async (interaction: any) => {
                await komaruChatService.handleChatCommand(interaction);
            },
        });

        commandRegistry.register({
            name: 'komaru_mood',
            description: "Check Komaru's current mood, energy, hunger, and your bond",
            handler: async (interaction: any) => {
                await komaruChatService.handleMoodCommand(interaction);
            },
        });

        commandRegistry.register({
            name: 'komaru_interact',
            description: 'Interact with Komaru to affect her mood',
            options: [
                {
                    name: 'action',
                    description: 'How do you want to interact with Komaru?',
                    type: 3, // STRING
                    required: true,
                    choices: [
                        { name: 'Pet', value: 'pet' },
                        { name: 'Rub Belly', value: 'belly_rub' },
                        { name: 'Boop Nose', value: 'boop' },
                        { name: 'Brush Fur', value: 'brush' },
                        { name: 'Cuddle', value: 'cuddle' },
                        { name: 'Give Cardboard Box', value: 'box' },
                        { name: 'Give Treat', value: 'treat' },
                        { name: 'Play', value: 'play' },
                        { name: 'Give Catnip', value: 'catnip' },
                        { name: 'Let Nap', value: 'nap' },
                    ],
                },
            ],
            handler: async (interaction: any) => {
                await komaruChatService.handleInteractCommand(interaction);
            },
        });

        commandRegistry.register({
            name: 'komaru_nickname',
            description: 'Set, view, or clear the nickname Komaru calls you',
            options: [
                {
                    name: 'nickname',
                    description: 'Nickname Komaru should call you (requires Trusted Friend bond)',
                    type: 3, // STRING
                    required: false,
                },
                {
                    name: 'clear',
                    description: 'Clear your custom Komaru nickname',
                    type: 5, // BOOLEAN
                    required: false,
                },
            ],
            handler: async (interaction: any) => {
                await komaruChatService.handleNicknameCommand(interaction);
            },
        });

        commandRegistry.register({
            name: 'komaru_channel',
            description: 'Configure passive Komaru chat in the current channel',
            options: [
                {
                    name: 'mode',
                    description: 'Enable, disable, or check status for this channel',
                    type: 3, // STRING
                    required: true,
                    choices: [
                        { name: 'enable', value: 'enable' },
                        { name: 'disable', value: 'disable' },
                        { name: 'status', value: 'status' },
                    ],
                },
            ],
            handler: async (interaction: any) => {
                await komaruChatService.handleChannelCommand(interaction);
            },
        });

        client.on('messageCreate', async (message: any) => {
            await komaruChatService.handleMessage(message, client.user?.id);
        });
    },
};

export default moduleDefinition;
export const module = moduleDefinition;
