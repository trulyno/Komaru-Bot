#!/usr/bin/env bash
set -e

# Change directory to the root of the bot repository
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "======================================="
echo "       Starting Komaru the Cat         "
echo "             (Production)              "
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

# Verify compiled entrypoint exists
if [ ! -f "dist/index.js" ]; then
    echo "[ERROR] Production entrypoint 'dist/index.js' not found."
    echo "[ERROR] Build the project first with 'npm run build' or deploy via './deploy.sh'."
    exit 1
fi

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "[INFO] node_modules not found. Installing production dependencies..."
    npm install --omit=dev --legacy-peer-deps
fi

# Parse options
AUTO_RESTART=false

for arg in "$@"; do
    case $arg in
        --loop|loop|--auto-restart)
            AUTO_RESTART=true
            ;;
        --help|-h)
            echo "Usage: ./run-prod.sh [OPTIONS]"
            echo ""
            echo "Runs Komaru the Cat in production mode directly from compiled dist/."
            echo ""
            echo "Options:"
            echo "  --loop, loop, --auto-restart   Auto-restart bot if it crashes"
            echo "  --help, -h                     Show this help message"
            echo ""
            exit 0
            ;;
    esac
done

echo "[INFO] Starting bot in PRODUCTION mode..."
if [ "$AUTO_RESTART" = true ]; then
    while true; do
        npm run start || echo "[WARNING] Bot process exited with status $?. Restarting in 3 seconds..."
        sleep 3
    done
else
    exec npm run start
fi
