#!/usr/bin/env bash
set -e

# Change directory to the root of the bot repository
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "======================================="
echo "       Starting Komaru Bot             "
echo "======================================="

# Check for .env file
if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        echo "[WARNING] .env file not found! Copying from .env.example..."
        cp .env.example .env
        echo "[IMPORTANT] Please edit .env and set your DISCORD_TOKEN before starting."
    else
        echo "[ERROR] .env file not found and .env.example is missing."
        exit 1
    fi
fi

# Check if DISCORD_TOKEN is set in .env
if grep -q "^DISCORD_TOKEN=\s*$" .env 2>/dev/null || ! grep -q "^DISCORD_TOKEN=" .env 2>/dev/null; then
    echo "[WARNING] DISCORD_TOKEN appears to be empty in .env."
    echo "[IMPORTANT] Make sure to set DISCORD_TOKEN in .env to connect to Discord."
fi

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "[INFO] node_modules not found. Installing dependencies..."
    npm install --legacy-peer-deps
fi

# Parse options
MODE="prod"
AUTO_RESTART=false

for arg in "$@"; do
    case $arg in
        --dev|dev)
            MODE="dev"
            ;;
        --loop|loop|--auto-restart)
            AUTO_RESTART=true
            ;;
        --build|build)
            echo "[INFO] Building TypeScript project..."
            npm run build
            echo "[INFO] Build completed successfully."
            exit 0
            ;;
        --deploy|deploy)
            shift || true
            exec ./deploy.sh "$@"
            ;;
        --help|-h)
            echo "Usage: ./run.sh [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --dev, dev            Run in development mode (using ts-node)"
            echo "  --loop, loop          Auto-restart bot if it crashes"
            echo "  --build, build        Build the project and exit"
            echo "  --deploy, deploy      Run full production pipeline and deploy to prod"
            echo "  --help, -h            Show this help message"
            echo ""
            echo "By default, run.sh builds the project and starts the bot in production mode."
            exit 0
            ;;
    esac
done

if [ "$MODE" = "dev" ]; then
    echo "[INFO] Starting bot in DEVELOPMENT mode..."
    if [ "$AUTO_RESTART" = true ]; then
        while true; do
            npm run dev || echo "[WARNING] Bot process exited with status $?. Restarting in 3 seconds..."
            sleep 3
        done
    else
        exec npm run dev
    fi
else
    echo "[INFO] Building project..."
    npm run build

    echo "[INFO] Starting bot in PRODUCTION mode..."
    if [ "$AUTO_RESTART" = true ]; then
        while true; do
            npm run start || echo "[WARNING] Bot process exited with status $?. Restarting in 3 seconds..."
            sleep 3
        done
    else
        exec npm run start
    fi
fi
