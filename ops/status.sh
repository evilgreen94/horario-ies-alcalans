#!/usr/bin/env bash
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_ROOT="${APP_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"
DB_PATH="${GUARDIAS_DB_PATH:-$APP_ROOT/BD/guardias.sqlite}"
BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/guardias}"
PM2_PROCESS="${PM2_PROCESS:-guardias}"
PM2_USER="${PM2_USER:-}"
NODE_HOST="127.0.0.1"
NODE_PORT="${PORT:-3000}"
NODE_URL="${NODE_URL:-http://$NODE_HOST:$NODE_PORT}"
NGINX_URL="${NGINX_URL:-http://127.0.0.1}"

failures=0
warnings=0

ok() { printf 'OK   %s\n' "$*"; }
warn() { printf 'WARN %s\n' "$*" >&2; warnings=$((warnings + 1)); }
fail() { printf 'FAIL %s\n' "$*" >&2; failures=$((failures + 1)); }
heading() { printf '\n[%s]\n' "$1"; }

run_pm2() {
  if [[ -n "$PM2_USER" && "$(id -un)" != "$PM2_USER" ]]; then
    sudo -n -iu "$PM2_USER" pm2 "$@"
  else
    pm2 "$@"
  fi
}

heading "release"
printf 'app=%s\ndatabase=%s\nbackups=%s\n' "$APP_ROOT" "$DB_PATH" "$BACKUP_ROOT"
if [[ -s "$APP_ROOT/.deployed-release" ]]; then
  printf 'release='
  head -n 1 "$APP_ROOT/.deployed-release"
elif command -v git >/dev/null 2>&1 && git -C "$APP_ROOT" rev-parse HEAD >/dev/null 2>&1; then
  printf 'release='
  git -C "$APP_ROOT" rev-parse HEAD
  warn ".deployed-release no existe; se usa el checkout Git como referencia"
else
  fail "no se puede identificar el release instalado"
fi

heading "services"
if command -v pm2 >/dev/null 2>&1; then
  pm2_pid="$(run_pm2 pid "$PM2_PROCESS" 2>/dev/null | tr -d '[:space:]' || true)"
  if [[ "$pm2_pid" =~ ^[1-9][0-9]*$ ]]; then
    ok "PM2 $PM2_PROCESS está activo (pid $pm2_pid)"
  else
    fail "PM2 $PM2_PROCESS no está activo o usa otro usuario"
  fi
else
  fail "pm2 no está disponible"
fi

if command -v systemctl >/dev/null 2>&1 && systemctl is-active --quiet nginx; then
  ok "Nginx está activo"
else
  fail "Nginx no está activo"
fi

if command -v systemctl >/dev/null 2>&1 && systemctl is-active --quiet guardias.service; then
  fail "guardias.service está activo; no debe coexistir con PM2"
else
  ok "no se detecta guardias.service activo"
fi

heading "listener"
if command -v ss >/dev/null 2>&1; then
  listeners="$(ss -H -ltn 2>/dev/null | awk -v port="$NODE_PORT" '$4 ~ (":" port "$")' || true)"
  if [[ -z "$listeners" ]]; then
    fail "no hay listener TCP en el puerto $NODE_PORT"
  elif printf '%s\n' "$listeners" | awk -v endpoint="$NODE_HOST:$NODE_PORT" '$4 != endpoint { exit 1 }'; then
    ok "Node escucha solo en $NODE_HOST:$NODE_PORT"
    printf '%s\n' "$listeners"
  else
    fail "el puerto $NODE_PORT no está limitado a $NODE_HOST"
    printf '%s\n' "$listeners"
  fi
else
  fail "ss no está disponible"
fi

heading "http"
if command -v curl >/dev/null 2>&1 && curl -fsS --max-time 5 "$NODE_URL/api/health" >/dev/null; then
  ok "health Node directo"
else
  fail "health Node directo: $NODE_URL/api/health"
fi
if command -v curl >/dev/null 2>&1 && curl -fsS --max-time 5 "$NGINX_URL/api/health" >/dev/null; then
  ok "health a través de Nginx"
else
  fail "health Nginx: $NGINX_URL/api/health"
fi

heading "sqlite"
if [[ ! -f "$DB_PATH" ]]; then
  fail "no existe SQLite: $DB_PATH"
elif ! command -v sqlite3 >/dev/null 2>&1; then
  fail "sqlite3 no está disponible"
else
  quick_check="$(sqlite3 -readonly "$DB_PATH" 'PRAGMA quick_check;' 2>&1 || true)"
  if [[ "$quick_check" == "ok" ]]; then
    ok "SQLite quick_check=ok"
  else
    fail "SQLite quick_check: $quick_check"
  fi
  fk_rows="$(sqlite3 -readonly "$DB_PATH" 'PRAGMA foreign_key_check;' 2>&1 || true)"
  if [[ -z "$fk_rows" ]]; then
    ok "SQLite foreign_key_check sin filas"
  else
    fail "SQLite foreign_key_check devolvió filas"
    printf '%s\n' "$fk_rows"
  fi

  academic_year="$(sqlite3 -readonly -separator ' | ' "$DB_PATH" "SELECT code,status FROM academic_years WHERE status='active' ORDER BY id DESC;" 2>/dev/null || true)"
  active_dataset="$(sqlite3 -readonly -separator ' | ' "$DB_PATH" "SELECT id,label,source_format,status FROM schedule_datasets WHERE status='active' ORDER BY id DESC;" 2>/dev/null || true)"
  if [[ -n "$academic_year" ]]; then
    ok "curso activo: $academic_year"
  else
    fail "no hay curso académico activo"
  fi
  if [[ -n "$active_dataset" ]]; then
    ok "dataset activo: $active_dataset"
  else
    fail "no hay dataset horario activo"
  fi
fi

heading "capacity and backup"
if command -v df >/dev/null 2>&1; then
  df -h "$APP_ROOT" 2>/dev/null || warn "no se pudo consultar espacio de $APP_ROOT"
  if [[ -e "$BACKUP_ROOT" ]]; then
    df -h "$BACKUP_ROOT" 2>/dev/null || warn "no se pudo consultar espacio de backups"
  else
    fail "no existe el directorio de backups: $BACKUP_ROOT"
  fi
else
  warn "df no está disponible"
fi

if [[ -d "$BACKUP_ROOT" ]]; then
  latest_backup="$(find "$BACKUP_ROOT" -type f -name '*.sqlite' -printf '%T@|%TY-%Tm-%TdT%TH:%TM:%TS|%p\n' 2>/dev/null |
    sort -n | tail -n 1 || true)"
  if [[ -n "$latest_backup" ]]; then
    latest_backup_rest="${latest_backup#*|}"
    latest_backup_date="${latest_backup_rest%%|*}"
    latest_backup_path="${latest_backup_rest#*|}"
    ok "último backup: $latest_backup_date $latest_backup_path"
    if command -v sqlite3 >/dev/null 2>&1; then
      latest_quick="$(sqlite3 -readonly "$latest_backup_path" 'PRAGMA quick_check;' 2>&1 || true)"
      latest_fk="$(sqlite3 -readonly "$latest_backup_path" 'PRAGMA foreign_key_check;' 2>&1 || true)"
      if [[ "$latest_quick" == "ok" && -z "$latest_fk" ]]; then
        ok "último backup supera quick_check y foreign_key_check"
      else
        fail "el último backup no supera integridad/FK"
      fi
    fi
  else
    fail "no se encontró ningún backup SQLite"
  fi
fi

heading "summary"
printf 'critical_failures=%d warnings=%d\n' "$failures" "$warnings"
(( failures == 0 ))
