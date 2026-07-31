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

Sometimes the commands might just display some text or images, without any other shennanigans. For that you can use a simplified syntax that starts with `qt`, followed by the trigger (also can be a string or a regex), and any other text or files attached to the messages are automatically added to the command.

```md
@bot
qt "ping"
**This is some text**. Maybe some files are also attached?
```

### Trigger as input

Sometimes the user might want to use a trigger as input in the logic of the command (such as for rock paper scissors). In that case, the message that the user sent and triggered the command is saved in the variable `input`. The user can then use that variable in the command logic.

```md
@bot
when I say "rock"
you say "You chose rock"
you say "You chose {input}"
```

### Limits

Commands should not be abused by the users, such as spamming. to prevent that, some new metadatas can be set for the commands.

- `meta cooldown` - the cooldown in seconds for the command (default: 5s, compare with `last_used` metadata)
- `meta roles role1, role2, ...` - the roles that can use the command (default: everyone)
- `meta channels channel1, channel2, ...` - the channels that can use the command (default: everyone)
- `meta enabled true/false` - whether the command is enabled or not (default: true)

These metadatas cannot be changed by the author of the command, but they can be changed by administrators.

### String processing

The bot can process strings in the command logic. For that, the string processing pipeline is introduced.

```md
scratch pole {remember [0]} # starting the pipeline with the input string
|> split on " " # split the string on spaces - result in an array, but since we don't support arrays, it must be reduced to a string. if it isn't, throw an error
|> filter {(item != "rock") and (item != "scissors")} # filter out the items that are not rock or scissors
|> join on "" # join the array back to a string
|> save [0] # save the result in the variable 0
```

This pipeline can be used in the command logic, and the bot will execute the commands in the pipeline in order.
Other pipeline instructions are:

- `split on <string|regex>` - split the string on the given string or regex
- `filter <expression>` - filter the items in the array, using the given expression
- `join on <string>` - join the array back to a string, using the given string as a separator
- `save <variable>` - save the result in the given variable
- `first` - get the first item in the array
- `last` - get the last item in the array
- `trim` - trim the string
- `lower` - convert the string to lowercase
- `upper` - convert the string to uppercase
- `as number` - convert the string to a number (not available for arrays)
- `reverse` - reverse the string or the array
- `sort` - sort the array
- `sort reverse` - sort the array in reverse order
- `shuffle` - shuffle the array
- `pole` - start a new pipeline on the array elements (must end with a return)
- `return` - end the sub-pipeline

The bot will throw an error if the pipeline is not valid.

Outside the pipeline, string instructions that return booleans can be used, like `is`, `is not`,`contains`, `starts with`, `ends with`, etc.

### Conditionals

Sometimes the user might want to have a command only be triggered if a certain condition is met. For that, the bot can use the `ponder` instruction, which will evaluate the given expression and return a boolean value.

```md
ponder {(input is "rock") and not (input is "scissors")} { # if
you say "You chose rock"
}
ponder again {(input is "paper") and not (input is "rock")} { # if else
you say "You chose paper"
}
otherwise { # else
you say "You chose scissors"
}
```

For the boolean expressions, the bot will use the following operators for strings and numbers:

- and
- or
- not
- is
- is not
- \>
- <
- \>=
- <=

### Variables

Variables are used to store values that can be used in the command logic.
