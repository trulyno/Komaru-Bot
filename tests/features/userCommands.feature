Feature: Dynamic User Command System and Macro DSL
  As a Discord server user and bot administrator
  I want a powerful custom command macro system with variables, math, pipelines, embeds, and governance controls
  So that community members can build rich interactive commands safely within server quotas

  Scenario: Evaluating mathematical expressions within user command macros
    When user command math expression "1 + 1" is evaluated
    Then result is 2
    When expression "10 - 3 * 2" is evaluated
    Then result is 4
    When expression "(5 + 5) / 2" is evaluated
    Then result is 5
    When expression "10 % 3" is evaluated
    Then result is 1

  Scenario: String interpolation with non-pinging nickname and system variables
    Given an evaluation context with username "TestUser", nickname "TestUserNickname", channel "general", and server "KomaruServer"
    When template "Hello {user} in {channel} on {server}!" is interpolated
    Then the result is "Hello TestUserNickname in general on KomaruServer!"
    And no ping notification is triggered

  Scenario: Parsing custom command DSL directives
    Given a command definition containing:
      """
      #name: 8ball
      #desc: Ask the magic 8ball
      #category: Fun
      #choice: Yes | No | Definitely | Maybe
      The 8ball says: {choice}
      """
    When the DSL parser parses the text
    Then the command name is "8ball"
    And description is "Ask the magic 8ball"
    And category is "Fun"
    And choices contains 4 options

  Scenario: Evaluating boolean expressions and conditionals (ponder directive)
    When boolean expression "5 > 3" is evaluated
    Then the result is true
    When boolean expression "'apple' == 'orange'" is evaluated
    Then the result is false

  Scenario: Scratch pole pipeline data flow
    Given a pipeline taking initial input "hello world"
    When input is transformed through uppercase and replace steps
    Then the final pipeline output reflects all successive transformations

  Scenario: Mention prevention ensures safe output
    Given user command output containing raw user IDs and role mentions
    When mention filtering is applied
    Then allowedMentions is configured with parse: [] preventing unwanted pings

  Scenario: Creator review flow and category channel restrictions
    Given an unapproved creator submitting a user command
    When the command is submitted
    Then it enters pending review status until approved by an administrator
    And commands restricted to specific channels cannot be executed elsewhere
