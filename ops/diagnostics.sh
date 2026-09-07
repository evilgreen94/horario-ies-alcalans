#!/usr/bin/env bash
set -eu
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_ROOT="${APP_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"
DB_PATH="${GUARDIAS_DB_PATH:-$APP_ROOT/BD/guardias.sqlite}"
BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/guardias}"
PM2_PROCESS="${PM2_PROCESS:-guardias}"
PM2_USER="${PM2_USER:-}"
DIAGNOSTICS_DIR="${DIAGNOSTICS_DIR:-/tmp/guardias-diagnostics}"
STAMP="$(date +%Y%m%d-%H%M%S)"
REPORT="$DIAGNOSTICS_DIR/guardias-diagnostics-$STAMP-$$.txt"

mkdir -p "$DIAGNOSTICS_DIR"

sanitize() {
  sed -E -e '/(authorization|set-cookie|cookie|password|passwd|session[_-]?secret|password_hash|password_salt|token)[[:space:]]*[:=]/I s/.*/[REDACTED SECRET-BEARING LINE]/' -e 's/(Bearer|Basic)[[:space:]]+[A-Za-z0-9._~+\/-]+=*/\1 [REDACTED]/Ig'
}

run_pm2() {
  if [[ -n "$PM2_USER" && "$(id -un)" != "$PM2_USER" ]]; then
    sudo -n -iu "$PM2_USER" pm2 "$@"
  else
    pm2 "$@"
  fi
}

section() { printf '\n===== %s =====\n' "$1" >> "$REPORT"; }

{
  printf 'Guardias diagnostics\ncreated=%s\nhost=%s\nuser=%s\napp=%s\ndatabase=%s\n' "$(date -Is)" "$(hostname)" "$(id -un)" "$APP_ROOT" "$DB_PATH"
} | sanitize > "$REPORT"

section "release and system"
{
  test -f "$APP_ROOT/.deployed-release" && cat "$APP_ROOT/.deployed-release" || true
  git -C "$APP_ROOT" rev-parse HEAD 2>/dev/null || true
  uname -a
  uptime
  date -Is
} 2>&1 | sanitize >> "$REPORT"

section "operational status"
{
  APP_ROOT="$APP_ROOT" GUARDIAS_DB_PATH="$DB_PATH" BACKUP_ROOT="$BACKUP_ROOT" PM2_PROCESS="$PM2_PROCESS" PM2_USER="$PM2_USER" bash "$SCRIPT_DIR/status.sh"
} 2>&1 | sanitize >> "$REPORT"

section "pm2"
{
  command -v pm2 >/dev/null 2>&1 && run_pm2 status
  command -v pm2 >/dev/null 2>&1 && run_pm2 logs "$PM2_PROCESS" --lines 150 --nostream
} 2>&1 | sanitize >> "$REPORT"

section "nginx"
{
  systemctl status nginx --no-pager 2>/dev/null || true
  journalctl -u nginx --since '-30 min' --no-pager 2>/dev/null || true
} 2>&1 | sanitize >> "$REPORT"

section "listeners and http"
{
  ss -ltnp 2>/dev/null | grep -E '(:80|:3000)([[:space:]]|$)' || true
  curl -sS -o /dev/null -w 'node_health_http=%{http_code}\n' --max-time 5 "http://127.0.0.1:${PORT:-3000}/api/health" || true
  curl -sS -o /dev/null -w 'nginx_health_http=%{http_code}\n' --max-time 5 "${NGINX_URL:-http://127.0.0.1}/api/health" || true
} 2>&1 | sanitize >> "$REPORT"

section "sqlite"
{
  if [[ -f "$DB_PATH" ]] && command -v sqlite3 >/dev/null 2>&1; then
    sqlite3 -readonly "$DB_PATH" 'PRAGMA quick_check; PRAGMA foreign_key_check;'
    sqlite3 -readonly -header -column "$DB_PATH" 'SELECT name,applied_at FROM schema_migrations ORDER BY name;'
    sqlite3 -readonly -header -column "$DB_PATH" "SELECT id,code,status,starts_on,ends_on FROM academic_years ORDER BY id;
       SELECT id,label,source_format,status,validated_at,activated_at
       FROM schedule_datasets ORDER BY id;"
  else
    printf 'SQLite o sqlite3 no disponible\n'
  fi
  ls -l "$DB_PATH" "$DB_PATH-wal" "$DB_PATH-shm" 2>&1 || true
} 2>&1 | sanitize >> "$REPORT"

section "capacity"
{
  df -h "$APP_ROOT" "$BACKUP_ROOT" 2>/dev/null || true
  df -i "$APP_ROOT" "$BACKUP_ROOT" 2>/dev/null || true
  free -h 2>/dev/null || true
  journalctl --disk-usage 2>/dev/null || true
} 2>&1 | sanitize >> "$REPORT"

section "backups"
{
  if [[ -d "$BACKUP_ROOT" ]]; then
    find "$BACKUP_ROOT" -type f -name '*.sqlite' -printf '%TY-%Tm-%TdT%TH:%TM:%TS %s %p\n' 2>/dev/null | sort | tail -n 20
  else
    printf 'No existe %s\n' "$BACKUP_ROOT"
  fi
  systemctl list-timers 'guardias-backup-*' --all 2>/dev/null || true
} 2>&1 | sanitize >> "$REPORT"

chmod 600 "$REPORT"
printf 'Diagnóstico creado: %s\n' "$REPORT"
printf 'Revísalo antes de compartirlo; no adjuntes .env, cookies ni credenciales.\n'
