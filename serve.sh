#!/usr/bin/env bash
# Starts the WarFarmer server (default http://localhost:3000). Override with PORT=1234 ./serve.sh
set -euo pipefail
cd "$(dirname "$0")"

export PORT="${PORT:-3000}"

if [ ! -d node_modules ]; then
  npm install
fi

exec npm start
