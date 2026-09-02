import assert from 'node:assert';
import { PermissionFlagsBits } from 'discord.js';
import {
    buildVerificationForm,
    getFieldValues,
    isVerificationChannel,
    isVerifier,
    resolveStargateRole,
} from '../src/modules/verification';
import { config } from '../src/config';
import { runTestCase } from './testHarness';

function runVerificationTests() {
    runTestCase('isVerificationChannel validation', () => {
        const originalAllowed = [...config.env.verificationChannelsAllowed];
        const originalId = config.env.verificationChannelId;
        config.env.verificationChannelsAllowed = ['screenshots', 'panoramas'];
        config.env.verificationChannelId = 'verification_channel';

        try {
            assert.strictEqual(isVerificationChannel(null), false);
            assert.strictEqual(isVerificationChannel({ name: 'general', id: '123' }), false);

            assert.strictEqual(isVerificationChannel({ name: 'screenshots', id: '101' }), true);
            assert.strictEqual(isVerificationChannel({ name: 'panoramas', id: '102' }), true);
            assert.strictEqual(isVerificationChannel({ name: 'random', id: 'verification_channel' }), true);

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

    runTestCase('isVerifier permissions and roles', () => {
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

    runTestCase('resolveStargateRole matching', () => {
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

    runTestCase('buildVerificationForm and getFieldValues', () => {
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
}

runVerificationTests();
