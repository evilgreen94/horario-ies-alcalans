#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${GUARDIAS_ENV_FILE:-/etc/guardias/guardias.env}"
RELEASE_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
NODE_BIN="$RELEASE_ROOT/runtime/node"

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

[[ -x "$NODE_BIN" ]] || {
  printf 'ERROR: falta el runtime Node incluido en el release: %s\n' "$NODE_BIN" >&2
  exit 1
}

cd "$RELEASE_ROOT"
exec "$NODE_BIN" server/app.js
