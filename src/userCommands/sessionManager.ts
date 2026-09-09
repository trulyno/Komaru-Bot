import { logger } from '../logger';
import { parseUserCommand } from './parser';
import { QuotaManager } from './quotaManager';
import { UserCommandStorage } from './storage';
import { TriggerPool } from './triggerPool';
import { PendingSession } from './types';
import { sendAuditLog, canAdministrate } from '../services/auditLogService';
import { config } from '../config';

export class SessionManager {
    private sessions: Map<string, PendingSession> = new Map();
    // Session timeout (5 minutes)
    private readonly SESSION_TIMEOUT_MS = 5 * 60 * 1000;

    constructor(
        private storage: UserCommandStorage,
        private triggerPool: TriggerPool,
        private quotaManager: QuotaManager,
    ) {}

    public async handleMessage(message: any, botId: string): Promise<boolean> {
        if (!message || !message.content || message.author?.bot) {
            return false;
        }

        const authorId = message.author.id;
        const isMentioned =
            message.mentions?.has?.(botId) ||
            message.content.includes(`<@${botId}>`) ||
            message.content.includes(`<@!${botId}>`);
        const activeSession = this.sessions.get(authorId);

        // If not mentioned and no active session, ignore
        if (!isMentioned && !activeSession) {
            return false;
        }

        // Check if user is restricted
        if (this.quotaManager.isUserRestricted(authorId)) {
            if (isMentioned) {
                await message.reply(
                    '❌ You are currently restricted by an admin from creating user commands.',
                );
            }
            return true;
        }

        // Clean content (strip bot mention if present)
        let cleanedContent = message.content;
        if (isMentioned) {
            cleanedContent = cleanedContent.replace(new RegExp(`<@!?${botId}>`, 'g'), '').trim();
        }

        // Check for session timeout
        if (activeSession && Date.now() - activeSession.createdAt > this.SESSION_TIMEOUT_MS) {
            this.sessions.delete(authorId);
            logger.info(`Expired multi-message command session for user ${authorId}`);
        }

        const session: PendingSession = this.sessions.get(authorId) || {
            authorId,
            lines: [],
            media: [],
            createdAt: Date.now(),
        };

        // Collect attached files from this message if any
        if (message.attachments && message.attachments.size > 0) {
            for (const [, attachment] of message.attachments) {
                try {
                    // Fetch buffer if URL is available or mock in tests
                    const response = await fetch(attachment.url);
                    const arrayBuf = await response.arrayBuffer();
                    const buffer = Buffer.from(arrayBuf);
                    session.media.push({
                        filename: attachment.name || `file_${session.media.length + 1}`,
                        url: attachment.url,
                        buffer,
                    });
                } catch (err) {
                    logger.error(`Failed to download attachment ${attachment.name}: ${err}`);
                }
            }
        }

        // Check if message has multi-message continuation token `~~~`
        const hasContinuation = cleanedContent.includes('~~~');
        const lineContent = cleanedContent.replace(/~~~/g, '').trim();

        const channelId = message.channel?.id || '';
        const channelName = message.channel?.name || '';
        const isOwner = Boolean(config.env.botOwnerId && authorId === config.env.botOwnerId);
        const isAdmin = canAdministrate(message.member);
        const channelAllowed = this.quotaManager
            .getConfigStore()
            .isCreationAllowedInChannel(channelId, channelName);

        if (lineContent) {
            session.lines.push(lineContent);
        }

        if (hasContinuation) {
            if (!isAdmin && !isOwner && !channelAllowed) {
                const allowedList = this.quotaManager
                    .getConfigStore()
                    .formatAllowedCreationChannels();
                await message.reply(
                    `❌ Creating user commands is only allowed in the following channel(s): ${allowedList}.`,
                );
                return true;
            }
            // Store session and wait for next message
            this.sessions.set(authorId, session);
            logger.info(`User ${authorId} started/continued multi-message command session.`);
            return true;
        }

        // Final message in definition session!
        this.sessions.delete(authorId);
        const fullRawDefinition = session.lines.join('\n');

        if (!fullRawDefinition.trim()) {
            return false;
        }

        // Check if full raw definition looks like a command definition (contains 'when ' or starts with 'qt')
        const lowerDef = fullRawDefinition.trim().toLowerCase();
        if (!lowerDef.includes('when ') && !lowerDef.startsWith('qt')) {
            // Normal ping or non-command message, silently ignore per spec
            return false;
        }

        if (!isAdmin && !isOwner && !channelAllowed) {
            const allowedList = this.quotaManager.getConfigStore().formatAllowedCreationChannels();
            await message.reply(
                `❌ Creating user commands is only allowed in the following channel(s): ${allowedList}.`,
            );
            return true;
        }

        try {
            const mediaForParser = session.media.map((m) => ({
                filename: m.filename,
                path: m.url,
            }));

            const cmdJson = parseUserCommand(fullRawDefinition, authorId, mediaForParser);

            // Normalize category against registered categories
            const normalizedCat = this.quotaManager
                .getConfigStore()
                .normalizeCategory(cmdJson.metadata.category);
            cmdJson.metadata.category = normalizedCat;

            // Check trigger / alias collision with existing commands
            const conflictingCmd = this.triggerPool.findConflictingCommand(
                cmdJson.trigger,
                cmdJson.aliases,
                cmdJson.metadata.name,
            );
            if (
                conflictingCmd &&
                conflictingCmd.metadata.name.toLowerCase() !== cmdJson.metadata.name.toLowerCase()
            ) {
                await message.reply(
                    `❌ Cannot register command **${cmdJson.metadata.name}**: trigger or alias \`${cmdJson.trigger.value}\` is already used by command **${conflictingCmd.metadata.name}**.`,
                );
                return true;
            }

            // Calculate incoming bytes (raw text + json text + media buffers)
            const rawBytes = Buffer.byteLength(fullRawDefinition, 'utf-8');
            const jsonBytes = Buffer.byteLength(JSON.stringify(cmdJson), 'utf-8');
            const mediaBytes = session.media.reduce(
                (acc, m) => acc + (m.buffer ? m.buffer.length : 0),
                0,
            );
            const incomingBytes = rawBytes + jsonBytes + mediaBytes;

            // Check quota
            const quotaCheck = this.quotaManager.checkQuota(
                authorId,
                message.member,
                incomingBytes,
            );
            if (!quotaCheck.allowed) {
                await message.reply(
                    `❌ Cannot register command **${cmdJson.metadata.name}**: ${quotaCheck.reason}`,
                );
                return true;
            }

            // Determine if creator is approved or admin
            const isOwner = Boolean(config.env.botOwnerId && authorId === config.env.botOwnerId);
            const isAdmin = canAdministrate(message.member);
            const isApproved = this.quotaManager.getConfigStore().isApprovedCreator(authorId);
            const autoApprove = isOwner || isAdmin || isApproved;

            cmdJson.metadata.enabled = autoApprove;

            // Save command and attachments
            const mediaBuffers = session.media
                .filter((m) => m.buffer)
                .map((m) => ({ filename: m.filename, buffer: m.buffer! }));

            this.storage.saveCommand(cmdJson, fullRawDefinition, mediaBuffers);
            this.triggerPool.registerCommand(cmdJson);

            if (autoApprove) {
                await sendAuditLog(
                    message.guild,
                    'User Command Created (Auto-Approved)',
                    `User command **${cmdJson.metadata.name}** was created by an approved creator / admin.`,
                    [
                        { name: 'Command', value: `**${cmdJson.metadata.name}**` },
                        { name: 'Category', value: cmdJson.metadata.category || 'General' },
                        { name: 'Author', value: `<@${authorId}> (${authorId})` },
                        {
                            name: 'Trigger',
                            value: `\`${cmdJson.trigger.value}\` (${cmdJson.trigger.type})`,
                        },
                        { name: 'Status', value: '✅ Enabled' },
                    ],
                );
                await message.reply(
                    `✅ Command **${cmdJson.metadata.name}** [${cmdJson.metadata.category}] registered and enabled successfully!`,
                );
            } else {
                await sendAuditLog(
                    message.guild,
                    'User Command Submitted (Pending Review)',
                    `A new user command **${cmdJson.metadata.name}** was submitted and requires admin review.`,
                    [
                        { name: 'Command', value: `**${cmdJson.metadata.name}**` },
                        { name: 'Category', value: cmdJson.metadata.category || 'General' },
                        { name: 'Author', value: `<@${authorId}> (${authorId})` },
                        {
                            name: 'Trigger',
                            value: `\`${cmdJson.trigger.value}\` (${cmdJson.trigger.type})`,
                        },
                        { name: 'Status', value: '⏳ Disabled (Pending Review)' },
                        {
                            name: 'Action',
                            value: `Use \`/usercmd_enable name:${cmdJson.metadata.name}\` to enable, or \`/usercmd_delete name:${cmdJson.metadata.name}\` to reject.`,
                        },
                    ],
                );
                await message.reply(
                    `⏳ Command **${cmdJson.metadata.name}** [${cmdJson.metadata.category}] submitted and queued for admin review before it can be used.`,
                );
            }

            return true;
        } catch (error) {
            logger.error(`Failed to parse/register user command from ping: ${error}`);
            // Do not display errors on invalid pings as per spec
            return false;
        }
    }
}
