import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    Colors,
    EmbedBuilder,
    ModalBuilder,
    PermissionFlagsBits,
    TextInputBuilder,
    TextInputStyle,
} from 'discord.js';
import fs from 'node:fs';
import path from 'node:path';
import { logger } from '../logger';
import { config } from '../config';
import { getConfiguredRoleNames, sendAuditLog } from './auditLogService';

export interface TicketData {
    id: string;
    guildId: string;
    channelId: string;
    creatorId: string;
    creatorTag: string;
    subject: string;
    description: string;
    status: 'open' | 'archived' | 'deleted';
    createdAt: number;
    lastActivityAt: number;
    lastReminderAt?: number;
    archivedAt?: number;
    archivedBy?: string;
    deletedAt?: number;
    deletedBy?: string;
}

export interface TicketStore {
    tickets: TicketData[];
    counter: number;
}

const DEFAULT_DATA_DIR = path.resolve(__dirname, '../../data/tickets');
export const DEFAULT_INACTIVITY_HOURS = 24;

export function getTicketsFilePath(dataDir = DEFAULT_DATA_DIR): string {
    return path.join(dataDir, 'tickets.json');
}

export function loadTickets(dataDir = DEFAULT_DATA_DIR): TicketStore {
    const filePath = getTicketsFilePath(dataDir);
    if (!fs.existsSync(filePath)) {
        return { tickets: [], counter: 0 };
    }
    try {
        const raw = fs.readFileSync(filePath, 'utf8');
        const data = JSON.parse(raw);
        return {
            tickets: Array.isArray(data.tickets) ? data.tickets : [],
            counter: typeof data.counter === 'number' ? data.counter : data.tickets?.length || 0,
        };
    } catch (error) {
        logger.error(`Failed to load tickets from ${filePath}: ${error}`);
        return { tickets: [], counter: 0 };
    }
}

export function saveTickets(store: TicketStore, dataDir = DEFAULT_DATA_DIR): void {
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }
    const filePath = getTicketsFilePath(dataDir);
    try {
        fs.writeFileSync(filePath, JSON.stringify(store, null, 2), 'utf8');
    } catch (error) {
        logger.error(`Failed to save tickets to ${filePath}: ${error}`);
    }
}

export function catifyText(text: string): string {
    if (text.includes('meow') || text.includes('purr') || text.includes('🐾') || text.includes('🐱')) {
        return text;
    }
    return `Meow! 🐾 ${text} Purr!`;
}

export function buildTicketModal(): ModalBuilder {
    const modal = new ModalBuilder()
        .setCustomId('ticket_modal')
        .setTitle('🐾 Meow! Support Ticket Form 🐱');

    const subjectInput = new TextInputBuilder()
        .setCustomId('ticket_subject')
        .setLabel('Subject / Issue Title meow')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Briefly state your question or issue purr...')
        .setRequired(true)
        .setMaxLength(100);

    const descriptionInput = new TextInputBuilder()
        .setCustomId('ticket_description')
        .setLabel('Ticket Details & Context')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Provide all details so the staff team can assist you meow...')
        .setRequired(true)
        .setMaxLength(1000);

    const row1 = new ActionRowBuilder<TextInputBuilder>().addComponents(subjectInput);
    const row2 = new ActionRowBuilder<TextInputBuilder>().addComponents(descriptionInput);

    modal.addComponents(row1, row2);
    return modal;
}

export function buildTicketEmbed(ticket: TicketData): EmbedBuilder {
    const isArchived = ticket.status === 'archived';
    const isDeleted = ticket.status === 'deleted';

    let statusString = '🟢 Open & Active meow';
    if (isArchived) statusString = '📦 Archived (Creator access revoked) meow';
    if (isDeleted) statusString = '🗑️ Deleted meow';

    return new EmbedBuilder()
        .setTitle(`🐾 Ticket #${ticket.id}: ${ticket.subject}`)
        .setDescription(ticket.description)
        .setColor(isArchived ? Colors.Grey : isDeleted ? Colors.Red : Colors.Gold)
        .addFields(
            { name: '👤 Creator', value: `<@${ticket.creatorId}> (${ticket.creatorTag})`, inline: true },
            { name: '📌 Status', value: statusString, inline: true },
            { name: '🕒 Created At', value: `<t:${Math.floor(ticket.createdAt / 1000)}:F>`, inline: false },
        )
        .setFooter({ text: 'Komaru Support System 🐾 | Purr-fect assistance' })
        .setTimestamp();
}

export function buildTicketActionRow(ticket: TicketData): ActionRowBuilder<ButtonBuilder> {
    const isArchived = ticket.status === 'archived';
    const isDeleted = ticket.status === 'deleted';

    const archiveButton = new ButtonBuilder()
        .setCustomId(`ticket_archive_${ticket.id}`)
        .setLabel('Archive Ticket 📦')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(isArchived || isDeleted);

    const deleteButton = new ButtonBuilder()
        .setCustomId(`ticket_delete_${ticket.id}`)
        .setLabel('Delete Ticket 🗑️')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(isDeleted);

    return new ActionRowBuilder<ButtonBuilder>().addComponents(archiveButton, deleteButton);
}

export function getStaffRoles(guild: any): any[] {
    if (!guild?.roles?.cache) return [];
    const config = getConfiguredRoleNames();

    return guild.roles.cache.filter((role: any) => {
        const nameLower = role.name.toLowerCase();
        if (config.moderator && (role.id === config.moderator || nameLower === config.moderator.toLowerCase())) {
            return true;
        }
        if (config.admin && (role.id === config.admin || nameLower === config.admin.toLowerCase())) {
            return true;
        }
        if (nameLower.includes('moderator') || nameLower.includes('mod') || nameLower.includes('admin')) {
            return true;
        }
        if (role.permissions?.has?.(PermissionFlagsBits.Administrator)) {
            return true;
        }
        return false;
    });
}

export function calculateOpenTicketPermissions(guild: any, creatorId: string): any[] {
    const overwrites: any[] = [
        {
            id: guild.roles.everyone.id,
            deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
        },
        {
            id: creatorId,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.AttachFiles,
                PermissionFlagsBits.EmbedLinks,
            ],
        },
    ];

    const staffRoles = getStaffRoles(guild);
    staffRoles.forEach((role: any) => {
        overwrites.push({
            id: role.id,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.ManageMessages,
                PermissionFlagsBits.AttachFiles,
                PermissionFlagsBits.EmbedLinks,
            ],
        });
    });

    if (guild.members?.me?.id) {
        overwrites.push({
            id: guild.members.me.id,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.ManageChannels,
                PermissionFlagsBits.ManageMessages,
                PermissionFlagsBits.EmbedLinks,
            ],
        });
    }

    return overwrites;
}

export async function createTicket(
    guild: any,
    creator: { id: string; tag: string; user?: any },
    subject: string,
    description: string,
    dataDir = DEFAULT_DATA_DIR,
): Promise<{ ticket: TicketData; channel: any }> {
    const store = loadTickets(dataDir);
    store.counter += 1;
    const ticketId = String(store.counter).padStart(4, '0');

    const cleanSubject = subject.trim();
    const cleanDescription = description.trim();

    const channelName = `ticket-${creator.user?.username ?? creator.tag ?? 'user'}-${ticketId}`
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-');

    const permissionOverwrites = calculateOpenTicketPermissions(guild, creator.id);

    const channel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        permissionOverwrites,
        topic: `Support ticket #${ticketId} created by ${creator.tag} meow. Subject: ${cleanSubject}`,
    });

    const now = Date.now();
    const ticket: TicketData = {
        id: ticketId,
        guildId: guild.id,
        channelId: channel.id,
        creatorId: creator.id,
        creatorTag: creator.tag,
        subject: cleanSubject,
        description: cleanDescription,
        status: 'open',
        createdAt: now,
        lastActivityAt: now,
    };

    store.tickets.push(ticket);
    saveTickets(store, dataDir);

    const embed = buildTicketEmbed(ticket);
    const actionRow = buildTicketActionRow(ticket);

    await channel.send({
        content: `Meow! 🐾 Welcome <@${creator.id}>! A staff member will be with you shortly purr.`,
        embeds: [embed],
        components: [actionRow],
    });

    await sendAuditLog(
        guild,
        '🐾 Ticket Created',
        `A new support ticket has been opened meow!`,
        [
            { name: 'Ticket ID', value: `#${ticketId}` },
            { name: 'Creator', value: `<@${creator.id}> (${creator.tag})` },
            { name: 'Channel', value: `<#${channel.id}>` },
            { name: 'Subject', value: cleanSubject },
        ],
    );

    return { ticket, channel };
}

export async function archiveTicket(
    guild: any,
    ticketId: string,
    actor: { id: string; tag: string },
    dataDir = DEFAULT_DATA_DIR,
): Promise<TicketData | null> {
    const store = loadTickets(dataDir);
    const ticket = store.tickets.find((t) => t.id === ticketId);
    if (!ticket || ticket.status !== 'open') {
        return null;
    }

    ticket.status = 'archived';
    ticket.archivedAt = Date.now();
    ticket.archivedBy = actor.id;
    saveTickets(store, dataDir);

    const channel = guild.channels.cache.get(ticket.channelId) ?? (await guild.channels.fetch(ticket.channelId).catch(() => null));
    if (channel) {
        try {
            await channel.permissionOverwrites.edit(ticket.creatorId, {
                ViewChannel: false,
                SendMessages: false,
            });

            await channel.setName(`archived-ticket-${ticket.id}`);
            await channel.setTopic(`[ARCHIVED] Support ticket #${ticket.id} meow.`);

            const embed = buildTicketEmbed(ticket);
            const actionRow = buildTicketActionRow(ticket);

            await channel.send({
                content: `📦 **Ticket Archived meow!** Access for creator <@${ticket.creatorId}> has been revoked purr. Archived by <@${actor.id}>.`,
                embeds: [embed],
                components: [actionRow],
            });
        } catch (error) {
            logger.error(`Failed to update channel for archived ticket ${ticketId}: ${error}`);
        }
    }

    await sendAuditLog(
        guild,
        '📦 Ticket Archived',
        `Ticket #${ticketId} has been archived meow.`,
        [
            { name: 'Ticket ID', value: `#${ticketId}` },
            { name: 'Archived By', value: `<@${actor.id}> (${actor.tag})` },
            { name: 'Creator', value: `<@${ticket.creatorId}>` },
            { name: 'Channel', value: channel ? `<#${channel.id}>` : ticket.channelId },
        ],
    );

    return ticket;
}

export async function deleteTicket(
    guild: any,
    ticketId: string,
    actor: { id: string; tag: string },
    dataDir = DEFAULT_DATA_DIR,
): Promise<TicketData | null> {
    const store = loadTickets(dataDir);
    const ticket = store.tickets.find((t) => t.id === ticketId);
    if (!ticket || ticket.status === 'deleted') {
        return null;
    }

    ticket.status = 'deleted';
    ticket.deletedAt = Date.now();
    ticket.deletedBy = actor.id;
    saveTickets(store, dataDir);

    const channel = guild.channels.cache.get(ticket.channelId) ?? (await guild.channels.fetch(ticket.channelId).catch(() => null));

    await sendAuditLog(
        guild,
        '🗑️ Ticket Deleted',
        `Ticket #${ticketId} has been deleted meow!`,
        [
            { name: 'Ticket ID', value: `#${ticketId}` },
            { name: 'Deleted By', value: `<@${actor.id}> (${actor.tag})` },
            { name: 'Creator', value: `<@${ticket.creatorId}>` },
            { name: 'Subject', value: ticket.subject },
        ],
    );

    if (channel) {
        try {
            await channel.send({
                content: `🗑️ **Ticket deleting in 5 seconds meow...** Purr-bye!`,
            });
            setTimeout(async () => {
                await channel.delete('Ticket deleted').catch((err: any) => logger.warn(`Failed to delete channel: ${err}`));
            }, 5000);
        } catch (error) {
            logger.error(`Error deleting channel for ticket ${ticketId}: ${error}`);
        }
    }

    return ticket;
}

export async function updateTicketActivity(
    channelId: string,
    dataDir = DEFAULT_DATA_DIR,
): Promise<void> {
    const store = loadTickets(dataDir);
    const ticket = store.tickets.find((t) => t.channelId === channelId && t.status === 'open');
    if (ticket) {
        ticket.lastActivityAt = Date.now();
        saveTickets(store, dataDir);
    }
}

export async function checkInactivityReminders(
    client: any,
    dataDir = DEFAULT_DATA_DIR,
): Promise<number> {
    const inactivityHours = config.env.ticketInactivityHours;
    const inactivityMs = inactivityHours * 60 * 60 * 1000;
    const now = Date.now();

    const store = loadTickets(dataDir);
    let remindedCount = 0;

    for (const ticket of store.tickets) {
        if (ticket.status !== 'open') continue;

        const timeSinceActivity = now - ticket.lastActivityAt;
        const timeSinceLastReminder = ticket.lastReminderAt ? now - ticket.lastReminderAt : Infinity;

        if (timeSinceActivity >= inactivityMs && timeSinceLastReminder >= inactivityMs) {
            try {
                const guild = client.guilds.cache.get(ticket.guildId) ?? (await client.guilds.fetch(ticket.guildId).catch(() => null));
                if (!guild) continue;

                const channel = guild.channels.cache.get(ticket.channelId) ?? (await guild.channels.fetch(ticket.channelId).catch(() => null));
                if (!channel) continue;

                await channel.send({
                    content: `Meow! 🐾 <@${ticket.creatorId}> This ticket has been quiet for over ${inactivityHours} hour(s) meow! Do you still need help purr? Staff is here to assist!`,
                });

                ticket.lastReminderAt = now;
                remindedCount++;

                await sendAuditLog(
                    guild,
                    '🐾 Ticket Inactivity Reminder',
                    `Inactivity reminder sent for ticket #${ticket.id} meow.`,
                    [
                        { name: 'Ticket ID', value: `#${ticket.id}` },
                        { name: 'Channel', value: `<#${channel.id}>` },
                        { name: 'Inactive Duration', value: `${Math.round(timeSinceActivity / (1000 * 60 * 60))} hours` },
                    ],
                );
            } catch (error) {
                logger.error(`Error sending inactivity reminder for ticket ${ticket.id}: ${error}`);
            }
        }
    }

    if (remindedCount > 0) {
        saveTickets(store, dataDir);
    }

    return remindedCount;
}
