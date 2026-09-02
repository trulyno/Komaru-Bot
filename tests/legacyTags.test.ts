import assert from 'node:assert';
import { commandRegistry } from '../src/commandRegistry';
import moduleDefinition, {
    buildTagPaginationEmbed,
    buildTagPaginationRow,
    getAllLegacyTagNames,
    getLegacyTagPage,
    handleLegacyTagMessage,
    loadLegacyTagNavigation,
    normalizeTagName,
} from '../src/modules/legacyTags';
import { LegacyTagNavigationFile } from '../src/services/legacyTagService';
import { runTestCase } from './testHarness';

async function runTests() {
    const sampleNav: LegacyTagNavigationFile = {
        tags: {
            zeta: { owner: 1, file: 'u1.json', aliases: ['z_alias'] },
            alpha: { owner: 2, file: 'u2.json', aliases: ['a_alias'] },
            Beta: { owner: 3, file: 'u3.json', aliases: [] },
            gamma: { owner: 4, file: 'u4.json', aliases: [] },
            delta: { owner: 5, file: 'u5.json', aliases: [] },
        },
        aliases: {
            b_alias: 'Beta',
            top_z: 'zeta',
        },
    };

    runTestCase('getAllLegacyTagNames sorts tags in alphabetical order', () => {
        const sorted = getAllLegacyTagNames(sampleNav);
        assert.deepStrictEqual(sorted, ['alpha', 'Beta', 'delta', 'gamma', 'zeta']);

        // Check against real data file
        const realTags = getAllLegacyTagNames();
        assert.ok(realTags.length > 400, 'Expected >400 tags from real tag navigation');
        for (let i = 0; i < realTags.length - 1; i++) {
            const cmp = realTags[i].localeCompare(realTags[i + 1], undefined, {
                sensitivity: 'base',
                numeric: true,
            });
            assert.ok(cmp <= 0, `Tags out of order: ${realTags[i]} came before ${realTags[i + 1]}`);
        }
    });

    runTestCase('getLegacyTagPage pagination and alias resolution', () => {
        // Page 1 with pageSize = 2
        const page1 = getLegacyTagPage(1, 2, sampleNav);
        assert.strictEqual(page1.currentPage, 1);
        assert.strictEqual(page1.totalPages, 3);
        assert.strictEqual(page1.totalTags, 5);
        assert.strictEqual(page1.pageSize, 2);
        assert.strictEqual(page1.tags.length, 2);
        assert.strictEqual(page1.tags[0].name, 'alpha');
        assert.deepStrictEqual(page1.tags[0].aliases, ['a_alias']);
        assert.strictEqual(page1.tags[1].name, 'Beta');
        assert.deepStrictEqual(page1.tags[1].aliases, ['b_alias']);

        // Page 2
        const page2 = getLegacyTagPage(2, 2, sampleNav);
        assert.strictEqual(page2.currentPage, 2);
        assert.strictEqual(page2.tags[0].name, 'delta');
        assert.strictEqual(page2.tags[1].name, 'gamma');

        // Page 3 (last page with 1 item)
        const page3 = getLegacyTagPage(3, 2, sampleNav);
        assert.strictEqual(page3.currentPage, 3);
        assert.strictEqual(page3.tags.length, 1);
        assert.strictEqual(page3.tags[0].name, 'zeta');
        // Both entry aliases and top-level navigation aliases should be resolved
        assert.ok(page3.tags[0].aliases.includes('z_alias'));
        assert.ok(page3.tags[0].aliases.includes('top_z'));

        // Boundary clamping: page <= 0 clamps to 1
        const clampedLow = getLegacyTagPage(0, 2, sampleNav);
        assert.strictEqual(clampedLow.currentPage, 1);

        // Boundary clamping: page > totalPages clamps to totalPages
        const clampedHigh = getLegacyTagPage(999, 2, sampleNav);
        assert.strictEqual(clampedHigh.currentPage, 3);

        // Empty tags handling
        const emptyPage = getLegacyTagPage(1, 10, { tags: {}, aliases: {} });
        assert.strictEqual(emptyPage.totalTags, 0);
        assert.strictEqual(emptyPage.totalPages, 1);
        assert.strictEqual(emptyPage.currentPage, 1);
        assert.strictEqual(emptyPage.tags.length, 0);
    });

    runTestCase('buildTagPaginationEmbed creates valid embed with tags and metadata', () => {
        const pageData = getLegacyTagPage(1, 2, sampleNav);
        const embed = buildTagPaginationEmbed(pageData);
        const json = embed.toJSON();

        assert.strictEqual(json.title, '🏷️ Legacy Tags Directory');
        assert.ok(json.description?.includes('alpha'));
        assert.ok(json.description?.includes('Beta'));
        assert.ok(json.description?.includes('*(aliases: `a_alias`)*'));
        assert.ok(json.description?.includes('*(aliases: `b_alias`)*'));
        assert.ok(json.footer?.text.includes('Page 1 of 3'));
        assert.ok(json.footer?.text.includes('Total: 5 tags'));
    });

    runTestCase(
        'buildTagPaginationRow handles button disabled states correctly and prevents duplicate IDs',
        () => {
            // Page 1 of 3: First and Previous disabled, Next and Last enabled
            const rowPage1 = buildTagPaginationRow(1, 3, 'user-123');
            const comps1 = rowPage1.components;
            assert.strictEqual(comps1.length, 4);

            // Crucial: Discord API requires ALL component custom_ids to be unique within an action row!
            const idsPage1 = comps1.map((c) => (c.data as any).custom_id);
            assert.strictEqual(
                new Set(idsPage1).size,
                4,
                'All button custom_ids must be strictly unique to prevent DiscordAPIError[50035]',
            );

            assert.strictEqual(
                comps1[0].data.disabled,
                true,
                'First button should be disabled on page 1',
            );
            assert.strictEqual(
                comps1[1].data.disabled,
                true,
                'Prev button should be disabled on page 1',
            );
            assert.strictEqual(
                comps1[2].data.disabled,
                false,
                'Next button should be enabled on page 1',
            );
            assert.strictEqual(
                comps1[3].data.disabled,
                false,
                'Last button should be enabled on page 1',
            );
            assert.strictEqual((comps1[0].data as any).custom_id, 'legacy_tags:first:1:user-123');
            assert.strictEqual((comps1[1].data as any).custom_id, 'legacy_tags:prev:1:user-123');
            assert.strictEqual((comps1[2].data as any).custom_id, 'legacy_tags:next:2:user-123');
            assert.strictEqual((comps1[3].data as any).custom_id, 'legacy_tags:last:3:user-123');

            // Page 2 of 3: All enabled
            const rowPage2 = buildTagPaginationRow(2, 3, 'user-123');
            const comps2 = rowPage2.components;
            const idsPage2 = comps2.map((c) => (c.data as any).custom_id);
            assert.strictEqual(new Set(idsPage2).size, 4);
            assert.strictEqual(comps2[0].data.disabled, false);
            assert.strictEqual(comps2[1].data.disabled, false);
            assert.strictEqual(comps2[2].data.disabled, false);
            assert.strictEqual(comps2[3].data.disabled, false);
            assert.strictEqual((comps2[0].data as any).custom_id, 'legacy_tags:first:1:user-123');
            assert.strictEqual((comps2[1].data as any).custom_id, 'legacy_tags:prev:1:user-123');
            assert.strictEqual((comps2[2].data as any).custom_id, 'legacy_tags:next:3:user-123');
            assert.strictEqual((comps2[3].data as any).custom_id, 'legacy_tags:last:3:user-123');

            // Page 3 of 3: Next and Last disabled, First and Prev enabled
            const rowPage3 = buildTagPaginationRow(3, 3, 'user-123');
            const comps3 = rowPage3.components;
            const idsPage3 = comps3.map((c) => (c.data as any).custom_id);
            assert.strictEqual(new Set(idsPage3).size, 4);
            assert.strictEqual(comps3[0].data.disabled, false);
            assert.strictEqual(comps3[1].data.disabled, false);
            assert.strictEqual(
                comps3[2].data.disabled,
                true,
                'Next button should be disabled on last page',
            );
            assert.strictEqual(
                comps3[3].data.disabled,
                true,
                'Last button should be disabled on last page',
            );

            // Single page total: All disabled
            const rowSingle = buildTagPaginationRow(1, 1, 'user-123');
            const compsSingle = rowSingle.components;
            const idsSingle = compsSingle.map((c) => (c.data as any).custom_id);
            assert.strictEqual(new Set(idsSingle).size, 4);
            assert.strictEqual(compsSingle[0].data.disabled, true);
            assert.strictEqual(compsSingle[1].data.disabled, true);
            assert.strictEqual(compsSingle[2].data.disabled, true);
            assert.strictEqual(compsSingle[3].data.disabled, true);
        },
    );

    runTestCase('module registers /tags and /legacy_tags commands', async () => {
        const clientListeners: Record<string, Function[]> = {};
        const mockClient = {
            on: (event: string, handler: Function) => {
                clientListeners[event] = clientListeners[event] || [];
                clientListeners[event].push(handler);
            },
        };

        await moduleDefinition.register(mockClient);

        const tagsCmd = commandRegistry.get('tags');
        assert.ok(tagsCmd, 'Command /tags should be registered');
        assert.strictEqual(tagsCmd.name, 'tags');
        assert.ok(tagsCmd.options?.some((o) => o.name === 'page'));

        const legacyTagsCmd = commandRegistry.get('legacy_tags');
        assert.ok(legacyTagsCmd, 'Command /legacy_tags should be registered');

        // Test executing /tags interaction
        let replyPayload: any = null;
        const mockInteraction = {
            user: { id: 'user-456' },
            options: {
                getInteger: (name: string) => (name === 'page' ? 2 : null),
            },
            reply: async (payload: any) => {
                replyPayload = payload;
            },
        };

        await tagsCmd.handler(mockInteraction);
        assert.ok(replyPayload, 'Handler should reply to interaction');
        assert.ok(replyPayload.embeds && replyPayload.embeds.length === 1);
        assert.ok(replyPayload.components && replyPayload.components.length === 1);

        const footerText = replyPayload.embeds[0].data?.footer?.text;
        assert.ok(
            footerText.includes('Page 2 of'),
            `Expected page 2 in footer, got: ${footerText}`,
        );
    });

    runTestCase('button interaction updates page or rejects unauthorized user', async () => {
        const clientListeners: Record<string, Function[]> = {};
        const mockClient = {
            on: (event: string, handler: Function) => {
                clientListeners[event] = clientListeners[event] || [];
                clientListeners[event].push(handler);
            },
        };

        await moduleDefinition.register(mockClient);
        const interactionHandlers = clientListeners['interactionCreate'];
        assert.ok(interactionHandlers && interactionHandlers.length > 0);

        const buttonHandler = interactionHandlers[0];

        // 1. Non-author click rejection
        let rejectedNotice: any = null;
        const otherUserInteraction = {
            isButton: () => true,
            customId: 'legacy_tags:next:3:original-author',
            user: { id: 'intruder' },
            reply: async (payload: any) => {
                rejectedNotice = payload;
            },
        };
        await buttonHandler(otherUserInteraction);
        assert.ok(
            rejectedNotice?.flags === 64 || rejectedNotice?.ephemeral,
            'Rejection notice should be ephemeral',
        );
        assert.ok(rejectedNotice?.content.includes('Use `/tags`'));

        // 2. Author click successful update
        let updatedPayload: any = null;
        const authorInteraction = {
            isButton: () => true,
            customId: 'legacy_tags:next:3:original-author',
            user: { id: 'original-author' },
            update: async (payload: any) => {
                updatedPayload = payload;
            },
        };
        await buttonHandler(authorInteraction);
        assert.ok(updatedPayload?.embeds?.length === 1);
        assert.ok(updatedPayload?.components?.length === 1);
        const updatedFooter = updatedPayload.embeds[0].data?.footer?.text;
        assert.ok(updatedFooter.includes('Page 3 of'));
    });

    runTestCase('message listener handles %tags and %t all commands', async () => {
        let sentMessage: any = null;
        const mockMsgTags = {
            author: { bot: false, id: 'user-789' },
            content: '%tags 2',
            reply: async (payload: any) => {
                sentMessage = payload;
            },
        };

        await handleLegacyTagMessage(mockMsgTags);
        assert.ok(sentMessage?.embeds?.length === 1);
        assert.ok(sentMessage?.components?.length === 1);
        const footer = sentMessage.embeds[0].data?.footer?.text;
        assert.ok(footer.includes('Page 2 of'));

        // Test %t all
        let sentAll: any = null;
        const mockMsgTAll = {
            author: { bot: false, id: 'user-789' },
            content: '%t all',
            reply: async (payload: any) => {
                sentAll = payload;
            },
        };
        await handleLegacyTagMessage(mockMsgTAll);
        assert.ok(sentAll?.embeds?.length === 1);
        assert.ok(sentAll?.embeds[0].data?.footer?.text.includes('Page 1 of'));
    });
}

runTests().catch((error) => {
    console.error('Legacy tags test failed:', error);
    process.exit(1);
});
