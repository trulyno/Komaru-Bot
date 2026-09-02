import { commandRegistry } from '../commandRegistry';
import { logger } from '../logger';
import {
    archiveTicket,
    buildTicketModal,
    checkInactivityReminders,
    createTicket,
    deleteTicket,
    loadTickets,
    updateTicketActivity,
} from '../services/ticketService';
import { canModerate } from '../services/auditLogService';

let reminderIntervalTimer: NodeJS.Timeout | null = null;

const moduleDefinition = {
    name: 'tickets',
    description: 'Cat-ified support ticket system with form submission, channel access controls, and activity reminders',
    register: async (client: any) => {
        commandRegistry.register({
            name: 'ticket',
            description: 'Open a support ticket form or manage existing tickets meow',
            options: [
                {
                    name: 'action',
                    description: 'Optional action: archive, delete, or status (leave blank to open ticket form)',
                    type: 3, // STRING
                    required: false,
                    choices: [
                        { name: 'Archive Current Ticket 📦', value: 'archive' },
                        { name: 'Delete Current Ticket 🗑️', value: 'delete' },
                        { name: 'Ticket Status 🐾', value: 'status' },
                    ],
                },
            ],
            handler: async (interaction: any) => {
                if (!interaction.guild) {
                    await interaction.reply({
                        content: 'Meow! 🐾 Tickets can only be created within a server purr!',
                        ephemeral: true,
                    });
                    return;
                }

                const action = interaction.options?.getString?.('action');

                if (!action) {
                    // Open the modal form for creating a ticket
                    const modal = buildTicketModal();
                    await interaction.showModal(modal);
                    return;
                }

                const channelId = interaction.channelId;
                const store = loadTickets();
                const ticket = store.tickets.find((t) => t.channelId === channelId && t.status !== 'deleted');

                if (action === 'status') {
                    if (!ticket) {
                        await interaction.reply({
                            content: 'Meow! 🐾 No active ticket found in this channel purr.',
                            ephemeral: true,
                        });
                        return;
                    }
                    await interaction.reply({
                        content: `🐾 **Ticket #${ticket.id} Status**: ${ticket.status.toUpperCase()} meow!\nSubject: ${ticket.subject}\nCreator: <@${ticket.creatorId}>`,
                        ephemeral: true,
                    });
                    return;
                }

                if (!ticket) {
                    await interaction.reply({
                        content: 'Meow! 🐾 This command action can only be run inside a ticket channel purr.',
                        ephemeral: true,
                    });
                    return;
                }

                const isCreator = ticket.creatorId === interaction.user.id;
                const isStaff = canModerate(interaction.member);

                if (!isCreator && !isStaff) {
                    await interaction.reply({
                        content: 'Meow! 🐾 Only the ticket creator or staff members can manage this ticket purr!',
                        ephemeral: true,
                    });
                    return;
                }

                if (action === 'archive') {
                    await interaction.deferReply({ ephemeral: true });
                    const archived = await archiveTicket(interaction.guild, ticket.id, interaction.user);
                    if (archived) {
                        await interaction.editReply('📦 Ticket archived purr-fectly! User access has been revoked meow.');
                    } else {
                        await interaction.editReply('Meow! 🐾 Unable to archive ticket (it may already be archived or deleted).');
                    }
                } else if (action === 'delete') {
                    await interaction.deferReply({ ephemeral: true });
                    const deleted = await deleteTicket(interaction.guild, ticket.id, interaction.user);
                    if (deleted) {
                        await interaction.editReply('🗑️ Ticket marked for deletion meow! Channel will close shortly.');
                    } else {
                        await interaction.editReply('Meow! 🐾 Unable to delete ticket.');
                    }
                }
            },
        });

        // Listen for Modal Submissions and Button Interactions
        client.on('interactionCreate', async (interaction: any) => {
            try {
                if (interaction.isModalSubmit?.()) {
                    if (interaction.customId === 'ticket_modal') {
                        if (!interaction.guild) {
                            await interaction.reply({
                                content: 'Meow! 🐾 Tickets can only be created inside a server purr!',
                                ephemeral: true,
                            });
                            return;
                        }

                        await interaction.deferReply({ ephemeral: true });

                        const subject = interaction.fields.getTextInputValue('ticket_subject');
                        const description = interaction.fields.getTextInputValue('ticket_description');

                        const { ticket, channel } = await createTicket(
                            interaction.guild,
                            { id: interaction.user.id, tag: interaction.user.tag ?? interaction.user.username, user: interaction.user },
                            subject,
                            description,
                        );

                        await interaction.editReply(
                            `Meow! 🐾 Your support ticket **#${ticket.id}** has been created purr-fectly! Head over to <#${channel.id}> meow!`,
                        );
                    }
                } else if (interaction.isButton?.()) {
                    const customId = interaction.customId ?? '';

                    if (customId.startsWith('ticket_archive_')) {
                        const ticketId = customId.replace('ticket_archive_', '');
                        const store = loadTickets();
                        const ticket = store.tickets.find((t) => t.id === ticketId);

                        if (!ticket) {
                            await interaction.reply({ content: 'Meow! 🐾 Ticket not found purr.', ephemeral: true });
                            return;
                        }

                        const isCreator = ticket.creatorId === interaction.user.id;
                        const isStaff = canModerate(interaction.member);

                        if (!isCreator && !isStaff) {
                            await interaction.reply({
                                content: 'Meow! 🐾 Only the ticket creator or staff members can archive this ticket purr!',
                                ephemeral: true,
                            });
                            return;
                        }

                        await interaction.deferReply({ ephemeral: true });
                        const archived = await archiveTicket(interaction.guild, ticketId, interaction.user);
                        if (archived) {
                            await interaction.editReply('📦 Ticket archived purr-fectly! Access for the creator has been revoked meow.');
                        } else {
                            await interaction.editReply('Meow! 🐾 Unable to archive ticket (it might already be archived or deleted).');
                        }
                    } else if (customId.startsWith('ticket_delete_')) {
                        const ticketId = customId.replace('ticket_delete_', '');
                        const store = loadTickets();
                        const ticket = store.tickets.find((t) => t.id === ticketId);

                        if (!ticket) {
                            await interaction.reply({ content: 'Meow! 🐾 Ticket not found purr.', ephemeral: true });
                            return;
                        }

                        const isCreator = ticket.creatorId === interaction.user.id;
                        const isStaff = canModerate(interaction.member);

                        if (!isCreator && !isStaff) {
                            await interaction.reply({
                                content: 'Meow! 🐾 Only the ticket creator or staff members can delete this ticket purr!',
                                ephemeral: true,
                            });
                            return;
                        }

                        await interaction.deferReply({ ephemeral: true });
                        const deleted = await deleteTicket(interaction.guild, ticketId, interaction.user);
                        if (deleted) {
                            await interaction.editReply('🗑️ Ticket scheduled for deletion meow!');
                        } else {
                            await interaction.editReply('Meow! 🐾 Unable to delete ticket.');
                        }
                    }
                }
            } catch (error) {
                logger.error(`Error in ticket interaction listener: ${error}`);
            }
        });

        // Listen for messages in ticket channels to update activity
        client.on('messageCreate', async (message: any) => {
            if (!message || message.author?.bot || !message.channel?.id) return;
            try {
                await updateTicketActivity(message.channel.id);
            } catch (error) {
                logger.error(`Error updating ticket activity on message: ${error}`);
            }
        });

        // Start background interval timer for inactivity reminders (every 15 minutes)
        if (reminderIntervalTimer) {
            clearInterval(reminderIntervalTimer);
        }
        reminderIntervalTimer = setInterval(async () => {
            try {
                await checkInactivityReminders(client);
            } catch (error) {
                logger.error(`Error in ticket inactivity check loop: ${error}`);
            }
        }, 15 * 60 * 1000);
    },
};

export default moduleDefinition;
export const module = moduleDefinition;
