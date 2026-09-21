Feature: Reaction-Based Role Management
  As a Discord server administrator
  I want members to assign and revoke roles by adding and removing message reactions
  So that community self-assignment of notification and cosmetic roles is automated

  Scenario Outline: Parsing unicode and custom emoji representations
    When emoji string "<Input>" is parsed
    Then parsed emoji ID is "<ExpectedID>" and name is "<ExpectedName>"

    Examples:
      | Input                                | ExpectedID         | ExpectedName |
      | 🎮                                   | null               | 🎮           |
      | <:komaru_wave:123456789012345678>    | 123456789012345678 | komaru_wave  |
      | <a:cat_dance:987654321098765432>     | 987654321098765432 | cat_dance    |
      | 123456789012345678                   | 123456789012345678 |              |
      | bingus:111222333444555666            | 111222333444555666 | bingus       |

  Scenario: Parsing message jump URLs and raw message IDs
    When message reference "https://discord.com/channels/111/222/333" is parsed
    Then channel ID is "222" and message ID is "333"
    When raw message ID "999888777" is parsed
    Then message ID is "999888777"

  Scenario: Adding reaction assigns configured role to member
    Given a configured reaction role binding emoji "🎮" to role "role_gamer" on message "msg_1"
    When user "user_123" reacts with "🎮" on message "msg_1"
    Then the bot assigns "role_gamer" to "user_123"

  Scenario: Removing reaction revokes configured role from member
    Given a member "user_456" possessing role "role_music" from message "msg_2"
    When user "user_456" removes reaction "🎵" from message "msg_2"
    Then the bot removes "role_music" from "user_456"

  Scenario: Role hierarchy validation prevents managing higher roles
    Given the bot's highest role is at position 5
    When an administrator attempts to configure a reaction role for a role at position 10
    Then the operation is rejected due to role hierarchy constraints
