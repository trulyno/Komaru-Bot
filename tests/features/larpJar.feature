Feature: Larp Jar Tracker and Dynamic Silence Minigame
  As a community moderator and member
  I want automatic detection of "larp" word variants with dynamic escalating silences and jar leaderboards
  So that word spam is curbed playfully with transparent penalty progression

  Scenario Outline: Detecting larp word variants and bypassing attempts
    When text "<Message>" is scanned for larp patterns
    Then the detection result should be <Detected>

    Examples:
      | Message                      | Detected |
      | Hello world                  | false    |
      | sharp turns ahead            | false    |
      | polar bears                  | false    |
      | stop your larping right now  | true     |
      | what a larper                | true     |
      | I larped all day             | true     |
      | LARP!                        | true     |
      | larps are fun                | true     |
      | nice llarp                   | true     |
      | laaaaarping                  | true     |
      | l.a.r.p                      | true     |
      | l a r p                      | true     |
      | l_a_r_p                      | true     |
      | 1arp                         | true     |
      | l4rp                         | true     |

  Scenario: Counting multiple larp occurrences in a single message
    When message "larp, larper, and larping!" is analyzed
    Then the occurrence count equals 3
    When message "larp and llarp" is analyzed
    Then the occurrence count equals 2

  Scenario Outline: Calculating escalating silence penalties across thresholds
    When a user crosses threshold <Threshold>
    Then the calculated penalty duration is "<DurationLabel>"

    Examples:
      | Threshold | DurationLabel |
      | 3         | 1 hour        |
      | 5         | 4 hours       |
      | 10        | 8 hours       |
      | 20        | 12 hours      |
      | 50        | 24 hours      |
      | 60        | 28 hours      |
      | 70        | 32 hours      |

  Scenario: Escalating penalty and enforcing 3-attempt limit for silenced users
    Given user "user_spammer" is silenced in guild "guild_1"
    When the user sends messages while silenced
    Then each message is deleted and logged as a silenced attempt
    And after 3 attempts, an audit log notification is sent and further attempts are suppressed

  Scenario: Unsilencing a user manually
    Given user "user_spammer" is silenced in guild "guild_1"
    When a moderator unsilences "user_spammer"
    Then the user is no longer marked as silenced
    And their silence expiration timestamp is cleared
