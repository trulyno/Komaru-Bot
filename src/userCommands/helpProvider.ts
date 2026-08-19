export interface HelpEmbed {
    title: string;
    description: string;
    color: number;
    fields: Array<{ name: string; value: string; inline?: boolean }>;
}

export function getHelpTopicEmbed(topicRaw?: string): HelpEmbed {
    const topic = (topicRaw || 'overview').toLowerCase().trim();

    switch (topic) {
        case 'quick':
        case 'qt':
            return {
                title: '⚡ User Command System: Quick Commands (qt)',
                color: 0x3498db,
                description: 'Quickly define simple text or file response commands without full boilerplate.',
                fields: [
                    {
                        name: 'Shorthand Syntax',
                        value: '```md\n@Komaru\nqt "ping"\nPong! This is a quick text response.\n```',
                    },
                    {
                        name: 'Author-Only Quick Command',
                        value: '```md\n@Komaru\nqt i "!myintro"\nHello everyone! I am {user}.\n```',
                    },
                    {
                        name: 'Attached Media Support',
                        value: 'Any files attached to the registration message are automatically attached to the command response.',
                    },
                ],
            };

        case 'triggers':
        case 'trigger':
        case 'variables':
            return {
                title: '🎯 User Command System: Triggers & Variables',
                color: 0x2ecc71,
                description: 'Triggers activate user commands, and variables let you build dynamic outputs.',
                fields: [
                    {
                        name: 'Trigger Types',
                        value: '• **String:** `when someone says "hello"`\n• **Author-Scoped:** `when I say "!secret"`\n• **Regex:** `when someone says /!rps (rock|paper|scissors)/`',
                    },
                    {
                        name: 'Trigger Capture Variables',
                        value: '• `{input}` — Full triggering message text\n• `{match [1]}`, `{match [2]}` — Regex capture groups',
                    },
                    {
                        name: 'System Context Variables',
                        value: '• `{user}` — User display name (non-pinging)\n• `{channel}` — Current channel name\n• `{server}` — Current server name\n• `{date}`, `{time}` — Current UTC date and time',
                    },
                    {
                        name: 'Custom Storage Variables',
                        value: '• `{remember [slot_or_alias]}` — Recalls stored value\n• `{calc {expr}}` — Evaluates safe math calculations',
                    },
                ],
            };

        case 'embeds':
        case 'embed':
            return {
                title: '🎨 User Command System: Rich Embeds',
                color: 0x9b59b6,
                description: 'Send beautifully formatted Discord embeds directly from user commands.',
                fields: [
                    {
                        name: 'Embed Block Syntax',
                        value: '```md\nyou embed {\n    title "Server Info"\n    description "Requested by {user}"\n    color "#6a5acd"\n    field "Channel" - "{channel}"\n    field "Time" - "{time} UTC"\n}\n```',
                    },
                    {
                        name: 'Supported Properties',
                        value: '• `title "..."` — Embed title\n• `description "..."` — Main embed text\n• `color "#hex"` — Hex color code\n• `field "Name" - "Value"` — Custom key-value field',
                    },
                ],
            };

        case 'ponder':
        case 'conditionals':
        case 'if':
            return {
                title: '🔀 User Command System: Conditionals (ponder)',
                color: 0xe67e22,
                description: 'Execute logic conditionally based on boolean evaluations.',
                fields: [
                    {
                        name: 'Conditional Syntax',
                        value: '```md\nponder {(match [1] is "rock")} {\n    you reply "I choose paper! I win!"\n}\nponder again {(match [1] is "paper")} {\n    you reply "I choose scissors! I win!"\n}\notherwise {\n    you reply "I choose rock! I win!"\n}\n```',
                    },
                    {
                        name: 'Boolean Operators',
                        value: '• `is`, `is not` — String / value equality\n• `contains`, `starts with`, `ends with` — Text search\n• `>`, `<`, `>=`, `<=` — Numeric comparisons\n• `and`, `or`, `not` — Logical combinations',
                    },
                ],
            };

        case 'pipeline':
        case 'scratch':
        case 'pole':
            return {
                title: '🛠️ User Command System: String Pipeline (scratch pole)',
                color: 0x1abc9c,
                description: 'Transform, split, filter, and format text strings sequentially.',
                fields: [
                    {
                        name: 'Pipeline Syntax',
                        value: '```md\nscratch pole {input}\n|> split on " "\n|> trim\n|> upper\n|> sort\n|> join on ", "\n|> save [0]\n```',
                    },
                    {
                        name: 'Pipeline Operations',
                        value: '• `split on <delimiter>` — Split string into list\n• `filter <expression>` — Filter array elements\n• `join on <separator>` — Join list to string\n• `save [slot]` — Save result to variable slot\n• `first`, `last`, `trim`, `lower`, `upper`, `sort`, `shuffle`',
                    },
                ],
            };

        case 'meta':
        case 'metadata':
        case 'limits':
            return {
                title: '⚙️ User Command System: Metadata & Restrictions',
                color: 0xf1c40f,
                description: 'Configure cooldowns, permissions, channel limits, and aliases.',
                fields: [
                    {
                        name: 'Directives',
                        value: '```md\nmeta cooldown 10\nmeta roles vip, admin\nmeta channels general\nmeta enabled true\nalias "announcement", "viping"\ncoauthor "101421780907859968"\n```',
                    },
                    {
                        name: 'Explanations',
                        value: '• `meta cooldown <sec>` — Cooldown per user\n• `meta roles <role_names_or_ids>` — Allowed roles\n• `meta channels <channel_names_or_ids>` — Allowed channels\n• `alias "<alias>"` — Alternative command triggers\n• `coauthor "<user_id>"` — Grants co-edit permissions',
                    },
                ],
            };

        case 'utility':
        case 'mycommands':
            return {
                title: '🔧 User Command System: User Utility Commands',
                color: 0x34495e,
                description: 'Manage and inspect your user commands.',
                fields: [
                    {
                        name: 'User Commands',
                        value: '• `/mycommands` — View all commands created by you\n• `/usercommands user: @User` — View user commands created by a specific user\n• `/storage_info` — Check your storage usage & limit\n• `/raw name: <name>` — View raw `.md` command definition\n• `/edit_trigger name: <name> new_trigger: <trig>` — Change command trigger\n• `/add_alias name: <name> alias: <alias>` — Add trigger alias\n• `/delete name: <name>` — Delete command\n• `/report_command name: <name> reason: <reason>` — Report rule breaking command',
                    },
                ],
            };

        case 'admin':
        case 'moderation':
            return {
                title: '🛡️ User Command System: Admin & Moderation Commands',
                color: 0xe74c3c,
                description: 'Commands for administrators and bot owners.',
                fields: [
                    {
                        name: 'Admin Commands',
                        value: '• `/view_reports` — Inspect open command reports\n• `/dismiss_report report_id: <id>` — Dismiss report\n• `/wipe_user_commands user: @User` — Wipe all commands by user\n• `/restrict_user user: @User` — Restrict user from creating commands\n• `/unrestrict_user user: @User` — Lift creation restriction\n• `/set_public_aliases enabled: <true/false>` — Toggle public alias creation\n• `/view_storage_config` — View role storage limits',
                    },
                    {
                        name: 'Bot Owner Commands',
                        value: '• `/set_role_storage role: <role> limit_mb: <mb>` — Adjust extra MB quota for a role',
                    },
                ],
            };

        case 'overview':
        default:
            return {
                title: '📖 Komaru User Defined Command System: Guide',
                color: 0x5865f2,
                description: 'Welcome to the User Defined Command System! Define your own custom bot commands directly in chat using natural syntax.',
                fields: [
                    {
                        name: '🚀 Quick Start',
                        value: 'To create a command, mention `@Komaru` in chat and specify your trigger & actions:\n```md\n@Komaru\nwhen someone says "!hello"\nyou reply "Hello {user}!"\n```',
                    },
                    {
                        name: '📚 Help Topics',
                        value: 'Use `/user_command_help topic: <topic>` or `!cmdhelp <topic>` to view detailed guides:\n• `quick` — Shorthand command creation (`qt`)\n• `triggers` — Triggers, capture groups (`{match [1]}`), and variables\n• `embeds` — Rich Discord embed outputs (`you embed`)\n• `ponder` — Conditional logic (`ponder`, `otherwise`)\n• `pipeline` — Text processing (`scratch pole`)\n• `meta` — Cooldowns, role/channel limits, aliases\n• `utility` — Management commands (`/mycommands`, `/add_alias`, etc.)\n• `admin` — Moderation & administrative configuration',
                    },
                ],
            };
    }
}
