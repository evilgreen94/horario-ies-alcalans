# ARGOS 1.0.2 — despliegue limpio, controlado y reversible

Este runbook prepara una ventana autorizada; no la autoriza. Se ejecuta puerta a
puerta y se detiene ante cualquier diferencia. El despliegue es offline: no usa
`git pull`, GitHub, `npm install`, `npm ci` ni `apt install` en producción.

```text
LAN → Nginx :80 → Node 127.0.0.1:3000 → SQLite
```

Release aprobado:

```text
commit   ccb2f7a88fbf9815c13df501d1aa972d31384129
artifact guardias-release-ccb2f7a88fbf-linux-x64.tar.gz
sha256   8275e5162f9a392a17ff33b9f111a2d8708ecfae6fa923aa6ae0aa6756f38cf8
Node     v22.23.2, requiere GLIBC_2.28
sqlite3  requiere GLIBC_2.34
```

XML candidato local, separado del artefacto y pendiente de confirmación humana
el día de la ventana:

```text
ruta      C:\Users\usuario\Desktop\Censo_docente_26-27\censo def\Horario.xml
tamaño    1.415.492 bytes
modificado 2026-09-07 12:04:51 +02:00
sha256    859901bb2bfecec6b468798128413fadbc5e2d23fead0bff1818d241dc708e2e
estado    DEPLOYMENT XML CANDIDATE
curso     2026/27
```

No está en Git ni en el tar y no se ha importado en producción.

El operador registra PASS/STOP, hora y evidencia no sensible en cada puerta.
Nunca copia en el acta `.env`, cookies, tokens, claves, hashes, salts ni
contraseñas. Ningún comando de este documento se ha ejecutado en producción.

## Variables de la ventana

Rafa debe confirmar el XML y su hash el mismo día. No reutilizar estas variables
en otra máquina sin verificar todas las rutas.

```bash
set -u
export RELEASE='ccb2f7a88fbf9815c13df501d1aa972d31384129'
export SHORT='ccb2f7a88fbf'
export EXPECTED_ARTIFACT_SHA='8275e5162f9a392a17ff33b9f111a2d8708ecfae6fa923aa6ae0aa6756f38cf8'
export ROOT='/srv/guardias'
export INCOMING="$ROOT/incoming"
export ARTIFACT="$INCOMING/guardias-release-$SHORT-linux-x64.tar.gz"
export CHECKSUM="$ARTIFACT.sha256"
export RELEASE_DIR="$ROOT/releases/$RELEASE"
export CURRENT="$ROOT/current"
export OLD_APP="$ROOT/horario-ies-alcalans"
export OLD_DB="$OLD_APP/BD/guardias.sqlite"
export DB='/var/lib/guardias/guardias.sqlite'
export ENV_FILE='/etc/guardias/guardias.env'
export BACKUP_ROOT='/var/backups/guardias'
export DEPLOY_BACKUPS="$BACKUP_ROOT/deployments"
export APP_USER='rafa'
export PM2_USER='rafa'
export STAMP="$(date +%Y%m%d-%H%M%S)"
export LEGACY_APP="$ROOT/legacy-$STAMP"

test "${#RELEASE}" -eq 40
```

## GATE 0 — preflight

Acción, inicialmente solo lectura:

```bash
hostname
whoami
uname -a
uname -m
ldd --version | head -1
df -h
df -i
free -h
pm2 status
pm2 describe guardias | sed -E '/(password|passwd|secret|token|cookie|authorization)/Id'
systemctl status nginx --no-pager
sudo nginx -t
sudo ss -lntp
readlink -f "$OLD_APP"
test -d "$OLD_APP" -a ! -L "$OLD_APP"
stat -c '%A %a %U:%G %s %y %n' "$OLD_DB" "$OLD_DB-wal" "$OLD_DB-shm" 2>&1
stat -c '%A %a %U:%G %s %y %n' "$OLD_APP/.env" /srv/guardias/guardias-predeploy-2026-09-04.tar.gz 2>&1
sudo systemctl cat pm2-rafa.service --no-pager
sudo nginx -T 2>&1 |
  sed -E '/(authorization|cookie|password|passwd|token|secret)/Id' |
  grep -n -E 'listen|server_name|proxy_pass'
```

PASS: x86_64, glibc >= 2.34, espacio para dos releases y tres DB, un único
Guardias/PM2 y un único proxy a 3000. STOP: cualquier dato distinto, integridad
no comprobable, glibc < 2.34 o secreto visible. No actualizar el SO como atajo.

## GATE 1 — artifact transfer/hash

En el servidor se crea el staging; desde el portátil se envían solo tar y
checksum:

```bash
# servidor
install -d -m 750 "$INCOMING"
```

```powershell
$archive = 'C:\Users\usuario\Documents\ARGOS\releases\1.0.2'
scp "$archive\guardias-release-ccb2f7a88fbf-linux-x64.tar.gz" rafa@172.28.244.250:/srv/guardias/incoming/
scp "$archive\guardias-release-ccb2f7a88fbf-linux-x64.tar.gz.sha256" rafa@172.28.244.250:/srv/guardias/incoming/
```

```bash
# servidor
test -f "$ARTIFACT" -a -f "$CHECKSUM"
printf '%s  %s\n' "$EXPECTED_ARTIFACT_SHA" "$(basename "$ARTIFACT")" |
  (cd "$INCOMING" && sha256sum -c -)
tar -tzf "$ARTIFACT" >/dev/null
```

PASS: hash OK y tar legible. STOP: nombre, tamaño o hash distinto. No descargar
otra copia de Internet.

## GATE 2 — coherent backup

Crear primero el destino restringido. `.backup` es seguro con WAL activo; una
copia aislada del fichero principal no lo es.

```bash
sudo install -d -m 750 -o "$APP_USER" -g "$APP_USER" \
  "$BACKUP_ROOT" "$DEPLOY_BACKUPS"
export LIVE_BACKUP="$DEPLOY_BACKUPS/guardias-live-$STAMP.sqlite"

sudo -u "$APP_USER" sqlite3 -readonly "$OLD_DB" 'PRAGMA quick_check;'
sudo -u "$APP_USER" sqlite3 -readonly "$OLD_DB" 'PRAGMA foreign_key_check;'
sudo -u "$APP_USER" sqlite3 -cmd '.timeout 5000' "$OLD_DB" ".backup '$LIVE_BACKUP'"
sudo -u "$APP_USER" sqlite3 -readonly "$LIVE_BACKUP" 'PRAGMA quick_check;'
sudo -u "$APP_USER" sqlite3 -readonly "$LIVE_BACKUP" 'PRAGMA foreign_key_check;'
sudo chmod 600 "$LIVE_BACKUP"
sudo -u "$APP_USER" sha256sum "$LIVE_BACKUP" |
  sudo -u "$APP_USER" tee "$LIVE_BACKUP.sha256" >/dev/null
sudo chmod 600 "$LIVE_BACKUP.sha256"
```

PASS: ambos `quick_check` devuelven solo `ok`; ambos FK no devuelven filas.
STOP: cualquier error, fila FK, timeout o copia no verificable.

## GATE 3 — off-server backup

Desde el portátil autorizado:

```powershell
$dest = Join-Path $env:USERPROFILE 'Documents\ARGOS\production-backups'
$stamp = 'AAAAMMDD-HHMMSS' # copiar exactamente el valor mostrado por el servidor
New-Item -ItemType Directory -Force -Path $dest | Out-Null
scp "rafa@172.28.244.250:/var/backups/guardias/deployments/guardias-live-$stamp.sqlite" $dest
scp "rafa@172.28.244.250:/var/backups/guardias/deployments/guardias-live-$stamp.sqlite.sha256" $dest
Get-FileHash -Algorithm SHA256 (Join-Path $dest "guardias-live-$stamp.sqlite")
```

PASS: el hash local coincide con el checksum del servidor. STOP: no existe copia
fuera del servidor verificada. No parar PM2 antes de este PASS.

## GATE 4 — stop/freeze legacy

```bash
sudo cp -a /home/rafa/.pm2/dump.pm2 "$DEPLOY_BACKUPS/pm2-dump-$STAMP.pm2"
sudo cp -a /etc/nginx/sites-available/guardias "$DEPLOY_BACKUPS/nginx-guardias-$STAMP.conf"
sudo chmod 600 "$DEPLOY_BACKUPS/pm2-dump-$STAMP.pm2" "$DEPLOY_BACKUPS/nginx-guardias-$STAMP.conf"

sudo -iu "$PM2_USER" pm2 stop guardias
if sudo ss -lntp | grep -q ':3000'; then echo 'STOP: queda un listener en 3000'; exit 1; fi
test ! -e "$LEGACY_APP"

export STOPPED_BACKUP="$DEPLOY_BACKUPS/guardias-stopped-$STAMP.sqlite"
sudo -u "$APP_USER" sqlite3 -cmd '.timeout 5000' "$OLD_DB" ".backup '$STOPPED_BACKUP'"
sudo -u "$APP_USER" sqlite3 -readonly "$STOPPED_BACKUP" 'PRAGMA quick_check; PRAGMA foreign_key_check;'
sudo chmod 600 "$STOPPED_BACKUP"
sudo -u "$APP_USER" sha256sum "$STOPPED_BACKUP" |
  sudo -u "$APP_USER" tee "$STOPPED_BACKUP.sha256" >/dev/null
sudo chmod 600 "$STOPPED_BACKUP.sha256"

sudo mv -- "$OLD_APP" "$LEGACY_APP"
sudo ln -s "$LEGACY_APP" "$OLD_APP"
test "$(readlink -f "$OLD_APP")" = "$LEGACY_APP"
```

PASS: no writer, stopped backup íntegro, árbol legacy renombrado e inactivo; el
symlink conserva la ruta de rollback del dump PM2. STOP: escritor residual,
backup defectuoso o destino legacy existente. No borrar DB/WAL/SHM ni el tarball
histórico sensible.

## GATE 5 — install release

```bash
sudo install -d -m 755 -o "$APP_USER" -g "$APP_USER" "$ROOT/releases"
test ! -e "$RELEASE_DIR"
sudo install -d -m 755 -o "$APP_USER" -g "$APP_USER" "$RELEASE_DIR"
sudo -u "$APP_USER" tar -xzf "$ARTIFACT" -C "$RELEASE_DIR"
test "$(sed -n 's/^commit=//p' "$RELEASE_DIR/.deployed-release")" = "$RELEASE"
sudo -u "$APP_USER" "$RELEASE_DIR/runtime/node" -e "require('$RELEASE_DIR/node_modules/sqlite3'); console.log('sqlite3=ok')"
```

PASS: marker exacto y sqlite3 carga con el Node incluido. STOP: cualquier
dependencia ausente o intento de usar `node_modules`/Node del sistema.

## GATE 6 — external DB/env

```bash
sudo install -d -m 750 -o "$APP_USER" -g "$APP_USER" /var/lib/guardias
sudo install -m 600 -o "$APP_USER" -g "$APP_USER" "$STOPPED_BACKUP" "$DB"
sudo -u "$APP_USER" sqlite3 -readonly "$DB" 'PRAGMA quick_check; PRAGMA foreign_key_check;'

sudo install -d -m 700 -o "$APP_USER" -g "$APP_USER" /etc/guardias
sudo install -m 600 -o "$APP_USER" -g "$APP_USER" /dev/null "$ENV_FILE"
sudo -u "$APP_USER" nano "$ENV_FILE"
sudo chmod 600 "$ENV_FILE"
test ! -e "$CURRENT" -a ! -L "$CURRENT"
sudo ln -s "$RELEASE_DIR" "$ROOT/current.next"
sudo mv -T "$ROOT/current.next" "$CURRENT"
```

Contenido mínimo introducido interactivamente, nunca en el historial:

```dotenv
NODE_ENV=production
PORT=3000
GUARDIAS_DB_PATH=/var/lib/guardias/guardias.sqlite
GUARDIAS_SESSION_SECRET=<secreto nuevo largo y aleatorio>
GUARDIAS_TRUST_PROXY=1
GUARDIAS_CORS_ORIGINS=
```

PASS: DB `0600`, directorio `0750`, entorno `0600`, todo propiedad de
`rafa`, y `current` resuelve al SHA. STOP: secreto heredado, ruta ambigua o
permisos más amplios.

## GATE 7 — migraciones

El artefacto aplica exactamente:
`001_individual_teacher_auth.sql`,
`002_academic_schedule_model.sql` y
`003_final_session_security_and_schedule_types.sql`.
`db:init` usa `skipWeeklyReset: true`: no ejecuta mantenimiento semanal.

Antes de inicializar, confirmar sin mostrar hashes que el legacy conserva las
dos credenciales de contrato:

```bash
sudo -u "$APP_USER" sqlite3 -readonly "$DB" \
  "SELECT role FROM auth_credentials WHERE role IN ('admin','superadmin') ORDER BY role;"
```

Deben aparecer ambas. Si falta alguna, STOP: definir en una decisión separada
cómo sembrar esa credencial legacy; no introducir contraseñas en el comando,
runbook ni acta.

```bash
sudo -u "$APP_USER" sqlite3 -readonly "$DB" \
  "SELECT 'ausencias',COUNT(*) FROM ausencias UNION ALL
   SELECT 'biblioteca_guardias',COUNT(*) FROM biblioteca_guardias UNION ALL
   SELECT 'historial',COUNT(*) FROM historial UNION ALL
   SELECT 'tareas_profesorado',COUNT(*) FROM tareas_profesorado UNION ALL
   SELECT 'app_state',COUNT(*) FROM app_state;" > "$DEPLOY_BACKUPS/counts-before-$STAMP.txt"

for pass in 1 2; do
  sudo -iu "$APP_USER" env GUARDIAS_ENV_FILE="$ENV_FILE" \
    bash -lc "set -a; . '$ENV_FILE'; set +a; cd '$CURRENT'; ./runtime/node server/scripts/init-db.js"
done
sudo -u "$APP_USER" sqlite3 -readonly "$DB" 'PRAGMA quick_check; PRAGMA foreign_key_check;'
sudo -u "$APP_USER" sqlite3 -readonly -header -column "$DB" \
  'SELECT name,applied_at FROM schema_migrations ORDER BY name;'
```

Repetir los recuentos en `counts-after` y compararlos. PASS: tres migraciones,
segunda ejecución idempotente, integridad y recuentos legacy intactos. STOP:
cualquier diferencia; no marcar migraciones a mano. Rollback: preservar la DB
fallida y restaurar el par legacy + backup detenido.

## GATE 8 — PM2

```bash
sudo -iu "$PM2_USER" pm2 delete guardias
sudo -iu "$PM2_USER" env GUARDIAS_ENV_FILE="$ENV_FILE" \
  pm2 start "$CURRENT/deploy/linux/start-guardias.sh" \
  --name guardias --interpreter bash --cwd "$CURRENT"
sudo -iu "$PM2_USER" pm2 status
sudo -iu "$PM2_USER" pm2 logs guardias --lines 100 --nostream
sudo ss -lntp | grep ':3000'
curl -fsS http://127.0.0.1:3000/api/health
```

PASS: usa `runtime/node`, cwd `current`, un único listener
`127.0.0.1:3000`, health OK y sin secretos en logs. Solo entonces:

```bash
sudo -iu "$PM2_USER" pm2 save
sudo systemctl is-enabled pm2-rafa.service
sudo systemctl is-active pm2-rafa.service
```

STOP/rollback: no guardar un proceso fallido; borrar el nuevo, conservar
`current` como evidencia y usar el dump legacy preservado, cuyo script sigue
resolviendo por el symlink `$OLD_APP`.

## GATE 9 — Nginx

Se confía exactamente en un proxy local (`GUARDIAS_TRUST_PROXY=1`). El fichero
versionado envía `Host`, `X-Real-IP`, `X-Forwarded-For` y
`X-Forwarded-Proto`; Node no queda expuesto a la LAN.

```nginx
server {
    listen 80;
    server_name _;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
export NGINX_CONF='/etc/nginx/sites-available/guardias'
sudo install -m 644 "$CURRENT/deploy/linux/guardias.nginx.conf" "$NGINX_CONF.new"
sudo mv "$NGINX_CONF.new" "$NGINX_CONF"
sudo nginx -t
sudo systemctl reload nginx
curl -fsS http://127.0.0.1/api/health
```

PASS: sintaxis y health vía Nginx, sin otro proxy a 3000. STOP/rollback:
restaurar `nginx-guardias-$STAMP.conf`, ejecutar `nginx -t` y recargar.

## GATE 10 — base smoke

```bash
curl -fsS http://127.0.0.1:3000/api/health
curl -fsSI http://127.0.0.1/
curl -fsSI http://127.0.0.1/guardias.html
curl -fsSI http://127.0.0.1/app/
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/api/schedule/active
sudo ss -lntp | grep ':3000'
```

PASS: páginas accesibles, dataset ausente produce 503 visible y Node solo
loopback. Desde otro equipo LAN, `:3000` no debe responder. STOP: fallback
2025/26, listener global, 500 o recurso sensible servido.

## GATE 11 — official XML import

Transferir `Horario.xml` por separado a un directorio `0700`, verificar el SHA
aprobado y no incorporarlo al release.

```bash
export IMPORT_DIR="/var/tmp/guardias-import-$RELEASE"
install -d -m 700 "$IMPORT_DIR"
```

```powershell
$xml = 'C:\Users\usuario\Desktop\Censo_docente_26-27\censo def\Horario.xml'
Get-FileHash -Algorithm SHA256 -LiteralPath $xml
scp $xml rafa@172.28.244.250:/var/tmp/guardias-import-ccb2f7a88fbf9815c13df501d1aa972d31384129/Horario.xml
```

```bash
export EXPECTED_XML_SHA='859901bb2bfecec6b468798128413fadbc5e2d23fead0bff1818d241dc708e2e'
printf '%s  %s\n' "$EXPECTED_XML_SHA" 'Horario.xml' |
  (cd "$IMPORT_DIR" && sha256sum -c -)
sudo -iu "$PM2_USER" pm2 stop guardias
export PRE_IMPORT_BACKUP="$DEPLOY_BACKUPS/guardias-before-import-$STAMP.sqlite"
sudo -u "$APP_USER" sqlite3 "$DB" ".backup '$PRE_IMPORT_BACKUP'"
sudo -u "$APP_USER" sqlite3 -readonly "$PRE_IMPORT_BACKUP" 'PRAGMA quick_check; PRAGMA foreign_key_check;'
sudo chmod 600 "$PRE_IMPORT_BACKUP"

sudo -iu "$APP_USER" bash -lc \
  "cd '$CURRENT' && ./runtime/node server/scripts/prepare-ghc-schedule.js \
   --input '$IMPORT_DIR/Horario.xml' --academic-year 2026/27"
sudo -iu "$APP_USER" bash -lc \
  "cd '$CURRENT' && ./runtime/node server/scripts/prepare-ghc-schedule.js \
   --input '$IMPORT_DIR/Horario.xml' --academic-year 2026/27 --db '$DB' --import \
   --allow-operational-db IMPORT_VALIDATED_GHC_DATASET_ONLY"
```

PASS: ISO-8859-1 sin mojibake, `source_code` únicos, referencias resueltas,
periodos/recreos explícitos, cero duplicados/anomalías y resultado
`activated:false` / `validated`. Los recuentos históricos (88 docentes,
2.143 obligaciones, 57 patio, 5 biblioteca y 6 inclusivos) son comparación, no
un requisito para un XML más nuevo. STOP: referencia sin resolver, identidad
ambigua, duplicado, anomalía o activación automática.

## GATE 12 — validate XML

```bash
sudo -u "$APP_USER" sqlite3 -readonly -header -column "$DB" "
SELECT d.id,y.code,d.label,d.source_format,d.status,d.validated_at,d.activated_at
FROM schedule_datasets d JOIN academic_years y ON y.id=d.academic_year_id
ORDER BY d.id;
SELECT dataset_id,session_type,COUNT(*) total
FROM teacher_schedule_sessions GROUP BY dataset_id,session_type ORDER BY dataset_id,session_type;"
```

Revisar también `validation_report_json` sin imprimir datos personales
innecesarios. PASS: Rafa selecciona un único ID `validated` y confirma las
semánticas `guardia`, `guardia_patio`, `biblioteca_patio` y
`patio_inclusivo`. STOP: no hay selección humana inequívoca.

## GATE 13 — pre-activation backup

```bash
export DATASET_ID='<id-validado-y-aprobado>'
export PRE_ACTIVATION_BACKUP="$DEPLOY_BACKUPS/guardias-before-activation-$STAMP.sqlite"
sudo -u "$APP_USER" sqlite3 "$DB" ".backup '$PRE_ACTIVATION_BACKUP'"
sudo -u "$APP_USER" sqlite3 -readonly "$PRE_ACTIVATION_BACKUP" 'PRAGMA quick_check; PRAGMA foreign_key_check;'
sudo chmod 600 "$PRE_ACTIVATION_BACKUP"
```

PASS: backup íntegro y DATASET_ID aprobado. STOP: no activar.

## GATE 14 — activate dataset

```bash
sudo -iu "$APP_USER" bash -lc \
  "cd '$CURRENT' && ./runtime/node server/scripts/activate-canonical-schedule.js \
   --db '$DB' --dataset-id '$DATASET_ID' \
   --allow-operational-db ACTIVATE_APPROVED_DATASET"
sudo -iu "$PM2_USER" pm2 start guardias
curl -fsS http://127.0.0.1:3000/api/health
```

PASS: exactamente un curso/dataset operativo activo. STOP/rollback: parar
Guardias y restaurar el backup preactivación completo; nunca hacer cirugía SQL.

## GATE 15 — bootstrap RMLL

```bash
sudo -iu "$APP_USER" bash -lc \
  "cd '$CURRENT' && ./runtime/node server/scripts/bootstrap-superadmin.js \
   --db '$DB' --source-code RMLL \
   --allow-operational-db BOOTSTRAP_APPROVED_SUPERADMIN"
```

PASS: usuario `rmll`, identidad `RMLL`, roles `teacher/admin/superadmin` y
cambio obligatorio. La clave temporal aparece una sola vez en la terminal del
operador: no capturarla ni guardarla en scripts/logs. Repetir no debe resetear.
STOP: identidad ausente/ambigua, roles distintos o segunda ejecución destructiva.

## GATE 16 — Rafa first login/change password

Rafa entra como RMLL, cambia la clave temporal, cierra sesión, vuelve a entrar y
comprueba perfil, horario, Jefatura y Superadmin. PASS: sesión antigua revocada y
cuatro áreas correctas. STOP: no provisionar personal si falla.

## GATE 17 — bulk provisioning preview

En Superadmin: `Usuarios → Crear cuentas del profesorado → preview`. Referencia
histórica: 88 identidades, 1 enlazada, 87 READY, 0 conflictos, 0 inválidas. La
vista real de producción manda. PASS obligatorio: `CONFLICT=0` e
`INVALID=0`. STOP: resolver por `source_code`, nunca por nombre.

## GATE 18 — staff provisioning

Tras aprobación humana explícita, confirmar una sola vez. PASS: transacción
completa, nuevas cuentas solo `teacher`, existentes enlazadas sin alterar clave
ni roles y ninguna clave persistida en texto plano. STOP: parcialidad, rol
elevado implícito o recuento inesperado.

## GATE 19 — local credential CSV

Descargar el CSV únicamente en el navegador de Rafa a una ubicación local
protegida; preparar tarjetas individuales y distribución privada. No copiarlo al
servidor, backups, GitHub ni nube; no crear QR con contraseñas. Eliminar la lista
maestra tras distribuir. Una pérdida se resuelve con reset individual.
PASS: cada entrega es privada y la lista maestra queda bajo control de Rafa.
STOP: descarga perdida, servidor/nube como destino o exposición colectiva.

## GATE 20 — JMH Superadmin

Seleccionar por identidad confirmada `JMH — Joaquín Maestre Hernándiz` y asignar
solo `superadmin` además de `teacher`. No conceder `admin`. JMH cambia su
clave inicial y verifica Superadmin, perfil y horario; Jefatura debe quedar
denegada. PASS: dos Superadmins activos y sesiones independientes.
STOP: coincidencia solo por nombre, `admin` implícito o imposibilidad de revocar
cada sesión por separado.

## GATE 21 — auth/functional smoke

Comprobar RMLL, JMH, docente normal y docente admin. Deben rechazarse rol,
`source_code`, `userId` y cookie manipulados; docente no accede a Jefatura ni
Superadmin; admin no accede a Superadmin; JMH no accede a Jefatura.

Comprobar landing, acceso personal, Sala del profesorado, horario, ausencia
futura y recepción en Jefatura, guardia/cobertura, patio, Biblioteca, Patis
Inclusius, F5, logout, revocación y kiosco Raspberry. Los registros de prueba
deben ser identificables y retirarse con la UI/API normal. Verificar por HTTP que
`.env`, SQLite, `.git`, `.ssh` y backups no se sirven. PASS requiere
`P0=0` y `P1=0`.
STOP: cualquier escalada, secreto en logs/HTTP, puerto 3000 accesible desde LAN o
fallo operativo que pueda confundir una guardia.

## GATE 22 — post-deploy backup

```bash
sudo -u "$APP_USER" env GUARDIAS_DB_PATH="$DB" \
  BACKUP_ROOT="$BACKUP_ROOT" bash "$CURRENT/ops/backup.sh"
sudo -u "$APP_USER" sqlite3 -readonly "$DB" 'PRAGMA quick_check; PRAGMA foreign_key_check;'
```

Copiar backup y checksum al portátil y verificar SHA como en GATE 3. PASS: primer
punto de recuperación ARGOS completo fuera del servidor. Los timers se instalan
solo después de este PASS; no instalar `guardias.service` porque producción usa
PM2.

```bash
for file in \
  guardias-backup-daily.service guardias-backup-daily.timer \
  guardias-backup-weekly.service guardias-backup-weekly.timer \
  guardias-backup-monthly.service guardias-backup-monthly.timer; do
  sudo install -m 644 "$CURRENT/deploy/linux/$file" "/etc/systemd/system/$file"
done
sudo systemctl daemon-reload
sudo systemctl enable --now guardias-backup-daily.timer \
  guardias-backup-weekly.timer guardias-backup-monthly.timer
sudo systemctl start guardias-backup-daily.service
sudo systemctl status guardias-backup-daily.service --no-pager
sudo systemctl list-timers 'guardias-backup-*' --all
```

STOP: backup no íntegro, checksum no verificable fuera del servidor o timer
fallido. No declarar GO sin este punto de recuperación.

## GATE 23 — GO / rollback decision

GO solo si todas las puertas están firmadas, PM2/Nginx están sanos, Node no sale
de loopback, DB íntegra, dataset/usuarios correctos, backup posterior fuera del
servidor y `P0=P1=0`. No borrar legacy, el tarball histórico ni backups.

Rollback según el fallo:

- antes de migrar: parar/borrar el proceso nuevo, repuntar Nginx si cambió y
  resucitar el dump legacy;
- migración: preservar DB fallida, restaurar el backup detenido y el par legacy;
- HTTP/Node: si no se corrige inmediatamente, restaurar PM2/Nginx legacy;
- dataset: restaurar el backup preactivación, no editar SQL;
- bootstrap/auth: no provisionar; restaurar el estado anterior si procede.

Siempre restaurar código y DB compatibles juntos, validar PRAGMA antes de
arrancar y no encadenar restauraciones improvisadas.

### Recuperación exacta del legacy

```bash
sudo -iu "$PM2_USER" pm2 delete guardias || true
sudo install -m 600 -o "$PM2_USER" -g "$PM2_USER" \
  "$DEPLOY_BACKUPS/pm2-dump-$STAMP.pm2" /home/rafa/.pm2/dump.pm2
sudo cp -a "$DEPLOY_BACKUPS/nginx-guardias-$STAMP.conf" /etc/nginx/sites-available/guardias
sudo nginx -t
sudo systemctl reload nginx
sudo -iu "$PM2_USER" pm2 resurrect
sudo -iu "$PM2_USER" pm2 status
curl -fsS http://127.0.0.1/api/health
```

El symlink `$OLD_APP` debe seguir resolviendo a `$LEGACY_APP`; su DB/WAL/SHM no
se han tocado. No ejecutar `pm2 save` hasta validar el rollback.

### Recuperación exacta tras una activación errónea

```bash
sudo -iu "$PM2_USER" pm2 stop guardias
export FAILED_DB_DIR="$DEPLOY_BACKUPS/guardias-failed-$STAMP"
sudo install -d -m 700 "$FAILED_DB_DIR"
sudo mv -- "$DB" "$FAILED_DB_DIR/guardias.sqlite"
sudo test ! -e "$DB-wal" || sudo mv -- "$DB-wal" "$FAILED_DB_DIR/guardias.sqlite-wal"
sudo test ! -e "$DB-shm" || sudo mv -- "$DB-shm" "$FAILED_DB_DIR/guardias.sqlite-shm"
sudo install -m 600 -o "$APP_USER" -g "$APP_USER" "$PRE_ACTIVATION_BACKUP" "$DB"
sudo -u "$APP_USER" sqlite3 -readonly "$DB" 'PRAGMA quick_check; PRAGMA foreign_key_check;'
sudo -iu "$PM2_USER" pm2 start guardias
curl -fsS http://127.0.0.1:3000/api/health
```

## Continuidad y limpieza posterior

En el servidor deben quedar `docs/START_HERE.md`, `SERVER_LAYOUT.md`,
`OPERATIONS.md`, `INCIDENTS.md`, este runbook y los scripts `ops/`. Cubren
estado, diagnóstico, backup, restart, XML, usuarios, reset, break-glass y
rollback sin incluir secretos.

La limpieza es otra operación con aprobación separada. Inventariar antes de
eliminar el HOME copiado, `.ssh`, `.env`, tarball sensible, PM2 viejo, logs,
backups o releases. Conservar el árbol legacy y su DB/WAL/SHM congelados durante
el piloto.

La prueba de carga tampoco forma parte de la cirugía inicial. Se ejecutará desde
otra máquina por los escalones kiosco, 15–25, 60–80, 100 y 150, exigiendo cero
500, cero `SQLITE_BUSY` inesperados, cero reinicios, cero escrituras perdidas,
`quick_check=ok` y FK limpias.
