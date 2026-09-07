#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${GUARDIAS_ENV_FILE:-/etc/guardias/guardias.env}"

[[ -r "$ENV_FILE" ]] || {
  printf 'ERROR: no se puede leer el entorno externo: %s\n' "$ENV_FILE" >&2
  exit 1
}

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

: "${GUARDIAS_DB_PATH:?GUARDIAS_DB_PATH es obligatorio}"
: "${GUARDIAS_SESSION_SECRET:?GUARDIAS_SESSION_SECRET es obligatorio}"

[[ "$GUARDIAS_DB_PATH" = /* ]] || {
  printf 'ERROR: GUARDIAS_DB_PATH debe ser una ruta absoluta.\n' >&2
  exit 1
}

exec node server/app.js
