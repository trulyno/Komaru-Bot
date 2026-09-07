#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Ensure ts-node is available
if [ ! -d "node_modules" ]; then
    echo "[INFO] Installing dependencies..."
    npm install --legacy-peer-deps
fi

# Run deployment pipeline via ts-node
exec npx ts-node scripts/deploy.ts "$@"
