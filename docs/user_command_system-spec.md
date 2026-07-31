# User Defined Command System

Ver 0.1

## Overview

Allows the users to define simple commands that can be used in the chat by themselves, or by anyone.

Examples:

```
@bot
when I say "ping" # when the user says "ping"
you say "pong" # bot send a message saying "pong"
```

## Syntax

### Command

A command is a simple string that can be used in the chat.

### Command Trigger

A command trigger is a simple string that can be used in the chat to trigger a command.

### Command Definition

A command definition is a simple string that can be used in the chat to define a command.

### Command Definition Trigger

A command definition trigger is a simple string that can be used in the chat to trigger a command definition.

## Commands

### Command intialization

A command is started to be registered when the user pings the bot. PInging the bot and not registering the command should not display any errors.

### Command trigger

The first line of the command represents the trigger.
Possible triggers are:

- `When I say ""` - when the command author says the trigger expression
- `When someone says ""` - when anyone says the trigger expression

Trigger expressions are either plain strings, or using regex expressions. String triggers must be inside quotes, while regex triggers must be inside forward slashes.

Examples:

```
When I say "ping" # string
When I say "/ping" # not a regex
When I say "/ping/" # not a regex
When I say /(ping|pong)/ # regex
```

### Command actions

The rest of the command is the action. The action is a list of commands that will be executed when the trigger is met.

Possible commands are:

- `You say ""` - bot will say the given string
- `You reply ""` - bot will reply to the user with the given string
- `You wisper ""` - bot will whisper the given string to the user

The bot will reply to the user with the given string, which allows for markdown styling and interpolation using `{}`.
For multiline strings, either use the `\n` character, or use `""" """` for a larger space.
Example:

```
You say "Hello {user}!"
You say "Hello
{user}!" # error
You say """Hello #adds automatically a new line character
{user}!"""
```

Commands are executed in the order they are written.

### Media

A command can also sent images, .txt or .md files and gifs. When registering a command, the user must attach the files to the message.
The bot can send the files by specifying the file name or file number.
Example:

```
You send "file.txt" # bot will send the file "file.txt"
You send &2 # bot will send the file with the number 2
```

### Logic

A command can use variables and logic.

Variables are defined using the following syntax:

```
memorize [0] {"test"} # saves the string "test" in the variable 0
say "{remember [0]}" # bot will say the string saved in the variable 0
```

A command has up to 10 slots for variables. The variables are numbered from 0 to 9.
The user can alias veriables to make it easier to use them, but it will still be number under the hood.

```
vars {
    1 - test
    2 - foo
}
```

For some basic logic, the bot can also evaluate arithmetic expressions. They are done in the safe `calc {}` instruction.

```
memorize [0] {calc {1 + 1}} # saves the result of the expression 1 + 1 in the variable 0
```

You can also sample from randomness using the `choice {}` and `random {}` instructions.

```
memorize [0] {choice {"foo", "bar"}} # saves the result of the expression 1 + 1 in the variable 0
memorize [0] {random {1, 10}} # saves a random number between 1 and 10 in the variable 0
```

### Meta

Each command has metadata, like author, creation date, name, etc. These are automatically generated when the command is registered. However, the user can define certain ones, like the name and description. Names must be unique, that is why it is best that the user doesn not define the name of the command, but it should still be allowed.

Example:

```
name "ping" # sets the name of the command to "ping"
description "pings the bot" # sets the description of the command to "pings the bot"
```

### Multi message deginition

Due to discord message size limitation, a command may not be able to fit in one message. To solve this, the bot can split the command into multiple messages. Using the `~~~` keyword, the next message will be also considered for the command. The last message to not have the `~~~` keyword will be the last message of the command.

Example:

```
You say "Hello"
You say "World"
You say "!"
~~~
# this is a new message
You say "Hello"
You say "World"
You say "!"
```

### Command saving and trigger pool

The command is saved in 2 separate files, one `.md` file for the raw definition (+ metadata), and one `.json` file for the parsed definition.
When a command is registered, the trigger will be added to the trigger pool, so the command can be used imideately without having to restart the bot. The trigger pool will only trigger the first command that matches the trigger.

Json file format:

```json
{
    "metadata": {
        "author": "101421780907859968",
        "storage_used": 13662,
        "creation_date": "2026-17-07T17:31:54.720Z",
        "name": "8Ball",
        "description": "Asks the bot a question and it will answer with a random answer",
        "raw": "8ball.md"
    },
    "media": {},
    "trigger": {
        "type": "string",
        "value": "/8ball"
    },
    "actions": [
        {
            "type": "reply",
            "value": {
                "type": "choice",
                "value": [
                    "Without a doubt",
                    "It is certain",
                    "It is decidedly so",
                    "Without a doubt",
                    "Yes definitely",
                    "You may rely on it",
                    "As I see it yes",
                    "Most likely",
                    "Outlook good",
                    "Yes",
                    "Signs point to yes",
                    "Reply hazy try again",
                    "Ask again later",
                    "Better not tell you now",
                    "Cannot predict now",
                    "Concentrate and ask again",
                    "Don't count on it",
                    "My reply is no",
                    "My sources say no",
                    "Outlook not so good",
                    "Very doubtful"
                ]
            }
        }
    ]
}
```

### Example command: 8Ball

```
name "8Ball"
description "Asks the bot a question and it will answer with a random answer"
when someone says "/8ball"
you reply {choice {"Without a doubt", "It is certain", "It is decidedly so", "Without a doubt", "Yes definitely", "You may rely on it", "As I see it yes", "Most likely", "Outlook good", "Yes", "Signs point to yes", "Reply hazy try again", "Ask again later", "Better not tell you now", "Cannot predict now", "Concentrate and ask again", "Don't count on it", "My reply is no", "My sources say no", "Outlook not so good", "Very doubtful"}}
```

### Related commands

`raw <name>` - returns the raw command definition
`edit_trigger <name> <new_trigger>` - edits the trigger of the command
`delete <name>` - deletes the command
