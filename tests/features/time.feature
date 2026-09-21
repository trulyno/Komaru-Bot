Feature: Time, Timezone Management, and Relative Offsets
  As a Discord server user
  I want relative time offsets, user timezone preferences, and formatted time responses
  So that I can coordinate international timezones and calculate time offsets easily

  Scenario Outline: Parsing relative time expressions and offsets
    When time expression "<Expression>" is parsed
    Then command is "<ExpectedCommand>" and offsetMs equals <ExpectedOffsetMs>

    Examples:
      | Expression         | ExpectedCommand | ExpectedOffsetMs |
      | !time              | time            | 0                |
      | !time+2h+5m+15s    | time            | 7515000          |
      | !mytime+2          | mytime          | 7200000          |
      | !mytime-30m        | mytime          | -1800000         |

  Scenario: Storing and retrieving user timezone preferences
    Given a UserTimezoneStore backed by persistent JSON storage
    When user "user-1" sets timezone to "America/New_York"
    Then getUserTimezone for "user-1" returns "America/New_York"
    When the store is reloaded from disk
    Then getUserTimezone for "user-1" persists as "America/New_York"

  Scenario: Building formatted time replies with Discord timestamps
    Given a valid location "Tokyo" or timezone "Asia/Tokyo"
    When buildTimeReply is called with the resolved timezone
    Then the response includes the formatted local time, timezone abbreviation, and Discord timestamp tags
