Feature: Dynamic Help and Module Documentation System
  As a Discord server user
  I want comprehensive `/help` documentation showing all available modules, status indicators, and per-module command usage
  So that I can learn how to use the bot and see what features are active in my server and channel

  Background:
    Given the module loader has discovered all bot modules
    And the help module is registered

  Scenario: Module loader discovers modules with embedded help metadata
    Then at least 10 bot modules are discovered
    And the "chess" module contains summary, commands, and examples metadata
    And the "calculator" module contains summary, commands, and examples metadata

  Scenario: Viewing general help shows an overview of all modules with status icons
    When a user executes "/help" without specifying a module
    Then an embed titled "Komaru the Cat — Modules & Help" is returned
    And the embed fields list all discovered modules including "chess" and "calculator"

  Scenario: Viewing specific help for an enabled module
    When a user executes "/help" with module argument "chess"
    Then an embed titled "Module Help: chess" is returned
    And the embed description indicates "🟢 Enabled"
    And the embed lists commands, descriptions, and usage examples for the chess module

  Scenario: Viewing specific help for a module disabled server-wide
    Given the module "chess" is disabled in guild "guild_help_test"
    When a user executes "/help" with module argument "chess" in guild "guild_help_test"
    Then the embed description indicates "🔴 Disabled (Server-wide)"

  Scenario: Requesting help for an unknown or non-existent module
    When a user executes "/help" with module argument "nonexistent_module_xyz"
    Then an ephemeral response is returned stating that "nonexistent_module_xyz" does not exist
    And the response provides a list of all available modules
