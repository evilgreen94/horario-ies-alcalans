#!/usr/bin/env bash
set -euo pipefail

KIND="${1:-daily}"

case "$KIND" in
  daily|weekly|monthly) ;;
  *)
    echo "Uso: $0 {daily|weekly|monthly}" >&2
    exit 1
    ;;
esac

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="${PROJECT_ROOT:-$(cd "$SCRIPT_DIR/../.." && pwd)}"
DB_PATH="${GUARDIAS_DB_PATH:-$PROJECT_ROOT/BD/guardias.sqlite}"
BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/guardias}"
JSON_BACKUP_ENABLED="${JSON_BACKUP_ENABLED:-0}"

DAILY_KEEP="${DAILY_KEEP:-14}"
WEEKLY_KEEP="${WEEKLY_KEEP:-8}"
MONTHLY_KEEP="${MONTHLY_KEEP:-12}"

TIMESTAMP="$(date +%F)"
WEEK_STAMP="$(date +%G-week-%V)"
MONTH_STAMP="$(date +%Y-%m)"

mkdir -p "$BACKUP_ROOT/daily" "$BACKUP_ROOT/weekly" "$BACKUP_ROOT/monthly" "$BACKUP_ROOT/logs"

if [[ ! -f "$DB_PATH" ]]; then
  echo "No existe la base de datos en $DB_PATH" >&2
  exit 1
fi

if ! command -v sqlite3 >/dev/null 2>&1; then
  echo "sqlite3 es obligatorio para ejecutar backups consistentes" >&2
  exit 1
fi

case "$KIND" in
  daily)
    TARGET_DIR="$BACKUP_ROOT/daily"
    TARGET_FILE="$TARGET_DIR/guardias-$TIMESTAMP.sqlite"
    KEEP="$DAILY_KEEP"
    ;;
  weekly)
    TARGET_DIR="$BACKUP_ROOT/weekly"
    TARGET_FILE="$TARGET_DIR/guardias-$WEEK_STAMP.sqlite"
    KEEP="$WEEKLY_KEEP"
    ;;
  monthly)
    TARGET_DIR="$BACKUP_ROOT/monthly"
    TARGET_FILE="$TARGET_DIR/guardias-$MONTH_STAMP.sqlite"
    KEEP="$MONTHLY_KEEP"
    ;;
esac

TMP_FILE="$TARGET_FILE.tmp"

sqlite3 "$DB_PATH" ".backup '$TMP_FILE'"

mv -f "$TMP_FILE" "$TARGET_FILE"
chmod 600 "$TARGET_FILE"

if [[ "$JSON_BACKUP_ENABLED" == "1" ]]; then
  JSON_TARGET="${TARGET_FILE%.sqlite}.json"
  if [[ -f "$PROJECT_ROOT/BD/backups/latest-guardias-backup.json" ]]; then
    cp "$PROJECT_ROOT/BD/backups/latest-guardias-backup.json" "$JSON_TARGET"
    chmod 600 "$JSON_TARGET"
  fi
fi

find "$TARGET_DIR" -maxdepth 1 -type f -name 'guardias-*.sqlite' | sort -r | awk "NR>$KEEP" | xargs -r rm -f
find "$TARGET_DIR" -maxdepth 1 -type f -name 'guardias-*.json' | sort -r | awk "NR>$KEEP" | xargs -r rm -f

echo "Backup $KIND creado en $TARGET_FILE"
