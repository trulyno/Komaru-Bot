# Changelog

All notable changes to Komaru the Cat will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Changelog tracking officially began at version 0.4.0.

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
