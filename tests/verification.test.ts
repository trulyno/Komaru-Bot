import assert from 'node:assert';
import { PermissionFlagsBits } from 'discord.js';
import {
    buildVerificationForm,
    formatAllowedVerificationChannels,
    formatChannelIdentifier,
    getFieldValues,
    isVerificationChannel,
    isVerifier,
    resolveStargateRole,
} from '../src/modules/verification';
import verificationModule from '../src/modules/verification';
import { commandRegistry } from '../src/commandRegistry';
import { config } from '../src/config';
import { runTestCase } from './testHarness';

async function runVerificationTests() {
    await runTestCase('isVerificationChannel validation', async () => {
        const originalAllowed = [...config.env.verificationChannelsAllowed];
        const originalId = config.env.verificationChannelId;
        config.env.verificationChannelsAllowed = ['screenshots', 'panoramas'];
        config.env.verificationChannelId = 'verification_channel';

        try {
            assert.strictEqual(isVerificationChannel(null), false);
            assert.strictEqual(isVerificationChannel({ name: 'general', id: '123' }), false);

            assert.strictEqual(isVerificationChannel({ name: 'screenshots', id: '101' }), true);
            assert.strictEqual(isVerificationChannel({ name: 'panoramas', id: '102' }), true);
            assert.strictEqual(
                isVerificationChannel({ name: 'random', id: 'verification_channel' }),
                true,
            );

            // Thread inside screenshots channel
            assert.strictEqual(
                isVerificationChannel({
                    name: 'my-run-thread',
                    id: '201',
                    parent: { name: 'screenshots', id: '101' },
                }),
                true,
            );
        } finally {
            config.env.verificationChannelsAllowed = originalAllowed;
            config.env.verificationChannelId = originalId;
        }
    });

    await runTestCase('isVerifier permissions and roles', async () => {
        assert.strictEqual(isVerifier(null), false);

        // Admin permission
        const adminMember = {
            permissions: {
                has: (perm: bigint) => perm === PermissionFlagsBits.Administrator,
            },
        };
        assert.strictEqual(isVerifier(adminMember), true);

        // Manage Roles permission
        const managerMember = {
            permissions: {
                has: (perm: bigint) => perm === PermissionFlagsBits.ManageRoles,
            },
        };
        assert.strictEqual(isVerifier(managerMember), true);

        // Verifier role member
        const verifierMember = {
            permissions: { has: () => false },
            roles: {
                cache: [{ id: 'verifier_role', name: 'Verifier' }],
            },
        };
        assert.strictEqual(isVerifier(verifierMember), true);

        // Regular user
        const regularMember = {
            permissions: { has: () => false },
            roles: {
                cache: [{ id: '999', name: 'Member' }],
            },
        };
        assert.strictEqual(isVerifier(regularMember), false);
    });

    await runTestCase('resolveStargateRole matching', async () => {
        const mockGuild = {
            roles: {
                cache: [
                    { id: 'role_1', name: 'Legacy CSG' },
                    { id: 'role_2', name: 'ASG' },
                    { id: 'role_3', name: 'DSG' },
                ],
            },
        };

        const legacyRole = resolveStargateRole(mockGuild, 'legacy_csg_role');
        assert.ok(legacyRole);
        assert.strictEqual(legacyRole.name, 'Legacy CSG');

        const asgRole = resolveStargateRole(mockGuild, 'ASG');
        assert.ok(asgRole);
        assert.strictEqual(asgRole.name, 'ASG');

        const dsgRole = resolveStargateRole(mockGuild, 'role_3');
        assert.ok(dsgRole);
        assert.strictEqual(dsgRole.name, 'DSG');

        assert.strictEqual(resolveStargateRole(mockGuild, 'NonExistent'), null);
    });

    await runTestCase('buildVerificationForm and getFieldValues', async () => {
        const modal = buildVerificationForm();
        assert.strictEqual(modal.data.custom_id, 'verification_form');
        assert.strictEqual(modal.components.length, 6);

        const mockInteraction = {
            fields: {
                getTextInputValue: (id: string) => ` value_${id} `,
            },
        } as any;

        const values = getFieldValues(mockInteraction);
        assert.strictEqual(values.role, 'value_role');
        assert.strictEqual(values.modifications, 'value_modifications');
        assert.strictEqual(values.versions, 'value_versions');
        assert.strictEqual(values.method, 'value_method');
        assert.strictEqual(values.playtime, 'value_playtime');
        assert.strictEqual(values.cheats, 'value_cheats');
    });

    await runTestCase('formatChannelIdentifier formatting', async () => {
        const mockGuild = {
            channels: {
                cache: [
                    { id: '101', name: 'screenshots' },
                    { id: '102', name: 'panoramas' },
                ],
            },
        };

        // Snowflake IDs -> <#ID>
        assert.strictEqual(formatChannelIdentifier('123456789012345678'), '<#123456789012345678>');
        assert.strictEqual(formatChannelIdentifier('101', mockGuild), '<#101>');

        // Pre-formatted mention -> <#ID>
        assert.strictEqual(formatChannelIdentifier('<#101>'), '<#101>');

        // Channel names resolved against guild -> <#ID>
        assert.strictEqual(formatChannelIdentifier('screenshots', mockGuild), '<#101>');
        assert.strictEqual(formatChannelIdentifier('panoramas', mockGuild), '<#102>');
        assert.strictEqual(formatChannelIdentifier('#screenshots', mockGuild), '<#101>');

        // Channel names without guild -> #name
        assert.strictEqual(formatChannelIdentifier('screenshots'), '#screenshots');
        assert.strictEqual(
            formatChannelIdentifier('unknown_channel', mockGuild),
            '#unknown_channel',
        );
    });

    await runTestCase('formatAllowedVerificationChannels formatting', async () => {
        const originalAllowed = [...config.env.verificationChannelsAllowed];
        const originalId = config.env.verificationChannelId;

        const mockGuild = {
            channels: {
                cache: [
                    { id: '9001', name: 'screenshots' },
                    { id: '9002', name: 'panoramas' },
                ],
            },
        };

        try {
            // Numeric IDs
            config.env.verificationChannelsAllowed = ['111111111111111111', '222222222222222222'];
            config.env.verificationChannelId = 'verification_channel';
            assert.strictEqual(
                formatAllowedVerificationChannels(mockGuild),
                '<#111111111111111111>, <#222222222222222222>',
            );

            // Channel names resolved via guild
            config.env.verificationChannelsAllowed = ['screenshots', 'panoramas'];
            config.env.verificationChannelId = 'verification_channel';
            assert.strictEqual(formatAllowedVerificationChannels(mockGuild), '<#9001>, <#9002>');

            // Additional verification channel ID configured
            config.env.verificationChannelsAllowed = ['screenshots'];
            config.env.verificationChannelId = '333333333333333333';
            assert.strictEqual(
                formatAllowedVerificationChannels(mockGuild),
                '<#9001>, <#333333333333333333>',
            );

            // Empty channels
            config.env.verificationChannelsAllowed = [];
            config.env.verificationChannelId = 'verification_channel';
            assert.strictEqual(
                formatAllowedVerificationChannels(mockGuild),
                'designated verification channels',
            );
        } finally {
            config.env.verificationChannelsAllowed = originalAllowed;
            config.env.verificationChannelId = originalId;
        }
    });

    await runTestCase(
        'verify command replies with proper channel mentions on invalid channel',
        async () => {
            const originalAllowed = [...config.env.verificationChannelsAllowed];
            const originalId = config.env.verificationChannelId;

            config.env.verificationChannelsAllowed = ['111111111111111111', '222222222222222222'];
            config.env.verificationChannelId = 'verification_channel';

            try {
                const mockClient = { user: { id: 'bot_1' }, on: () => {} };
                await verificationModule.register(mockClient);

                const verifyCmd = commandRegistry.get('verify');
                assert.ok(verifyCmd, 'verify command must be registered');

                let repliedContent = '';
                let repliedEphemeral = false;

                const mockInteraction = {
                    channel: { id: '999999999999999999', name: 'general' },
                    guild: {
                        channels: {
                            cache: [],
                        },
                    },
                    reply: async (opts: any) => {
                        repliedContent = opts.content;
                        repliedEphemeral = opts.ephemeral;
                    },
                };

                await verifyCmd.handler(mockInteraction);

                assert.strictEqual(repliedEphemeral, true);
                assert.strictEqual(
                    repliedContent,
                    '❌ Verification requests can only be made in <#111111111111111111>, <#222222222222222222>.',
                );
            } finally {
                config.env.verificationChannelsAllowed = originalAllowed;
                config.env.verificationChannelId = originalId;
            }
        },
    );
}

runVerificationTests().catch((err) => {
    console.error(err);
    process.exit(1);
});
