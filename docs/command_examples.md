# User Command Examples

```md
@Komaru
name "hello"
description "Greets the user"
when someone says "hello bot"
you reply "Hello {user}! Welcome to the server."
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
name "PingPong"
description "Triggers on ping or pong"
when someone says /(ping|pong)/
you say "I heard ping or pong, {user}!"
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

**Message 1:**

```md
@Komaru
name "Story"
when someone says "!story"
you say "Once upon a time..."

```

```
```

**Message 2:**

```md
you say "...in a galaxy far, far away..."
you say "The end!"
```


```md
@Komaru
name "Photo"
when someone says "!pic"
you send &1
you say "Here is the attached picture!"
```

## Commands

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

## Admin Moderation Commands

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
    - Text command: `!view_storage_config

## Bot Owner Commands

- **Set Role Storage Quota (Bot Owner Only):**
    - Slash command: `/set_role_storage role: vip limit_mb: 10`
    - Text command: `!set_role_storage vip 10`
