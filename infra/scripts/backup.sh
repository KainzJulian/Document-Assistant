#!/bin/sh
# Backup the database (pg_dump) and the uploaded files (tar of the "files" volume).
# Usage: sh infra/scripts/backup.sh [target-dir]    (default: backups/<timestamp>)
# Set ENV_FILE to use another env file than infra/.env.
set -eu
cd "$(dirname "$0")/../.."

ENV_FILE="${ENV_FILE:-infra/.env}"
COMPOSE="docker compose -f infra/docker-compose.yml --env-file $ENV_FILE"
DEST="${1:-backups/$(date +%Y%m%d-%H%M%S)}"

mkdir -p "$DEST"
echo "Sichere Datenbank ..."
$COMPOSE exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$DEST/db.dump"
echo "Sichere Dateien ..."
$COMPOSE exec -T api tar -C /data/files -cf - . > "$DEST/files.tar"

test -s "$DEST/db.dump" || { echo "FEHLER: db.dump ist leer" >&2; exit 1; }
test -s "$DEST/files.tar" || { echo "FEHLER: files.tar ist leer" >&2; exit 1; }
echo "Backup fertig: $DEST"
