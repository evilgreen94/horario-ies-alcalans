# Despliegue limpio y reversible — ARGOS / Guardias 2026/27

Este documento prepara una ventana autorizada; no la autoriza. El despliegue es
por artefacto offline, no usa `git pull`, GitHub, `npm install` ni `npm ci` en el
servidor. Arquitectura objetivo:

```text
LAN → Nginx :80 → Node 127.0.0.1:3000 → /var/lib/guardias/guardias.sqlite
```

## 0. Hechos auditados y condiciones de parada

Producción fue inventariada en lectura el 7-09-2026: usuario `rafa`, PM2
`guardias`, `PM2_HOME=/home/rafa/.pm2`, unidad `pm2-rafa.service`, aplicación
legacy en `/srv/guardias/horario-ies-alcalans`, Nginx en
`/etc/nginx/sites-available/guardias` y symlink en `sites-enabled`. El proxy
actual usa `localhost:3000`; Node escucha en `*:3000`. La SQLite legacy y su WAL
están activos. No hay backup periódico verificado. El checkout y el tarball
antiguos contienen estado local y material sensible: se ha elegido un
**redeploy limpio controlado**, no una actualización incremental.

Abortar la ventana si:

- el SHA o checksum del artefacto no son los aprobados;
- el runtime Node incluido no es `>=22.9 <23`, o faltan `sqlite3`, PM2/Nginx;
- no hay espacio para dos releases y tres copias de la DB;
- no se obtiene un backup SQLite verificable y una copia fuera del servidor;
- `quick_check` no es `ok` o `foreign_key_check` devuelve filas;
- aparece otro escritor, otro gestor de Guardias o un segundo proxy a `:3000`;
- falla una migración, el listener no es loopback o el smoke no coincide;
- no existe aprobación humana para importar o activar el dataset.

Nunca imprimir `.env`, cookies, tokens, claves, hashes ni contraseñas.

## 1. Artefactos preparados localmente

Desde el commit limpio y aprobado de `feat/argos-1.0.1-unified-web-auth`, marcado
con `argos-v1.0.1-rc1`:

```powershell
$out = Join-Path $env:TEMP ('guardias-release-' + [guid]::NewGuid().ToString('N'))
.\deploy\build-release.ps1 -OutputDirectory $out
Get-ChildItem $out
```

El script usa `node:22-bookworm-slim` en Docker Linux/amd64, extrae una allowlist
del commit, compila las dependencias nativas dentro de esa imagen mediante
`npm ci --omit=dev`, carga el módulo `sqlite3` resultante y rechaza el artefacto
si `sqlite3` o el Node portable requieren una versión superior a `GLIBC_2.35`.
El tar incluye `runtime/node`; producción no descarga ni instala Node/npm. Después crea:

```text
guardias-release-<sha-corto>-linux-x64.tar.gz
guardias-release-<sha-corto>-linux-x64.tar.gz.sha256
```

El tar incluye runtime, frontend, imágenes, `ops/`, tooling Linux,
`.env.example`, `package*.json`, `node_modules` Linux y `.deployed-release`.
Excluye Git, BD, secretos, PDF/censo/XML, `json_profes`, datasets retirados,
tests, utilidades locales de credenciales y `node_modules` Windows.

Transferir exactamente: tarball, checksum y —por canal privado separado— el XML
oficial aprobado. PDF/censo solo son evidencia diagnóstica y no son necesarios
para operar. No transferir checkout, `.env`, SQLite local ni temporales.

## 2. Variables de la ventana

En producción, sustituir solo los marcadores aprobados:

```bash
set -u
export RELEASE='<sha-completo-aprobado>'
export SHORT='<sha-corto-12>'
export ARTIFACT="/var/tmp/guardias-release-$SHORT-linux-x64.tar.gz"
export ARTIFACT_SHA="$ARTIFACT.sha256"
export ROOT='/srv/guardias'
export OLD_APP='/srv/guardias/horario-ies-alcalans'
export RELEASE_DIR="$ROOT/releases/$RELEASE"
export CURRENT="$ROOT/current"
export OLD_DB="$OLD_APP/BD/guardias.sqlite"
export DB='/var/lib/guardias/guardias.sqlite'
export ENV_FILE='/etc/guardias/guardias.env'
export BACKUP_ROOT='/var/backups/guardias'
export DEPLOY_BACKUPS="$BACKUP_ROOT/deployments"
export PM2_USER='rafa'
export APP_USER='rafa'
export APP_GROUP='rafa'
export LAN_URL='http://172.28.244.250'
export STAMP="$(date +%Y%m%d-%H%M%S)"

test "${#RELEASE}" -eq 40
test -f "$ARTIFACT" -a -f "$ARTIFACT_SHA"
test -d "$OLD_APP" -a -f "$OLD_DB"
```

## 3. Preflight, backup y copia fuera del servidor

Primero, solo lectura:

```bash
id
uname -m
node --version
npm --version
sqlite3 --version
sudo -iu "$PM2_USER" pm2 status
sudo systemctl status pm2-rafa.service nginx --no-pager
sudo nginx -t
sudo nginx -T | grep -n -E 'listen|server_name|proxy_pass'
sudo ss -ltnp
df -h "$ROOT" /var/lib /var/backups /var/tmp
df -i "$ROOT" /var/lib /var/backups
sha256sum -c "$ARTIFACT_SHA"
tar -tzf "$ARTIFACT" >/dev/null
```

Crear el área de backups y una copia coherente mientras el servicio sigue vivo:

```bash
sudo install -d -m 750 -o "$APP_USER" -g "$APP_GROUP" \
  "$BACKUP_ROOT" "$BACKUP_ROOT/daily" "$BACKUP_ROOT/weekly" \
  "$BACKUP_ROOT/monthly" "$DEPLOY_BACKUPS"

export LIVE_BACKUP="$DEPLOY_BACKUPS/guardias-live-$STAMP.sqlite"
sudo -u "$APP_USER" sqlite3 -cmd '.timeout 5000' "$OLD_DB" ".backup '$LIVE_BACKUP'"
sudo -u "$APP_USER" sqlite3 -readonly "$LIVE_BACKUP" 'PRAGMA quick_check; PRAGMA foreign_key_check;'
sudo -u "$APP_USER" sha256sum "$LIVE_BACKUP" > "$LIVE_BACKUP.sha256"
```

Debe verse `ok` y ninguna fila adicional. Antes de parar, copiar `$LIVE_BACKUP`
y su checksum a un equipo autorizado de la LAN y verificar allí el SHA-256. Sin
esa segunda copia, parar.

Preservar rollback sin mostrar entornos:

```bash
sudo cp -a /home/rafa/.pm2/dump.pm2 "$DEPLOY_BACKUPS/pm2-dump-$STAMP.pm2"
sudo cp -a /etc/nginx/sites-available/guardias "$DEPLOY_BACKUPS/nginx-guardias-$STAMP.conf"
sudo tar -C "$OLD_APP" --exclude='./BD' -czpf \
  "$DEPLOY_BACKUPS/legacy-app-$STAMP.tar.gz" .
sudo chmod 600 "$DEPLOY_BACKUPS/legacy-app-$STAMP.tar.gz"
sudo sha256sum "$DEPLOY_BACKUPS/legacy-app-$STAMP.tar.gz" > \
  "$DEPLOY_BACKUPS/legacy-app-$STAMP.tar.gz.sha256"
```

Ese tar legacy contiene material sensible: no compartirlo y retirarlo solo tras
inventario y aprobación.

## 4. Detener escritores y congelar la SQLite legacy

```bash
sudo -iu "$PM2_USER" pm2 stop guardias
sudo ss -ltnp | grep ':3000' && { echo 'Aún hay un escritor'; exit 1; } || true

export FROZEN="$DEPLOY_BACKUPS/legacy-db-files-$STAMP"
sudo install -d -m 700 "$FROZEN"
sudo cp -a "$OLD_DB" "$FROZEN/guardias.sqlite"
sudo test ! -e "$OLD_DB-wal" || sudo cp -a "$OLD_DB-wal" "$FROZEN/guardias.sqlite-wal"
sudo test ! -e "$OLD_DB-shm" || sudo cp -a "$OLD_DB-shm" "$FROZEN/guardias.sqlite-shm"

export STOPPED_BACKUP="$DEPLOY_BACKUPS/guardias-stopped-$STAMP.sqlite"
sudo -u "$APP_USER" sqlite3 -cmd '.timeout 5000' "$OLD_DB" ".backup '$STOPPED_BACKUP'"
sudo -u "$APP_USER" sqlite3 -readonly "$STOPPED_BACKUP" 'PRAGMA quick_check; PRAGMA foreign_key_check;'
sudo -u "$APP_USER" sha256sum "$STOPPED_BACKUP" > "$STOPPED_BACKUP.sha256"
```

No borrar ni mezclar el DB/WAL/SHM original. El directorio legacy se conserva
sin uso hasta cerrar el piloto.

## 5. Instalar release, DB externa y entorno

```bash
sudo install -d -m 755 -o "$APP_USER" -g "$APP_GROUP" "$ROOT/releases"
sudo install -d -m 755 -o "$APP_USER" -g "$APP_GROUP" "$RELEASE_DIR"
sudo -u "$APP_USER" tar -xzf "$ARTIFACT" -C "$RELEASE_DIR"
test "$(sed -n 's/^commit=//p' "$RELEASE_DIR/.deployed-release")" = "$RELEASE"
test -d "$RELEASE_DIR/node_modules/sqlite3"

sudo install -d -m 750 -o "$APP_USER" -g "$APP_GROUP" /var/lib/guardias
sudo install -m 600 -o "$APP_USER" -g "$APP_GROUP" "$STOPPED_BACKUP" "$DB"
sudo -u "$APP_USER" sqlite3 -readonly "$DB" 'PRAGMA quick_check; PRAGMA foreign_key_check;'

sudo install -d -m 700 -o "$APP_USER" -g "$APP_GROUP" /etc/guardias
sudo install -m 600 -o "$APP_USER" -g "$APP_GROUP" /dev/null "$ENV_FILE"
sudo -u "$APP_USER" "${EDITOR:-nano}" "$ENV_FILE"
sudo chmod 600 "$ENV_FILE"
```

Contenido mínimo, introducido interactivamente:

```dotenv
NODE_ENV=production
PORT=3000
GUARDIAS_DB_PATH=/var/lib/guardias/guardias.sqlite
GUARDIAS_SESSION_SECRET=<aleatorio-largo-y-nuevo>
GUARDIAS_TRUST_PROXY=1
GUARDIAS_CORS_ORIGINS=
```

Las variables admin/superadmin solo son necesarias si esos roles aún no existen
en `auth_credentials`; se usan una vez para `db:init` y se retiran antes de PM2.
Nunca guardar claves reales en Git, comandos o actas.

```bash
sudo ln -s "$RELEASE_DIR" "$ROOT/current.next"
sudo mv -Tf "$ROOT/current.next" "$CURRENT"
readlink -f "$CURRENT"
```

## 6. Migración exacta e integridad

Guardar recuentos legacy antes de migrar:

```bash
sudo -u "$APP_USER" sqlite3 -readonly "$DB" \
  "SELECT 'ausencias',COUNT(*) FROM ausencias UNION ALL
   SELECT 'biblioteca_guardias',COUNT(*) FROM biblioteca_guardias UNION ALL
   SELECT 'historial',COUNT(*) FROM historial UNION ALL
   SELECT 'tareas_profesorado',COUNT(*) FROM tareas_profesorado UNION ALL
   SELECT 'app_state',COUNT(*) FROM app_state;" \
  > "$DEPLOY_BACKUPS/counts-before-$STAMP.txt"
```

Ejecutar dos veces. `db:init` usa `skipWeeklyReset`; no ejecuta mantenimiento:

```bash
sudo -iu "$APP_USER" bash -lc \
  "set -a; . '$ENV_FILE'; set +a; cd '$CURRENT'; ./runtime/node server/scripts/init-db.js"
sudo -iu "$APP_USER" bash -lc \
  "set -a; . '$ENV_FILE'; set +a; cd '$CURRENT'; ./runtime/node server/scripts/init-db.js"

sudo -u "$APP_USER" sqlite3 -readonly "$DB" \
  'PRAGMA quick_check; PRAGMA foreign_key_check;'
sudo -u "$APP_USER" sqlite3 -readonly -header -column "$DB" \
  'SELECT name,applied_at FROM schema_migrations ORDER BY name;'
```

Deben figurar `001_individual_teacher_auth.sql`,
`002_academic_schedule_model.sql` y `003_final_session_security_and_schedule_types.sql`.
Repetir los recuentos y compararlos: las
tablas legacy no cambian. Si falla, no arrancar; volver al par PM2/DB legacy con
aprobación.

## 7. PM2 sin CWD ni secretos legacy

Se reutiliza PM2 con el wrapper versionado. Este carga el entorno externo después
de iniciar, por lo que no depende de `.env` dentro del release.

```bash
sudo -iu "$PM2_USER" pm2 delete guardias
sudo -iu "$PM2_USER" env GUARDIAS_ENV_FILE="$ENV_FILE" \
  pm2 start "$CURRENT/deploy/linux/start-guardias.sh" \
  --name guardias --interpreter bash --cwd "$CURRENT"
sudo -iu "$PM2_USER" pm2 status
sudo -iu "$PM2_USER" pm2 logs guardias --lines 100 --nostream
sudo ss -ltnp | grep ':3000'
curl -fsS http://127.0.0.1:3000/api/health
```

Único listener válido: `127.0.0.1:3000`. Revisar solo nombres de variables en
PM2/dump; si contiene secretos en su definición, parar sin imprimir valores.

```bash
sudo -iu "$PM2_USER" pm2 save
sudo systemctl is-enabled pm2-rafa.service
sudo systemctl is-active pm2-rafa.service
```

`pm2 save` se ejecuta solo aquí, en la ventana autorizada y tras el smoke Node.

## 8. Nginx objetivo y rollback inmediato

El archivo exacto es `deploy/linux/guardias.nginx.conf`. Se confía en una sola
capa (`GUARDIAS_TRUST_PROXY=1`); `X-Forwarded-For` permite limitar login por
cliente y `X-Forwarded-Proto` prepara cookies seguras si se añade TLS.

```bash
export NGINX_CONF='/etc/nginx/sites-available/guardias'
export NGINX_BACKUP="$DEPLOY_BACKUPS/nginx-guardias-$STAMP.conf"
sudo install -m 644 "$CURRENT/deploy/linux/guardias.nginx.conf" "$NGINX_CONF.new"
sudo mv -f "$NGINX_CONF.new" "$NGINX_CONF"
sudo nginx -t
sudo systemctl reload nginx
curl -fsS http://127.0.0.1/api/health
```

Si falla:

```bash
sudo cp -a "$NGINX_BACKUP" "$NGINX_CONF"
sudo nginx -t
sudo systemctl reload nginx
```

Confirmar con `sudo nginx -T` que nada más proxifica a `:3000`.

## 9. Smoke previo al dataset

```bash
curl -fsS http://127.0.0.1:3000/api/health
curl -fsSI http://127.0.0.1:3000/
curl -fsSI http://127.0.0.1:3000/guardias.html
curl -fsSI http://127.0.0.1:3000/app/
curl -sS -o /var/tmp/no-active.json -w '%{http_code}\n' \
  http://127.0.0.1:3000/api/schedule/active
```

Sin dataset activo, `/api/schedule/active` devuelve `503`; `guardias.html` no
muestra 2025/26. Verificar login/logout legacy, permisos y endpoints de
guardias/ausencias sin escribir contraseñas en comandos.

## 10. Importar, validar y activar el XML oficial

El procedimiento obligatorio es: XML oficial → inspección/parseo → validación
canónica → importación SQLite como `validated` → informe y diferencias →
aprobación humana → activación explícita. La importación nunca autoactiva. Si el
horario cambia durante septiembre, se importa otra versión por el mismo proceso;
no se edita ni sustituye silenciosamente la activa.

```bash
export IMPORT_DIR="/var/tmp/guardias-import-$RELEASE"
install -d -m 700 "$IMPORT_DIR"
# Transferir por canal privado y verificar SHA-256: Horario.xml

sudo -iu "$PM2_USER" pm2 stop guardias
export PRE_IMPORT_BACKUP="$DEPLOY_BACKUPS/guardias-before-import-$STAMP.sqlite"
sudo -u "$APP_USER" sqlite3 "$DB" ".backup '$PRE_IMPORT_BACKUP'"

sudo -iu "$APP_USER" bash -lc \
  "cd '$CURRENT' && ./runtime/node server/scripts/prepare-ghc-schedule.js \
   --input '$IMPORT_DIR/Horario.xml' --academic-year 2026/27"
sudo -iu "$APP_USER" bash -lc \
  "cd '$CURRENT' && ./runtime/node server/scripts/prepare-ghc-schedule.js \
   --input '$IMPORT_DIR/Horario.xml' --academic-year 2026/27 --db '$DB' --import \
   --allow-operational-db IMPORT_VALIDATED_GHC_DATASET_ONLY"
```

La salida debe indicar `activated: false`, `validated` y:

| Métrica | Total |
|---|---:|
| docentes | 88/88 |
| total canónico | 2.143 |
| clase | 1.206 |
| guardia lectiva | 155 |
| reunión | 220 |
| other/complementaria | 494 |
| `GUÀRDIES PATI` | 57 |
| `BIBLIOTECA PATI` | 5 |
| `PATIS INCLUSIUS` | 6 |
| duplicados / anomalías | 0 / 0 |

Las obligaciones de recreo están ocupadas y sin puesto inventado. Revisar
dataset, periodos, recuentos y `validation_report_json`; fijar el ID aprobado:

```bash
export DATASET_ID='<id-validado-y-revisado>'
sudo -u "$APP_USER" sqlite3 -readonly "$DB" \
  "SELECT id,label,status FROM schedule_datasets ORDER BY id;
   SELECT session_type,COUNT(*) FROM teacher_schedule_sessions
   WHERE dataset_id=$DATASET_ID GROUP BY session_type;
   SELECT COUNT(*) FROM teacher_schedule_sessions WHERE dataset_id=$DATASET_ID;"

export PRE_ACTIVATION_BACKUP="$DEPLOY_BACKUPS/guardias-before-activation-$STAMP.sqlite"
sudo -u "$APP_USER" sqlite3 "$DB" ".backup '$PRE_ACTIVATION_BACKUP'"
sudo -u "$APP_USER" sqlite3 -readonly "$PRE_ACTIVATION_BACKUP" \
  'PRAGMA quick_check; PRAGMA foreign_key_check;'

sudo -iu "$APP_USER" bash -lc \
  "cd '$CURRENT' && ./runtime/node server/scripts/activate-canonical-schedule.js \
   --db '$DB' --dataset-id '$DATASET_ID' \
   --allow-operational-db ACTIVATE_APPROVED_DATASET"
```

Arrancar Guardias y repetir listener, health y smoke. Debe existir exactamente
un curso y un dataset `active`.

## 11. Backups programados

El script usa `.backup`, verifica origen/destino, crea SHA-256 y retiene 14
diarios, 8 semanales y 12 mensuales.

```bash
sudo install -m 644 "$CURRENT/deploy/linux/guardias-backup-daily.service" /etc/systemd/system/
sudo install -m 644 "$CURRENT/deploy/linux/guardias-backup-daily.timer" /etc/systemd/system/
sudo install -m 644 "$CURRENT/deploy/linux/guardias-backup-weekly.service" /etc/systemd/system/
sudo install -m 644 "$CURRENT/deploy/linux/guardias-backup-weekly.timer" /etc/systemd/system/
sudo install -m 644 "$CURRENT/deploy/linux/guardias-backup-monthly.service" /etc/systemd/system/
sudo install -m 644 "$CURRENT/deploy/linux/guardias-backup-monthly.timer" /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now guardias-backup-daily.timer \
  guardias-backup-weekly.timer guardias-backup-monthly.timer
sudo systemctl start guardias-backup-daily.service
sudo systemctl status guardias-backup-daily.service --no-pager
sudo systemctl list-timers 'guardias-backup-*' --all
sudo -u "$APP_USER" bash "$CURRENT/ops/status.sh"
```

No instalar `deploy/linux/guardias.service`: producción usa PM2.

## 12. Checklist humano obligatorio

Rafa comprueba desde servidor y otro equipo LAN:

- `/`, `/guardias.html`, `/app/`; `http://SERVER_IP` funciona;
- `http://SERVER_IP:3000` **no** es accesible;
- admin/Jefatura, superadmin, logout y sesión;
- cuenta individual piloto aprobada RMLL y otra docente normal;
- manipular rol, `userId`, body, parámetros o cookie no eleva permisos;
- actividad actual/siguiente, aula/grupo, clase, guardia, reunión, `other`, libre,
  recreo, patio, biblioteca y fuera de horario;
- ausencia, asignación/retirada de guardia y sustitución controlada;
- ningún dato 2025/26 aparece como fallback;
- `BIBLIOTECA PATI` está ocupada en Biblioteca fija y no rota;
- `PATIS INCLUSIUS` está ocupado y no es guardia;
- ninguno de los tres conceptos especiales genera cobertura automática;
- consola/red del navegador sin errores inesperados.

No usar `create-local-teacher.js` en producción. Si aún no existen cuentas
individuales aprobadas, esa parte del piloto espera autorización separada; no se
crean 88 credenciales.

## 13. Política anual de fuentes

El XML oficial es primario. Exige curso explícito y `source_code`, rechaza match
solo por nombre y queda `validated`. El PDF permanece fuera del servidor como
contraste independiente. Cualquier XML posterior se importa como nueva versión,
se reconcilia, se aprueba y solo después se activa con backup preactivación.

### Aprovisionamiento de cuentas

Solo después de aprobar el XML final y el paso de provisión, crear la cuenta
bootstrap con el CLI versionado y la confirmación operativa exacta:

```bash
sudo -iu "$APP_USER" bash -lc \
  "cd '$CURRENT' && ./runtime/node server/scripts/bootstrap-superadmin.js \
   --db '$DB' --source-code RMLL \
   --allow-operational-db BOOTSTRAP_APPROVED_SUPERADMIN"
```

La salida entrega una clave temporal una vez. No capturarla en logs ni historial;
guardarla solo por el canal privado aprobado y comprobar el cambio obligatorio.
Repetir el comando debe informar la cuenta existente sin resetearla.

Después, entrar como Superadmin en Usuarios → Crear cuentas del profesorado,
seleccionar el dataset aprobado y revisar todas las clasificaciones. Cualquier
`CONFLICT` o `INVALID` bloquea la operación. Tras confirmación, las cuentas nuevas
reciben únicamente `teacher`; las ya enlazadas se omiten y las históricas se
enlazan al perfil anual sin cambiar clave ni roles. Descargar el CSV de un solo
uso desde el navegador, distribuirlo en privado y eliminarlo: el servidor no lo
persiste. Si se pierde una clave, usar el reset individual; no hay recuperación.

Los pocos usuarios de Jefatura reciben `admin`; los de Administración técnica,
`superadmin`; una cuenta combinada recibe ambos de forma explícita. Ninguno se
deduce del otro. El reset Superadmin mantiene el cambio forzado y revoca sesiones.
Mantener al menos dos Superadmins activos. Resolver el segundo por identidad
confirmada, nunca por coincidencia de nombre, y no añadir `admin` salvo aprobación
explícita. Detenerse antes de provisionar o asignar roles si no existe aprobación
humana.

## 14. Rollback por dominios

Nunca restaurar SQLite automáticamente. Preservar dump PM2, Nginx, release
legacy, DB/WAL/SHM congelados, backup detenido y backup preactivación.

- **Node nuevo no arranca/regresión de código:** con aprobación, detener y borrar
  el proceso nuevo, restaurar el dump PM2 y `pm2 resurrect`. El legacy vuelve
  con su DB legacy; no mezclar versiones.
- **Migración falla:** no arrancar. Preservar `$DB` fallida y volver al par
  release/DB legacy. No sobrescribir el backup detenido.
- **Nginx falla:** restaurar `nginx-guardias-$STAMP.conf`, `nginx -t` y recargar.
- **Dataset malo aún validated:** no activar; no restaurar ni borrar.
- **Activación mala:** con aprobación y sin tráfico, parar PM2, preservar la DB
  actual, instalar el backup preactivación como `$DB`, comprobar PRAGMA y
  reiniciar el release nuevo.
- **Regresión posterior:** clasificar código/Nginx/dataset/datos y aplicar un
  único rollback. No encadenar restauraciones ni borrar evidencia.

## 15. Seguridad y cierre

- entorno externo `0600`, propiedad `rafa`;
- restringir tar legacy y revisar PM2 dumps/logs sin imprimir valores;
- rotar la clave SSH privada incluida en el archivo antiguo;
- rotar secreto de sesión y credenciales admin/bootstrap expuestas/archivadas;
- conservar release actual y uno anterior verificado;
- crear backup postdespliegue y copiarlo fuera del servidor;
- borrar solo cookies/fuentes temporales tras verificar rutas exactas;
- registrar SHA, checksum, PRAGMA, backups, smoke y decisiones humanas.

No bloquean el release técnico: la tabla física de rotación de `GUÀRDIES PATI`,
pulido UI/PWA/branding y el rename futuro del repositorio. Las semánticas de
Biblioteca, Patis Inclusius y ausencia especial ya son finales.
