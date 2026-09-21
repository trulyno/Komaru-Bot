Feature: Administrative Management and Command Synchronization
  As a Discord server administrator
  I want to manage bot modules, channel overrides, and synchronize slash commands
  So that I can control bot functionality and keep commands updated

  Background:
    Given the module loader has loaded all available bot modules
    And the admin module is registered in the command registry

  Scenario: Admin module registers core management commands
    Then the following administrative slash commands should be registered in the command registry:
      | Command Name           |
      | cleancommands          |
      | synccommands           |
      | module_enable          |
      | module_disable         |
      | module_channel_disable |
      | module_channel_enable  |
      | module_status          |
      | module_list            |

  Scenario: Administrator disables and re-enables a module server-wide
    Given an interaction from a user with "Administrator" permission in guild "guild_admin_test"
    When the administrator executes "/module_disable" with module "chess"
    Then the bot replies that module "chess" has been disabled
    And the module "chess" should be disabled in guild "guild_admin_test"
    When the administrator executes "/module_enable" with module "chess"
    Then the bot replies that module "chess" has been enabled
    And the module "chess" should be enabled in guild "guild_admin_test"

  Scenario: Administrator cannot disable protected unblockable modules
    Given an interaction from a user with "Administrator" permission in guild "guild_admin_test"
    When the administrator executes "/module_disable" with module "admin"
    Then the bot replies that module "admin" cannot be disabled
    And the module "admin" remains enabled in guild "guild_admin_test"

  Scenario: Administrator disables and re-enables a module in a specific channel
    Given an interaction from a user with "Administrator" permission in guild "guild_admin_test"
    When the administrator executes "/module_channel_disable" for module "calculator" in channel "chan_special"
    Then the bot replies that module "calculator" is disabled in channel "chan_special"
    And the module "calculator" should be disabled in channel "chan_special"
    And the module "calculator" should remain enabled in channel "chan_other"
    When the administrator executes "/module_channel_enable" for module "calculator" in channel "chan_special"
    Then the bot replies that module "calculator" is re-enabled in channel "chan_special"
    And the module "calculator" should be enabled in channel "chan_special"

  Scenario: Non-administrator user is blocked from executing admin commands
    Given an interaction from a regular user without "Administrator" permission
    When the user attempts to execute "/module_disable" with module "chess"
    Then the bot responds that the user does not have permission to execute this command

  Scenario: Clean and sync commands with guild ID clears and re-registers commands
    Given a mock Discord REST API client
    When the cleanAndSyncCommands function is called with token "mock_token", client ID "123456789", and guild ID "987654321"
    Then 3 PUT requests are sent to Discord REST API
    And the first two PUT requests send empty command arrays to clear existing commands
    And the third PUT request registers all commands from the command registry

  Scenario: Clean and sync commands globally without guild ID
    Given a mock Discord REST API client
    When the cleanAndSyncCommands function is called with token "mock_token" and client ID "123456789" without a guild ID
    Then 2 PUT requests are sent to Discord REST API
    And the first PUT request sends an empty command array
    And the second PUT request registers all commands globally from the command registry
