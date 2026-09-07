# User Defined Command System

Ver 0.2

Status: Still in concepting phase!

## Overview

Allows the users to define simple commands that can be used in the chat by themselves, or by anyone.

Examples:

```
@bot
when I say "ping" # when the user says "ping"
you say "pong" # bot send a message saying "pong"
```

## New features:

### Quick command creation

Sometimes the commands might just display some text or images, without any other shenanigans. For that you can use a simplified syntax that starts with `qt`, followed by the trigger (which can be a string or a regex). Any other text or attached files are automatically converted into a `you reply` action.

- `qt "trigger"` - Defaults to `when someone says "trigger"`
- `qt i "trigger"` - Scoped to author: `when I say "trigger"`

```md
@bot
qt "ping"
**This is some text**. Maybe some files are also attached?
```

### Trigger as input & Regex Capture Groups

Sometimes the user might want to use the triggering message as input in the logic of the command (such as for rock paper scissors). The triggering message is saved in the variable `{input}`.

```md
@bot
when I say "rock"
you say "You chose {input}"
```

For regex triggers, capture groups are automatically stored in `{match [1]}`, `{match [2]}`, etc.

```md
@bot
when someone says /!rps (rock|paper|scissors)/
you say "You picked {match [1]}!"
```

### Limits & Metadata

Commands should not be abused by users (e.g., spamming). To prevent that, metadata settings can be defined:

- `meta cooldown <seconds>` - Cooldown in seconds for the command (default: 5s, minimum server limit: 3s).
- `meta roles role1, role2, ...` - Roles allowed to use the command (default: everyone).
- `meta channels channel1, channel2, ...` - Channels where the command can be used (default: all channels).
- `meta enabled true/false` - Whether the command is active (default: true).

Authors can set initial metadata upon creation, but administrators have override authority to update or lock these settings.

### String processing

The bot can process strings in the command logic using the `scratch pole` processing pipeline.

```md
scratch pole {remember [0]} # starting the pipeline with the input string
|> split on " " # split the string on spaces - results in an array
|> filter {(item is not "rock") and (item is not "scissors")} # filter out items that are not rock or scissors
|> join on "" # join the array back to a string
|> save [0] # save the result in variable 0
```

Pipeline instructions:

- `split on <string|regex>` - split the string on the given string or regex
- `filter <expression>` - filter items in the array using a boolean expression
- `join on <string>` - join the array back into a string using a separator
- `save <variable>` - save the result in the given variable
- `first` - get the first item in the array
- `last` - get the last item in the array
- `trim` - trim whitespace from the string
- `lower` - convert the string to lowercase
- `upper` - convert the string to uppercase
- `as number` - convert the string to a number (not available for arrays)
- `reverse` - reverse the string or array
- `sort` - sort the array
- `sort reverse` - sort the array in reverse order
- `shuffle` - shuffle the array
- `pole` - start a new sub-pipeline on array elements (must end with `return`)
- `return` - end the sub-pipeline

If a pipeline ends on an unjoined array, the engine automatically coerces the items into a space-separated string. Subpipelines can optionally use leading `|` characters for visual clarity.

Outside the pipeline, boolean string comparisons can be used: `is`, `is not`, `contains`, `starts with`, `ends with`.

### Conditionals

Commands can evaluate conditions using the `ponder` instruction:

```md
ponder {(input is "rock") and not (input is "scissors")} { # if
you say "You chose rock"
}
ponder again {(input is "paper") and not (input is "rock")} { # else if
you say "You chose paper"
}
otherwise { # else
you say "You chose scissors"
}
```

Boolean expression operators:

- `and`, `or`, `not`
- `is`, `is not`
- `>`, `<`, `>=`, `<=`

### Rich Embed Actions (`you embed`)

Commands can send formatted Discord embeds using the `you embed` statement:

```md
you embed {
title "Player Status"
description "{user} has executed the command!"
color "#6a5acd"
field "Choice" - "{input}"
}
```

### System Context Variables

Built-in variables provide environment details without requiring manual state tracking:

- `{channel}` - Name of the current channel.
- `{server}` - Name of the server/guild.
- `{time}` - Current UTC time (HH:MM:SS).
- `{date}` - Current UTC date (YYYY-MM-DD).

### Command Aliases & Co-authors

Authors can assign alternative triggers and delegate edit permissions:

- `alias "p", "pong"` - Registers additional triggers for the command.
- `coauthor "101421780907859968"` - Grants another user permission to edit or manage the command.
