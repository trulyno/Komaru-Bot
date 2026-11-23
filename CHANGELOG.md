# Changelog

All notable changes to Komaru the Cat will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Changelog tracking officially began at version 0.4.0.

## [0.5.0] - 2026-11-23

### Added

- Rule-based Komaru the Cat conversational chatbot (`komaruChat` module) with mood, energy, hunger, and user bond tracking, passive chat triggers, and `/chat`, `/komaru_mood`, `/komaru_interact`, and `/komaru_channel` commands.
- Automatic chess role rewards (`/chess_roles`) supporting first-match roles, #1 top player roles, configurable Elo tier roles (stacked or highest-only), and manual/post-match role syncing.
- Persistence actions (`hide` for global/per-user persistent state, `think` for ephemeral variables, and `expr` for expressions) and interactive user input (`ask` with regex validation and retry prompts) in user commands, along with `/usercmd_persistence_limits` and `/usercmd_input_limit` admin commands.
- Message and media group support in user commands for grouping multiple outputs and attachments.
- Audit log attachment handling: deleted, ghost-pinged, and duplicate-spam messages now include source channel fields, attachment metadata, image previews, and re-uploaded attachments (within size/count limits).
- Support for `<owner/repo#number>` link-only GitHub reference syntax and richer status colors/labels (draft, merged, closed, duplicate, not planned) in GitHub reference embeds.

### Changed

- Reworked the chess module (`/challenge`, `/accept`, `/chess`, `/chess_stats`, `/chess_leaderboard`, `/chess_mod`) to integrate with the external chess web app API (`CHESS_API_BASE_URL`, `CHESS_BOT_API_KEY`, `CHESS_POLL_INTERVAL_SECONDS`) with match polling and web app auth codes.
- Allowed moderators (in addition to administrators and the bot owner) to enable and disable user commands via `/usercmd_enable`, `/usercmd_disable`, `!enable_cmd`, and `!disable_cmd`.
- Updated `scripts/deploy.ts` and `.gitignore` to exclude runtime state and guild-specific configs (`chess`, `tickets`, `reaction_roles`, `color_of_the_day`, `larp_jar`, `komaru_chat`, `user_commands_config`, `modules_config.json`, `github_reference_prefixes.json`, `timezones.json`, `pass_the_tuna` state/config, and `test_*` files) from production sync and git tracking.

## [0.4.0] - 2026-11-13

### Added

- Changelog system and `/changelog` slash & prefix command (`!changelog`) allowing users to inspect the current bot version and query changes from previous versions.
- Legacy tag conversion system (`/convert_legacy_tags`) with full AST/token parsing and migration engine converting legacy tags into modern user commands.
- Automated production deployment pipeline (`scripts/deploy.ts`, `deploy.sh`, `run-prod.sh`) with strict linting, typechecking, test suite verification, and build artifact validation.

### Changed

- Production deployment pipeline configured to strictly exclude dev and test environment user commands from production targets.
- Updated slash command registration and runtime diagnostics.

### Removed

- Deprecated Google Drive backup module and associated services.
