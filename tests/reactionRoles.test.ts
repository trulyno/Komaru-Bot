import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { PermissionFlagsBits } from 'discord.js';
import { runTestCase } from './testHarness';
import {
    addReactionRole,
    buildReactionRoleListEmbed,
    canManageRole,
    clearReactionRoleMessage,
    getReactionRoleForMessage,
    getReactionRolesForGuild,
    handleReactionAdd,
    handleReactionRemove,
    isAdmin,
    loadReactionRoles,
    matchesEmoji,
    parseEmoji,
    parseMessageReference,
    removeReactionRole,
    saveReactionRoles,
} from '../src/services/reactionRoleService';
import moduleDefinition from '../src/modules/reactionRoles';
import { commandRegistry } from '../src/commandRegistry';

const TEST_DATA_DIR = path.resolve(__dirname, '../data/test_reaction_roles');

function cleanupTestDir(): void {
    if (fs.existsSync(TEST_DATA_DIR)) {
        fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    }
}

async function runSuite(): Promise<void> {
    cleanupTestDir();

    await runTestCase('parseEmoji parses unicode and custom emojis correctly', async () => {
        const unicode = parseEmoji('🎮');
        assert.strictEqual(unicode.id, null);
        assert.strictEqual(unicode.name, '🎮');
        assert.strictEqual(unicode.raw, '🎮');

        const custom = parseEmoji('<:komaru_wave:123456789012345678>');
        assert.strictEqual(custom.id, '123456789012345678');
        assert.strictEqual(custom.name, 'komaru_wave');
        assert.strictEqual(custom.raw, '<:komaru_wave:123456789012345678>');

        const animated = parseEmoji('<a:cat_dance:987654321098765432>');
        assert.strictEqual(animated.id, '987654321098765432');
        assert.strictEqual(animated.name, 'cat_dance');

        const snowflake = parseEmoji('123456789012345678');
        assert.strictEqual(snowflake.id, '123456789012345678');

        const colonFormat = parseEmoji('bingus:111222333444555666');
        assert.strictEqual(colonFormat.id, '111222333444555666');
        assert.strictEqual(colonFormat.name, 'bingus');
    });

    await runTestCase('matchesEmoji accurately matches unicode and custom emojis', async () => {
        const unicodeEntry = {
            emoji: '⭐',
            emojiRaw: '⭐',
            roleId: '1001',
            roleName: 'Star',
        };
        assert.strictEqual(matchesEmoji({ id: null, name: '⭐' }, unicodeEntry), true);
        assert.strictEqual(matchesEmoji({ id: null, name: '❌' }, unicodeEntry), false);

        const customEntry = {
            emoji: '999888777666555444',
            emojiRaw: '<:komaru:999888777666555444>',
            roleId: '1002',
            roleName: 'Komaru',
        };
        assert.strictEqual(
            matchesEmoji({ id: '999888777666555444', name: 'komaru' }, customEntry),
            true,
        );
        assert.strictEqual(
            matchesEmoji({ id: '111111111111111111', name: 'komaru' }, customEntry),
            false,
        );
        assert.strictEqual(matchesEmoji({ id: null, name: 'komaru' }, customEntry), false);
    });

    await runTestCase('parseMessageReference extracts IDs and URLs', async () => {
        const directId = parseMessageReference('123456789012345678');
        assert.ok(directId);
        assert.strictEqual(directId?.messageId, '123456789012345678');
        assert.strictEqual(directId?.channelId, undefined);

        const jumpUrl = parseMessageReference(
            'https://discord.com/channels/111222333/444555666/777888999000',
        );
        assert.ok(jumpUrl);
        assert.strictEqual(jumpUrl?.guildId, '111222333');
        assert.strictEqual(jumpUrl?.channelId, '444555666');
        assert.strictEqual(jumpUrl?.messageId, '777888999000');

        const canaryUrl = parseMessageReference(
            'https://canary.discord.com/channels/111/222/333444555666777888',
        );
        assert.ok(canaryUrl);
        assert.strictEqual(canaryUrl?.messageId, '333444555666777888');

        const invalid = parseMessageReference('not-a-valid-ref');
        assert.strictEqual(invalid, null);
    });

    await runTestCase('canManageRole evaluates role hierarchy and managed status', async () => {
        const mockGuild = {
            id: 'guild_1',
            members: {
                me: {
                    permissions: {
                        has: (perm: any) => perm === PermissionFlagsBits.ManageRoles,
                    },
                    roles: {
                        highest: { position: 10, name: 'Bot Role' },
                    },
                },
            },
        };

        // Non-existent role
        assert.strictEqual(canManageRole(mockGuild, null).canManage, false);

        // Everyone role
        const everyoneRole = { id: 'guild_1', name: '@everyone', position: 0, managed: false };
        assert.strictEqual(canManageRole(mockGuild, everyoneRole).canManage, false);

        // Managed integration role
        const managedRole = {
            id: 'role_boost',
            name: 'Server Booster',
            position: 5,
            managed: true,
        };
        const managedResult = canManageRole(mockGuild, managedRole);
        assert.strictEqual(managedResult.canManage, false);
        assert.match(managedResult.reason || '', /managed/);

        // Higher role
        const higherRole = { id: 'role_admin', name: 'Admin', position: 15, managed: false };
        const higherResult = canManageRole(mockGuild, higherRole);
        assert.strictEqual(higherResult.canManage, false);
        assert.match(higherResult.reason || '', /higher than or equal/);

        // Equal role
        const equalRole = { id: 'role_equal', name: 'Equal', position: 10, managed: false };
        assert.strictEqual(canManageRole(mockGuild, equalRole).canManage, false);

        // Valid lower role
        const lowerRole = { id: 'role_member', name: 'Member', position: 5, managed: false };
        assert.strictEqual(canManageRole(mockGuild, lowerRole).canManage, true);

        // Bot lacks permission
        const noPermGuild = {
            id: 'guild_1',
            members: {
                me: {
                    permissions: {
                        has: () => false,
                    },
                    roles: { highest: { position: 10 } },
                },
            },
        };
        assert.strictEqual(canManageRole(noPermGuild, lowerRole).canManage, false);
    });

    await runTestCase('isAdmin evaluates member permissions', async () => {
        assert.strictEqual(isAdmin(null), false);

        const adminMember = {
            permissions: {
                has: (flag: any) => flag === PermissionFlagsBits.Administrator,
            },
        };
        assert.strictEqual(isAdmin(adminMember), true);

        const manageRolesMember = {
            permissions: {
                has: (flag: any) => flag === PermissionFlagsBits.ManageRoles,
            },
        };
        assert.strictEqual(isAdmin(manageRolesMember), true);

        const regularMember = {
            permissions: {
                has: () => false,
            },
        };
        assert.strictEqual(isAdmin(regularMember), false);
    });

    await runTestCase('Reaction role store CRUD and persistence', async () => {
        // 1. Add reaction role
        const addResult1 = addReactionRole(
            {
                messageId: 'msg_100',
                channelId: 'chan_200',
                guildId: 'guild_300',
                emojiInput: '🐱',
                roleId: 'role_cat',
                roleName: 'Cat Lovers',
                description: 'Pick roles here',
            },
            TEST_DATA_DIR,
        );
        assert.strictEqual(addResult1.success, true);
        assert.strictEqual(addResult1.entry.emoji, '🐱');

        // 2. Add another emoji to same message
        const addResult2 = addReactionRole(
            {
                messageId: 'msg_100',
                channelId: 'chan_200',
                guildId: 'guild_300',
                emojiInput: '<:doggo:123456789012345678>',
                roleId: 'role_dog',
                roleName: 'Dog Lovers',
            },
            TEST_DATA_DIR,
        );
        assert.strictEqual(addResult2.success, true);
        assert.strictEqual(addResult2.message.entries.length, 2);

        // Verify retrieval
        const retrieved = getReactionRoleForMessage('msg_100', TEST_DATA_DIR);
        assert.ok(retrieved);
        assert.strictEqual(retrieved?.entries.length, 2);

        // Guild listing
        const guildList = getReactionRolesForGuild('guild_300', TEST_DATA_DIR);
        assert.strictEqual(guildList.length, 1);
        assert.strictEqual(guildList[0].messageId, 'msg_100');

        // Embed builder test
        const embed = buildReactionRoleListEmbed({ name: 'Test Guild' }, guildList);
        assert.ok(embed);
        assert.match(embed.data.title || '', /Reaction Roles Configuration/);

        // Remove single emoji
        const removeOne = removeReactionRole(
            { messageId: 'msg_100', emojiInput: '🐱' },
            TEST_DATA_DIR,
        );
        assert.strictEqual(removeOne.success, true);
        assert.strictEqual(removeOne.removed?.roleId, 'role_cat');

        const afterRemove = getReactionRoleForMessage('msg_100', TEST_DATA_DIR);
        assert.strictEqual(afterRemove?.entries.length, 1);

        // Clear entire message
        const cleared = clearReactionRoleMessage('msg_100', TEST_DATA_DIR);
        assert.strictEqual(cleared, true);
        assert.strictEqual(getReactionRoleForMessage('msg_100', TEST_DATA_DIR), undefined);
    });

    await runTestCase('handleReactionAdd assigns role upon reaction', async () => {
        // Setup initial store
        addReactionRole(
            {
                messageId: 'msg_react_1',
                channelId: 'chan_1',
                guildId: 'guild_1',
                emojiInput: '🎮',
                roleId: 'role_gamer',
                roleName: 'Gamer',
            },
            TEST_DATA_DIR,
        );

        const addedRoles: string[] = [];
        const mockMember = {
            id: 'user_123',
            roles: {
                cache: new Set<string>(),
                add: async (role: any) => {
                    addedRoles.push(role.id);
                },
            },
        };

        const mockGuild = {
            id: 'guild_1',
            members: {
                fetch: async (id: string) => (id === 'user_123' ? mockMember : null),
                me: {
                    permissions: { has: () => true },
                    roles: { highest: { position: 10, name: 'Bot' } },
                },
            },
            roles: {
                fetch: async (id: string) =>
                    id === 'role_gamer'
                        ? { id: 'role_gamer', name: 'Gamer', position: 5, managed: false }
                        : null,
            },
        };

        const mockReaction = {
            partial: false,
            message: {
                id: 'msg_react_1',
                guild: mockGuild,
            },
            emoji: { id: null, name: '🎮' },
        };

        const mockUser = { id: 'user_123', bot: false, partial: false };

        // Normal addition
        const result = await handleReactionAdd(mockReaction, mockUser, TEST_DATA_DIR);
        assert.strictEqual(result, true);
        assert.deepStrictEqual(addedRoles, ['role_gamer']);

        // Reaction from bot ignored
        const botResult = await handleReactionAdd(
            mockReaction,
            { id: 'bot_1', bot: true },
            TEST_DATA_DIR,
        );
        assert.strictEqual(botResult, false);

        // Unconfigured emoji ignored
        const nonMatchingReaction = {
            ...mockReaction,
            emoji: { id: null, name: '🍎' },
        };
        const nonMatchResult = await handleReactionAdd(
            nonMatchingReaction,
            mockUser,
            TEST_DATA_DIR,
        );
        assert.strictEqual(nonMatchResult, false);
    });

    await runTestCase('handleReactionRemove revokes role upon unreacting', async () => {
        addReactionRole(
            {
                messageId: 'msg_react_2',
                channelId: 'chan_1',
                guildId: 'guild_1',
                emojiInput: '🎵',
                roleId: 'role_music',
                roleName: 'Music',
            },
            TEST_DATA_DIR,
        );

        const removedRoles: string[] = [];
        const memberRolesCache = new Set<string>(['role_music']);
        const mockMember = {
            id: 'user_456',
            roles: {
                cache: memberRolesCache,
                remove: async (role: any) => {
                    removedRoles.push(role.id);
                    memberRolesCache.delete(role.id);
                },
            },
        };

        const mockGuild = {
            id: 'guild_1',
            members: {
                fetch: async (id: string) => (id === 'user_456' ? mockMember : null),
                me: {
                    permissions: { has: () => true },
                    roles: { highest: { position: 10, name: 'Bot' } },
                },
            },
            roles: {
                fetch: async (id: string) =>
                    id === 'role_music'
                        ? { id: 'role_music', name: 'Music', position: 5, managed: false }
                        : null,
            },
        };

        const mockReaction = {
            partial: false,
            message: {
                id: 'msg_react_2',
                guild: mockGuild,
            },
            emoji: { id: null, name: '🎵' },
        };

        const mockUser = { id: 'user_456', bot: false, partial: false };

        const result = await handleReactionRemove(mockReaction, mockUser, TEST_DATA_DIR);
        assert.strictEqual(result, true);
        assert.deepStrictEqual(removedRoles, ['role_music']);
    });

    await runTestCase('Module registers commands and event listeners', async () => {
        const registeredEvents: string[] = [];
        const mockClient = {
            on: (event: string) => {
                registeredEvents.push(event);
            },
        };

        await moduleDefinition.register(mockClient);

        assert.ok(commandRegistry.get('reaction_role_add'));
        assert.ok(commandRegistry.get('reaction_role_create'));
        assert.ok(commandRegistry.get('reaction_role_remove'));
        assert.ok(commandRegistry.get('reaction_role_list'));
        assert.ok(commandRegistry.get('reaction_role_clear'));

        assert.ok(registeredEvents.includes('messageReactionAdd'));
        assert.ok(registeredEvents.includes('messageReactionRemove'));
    });

    cleanupTestDir();
}

runSuite().catch((err) => {
    console.error(err);
    process.exit(1);
});
