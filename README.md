# Komaru the Cat

Komaru the Cat is an event-driven Discord application written in TypeScript (Node.js / discord.js v14) with dynamic module loading, moderation, community minigames, user commands, and server utilities.

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

## Google Drive Backup & Live Restore

Komaru the Cat includes an automated, scheduled, and on-demand Google Drive backup service for the `data/` directory.

- **Automated Backups**: Backs up `data/` into compressed `.tar.gz` archives on a configurable schedule (`BACKUP_INTERVAL_MINUTES`).
- **Non-Blocking Manual Backups**: Admins can trigger backups anytime via `/backup create` without interrupting the schedule or bot operations.
- **Live Restore with Soft Restart**: Restoring via `/backup restore` downloads and unpacks the archive into `data/`, automatically invalidating config caches and reloading all bot modules without dropping the Discord Gateway connection.
- **Retention Pruning**: Automatically rotates and removes older backups exceeding `BACKUP_RETENTION_COUNT`.

### Step-by-Step Google Drive Configuration

Follow these steps to connect the bot to Google Drive:

#### 1. Create a Google Cloud Project & Enable Google Drive API

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project (e.g. `komaru-bot-data`) or select an existing project.
3. In the left navigation menu, go to **APIs & Services** > **Library**.
4. Search for **Google Drive API** and click **Enable**.

#### 2. Create a Service Account & Download Key

1. Go to **APIs & Services** > **Credentials**.
2. Click **Create Credentials** > **Service Account**.
3. Set a Service account name (e.g. `komaru-backup`) and click **Done**.
4. Click on the newly created Service Account from the list, then select the **Keys** tab.
5. Click **Add Key** > **Create new key**, select **JSON**, and click **Create**.
6. A JSON credentials file will download to your computer.

#### 3. Create a Google Drive Folder & Share with Service Account

1. Open [Google Drive](https://drive.google.com/).
2. Create a dedicated folder for backups (e.g. `Komaru Bot Backups`).
3. Right-click the folder > **Share** > **Share**.
4. In the "Add people and groups" box, paste the **Service Account Email** (e.g. `komaru-backup@your-project.iam.gserviceaccount.com`).
5. Ensure the role is set to **Editor**, then click **Send** / **Save**.
6. Copy the **Folder ID** from your browser address bar (the alphanumeric string after `/folders/`, e.g. `https://drive.google.com/drive/folders/1a2b3c4d5e6f7g8h9...`).

#### 4. Configure Environment Variables (`.env`)

Place the downloaded JSON key in your project root or set the environment variables in `.env`:

```env
# Option A: Path to Service Account JSON key file (recommended)
GOOGLE_SERVICE_ACCOUNT_KEY_PATH=./service-account.json

# Option B: Raw JSON string of the service account key
# GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account","client_email":"...","private_key":"..."}

# Option C: Explicit Email & Private Key
# GOOGLE_SERVICE_ACCOUNT_EMAIL=komaru-backup@your-project.iam.gserviceaccount.com
# GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"

# Google Drive Target Folder ID
GOOGLE_DRIVE_FOLDER_ID=1a2b3c4d5e6f7g8h9i0jklmnopqrstuvwxyz

# Scheduled backup interval in minutes (default: 360 = 6 hours)
BACKUP_INTERVAL_MINUTES=360

# Number of backups to retain on Google Drive before deleting oldest (default: 10)
BACKUP_RETENTION_COUNT=10

# Enable/disable scheduled backups (default: true)
BACKUP_ENABLED=true
```

### Discord Admin Backup Commands

| Command                            | Description                                                                         |
| ---------------------------------- | ----------------------------------------------------------------------------------- |
| `/backup create`                   | Manually triggers an immediate non-blocking backup to Google Drive.                 |
| `/backup list`                     | Displays available backups stored in Google Drive with timestamps and sizes.        |
| `/backup restore backup:latest`    | Downloads and restores the latest backup, triggering a soft bot reload.             |
| `/backup restore backup:<file_id>` | Restores a specific backup archive by file ID or archive name.                      |
| `/backup status`                   | Displays Google Drive connection status, next scheduled run, and last backup stats. |
