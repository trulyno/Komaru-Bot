import { commandRegistry } from '../commandRegistry';
import { UserTimezoneStore } from '../services/timezoneStore';
import {
    buildTimeReply,
    formatTimeForTimezone,
    isValidTimezone,
    ParsedTimeExpression,
    parseTimeExpression,
    TimeCommand,
} from '../utils/timeUtils';

export {
    UserTimezoneStore,
    parseTimeExpression,
    formatTimeForTimezone,
    isValidTimezone,
    buildTimeReply,
    ParsedTimeExpression,
    TimeCommand,
};

const timezoneStore = new UserTimezoneStore();

const moduleDefinition = {
    name: 'time',
    description: 'Get the current time or a user-specific time',
    register: async (client: any) => {
        commandRegistry.register({
            name: 'settimezone',
            description: 'Set your timezone for !mytime replies',
            options: [
                { name: 'timezone', description: 'Your IANA timezone', type: 3, required: true },
            ],
            handler: async (interaction: any) => {
                const timezone = interaction.options?.getString?.('timezone')?.trim();
                if (!timezone) {
                    await interaction.reply({
                        content: 'Usage: /settimezone <IANA timezone>',
                        ephemeral: true,
                    });
                    return;
                }

                if (!isValidTimezone(timezone)) {
                    await interaction.reply({
                        content:
                            'That does not look like a valid IANA timezone. Try something like America/New_York.',
                        ephemeral: true,
                    });
                    return;
                }

                timezoneStore.setUserTimezone(interaction.user.id, timezone);
                await interaction.reply({
                    content: `Your timezone has been set to ${timezone}.`,
                    ephemeral: true,
                });
            },
        });

        client.on('messageCreate', async (message: any) => {
            if (!message || message.author?.bot) {
                return;
            }

            const content = message.content ?? '';
            const match = content.match(/!time[^\n\r]*/i) ?? content.match(/!mytime[^\n\r]*/i);
            if (!match) {
                if (content.trim().startsWith('!settimezone')) {
                    const timezone = content.slice('!settimezone'.length).trim();
                    if (!timezone) {
                        await message.reply('Usage: !settimezone <IANA timezone>');
                        return;
                    }

                    if (!isValidTimezone(timezone)) {
                        await message.reply(
                            'That does not look like a valid IANA timezone. Try something like America/New_York.',
                        );
                        return;
                    }

                    timezoneStore.setUserTimezone(message.author.id, timezone);
                    await message.reply(`Your timezone has been set to ${timezone}.`);
                }
                return;
            }

            const expression = parseTimeExpression(match[0]);
            if (!expression) {
                return;
            }

            if (expression.command === 'mytime') {
                const timezone = timezoneStore.getUserTimezone(message.author.id);
                if (!timezone) {
                    await message.reply(
                        'You have not registered a timezone yet. Use !settimezone <IANA timezone> to register one.',
                    );
                    return;
                }

                await message.reply(buildTimeReply(expression, timezone));
                return;
            }

            await message.reply(buildTimeReply(expression));
        });
    },
};

export default moduleDefinition;
export const module = moduleDefinition;
