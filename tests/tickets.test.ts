import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PermissionFlagsBits } from 'discord.js';
import {
    archiveTicket,
    buildTicketActionRow,
    buildTicketEmbed,
    buildTicketModal,
    calculateOpenTicketPermissions,
    catifyText,
    checkInactivityReminders,
    createTicket,
    deleteTicket,
    loadTickets,
    saveTickets,
    updateTicketActivity,
} from '../src/services/ticketService';
import { runTestCase } from './testHarness';

async function runTicketTests() {
    await runTestCase('catifyText formatting', () => {
        const plain = 'System notification for ticket update.';
        const catified = catifyText(plain);
        assert.ok(catified.includes('Meow!'));
        assert.ok(catified.includes('Purr!'));

        const alreadyCat = 'Meow! 🐾 Ticket created purr!';
        assert.strictEqual(catifyText(alreadyCat), alreadyCat);
    });

    await runTestCase('buildTicketModal and builders', () => {
        const modal = buildTicketModal();
        assert.strictEqual(modal.data.custom_id, 'ticket_modal');
        assert.strictEqual(modal.components.length, 2);

        const fakeTicket = {
            id: '0001',
            guildId: 'g1',
            channelId: 'c1',
            creatorId: 'u1',
            creatorTag: 'User#1234',
            subject: 'Test Issue',
            description: 'Detailed description',
            status: 'open' as const,
            createdAt: Date.now(),
            lastActivityAt: Date.now(),
        };

        const embed = buildTicketEmbed(fakeTicket);
        assert.ok(embed.data.title?.includes('#0001'));
        assert.strictEqual(embed.data.description, 'Detailed description');

        const row = buildTicketActionRow(fakeTicket);
        assert.strictEqual(row.components.length, 2);
        assert.strictEqual((row.components[0].data as any).custom_id, 'ticket_archive_0001');
        assert.strictEqual((row.components[1].data as any).custom_id, 'ticket_delete_0001');
    });

    await runTestCase('calculateOpenTicketPermissions overwrites', () => {
        const mockGuild = {
            roles: {
                everyone: { id: 'everyone_role_id' },
                cache: [
                    { id: 'mod_role_id', name: 'Moderator' },
                    { id: 'admin_role_id', name: 'Administrator' },
                ],
            },
            members: { me: { id: 'bot_id' } },
        };

        const overwrites = calculateOpenTicketPermissions(mockGuild, 'creator_user_id');
        assert.ok(overwrites.length >= 4);

        const everyoneOv = overwrites.find((o) => o.id === 'everyone_role_id');
        assert.ok(everyoneOv.deny.includes(PermissionFlagsBits.ViewChannel));

        const creatorOv = overwrites.find((o) => o.id === 'creator_user_id');
        assert.ok(creatorOv.allow.includes(PermissionFlagsBits.ViewChannel));

        const modOv = overwrites.find((o) => o.id === 'mod_role_id');
        assert.ok(modOv.allow.includes(PermissionFlagsBits.ViewChannel));
    });

    await runTestCase('ticket creation, archiving, deletion and persistence lifecycle', async () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'komaru-ticket-test-'));

        try {
            let channelCreatedData: any = null;
            let permissionEdits: any[] = [];
            let channelDeleted = false;

            const mockChannel = {
                id: 'chan_999',
                send: async (msg: any) => msg,
                permissionOverwrites: {
                    edit: async (userOrRoleId: string, options: any) => {
                        permissionEdits.push({ userOrRoleId, options });
                    },
                },
                setName: async (name: string) => {
                    mockChannel.name = name;
                },
                setTopic: async (topic: string) => {
                    mockChannel.topic = topic;
                },
                delete: async () => {
                    channelDeleted = true;
                },
                name: 'ticket-testuser-0001',
                topic: 'topic',
            };

            const mockGuild = {
                id: 'guild_123',
                roles: {
                    everyone: { id: 'everyone_role' },
                    cache: [{ id: 'mod_role', name: 'Moderator' }],
                },
                members: { me: { id: 'bot_user' } },
                channels: {
                    create: async (data: any) => {
                        channelCreatedData = data;
                        return mockChannel;
                    },
                    cache: new Map([['chan_999', mockChannel]]),
                    fetch: async () => mockChannel,
                },
            };

            const creator = { id: 'user_456', tag: 'TestUser#0001' };

            // Create ticket
            const { ticket, channel } = await createTicket(
                mockGuild,
                creator,
                'Broken Command',
                'Help me meow!',
                tempDir,
            );

            assert.strictEqual(ticket.id, '0001');
            assert.strictEqual(ticket.status, 'open');
            assert.strictEqual(channel.id, 'chan_999');
            assert.ok(channelCreatedData);

            // Load saved store
            const store = loadTickets(tempDir);
            assert.strictEqual(store.tickets.length, 1);
            assert.strictEqual(store.tickets[0].subject, 'Broken Command');

            // Update activity
            await updateTicketActivity('chan_999', tempDir);

            // Archive ticket
            const actor = { id: 'mod_789', tag: 'ModUser#0002' };
            const archivedTicket = await archiveTicket(mockGuild, '0001', actor, tempDir);
            assert.ok(archivedTicket);
            assert.strictEqual(archivedTicket.status, 'archived');
            assert.ok(permissionEdits.some((pe) => pe.userOrRoleId === 'user_456' && pe.options.ViewChannel === false));

            // Delete ticket
            const deletedTicket = await deleteTicket(mockGuild, '0001', actor, tempDir);
            assert.ok(deletedTicket);
            assert.strictEqual(deletedTicket.status, 'deleted');
        } finally {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    await runTestCase('checkInactivityReminders triggers on old open tickets', async () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'komaru-inactivity-test-'));

        try {
            const oldTime = Date.now() - 25 * 60 * 60 * 1000; // 25 hours ago

            const store = {
                counter: 1,
                tickets: [
                    {
                        id: '0001',
                        guildId: 'guild_1',
                        channelId: 'chan_1',
                        creatorId: 'user_1',
                        creatorTag: 'User#1',
                        subject: 'Idle ticket',
                        description: 'Help needed',
                        status: 'open' as const,
                        createdAt: oldTime,
                        lastActivityAt: oldTime,
                    },
                ],
            };
            saveTickets(store, tempDir);

            let reminderSent = false;
            const mockChannel = {
                id: 'chan_1',
                send: async (msg: any) => {
                    if (typeof msg.content === 'string' && msg.content.includes('quiet for over')) {
                        reminderSent = true;
                    }
                },
            };

            const mockGuild = {
                id: 'guild_1',
                channels: {
                    cache: new Map([['chan_1', mockChannel]]),
                    fetch: async () => mockChannel,
                },
            };

            const mockClient = {
                guilds: {
                    cache: new Map([['guild_1', mockGuild]]),
                    fetch: async () => mockGuild,
                },
            };

            const count = await checkInactivityReminders(mockClient, tempDir);
            assert.strictEqual(count, 1);
            assert.ok(reminderSent);

            const updatedStore = loadTickets(tempDir);
            assert.ok(updatedStore.tickets[0].lastReminderAt);
        } finally {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });
}

runTicketTests();
