Feature: Web-App Chess Integration
  As a Discord server member
  I want to challenge others to chess via the bot and receive web-app authentication codes
  So that we can play on the chess web app, let others spectate, query live updates, and see match results automatically

  Background:
    Given the chess module is registered and ready

  Scenario: Challenging a player and accepting to start a web-app match
    Given user "Alice" challenges user "Bob" using /challenge
    When "Bob" accepts the challenge using /accept or the Accept button
    Then the bot calls POST /api/v1/games/start with both players
    And the bot posts a public embed containing the gameUrl and spectateUrl
    And both players can retrieve their private authentication codes ephemerally

  Scenario: Querying live match status, active matches, stats, and leaderboard
    Given an ongoing or finished match on the web app
    When a user runs /chess action:status, /chess action:active, /chess_stats, or /chess_leaderboard
    Then the bot queries the web-app API and displays the formatted embed

  Scenario: Continuous polling announces ended matches
    Given an active match tracked by the bot
    When the scheduled polling job detects status "finished" or "aborted" via GET /api/v1/bot/matches
    Then the bot posts a match result embed in the origin channel once

  Scenario: Moderators resolving or aborting matches
    Given a moderator invokes /chess_mod
    When they run force_win, force_draw, or abort for a matchId
    Then the bot calls POST /api/v1/games/:matchId/result and announces the outcome
