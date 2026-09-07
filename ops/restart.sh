#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_ROOT="${APP_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"
DB_PATH="${GUARDIAS_DB_PATH:-$APP_ROOT/BD/guardias.sqlite}"
PM2_PROCESS="${PM2_PROCESS:-guardias}"
PM2_USER="${PM2_USER:-}"
NODE_PORT="${PORT:-3000}"
NODE_URL="${NODE_URL:-http://127.0.0.1:$NODE_PORT}"
NGINX_URL="${NGINX_URL:-http://127.0.0.1}"

run_pm2() {
  if [[ -n "$PM2_USER" && "$(id -un)" != "$PM2_USER" ]]; then
    sudo -n -iu "$PM2_USER" pm2 "$@"
  else
    pm2 "$@"
  fi
}

command -v sqlite3 >/dev/null 2>&1 || {
  printf 'FAILURE: sqlite3 no está disponible.\n' >&2
  exit 1
}
command -v pm2 >/dev/null 2>&1 || {
  printf 'FAILURE: pm2 no está disponible.\n' >&2
  exit 1
}
command -v curl >/dev/null 2>&1 || {
  printf 'FAILURE: curl no está disponible.\n' >&2
  exit 1
}
[[ -f "$DB_PATH" ]] || {
  printf 'FAILURE: no existe %s\n' "$DB_PATH" >&2
  exit 1
}

quick_check="$(sqlite3 -readonly "$DB_PATH" 'PRAGMA quick_check;')"
fk_rows="$(sqlite3 -readonly "$DB_PATH" 'PRAGMA foreign_key_check;')"
[[ "$quick_check" == "ok" && -z "$fk_rows" ]] || {
  printf 'FAILURE: SQLite no supera integridad/FK; no se reinicia.\n' >&2
  exit 1
}

current_pid="$(run_pm2 pid "$PM2_PROCESS" 2>/dev/null | tr -d '[:space:]' || true)"
[[ "$current_pid" =~ ^[1-9][0-9]*$ ]] || {
  printf 'FAILURE: el proceso PM2 %s no existe; no se creará automáticamente.\n' "$PM2_PROCESS" >&2
  exit 1
}

printf 'SQLite correcta. Reiniciando solo PM2/%s...\n' "$PM2_PROCESS"
run_pm2 restart "$PM2_PROCESS" >/dev/null

for _attempt in $(seq 1 20); do
  if curl -fsS --max-time 2 "$NODE_URL/api/health" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

listeners="$(ss -H -ltn 2>/dev/null | awk -v port="$NODE_PORT" '$4 ~ (":" port "$")' || true)"
[[ -n "$listeners" ]] || {
  printf 'FAILURE: no hay listener en %s.\n' "$NODE_PORT" >&2
  exit 1
}
printf '%s\n' "$listeners" | awk -v endpoint="127.0.0.1:$NODE_PORT" '$4 != endpoint { exit 1 }' || {
    printf 'FAILURE: Node no está limitado a 127.0.0.1:%s.\n' "$NODE_PORT" >&2
    exit 1
  }

curl -fsS --max-time 5 "$NODE_URL/api/health" >/dev/null || {
  printf 'FAILURE: health Node no responde.\n' >&2
  exit 1
}
curl -fsS --max-time 5 "$NGINX_URL/api/health" >/dev/null || {
  printf 'FAILURE: health Nginx no responde.\n' >&2
  exit 1
}

printf 'SUCCESS: Guardias reiniciado; Node y Nginx responden y el listener es loopback.\n'
