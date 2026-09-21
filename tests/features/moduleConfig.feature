Feature: Per-Guild and Per-Channel Module Configuration
  As a bot administrator
  I want granular control over which modules are enabled or disabled per server and channel
  So that server owners can customize bot behavior while core security modules remain unblockable

  Background:
    Given a fresh instance of ModuleConfigService

  Scenario: Default module enablement state
    Then all modules default to enabled across guilds and channels

  Scenario: Disabling and re-enabling a module server-wide
    When module "chess" is disabled in guild "guild1"
    Then "chess" is disabled in guild "guild1" across all channels
    And "chess" remains enabled in other guilds like "guild2"
    When module "chess" is re-enabled in guild "guild1"
    Then "chess" is enabled in guild "guild1"

  Scenario: Disabling and re-enabling a module in a specific channel
    When module "calculator" is disabled in channel "chanA" of guild "guild1"
    Then "calculator" is disabled in channel "chanA"
    And "calculator" remains enabled in channel "chanB" of guild "guild1"
    When module "calculator" is re-enabled in channel "chanA"
    Then "calculator" is enabled in channel "chanA"

  Scenario: Protecting core unblockable modules from being disabled
    When an administrator attempts to disable "admin" or "help" in a guild or channel
    Then the operation is rejected and the module remains enabled

  Scenario: Module configuration persistence and disk reload
    Given module "larpJar" is disabled in guild "guild1"
    And module "passTheTuna" is disabled in channel "chanX" of guild "guild1"
    When a new ModuleConfigService instance is initialized from disk
    Then "larpJar" is disabled in guild "guild1"
    And "passTheTuna" is disabled in channel "chanX"
    And "passTheTuna" is enabled in channel "chanY"
