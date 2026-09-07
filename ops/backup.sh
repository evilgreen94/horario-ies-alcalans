#!/usr/bin/env bash
set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_ROOT="${APP_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"
DB_PATH="${GUARDIAS_DB_PATH:-$APP_ROOT/BD/guardias.sqlite}"
BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/guardias}"
STAMP="$(date +%Y%m%d-%H%M%S)"
TARGET_DIR="${BACKUP_DIR:-$BACKUP_ROOT/manual}"
TARGET_FILE="$TARGET_DIR/guardias-manual-$STAMP.sqlite"
TMP_FILE="$TARGET_FILE.tmp.$$"

cleanup() { rm -f -- "$TMP_FILE"; }
trap cleanup EXIT

command -v sqlite3 >/dev/null 2>&1 || {
  printf 'ERROR: sqlite3 es obligatorio.\n' >&2
  exit 1
}
command -v sha256sum >/dev/null 2>&1 || {
  printf 'ERROR: sha256sum es obligatorio.\n' >&2
  exit 1
}
[[ -f "$DB_PATH" ]] || {
  printf 'ERROR: no existe la SQLite: %s\n' "$DB_PATH" >&2
  exit 1
}
[[ "$TARGET_FILE" != *"'"* ]] || {
  printf 'ERROR: la ruta de backup contiene una comilla no admitida.\n' >&2
  exit 1
}
[[ ! -e "$TARGET_FILE" && ! -e "$TARGET_FILE.sha256" ]] || {
  printf 'ERROR: ya existe el destino de backup: %s\n' "$TARGET_FILE" >&2
  exit 1
}

source_quick="$(sqlite3 -readonly "$DB_PATH" 'PRAGMA quick_check;')"
source_fk="$(sqlite3 -readonly "$DB_PATH" 'PRAGMA foreign_key_check;')"
[[ "$source_quick" == "ok" ]] || {
  printf 'ERROR: la base origen no pasa quick_check: %s\n' "$source_quick" >&2
  exit 1
}
[[ -z "$source_fk" ]] || {
  printf 'ERROR: la base origen tiene violaciones FK; no se publica backup.\n' >&2
  exit 1
}

mkdir -p "$TARGET_DIR"
sqlite3 -cmd '.timeout 5000' "$DB_PATH" ".backup '$TMP_FILE'"

backup_quick="$(sqlite3 -readonly "$TMP_FILE" 'PRAGMA quick_check;')"
backup_fk="$(sqlite3 -readonly "$TMP_FILE" 'PRAGMA foreign_key_check;')"
[[ "$backup_quick" == "ok" ]] || {
  printf 'ERROR: el backup no pasa quick_check: %s\n' "$backup_quick" >&2
  exit 1
}
[[ -z "$backup_fk" ]] || {
  printf 'ERROR: el backup tiene violaciones FK.\n' >&2
  exit 1
}

chmod 600 "$TMP_FILE"
mv -- "$TMP_FILE" "$TARGET_FILE"
sha256sum "$TARGET_FILE" > "$TARGET_FILE.sha256"
chmod 600 "$TARGET_FILE.sha256"
trap - EXIT

printf 'Backup SQLite verificado\n'
printf 'path=%s\nquick_check=ok\nforeign_key_violations=0\n' "$TARGET_FILE"
printf 'sha256='
cut -d ' ' -f 1 "$TARGET_FILE.sha256"
