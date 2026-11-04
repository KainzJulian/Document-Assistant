#!/bin/sh
# Update the running app: backup, pull the new code, rebuild and restart.
# Database migrations run automatically when the api container starts.
# Usage: sh infra/scripts/update.sh
set -eu
cd "$(dirname "$0")/../.."

ENV_FILE="${ENV_FILE:-infra/.env}"
COMPOSE="docker compose -f infra/docker-compose.yml --env-file $ENV_FILE"

echo "Backup vor dem Update ..."
sh infra/scripts/backup.sh
echo "Hole neuen Code ..."
git pull --ff-only
echo "Baue und starte neu ..."
$COMPOSE up -d --build
$COMPOSE ps
