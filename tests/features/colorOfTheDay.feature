Feature: Color of the Day Module
  As a Discord server community member
  I want a daily random Color of the Day with preview images, tier ranking, and a historical tier list gallery
  So that the community can engage in rating colors and track the server's favorite palettes

  Scenario: Configuring the Color of the Day announcement channel
    Given a server with ID "guild_1"
    When a moderator executes "/set_color_of_the_day_channel" targeting "#palette-lounge"
    Then the channel is stored as the daily announcement channel for "guild_1"
    And an introductory announcement message with a solid color preview is sent to the channel

  Scenario: Viewing the active Color of the Day
    Given an active Color of the Day with hex "#E63946"
    When a user executes "/coloroftheday"
    Then an embed is returned displaying hex code "#E63946" and RGB values
    And a solid color square PNG image is attached to the response
    And current voting totals and trending tier are displayed

  Scenario: Ranking the current Color of the Day
    Given an active Color of the Day with hex "#457B9D"
    When user "Alice" executes "/rankcoloroftheday tier:S"
    Then Alice's vote is recorded as tier "S"
    And a confirmation message acknowledges the tier "S" rating
    When user "Alice" updates their vote with "/rankcoloroftheday tier:A"
    Then Alice's vote is updated to tier "A" without incrementing total voter count

  Scenario Outline: Averaging votes and transitioning to the historical tier list after 24 hours
    Given an active Color of the Day with votes resulting in average score <AverageScore>
    When the 24-hour cycle elapses and the color advances
    Then the outgoing color is assigned tier "<ExpectedTier>" in history
    And a new random Color of the Day is generated with an empty vote tally
    And a daily rotation announcement is broadcast to all configured guild channels

    Examples:
      | AverageScore | ExpectedTier |
      | 5.0          | S            |
      | 4.6          | S            |
      | 4.0          | A            |
      | 3.2          | B            |
      | 2.0          | C            |
      | 1.0          | D            |
      | 0.3          | F            |

  Scenario: Browsing the historical tier list and filtering by tier
    Given a history of past Colors of the Day across tiers S, A, B, C, D, and F
    When a user executes "/colorofthedaytierlist"
    Then an overview embed is shown displaying the top 5 colors for each tier
    And a select menu component allows choosing individual tiers
    When the user selects "Tier S" in the dropdown menu
    Then the embed updates to list all colors awarded Tier S
