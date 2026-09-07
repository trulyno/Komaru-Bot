# Komaru Bot

Komaru Bot is an event-driven Discord application written in TypeScript (Node.js / discord.js v14) with dynamic module loading, moderation, community minigames, user commands, and server utilities.

## Setup & Development

1. Copy `.env.example` to `.env`.
2. Fill in your Discord bot token and optional guild ID for instant development slash command syncing.
3. Install dependencies:
    ```bash
    npm install --legacy-peer-deps
    ```
4. Start the bot in development mode:
    ```bash
    npm run dev
    # or with auto-restart:
    ./run.sh --dev --loop
    ```

## Available Scripts

### Development & Testing

- `npm run dev` / `./run.sh --dev` - Start the bot in development mode (using `ts-node`)
- `./run.sh --dev --loop` - Start in development mode with automatic crash restart loop
- `npm test` - Execute the full automated test suite
- `npm run lint` - Run ESLint code quality checks
- `npm run lint:typecheck` - Run TypeScript type checking (`tsc`)
- `npm run format` - Format code with Prettier

### Production Build & Deployment Pipeline

- `./deploy.sh` / `npm run deploy` - Run the automated multi-stage pipeline and deploy to production (`/home/komarubot-prod`)
- `./deploy.sh --dry-run` / `npm run deploy:dry-run` - Run all pipeline quality gates (lint, typecheck, tests, build) without writing files to prod
- `./run.sh --deploy` - Trigger the deployment pipeline via `run.sh`
- `./run.sh` / `npm run start` - Start the compiled bot in production mode (`node dist/index.js`)

## Production Deployment Pipeline

The deployment pipeline (`scripts/deploy.ts` / `./deploy.sh`) enforces strict quality gates:

1. **Stage 1: Code Quality & Lint Check** (`npm run lint`)
2. **Stage 2: TypeScript Type Checking** (`npm run lint:typecheck`)
3. **Stage 3: Automated Test Suite** (All 17 test suites via `npm test`)
4. **Stage 4: Clean TypeScript Compilation** (Compiles `src/` to `dist/`)
5. **Stage 5: Build Output Integrity Check** (Validates `dist/index.js`, modules, services, configs)
6. **Stage 6: Target Environment Preparation** (Prepares target directory e.g. `/home/komarubot-prod`)
7. **Stage 7: Safe Distribution Sync** (Syncs `dist/`, assets, and runner scripts; preserves live `.env` and persistent state in `data/`)
8. **Stage 8: Production Dependency Installation** (`npm install --omit=dev --legacy-peer-deps`)
9. **Stage 9: Deployment Manifest Generation** (Writes `deployment_info.json` with commit, branch, timestamp)

If any check fails at any stage, the pipeline **aborts immediately** and leaves the production environment untouched.
