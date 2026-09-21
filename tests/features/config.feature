Feature: Configuration Management and Dynamic Reloading
  As a bot operator
  I want centralized access to environment variables, JSON configs, and live reload functionality
  So that runtime configuration changes take effect without process restarts

  Scenario: Loading default environment configuration values
    Given the bot configuration singleton is initialized
    Then the log level is a valid string
    And the verification allowed channels is an array
    And template invalid tags is an array
    And ticket inactivity hours is a number

  Scenario: Loading issue and suggestion template configs from JSON
    Given the template configuration is loaded
    Then issue template fields is a non-empty list of strings
    And suggestion template fields is a non-empty list of strings
    And modpack versions includes "Theta 1"

  Scenario: Loading moderation audit log configuration
    Given the audit log configuration is loaded
    Then duplicate spam window is defined in milliseconds
    And ghost ping window is defined in milliseconds
    And default moderator role name is "Moderator"

  Scenario: Live configuration reload updates in-memory settings
    Given the current log level is set in the environment
    When process.env.LOG_LEVEL is changed to "debug"
    And config.reload() is executed
    Then the active config.env.logLevel updates to "debug" without restarting the application
