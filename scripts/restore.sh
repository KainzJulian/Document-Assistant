#!/bin/sh
# Restore a backup made by backup.sh: replaces the database and the uploaded files.
# Usage: sh scripts/restore.sh <backup-dir>
# WARNING: everything currently in the database and in the files volume is replaced.
set -eu
cd "$(dirname "$0")/.."

DIR="${1:?Aufruf: sh scripts/restore.sh <backup-verzeichnis>}"
ENV_FILE="${ENV_FILE:-.env}"
COMPOSE="docker compose -f docker-compose.yml --env-file $ENV_FILE"

test -s "$DIR/db.dump" || { echo "FEHLER: $DIR/db.dump fehlt" >&2; exit 1; }
test -s "$DIR/files.tar" || { echo "FEHLER: $DIR/files.tar fehlt" >&2; exit 1; }

echo "Stoppe api und worker ..."
$COMPOSE stop api worker proxy
$COMPOSE up -d db

echo "Erstelle leere Datenbank ..."
$COMPOSE exec -T db sh -c 'dropdb -U "$POSTGRES_USER" --if-exists --force "$POSTGRES_DB" && createdb -U "$POSTGRES_USER" "$POSTGRES_DB"'
echo "Spiele Datenbank ein ..."
$COMPOSE exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner' < "$DIR/db.dump"

echo "Spiele Dateien ein ..."
$COMPOSE run --rm --no-deps -T api sh -c 'find /data/files -mindepth 1 -delete && tar -C /data/files -xf -' < "$DIR/files.tar"

echo "Starte alles ..."
$COMPOSE up -d
echo "Wiederherstellung fertig."
