Feature: Moderation Audit Logging and Spam Fingerprinting
  As a Discord server moderator
  I want accurate message fingerprinting and duration parsing
  So that spam detection and moderation timeouts operate correctly

  Scenario Outline: Parsing human-readable duration strings to milliseconds
    When duration string "<Duration>" is parsed
    Then the calculated milliseconds should equal <Milliseconds>

    Examples:
      | Duration        | Milliseconds |
      | 10m             | 600000       |
      | 2h              | 7200000      |
      | 1d              | 86400000     |
      | not-a-duration  | 0            |

  Scenario: Message fingerprinting detects identical content and attachments regardless of attachment order
    Given a message with content "hello world" and attachments ["a.png", "b.png"]
    And another message with content "hello world" and attachments ["b.png", "a.png"]
    When both message fingerprints are generated
    Then both message fingerprints must be identical
