# User Command Examples

### 1. Quick Command Creation (`qt`)

Simply mention `@Komaru` and send `qt "trigger"` followed by response text (and optional attached media):

```md
@Komaru
qt "ping"
Pong! Here is a quick message response.
```

Author-scoped quick command (only triggers when you say it):

```md
@Komaru
qt i "!myintro"
Hello everyone! I am {user}.
```

---

### 2. Regex Triggers with Capture Groups (`{match [1]}`)

Capture user inputs directly inside regex patterns:

```md
@Komaru
name "RPS"
description "Rock Paper Scissors Game"
when someone says /!rps (rock|paper|scissors)/
you reply "You chose **{match [1]}**! I choose **{choice {"rock", "paper", "scissors"}}**!"
```

---

### 3. Rich Embeds (`you embed`)

Output custom styled Discord embeds:

```md
@Komaru
name "ServerInfo"
description "Displays server info"
when someone says "!serverinfo"
you embed {
title "Server & User Info"
description "Information for {user}"
color "#6a5acd"
field "Channel" - "{channel}"
field "Server" - "{server}"
field "Date" - "{date} {time}"
}
```

---

### 4. Conditionals (`ponder`, `ponder again`, `otherwise`)

Execute actions based on boolean evaluation:

```md
@Komaru
name "PickGame"
description "Evaluates rock paper scissors choice"
when someone says /!pick (rock|paper|scissors)/
ponder {(match [1] is "rock")} {
you reply "You picked rock! I pick paper. I win!"
}
ponder again {(match [1] is "paper")} {
you reply "You picked paper! I pick scissors. I win!"
}
otherwise {
you reply "You picked scissors! I pick rock. I win!"
}
```

---

### 5. String Processing Pipeline (`scratch pole`)

Transform and process text strings:

```md
@Komaru
name "FormatWords"
description "Splits, trims, uppercase and sorts text"
vars {
0 - formatted
}
when someone says "!format"
scratch pole {input}
|> split on " "
|> trim
|> upper
|> sort
|> join on ", "
|> save [formatted]
you reply "Formatted words: **{remember [formatted]}**"
```

---

### 6. Metadata Limits, Aliases & Co-authors

Configure command metadata, aliases, and co-authors:

```md
@Komaru
name "VipAnnouncement"
description "VIP command with cooldown and role limits"
alias "announcement", "viping"
coauthor "101421780907859968"
meta cooldown 10
meta roles vip, admin
meta channels general
meta enabled true
when someone says "!vip"
you say "📣 VIP Announcement triggered by **{user}** at {time} UTC!"
```

---

### 7. Classic Basic Examples

```md
@Komaru
name "hello"
description "Greets the user"
when someone says "hello bot"
you reply "Hello {user}! Welcome to {server}."
```

```md
@Komaru
name "8Ball"
description "Asks the bot a question"
when someone says "/8ball"
you reply {choice {"Without a doubt", "It is certain", "Yes definitely", "Reply hazy try again", "Ask again later", "Don't count on it", "My reply is no"}}
```

```md
@Komaru
name "DiceRoll"
description "Rolls a die and calculates double"
vars {
0 - roll
1 - double
}
when I say "!roll"
memorize [roll] {random {1, 6}}
memorize [double] {calc {remember [roll] * 2}}
you reply "🎲 You rolled a **{remember [roll]}**! Double is **{remember [double]}**!"
```

```md
@Komaru
name "SecretNote"
when someone says "!secret"
you whisper "Psst... {user}, this is a secret message from Komaru!"
you reply "Done!"
```

---

## Utility Commands

- **Interactive Tutorial & System Help:**
    - Slash command: `/user_command_help topic: ponder`
    - Text command: `!cmdhelp ponder`

- **View Raw Definition:**
    - Slash command: `/raw name: 8Ball`
    - Text command: `!raw 8Ball`

- **Edit Command Trigger:**
    - Slash command: `/edit_trigger name: 8Ball new_trigger: /ask`
    - Text command: `!edit_trigger 8Ball /ask`

- **Delete Command:**
    - Slash command: `/delete name: 8Ball`
    - Text command: `!delete 8Ball`

- **View Your Commands:**
    - Slash command: `/mycommands`
    - Text command: `!mycommands`

- **View Someone's Commands:**
    - Slash command: `/usercommands user: @User`
    - Text command: `!usercommands @User`

- **Check Storage Quota Info:**
    - Slash command: `/storage_info`
    - Text command: `!storage_info`

- **Report Rule-Breaking Command:**
    - Slash command: `/report_command name: 8Ball reason: Spam`
    - Text command: `!report_command 8Ball Inappropriate content`

- **Add Alias to Command:**
    - Slash command: `/add_alias name: 8Ball alias: ask8ball`
    - Text command: `!add_alias 8Ball ask8ball`

## Admin Moderation Commands

- **Toggle Public Alias Creation:**
    - Slash command: `/set_public_aliases enabled: true`
    - Text command: `!set_public_aliases true`

- **View Open Reports:**
    - Slash command: `/view_reports`
    - Text command: `!view_reports`

- **Dismiss a Report:**
    - Slash command: `/dismiss_report report_id: rep_12345`
    - Text command: `!dismiss_report rep_12345`

- **Wipe All Commands from a User:**
    - Slash command: `/wipe_user_commands user: @User`
    - Text command: `!wipe_user_commands @User`

- **Restrict / Ban User from Creating Commands:**
    - Slash command: `/restrict_user user: @User`
    - Text command: `!restrict_user @User`

- **Lift User Restriction:**
    - Slash command: `/unrestrict_user user: @User`
    - Text command: `!unrestrict_user @User`

- **View Role Storage Config:**
    - Slash command: `/view_storage_config`
    - Text command: `!view_storage_config`

## Bot Owner Commands

- **Set Role Storage Quota (Bot Owner Only):**
    - Slash command: `/set_role_storage role: vip limit_mb: 10`
    - Text command: `!set_role_storage vip 10`
