import assert from 'node:assert';
import path from 'node:path';
import { commandRegistry } from '../src/commandRegistry';
import { moduleLoader } from '../src/moduleLoader';
import { config } from '../src/config';
import {
    changelogService,
    ChangelogService,
    normalizeVersion,
    resolveBotVersion,
    VersionEntry,
} from '../src/services/changelogService';
import changelogModule from '../src/modules/changelog';
import { runTestCase } from './testHarness';

async function runChangelogTests(): Promise<void> {
    await runTestCase('resolveBotVersion extracts valid version from package.json', async () => {
        const version = resolveBotVersion();
        assert.ok(version, 'Version should be defined');
        assert.strictEqual(typeof version, 'string');
        assert.match(version, /^\d+\.\d+\.\d+/);
        assert.strictEqual(version, '0.4.0');
    });

    await runTestCase('normalizeVersion strips whitespace and leading v/V', async () => {
        assert.strictEqual(normalizeVersion('0.4.0'), '0.4.0');
        assert.strictEqual(normalizeVersion('v0.4.0'), '0.4.0');
        assert.strictEqual(normalizeVersion('V0.4.0'), '0.4.0');
        assert.strictEqual(normalizeVersion('  v1.2.3  '), '1.2.3');
    });

    await runTestCase('changelogService initializes with current version 0.4.0', async () => {
        const currentVersion = changelogService.getCurrentVersion();
        assert.strictEqual(currentVersion, '0.4.0');

        const startVersion = changelogService.getTrackingStartVersion();
        assert.strictEqual(startVersion, '0.4.0');

        const allVersions = changelogService.getAllVersions();
        assert.ok(allVersions.includes('0.4.0'), '0.4.0 should be listed in all versions');
    });

    await runTestCase('getEntry returns current version when called without argument', async () => {
        const entry = changelogService.getEntry();
        assert.ok(entry, 'Should return current version entry');
        assert.strictEqual(entry.version, '0.4.0');
        assert.ok(entry.sections && entry.sections.length > 0, 'Should have sections');

        const addedSection = entry.sections.find((s) => s.title.toLowerCase() === 'added');
        assert.ok(addedSection, 'Should contain Added section');
        assert.ok(addedSection.items.length > 0, 'Added section should have items');

        const changedSection = entry.sections.find((s) => s.title.toLowerCase() === 'changed');
        assert.ok(changedSection, 'Should contain Changed section');

        const removedSection = entry.sections.find((s) => s.title.toLowerCase() === 'removed');
        assert.ok(removedSection, 'Should contain Removed section');
    });

    await runTestCase('getEntry returns matching entry for normalized version', async () => {
        const entryExact = changelogService.getEntry('0.4.0');
        assert.ok(entryExact);
        assert.strictEqual(entryExact.version, '0.4.0');

        const entryWithV = changelogService.getEntry('v0.4.0');
        assert.ok(entryWithV);
        assert.strictEqual(entryWithV.version, '0.4.0');
    });

    await runTestCase('getEntry returns undefined for non-existent versions', async () => {
        const entryNonExistent = changelogService.getEntry('0.3.1');
        assert.strictEqual(entryNonExistent, undefined);

        const entryInvalid = changelogService.getEntry('999.0.0');
        assert.strictEqual(entryInvalid, undefined);
    });

    await runTestCase(
        'multi-version support: adding and querying previous or future versions',
        async () => {
            const testService = new ChangelogService(
                path.resolve(process.cwd(), 'data', 'test_changelog_nonexistent.json'),
            );

            const previousVersionEntry: VersionEntry = {
                version: '0.3.9',
                date: '2026-10-01',
                title: 'Previous Test Release',
                description: 'A previous release for testing version navigation.',
                sections: [
                    {
                        title: 'Fixed',
                        items: ['Fixed timezone edge case in test runner.'],
                    },
                ],
            };

            testService.addEntry(previousVersionEntry);

            const versions = testService.getAllVersions();
            assert.ok(versions.includes('0.3.9'));
            assert.ok(versions.includes('0.4.0'));

            const retrievedPrev = testService.getEntry('0.3.9');
            assert.ok(retrievedPrev);
            assert.strictEqual(retrievedPrev.version, '0.3.9');
            assert.strictEqual(retrievedPrev.title, 'Previous Test Release');

            const retrievedCurrent = testService.getEntry('0.4.0');
            assert.ok(retrievedCurrent);
            assert.strictEqual(retrievedCurrent.version, '0.4.0');
        },
    );

    await runTestCase(
        'embed and text formatting generates accurate Discord structures',
        async () => {
            const entry = changelogService.getEntry('0.4.0');
            assert.ok(entry);

            const embed = changelogService.formatEmbed(entry);
            assert.ok(embed);
            const data = embed.data;
            assert.strictEqual(data.title, 'Komaru the Cat - Changelog v0.4.0');
            assert.strictEqual(data.color, 0x6a5acd);
            assert.ok(data.description && data.description.includes('Release Date: 2026-11-13'));
            assert.ok(data.fields && data.fields.length >= 3);
            assert.ok(data.footer?.text.includes('Current Version: v0.4.0'));

            const textOutput = changelogService.formatText(entry);
            assert.ok(textOutput.includes('Komaru the Cat - Changelog v0.4.0'));
            assert.ok(textOutput.includes('Added:'));
            assert.ok(textOutput.includes('Current Version: v0.4.0'));
        },
    );

    await runTestCase('formatNotFoundEmbed and message provide informative guidance', async () => {
        const notFoundEmbed = changelogService.formatNotFoundEmbed('0.3.0');
        assert.strictEqual(notFoundEmbed.data.title, 'Changelog: Version Not Found');
        assert.strictEqual(notFoundEmbed.data.color, 0xed4245);
        assert.ok(notFoundEmbed.data.description?.includes('0.3.0'));
        assert.ok(notFoundEmbed.data.description?.includes('0.4.0'));

        const notFoundText = changelogService.formatNotFoundMessage('0.3.0');
        assert.ok(notFoundText.includes('No changelog entry found for version "0.3.0"'));
        assert.ok(notFoundText.includes('Changelog tracking started at version 0.4.0'));
    });

    await runTestCase('changelog module registers command and options correctly', async () => {
        const dummyClient = {
            on: () => {},
        };
        await changelogModule.register(dummyClient);

        const cmd = commandRegistry.get('changelog');
        assert.ok(cmd, 'changelog command should be registered');
        assert.strictEqual(cmd.name, 'changelog');
        assert.strictEqual(cmd.options?.[0]?.name, 'version');
        assert.strictEqual(cmd.options?.[0]?.type, 3);
        assert.strictEqual(cmd.options?.[0]?.required, false);
    });

    await runTestCase(
        'slash command /changelog returns current version when no option passed',
        async () => {
            const cmd = commandRegistry.get('changelog');
            assert.ok(cmd);

            let replyPayload: any = null;
            const mockInteraction = {
                options: {
                    getString: (_name: string) => null,
                },
                reply: async (payload: any) => {
                    replyPayload = payload;
                },
            };

            await cmd.handler(mockInteraction);
            assert.ok(replyPayload);
            assert.ok(replyPayload.embeds && replyPayload.embeds.length === 1);
            const embedData = replyPayload.embeds[0].data;
            assert.strictEqual(embedData.title, 'Komaru the Cat - Changelog v0.4.0');
            assert.ok(embedData.description.includes('(Current Version)'));
        },
    );

    await runTestCase(
        'slash command /changelog returns specified version when option provided',
        async () => {
            const cmd = commandRegistry.get('changelog');
            assert.ok(cmd);

            let replyPayload: any = null;
            const mockInteraction = {
                options: {
                    getString: (name: string) => (name === 'version' ? '0.4.0' : null),
                },
                reply: async (payload: any) => {
                    replyPayload = payload;
                },
            };

            await cmd.handler(mockInteraction);
            assert.ok(replyPayload);
            assert.ok(replyPayload.embeds && replyPayload.embeds.length === 1);
            const embedData = replyPayload.embeds[0].data;
            assert.strictEqual(embedData.title, 'Komaru the Cat - Changelog v0.4.0');
        },
    );

    await runTestCase(
        'slash command /changelog returns ephemeral not-found embed for unknown version',
        async () => {
            const cmd = commandRegistry.get('changelog');
            assert.ok(cmd);

            let replyPayload: any = null;
            const mockInteraction = {
                options: {
                    getString: (name: string) => (name === 'version' ? '0.2.5' : null),
                },
                reply: async (payload: any) => {
                    replyPayload = payload;
                },
            };

            await cmd.handler(mockInteraction);
            assert.ok(replyPayload);
            assert.strictEqual(replyPayload.ephemeral, true);
            assert.ok(replyPayload.embeds && replyPayload.embeds.length === 1);
            const embedData = replyPayload.embeds[0].data;
            assert.strictEqual(embedData.title, 'Changelog: Version Not Found');
            assert.ok(embedData.description.includes('0.2.5'));
        },
    );

    await runTestCase('prefix !changelog command handler replies correctly', async () => {
        let messageListener: ((msg: any) => Promise<void>) | null = null;
        const mockClient = {
            on: (event: string, callback: any) => {
                if (event === 'messageCreate') {
                    messageListener = callback;
                }
            },
        };

        await changelogModule.register(mockClient);
        assert.ok(messageListener, 'messageCreate listener should be registered');
        const handleMessage = messageListener as (msg: any) => Promise<void>;

        let repliedPayload: any = null;
        const mockMessage = {
            author: { bot: false },
            content: '!changelog',
            guildId: 'test_guild',
            channelId: 'test_chan',
            reply: async (payload: any) => {
                repliedPayload = payload;
            },
        };

        await handleMessage(mockMessage);
        assert.ok(repliedPayload);
        assert.ok(repliedPayload.embeds && repliedPayload.embeds.length === 1);
        assert.strictEqual(
            repliedPayload.embeds[0].data.title,
            'Komaru the Cat - Changelog v0.4.0',
        );

        // Test with specific non-existent version via !changelog 0.1.0
        repliedPayload = null;
        const mockMessageUnknown = {
            author: { bot: false },
            content: '!changelog 0.1.0',
            guildId: 'test_guild',
            channelId: 'test_chan',
            reply: async (payload: any) => {
                repliedPayload = payload;
            },
        };

        await handleMessage(mockMessageUnknown);
        assert.ok(repliedPayload);
        assert.strictEqual(repliedPayload.embeds[0].data.title, 'Changelog: Version Not Found');

        // Test ignored when module disabled
        config.modules.disableModuleInGuild('test_guild', 'changelog');
        repliedPayload = null;
        await handleMessage(mockMessage);
        assert.strictEqual(repliedPayload, null, 'Should not reply if module is disabled');
        config.modules.enableModuleInGuild('test_guild', 'changelog');
    });
}

runChangelogTests().catch((err) => {
    console.error(err);
    process.exit(1);
});
