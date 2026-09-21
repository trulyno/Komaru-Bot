Feature: Pass the Tuna Minigame Engine
  As a Discord server member
  I want an interactive Pass the Tuna game with chain passes, steals, deliciousness mechanics, and random events
  So that community members can compete and climb the fish leaderboard

  Background:
    Given a Pass the Tuna engine instance with customized game configuration

  Scenario: Starting a new tuna chain and making standard passes
    When a tuna chain is started in channel "channel-1"
    Then the chain length is 0 and deliciousness threshold is 3
    When user "user-1" passes the tuna
    Then chain length becomes 1 and "user-1" gains points

  Scenario: Blocking attempts to take the tuna while too fresh
    Given an active tuna chain at length 1
    When "user-1" attempts to take the tuna before reaching the deliciousness threshold
    Then the action is blocked because the tuna is too fresh to take

  Scenario: Successfully taking the tuna once deliciousness threshold is reached
    Given an active tuna chain that has reached deliciousness threshold 3
    When user "user-2" takes the tuna
    Then the steal is successful and "user-2" receives bonus deliciousness points
    And the chain resets for a new round

  Scenario: Triggering random game events during gameplay
    Given a game configuration with 100% chance for the "Frozen Tuna" event
    When a player takes the tuna
    Then the take is transformed into a pass due to the Frozen Tuna event
    And event-specific flavor text is returned

  Scenario: Idle tuna timeout and penalty enforcement
    Given an active tuna chain held by "user-1"
    When the idle timeout period expires without player action
    Then the tuna spoils and the holder incurs an idle penalty
