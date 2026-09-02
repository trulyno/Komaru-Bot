import 'dotenv/config';

export interface EnvConfig {
    discordToken: string;
    discordGuildId?: string;
    logLevel: string;
    botOwnerId?: string;

    // Moderation & Audit Log
    moderationModeratorRoleId?: string;
    moderationModeratorRoleName: string;
    moderationAdminRoleId?: string;
    moderationAdminRoleName: string;
    moderationAuditChannelId?: string;

    // Verification
    verificationChannelId: string;
    verificationChannelsAllowed: string[];
    verifierRoleId: string;
    verifierRoleName: string;
    legacyCsgRoleId?: string;
    asgRoleId?: string;
    dsgRoleId?: string;

    // Template Detection
    issueReportingChannelId?: string;
    suggestionsChannelId?: string;
    templateInvalidTags: string[];

    // Ticket System
    ticketInactivityHours: number;
}

export function loadEnvConfig(): EnvConfig {
    const rawAllowed = process.env.VERIFICATION_CHANNELS_ALLOWED;
    const allowedChannels = rawAllowed
        ? rawAllowed.split(',').map((c) => c.trim().toLowerCase()).filter(Boolean)
        : ['screenshots', 'panoramas'];

    const rawInvalidTags = process.env.TEMPLATE_INVALID_TAGS;
    const invalidTags = rawInvalidTags
        ? rawInvalidTags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean)
        : ['invalid', 'needs template', 'template missing'];

    const rawTicketInactivity = process.env.TICKET_INACTIVITY_HOURS;
    const ticketInactivityHours = Number(rawTicketInactivity) || 24;

    return {
        discordToken: process.env.DISCORD_TOKEN || '',
        discordGuildId: process.env.DISCORD_GUILD_ID || undefined,
        logLevel: process.env.LOG_LEVEL || 'info',
        botOwnerId: process.env.BOT_OWNER_ID || undefined,

        moderationModeratorRoleId: process.env.MODERATION_MODERATOR_ROLE_ID || undefined,
        moderationModeratorRoleName: process.env.MODERATION_MODERATOR_ROLE_NAME || 'Moderator',
        moderationAdminRoleId: process.env.MODERATION_ADMIN_ROLE_ID || undefined,
        moderationAdminRoleName: process.env.MODERATION_ADMIN_ROLE_NAME || 'Administrator',
        moderationAuditChannelId: process.env.MODERATION_AUDIT_CHANNEL_ID || undefined,

        verificationChannelId: process.env.VERIFICATION_CHANNEL_ID || 'verification_channel',
        verificationChannelsAllowed: allowedChannels,
        verifierRoleId: process.env.VERIFIER_ROLE_ID || 'verifier_role',
        verifierRoleName: process.env.VERIFIER_ROLE_NAME || 'verifier',
        legacyCsgRoleId: process.env.LEGACY_CSG_ROLE_ID || undefined,
        asgRoleId: process.env.ASG_ROLE_ID || undefined,
        dsgRoleId: process.env.DSG_ROLE_ID || undefined,

        issueReportingChannelId: process.env.ISSUE_REPORTING_CHANNEL_ID || undefined,
        suggestionsChannelId: process.env.SUGGESTIONS_CHANNEL_ID || undefined,
        templateInvalidTags: invalidTags,

        ticketInactivityHours,
    };
}
