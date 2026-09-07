#!/usr/bin/env bash
set -euo pipefail
umask 077

KIND="${1:-daily}"

case "$KIND" in
  daily|weekly|monthly) ;;
  *)
    echo "Uso: $0 {daily|weekly|monthly}" >&2
    exit 1
    ;;
esac

DB_PATH="${GUARDIAS_DB_PATH:-/var/lib/guardias/guardias.sqlite}"
BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/guardias}"

DAILY_KEEP="${DAILY_KEEP:-14}"
WEEKLY_KEEP="${WEEKLY_KEEP:-8}"
MONTHLY_KEEP="${MONTHLY_KEEP:-12}"

TIMESTAMP="$(date +%F)"
WEEK_STAMP="$(date +%G-week-%V)"
MONTH_STAMP="$(date +%Y-%m)"

[[ "$BACKUP_ROOT" = /* && "$BACKUP_ROOT" != "/" ]] || {
  echo "BACKUP_ROOT debe ser una ruta absoluta no raíz" >&2
  exit 1
}

for keep in "$DAILY_KEEP" "$WEEKLY_KEEP" "$MONTHLY_KEEP"; do
  [[ "$keep" =~ ^[1-9][0-9]*$ ]] || {
    echo "La retención debe ser un entero positivo" >&2
    exit 1
  }
done

mkdir -p "$BACKUP_ROOT/daily" "$BACKUP_ROOT/weekly" "$BACKUP_ROOT/monthly" "$BACKUP_ROOT/logs"

if [[ ! -f "$DB_PATH" ]]; then
  echo "No existe la base de datos en $DB_PATH" >&2
  exit 1
fi

if ! command -v sqlite3 >/dev/null 2>&1; then
  echo "sqlite3 es obligatorio para ejecutar backups consistentes" >&2
  exit 1
fi
if ! command -v sha256sum >/dev/null 2>&1; then
  echo "sha256sum es obligatorio para verificar backups" >&2
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

TMP_FILE="$TARGET_FILE.tmp.$$"

cleanup() { rm -f -- "$TMP_FILE"; }
trap cleanup EXIT

[[ "$TARGET_FILE" != *"'"* ]] || {
  echo "La ruta de backup contiene una comilla no admitida" >&2
  exit 1
}

source_quick="$(sqlite3 -readonly "$DB_PATH" 'PRAGMA quick_check;')"
source_fk="$(sqlite3 -readonly "$DB_PATH" 'PRAGMA foreign_key_check;')"
[[ "$source_quick" == "ok" && -z "$source_fk" ]] || {
  echo "La SQLite origen no supera quick_check/foreign_key_check" >&2
  exit 1
}

sqlite3 -cmd '.timeout 5000' "$DB_PATH" ".backup '$TMP_FILE'"

backup_quick="$(sqlite3 -readonly "$TMP_FILE" 'PRAGMA quick_check;')"
backup_fk="$(sqlite3 -readonly "$TMP_FILE" 'PRAGMA foreign_key_check;')"
[[ "$backup_quick" == "ok" && -z "$backup_fk" ]] || {
  echo "El backup temporal no supera quick_check/foreign_key_check" >&2
  exit 1
}

mv -f "$TMP_FILE" "$TARGET_FILE"
chmod 600 "$TARGET_FILE"
sha256sum "$TARGET_FILE" > "$TARGET_FILE.sha256"
chmod 600 "$TARGET_FILE.sha256"
trap - EXIT

mapfile -t expired < <(find "$TARGET_DIR" -maxdepth 1 -type f -name 'guardias-*.sqlite' -print | sort -r | tail -n "+$((KEEP + 1))")
for expired_file in "${expired[@]}"; do
  rm -f -- "$expired_file" "$expired_file.sha256"
done

echo "Backup $KIND verificado en $TARGET_FILE"
echo "quick_check=ok foreign_key_violations=0"
