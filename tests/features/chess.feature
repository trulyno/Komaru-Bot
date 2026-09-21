Feature: Interactive Two-Player Chess Minigame
  As a Discord server member
  I want to play chess using Standard Algebraic Notation (SAN)
  So that I can challenge other members, track ratings, view statistics, and climb the leaderboard

  Background:
    Given the chess module is registered and ready

  Scenario: Creating and accepting a chess game challenge
    Given user "Alice" challenges user "Bob" to a chess game
    When "Bob" accepts the challenge
    Then a new active game starts with "Alice" playing White and "Bob" playing Black
    And the initial board position is rendered

  Scenario: Creating, declining, and cancelling a challenge
    Given user "Alice" challenges user "Bob" with auto-declining
    When "Bob" declines the challenge
    Then the challenge state is marked as declined
    Given user "Alice" challenges user "Charlie"
    When "Alice" cancels the challenge
    Then the challenge state is marked as cancelled

  Scenario: Executing legal moves and advancing turns
    Given an active game between "Alice" (White) and "Bob" (Black)
    When "Alice" moves "e4"
    Then the move is accepted and recorded in SAN history
    And it becomes "Bob"'s turn (Black)
    When "Bob" moves "e5"
    Then the move is accepted and recorded in SAN history
    And it becomes "Alice"'s turn (White)

  Scenario: Validating illegal moves and providing educational notation suggestions
    Given an active game where it is White's turn
    When White attempts illegal move "e5"
    Then the move is rejected with an explanation that the pawn cannot jump two squares to an occupied or invalid position
    When White provides lowercase piece notation "nf3"
    Then the notation analyzer normalizes it to "Nf3"

  Scenario: Resolving game outcome by checkmate and updating Elo ratings
    Given an active game reaching Scholar's Mate
    When White plays "Qxf7#" delivering checkmate
    Then the game is marked as completed with White winning
    And White's Elo rating increases
    And Black's Elo rating decreases

  Scenario: Resigning a game and offering a draw
    Given an active game between "Alice" and "Bob"
    When "Alice" resigns the game
    Then "Bob" is declared the winner by resignation
    Given another active game between "Alice" and "Bob"
    When "Alice" offers a draw and "Bob" accepts
    Then the game ends as a draw and Elo ratings adjust for a tied match

  Scenario: Viewing player statistics and server leaderboards
    Given users with completed games and Elo ratings
    When a user requests the chess leaderboard
    Then an embed is generated sorting players by rating descending
    When a user requests personal stats for "Alice"
    Then an embed is generated showing rating, win rate, streak, and game history
