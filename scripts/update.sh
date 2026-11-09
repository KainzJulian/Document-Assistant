#!/bin/sh
# Update the running app: backup, pull the new code, rebuild and restart.
# Database migrations run automatically when the api container starts.
# Usage: sh scripts/update.sh
set -eu
cd "$(dirname "$0")/.."

ENV_FILE="${ENV_FILE:-.env}"
COMPOSE="docker compose -f docker-compose.yml --env-file $ENV_FILE"

echo "Backup vor dem Update ..."
sh scripts/backup.sh
echo "Hole neuen Code ..."
git pull --ff-only
echo "Baue und starte neu ..."
$COMPOSE up -d --build
$COMPOSE ps
