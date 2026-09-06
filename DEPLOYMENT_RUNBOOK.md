# Runbook reversible de despliegue — Guardias 2026/27

Este documento prepara el despliegue; **no autoriza ejecutarlo**. No usar en
producción hasta cerrar todos los P0 de `ROADMAP_2026-27.md` y obtener aprobación
expresa para la ventana.

Arquitectura objetivo:

```text
LAN → Nginx :80 → Node/Express 127.0.0.1:3000 → SQLite
```

El servidor no tiene acceso fiable a Internet/GitHub. El método previsto es un
artefacto Git transferido por `scp`/`rsync`, coherente con el método manual ya
documentado en el proyecto. No usar `git pull` en producción.

## 0. Condiciones de parada

Abortar antes de modificar producción si ocurre cualquiera de estas condiciones:

- el release aún usa `app.listen(PORT)` sin fijar loopback;
- el árbol fuente no está limpio o el commit no es el aprobado;
- no hay backup SQLite verificado y artefacto de rollback de la aplicación;
- `quick_check` no devuelve `ok` o `foreign_key_check` devuelve filas;
- no se conoce qué usuario ejecuta PM2 o hay dos gestores ejecutando la app;
- falta espacio para staging, backup completo y tres copias de la DB;
- las dependencias Linux no están presentes y verificadas offline;
- el dataset no tiene acta de validación y aprobación de Jefatura;
- el smoke manual local no está firmado por Rafa.

El commit `b854507af7e1d6bafacc5bac4f66b6b2d0bb31fb` es la base auditada, pero **no
es desplegable mientras no se corrija el bind de Node**. El release real será el
commit posterior que cierre ese P0.

## 1. Variables de la ventana

En Ubuntu, sustituir los valores entre `<...>` y comprobarlos antes de seguir:

```bash
set -u
export RELEASE='<sha-completo-aprobado>'
export APP='/srv/guardias/horario-ies-alcalans'
export DB='/srv/guardias/horario-ies-alcalans/BD/guardias.sqlite'
export BACKUP_ROOT='/var/backups/guardias/deployments'
export PM2_USER='<usuario-real-de-pm2>'
export APP_USER='<usuario-real-de-la-app>'
export APP_GROUP='<grupo-real-de-la-app>'
export LAN_URL='http://10.185.39.94'
export STAMP="$(date +%Y%m%d-%H%M%S)"

test "${#RELEASE}" -eq 40
test -d "$APP"
test -f "$DB"
```

No imprimir `.env`, secretos ni cookies en el informe de despliegue.

## 2. Construcción y transferencia del release

### 2.1 En el equipo de preparación (PowerShell)

```powershell
Set-Location 'C:\Users\usuario\Documents\GitHub\horario-ies-alcalans'
git switch rescue/preproduction-2026-09
git status --short
$release = git rev-parse HEAD
if ($release.Length -ne 40) { throw 'Commit de release inválido' }

$artifact = Join-Path $env:TEMP "guardias-$release.tar.gz"
git archive --format=tar.gz --output=$artifact $release
Get-FileHash -Algorithm SHA256 $artifact
scp $artifact "<usuario>@10.185.39.94:/tmp/guardias-$release.tar.gz"
```

Registrar commit y SHA-256 del artefacto. No incluir PDF, censo, `.env`, SQLite
ni ficheros no versionados.

### 2.2 En Ubuntu

```bash
sha256sum "/tmp/guardias-$RELEASE.tar.gz"
tar -tzf "/tmp/guardias-$RELEASE.tar.gz" | less
```

La huella debe coincidir y el listado no debe contener `BD/`, `.env`, PDF, censo,
backups ni datos personales.

## 3. Pre-flight de producción

### 3.1 Estado actual e infraestructura

```bash
sudo -v
sudo install -d -m 700 -o "$USER" "$BACKUP_ROOT"

{
  date -Is
  hostname
  uname -a
  node --version
  npm --version
  sqlite3 --version
  df -h "$APP" "$BACKUP_ROOT"
  df -i "$APP" "$BACKUP_ROOT"
} | tee "$BACKUP_ROOT/preflight-$STAMP.txt"

sudo -iu "$PM2_USER" pm2 status
sudo -iu "$PM2_USER" pm2 describe guardias \
  | tee "$BACKUP_ROOT/pm2-before-$STAMP.txt"
sudo systemctl is-active guardias.service || true

sudo nginx -t
sudo nginx -T > "$BACKUP_ROOT/nginx-$STAMP.txt"
sudo ss -ltnp | tee "$BACKUP_ROOT/listeners-before-$STAMP.txt"
```

Si PM2 ejecuta `guardias`, `guardias.service` no debe estar activo. Confirmar que
Nginx apunta a `http://127.0.0.1:3000` y conserva al menos:

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

No sustituir la configuración real sin revisarla y guardarla primero.

### 3.2 Registrar versión desplegada

```bash
{
  date -Is
  test -f "$APP/.deployed-release" && cat "$APP/.deployed-release" || true
  git -C "$APP" rev-parse HEAD 2>/dev/null || true
  sha256sum "$APP/server/app.js" "$APP/package-lock.json"
} | tee "$BACKUP_ROOT/deployed-before-$STAMP.txt"
```

### 3.3 Backup completo de aplicación

Incluye código, `.env` y dependencias, pero excluye los ficheros SQLite en uso,
que se copian de forma consistente en el siguiente paso.

```bash
sudo tar -C "$APP" \
  --exclude='./BD/guardias.sqlite' \
  --exclude='./BD/guardias.sqlite-wal' \
  --exclude='./BD/guardias.sqlite-shm' \
  -czpf "$BACKUP_ROOT/app-full-$STAMP.tar.gz" .
sudo sha256sum "$BACKUP_ROOT/app-full-$STAMP.tar.gz" \
  | tee "$BACKUP_ROOT/app-full-$STAMP.sha256"
sudo tar -tzf "$BACKUP_ROOT/app-full-$STAMP.tar.gz" >/dev/null
```

### 3.4 Backup SQLite verificado

```bash
export DB_BACKUP="$BACKUP_ROOT/guardias-before-release-$STAMP.sqlite"
sudo sqlite3 "$DB" ".timeout 5000" ".backup '$DB_BACKUP'"
sudo chmod 600 "$DB_BACKUP"

sudo sqlite3 "$DB" 'PRAGMA quick_check; PRAGMA foreign_key_check;'
sudo sqlite3 "$DB_BACKUP" 'PRAGMA quick_check; PRAGMA foreign_key_check;'
sudo sha256sum "$DB_BACKUP" | tee "$DB_BACKUP.sha256"
```

Resultado obligatorio: una línea `ok` por `quick_check` y ninguna fila adicional
para `foreign_key_check`.

## 4. Preparar el release sin tocar la aplicación activa

```bash
export RELEASE_DIR="/srv/guardias/releases/$RELEASE"
sudo install -d -m 755 -o "$USER" "/srv/guardias/releases"
install -d -m 755 "$RELEASE_DIR"
tar -xzf "/tmp/guardias-$RELEASE.tar.gz" -C "$RELEASE_DIR"

test -f "$RELEASE_DIR/server/app.js"
test -f "$RELEASE_DIR/package-lock.json"
grep -n 'listen' "$RELEASE_DIR/server/app.js"
```

El `listen` del release debe fijar `127.0.0.1` directamente o mediante una
variable validada que el código realmente consuma.

### 4.1 Dependencias sin Internet

Nunca copiar `node_modules` desde Windows: `sqlite3` contiene binarios nativos.

Si el lockfile no cambió respecto a producción:

```bash
cmp "$APP/package-lock.json" "$RELEASE_DIR/package-lock.json"
cp -a "$APP/node_modules" "$RELEASE_DIR/node_modules"
```

Si cambió, preparar previamente `node_modules` en un Ubuntu compatible, con la
misma arquitectura y versión mayor de Node, y transferirlo como artefacto offline.
No continuar si ese artefacto no existe.

Validar siempre:

```bash
cd "$RELEASE_DIR"
npm ls --omit=dev
node -e "require('sqlite3'); require('express'); console.log('runtime dependencies ok')"
npm test
```

## 5. Despliegue de código y migraciones

### 5.1 Previsualizar la sustitución

```bash
sudo rsync -an --delete \
  --exclude='.env' \
  --exclude='BD/' \
  --exclude='.git/' \
  --exclude='.deployed-release' \
  "$RELEASE_DIR/" "$APP/"
```

Revisar todo el listado. Si aparece un fichero operativo inesperado, abortar.

### 5.2 Entrar en mantenimiento y crear copia final

```bash
sudo -iu "$PM2_USER" pm2 stop guardias
sudo ss -ltnp | grep ':3000' && { echo 'Node sigue escuchando'; exit 1; } || true

export FINAL_DB_BACKUP="$BACKUP_ROOT/guardias-stopped-$STAMP.sqlite"
sudo sqlite3 "$DB" 'PRAGMA wal_checkpoint(TRUNCATE);'
sudo sqlite3 "$DB" ".backup '$FINAL_DB_BACKUP'"
sudo chmod 600 "$FINAL_DB_BACKUP"
sudo sqlite3 "$FINAL_DB_BACKUP" 'PRAGMA quick_check; PRAGMA foreign_key_check;'
```

### 5.3 Instalar código

```bash
sudo rsync -a --delete --chown="$APP_USER:$APP_GROUP" \
  --exclude='.env' \
  --exclude='BD/' \
  --exclude='.git/' \
  --exclude='.deployed-release' \
  "$RELEASE_DIR/" "$APP/"
printf '%s\n' "$RELEASE" | sudo tee "$APP/.deployed-release" >/dev/null
```

### 5.4 Ejecutar migraciones explícitamente

El arranque también ejecuta migraciones, pero se hacen primero con Node detenido
para poder verificar y restaurar sin tráfico.

```bash
cd "$APP"
set -a
. ./.env
set +a
export GUARDIAS_DB_PATH="$DB"

npm run db:init
sqlite3 "$DB" 'PRAGMA quick_check; PRAGMA foreign_key_check;'
sqlite3 -header -column "$DB" \
  "SELECT name, applied_at FROM schema_migrations ORDER BY name;"
```

Deben figurar:

```text
001_individual_teacher_auth.sql
002_academic_schedule_model.sql
```

Verificar además:

```bash
sqlite3 "$DB" \
  "SELECT name FROM sqlite_master WHERE type='table' AND name IN
   ('users','roles','user_roles','teacher_profiles','teacher_assignments',
    'academic_years','teacher_external_identities','schedule_datasets',
    'schedule_dataset_teachers','schedule_periods',
    'teacher_schedule_sessions','audit_log') ORDER BY name;"
```

Si falla cualquier paso, no arrancar: aplicar el rollback de migración.

## 6. Runtime y smoke de código antes del dataset

### 6.1 Arrancar mediante el PM2 existente

```bash
sudo -iu "$PM2_USER" bash -lc \
  "cd '$APP' && set -a && . ./.env && set +a && pm2 restart guardias --update-env"
sudo -iu "$PM2_USER" pm2 status
sudo -iu "$PM2_USER" pm2 logs guardias --lines 100 --nostream
```

Si el proceso no existía, detenerse y confirmar su definición antes de crearlo.
No activar simultáneamente `guardias.service`.

### 6.2 Confirmar bind loopback

```bash
sudo ss -ltnp | grep ':3000'
```

Resultado permitido: `127.0.0.1:3000`. Si aparece `0.0.0.0:3000`, `*:3000` o
`[::]:3000`, detener Guardias y hacer rollback.

### 6.3 Smoke HTTP

```bash
curl -fsS http://127.0.0.1:3000/api/health
curl -fsSI http://127.0.0.1:3000/guardias.html
curl -fsSI http://127.0.0.1:3000/app/
curl -fsS "$LAN_URL/api/health"
curl -fsSI "$LAN_URL/guardias.html"
curl -fsSI "$LAN_URL/app/"
```

Sin dataset activo, este resultado es intencionado y demuestra que no hay
fallback 2025/26:

```bash
curl -sS -o /tmp/schedule-active.json -w '%{http_code}\n' \
  http://127.0.0.1:3000/api/schedule/active
grep -F 'No hay un dataset horario activo y validado' /tmp/schedule-active.json

curl -fsS http://127.0.0.1:3000/api/schedule/legacy.js \
  | grep -F 'window.PROFESORADO_SOURCE=null'
```

Probar manualmente login/logout de `admin` y `superadmin`, sesión tras recarga,
rechazo anónimo y rechazo de profesor individual en operaciones administrativas.
No escribir contraseñas en comandos, logs o actas.

## 7. Preparación del dataset académico

Mantener siempre la separación:

```text
import → validated → inspect → explicit activation
```

Los PDF/JSON/XML externos se transfieren a una ruta temporal con permisos 700 y
nunca al repositorio:

```bash
export IMPORT_DIR="/var/tmp/guardias-import-$RELEASE"
install -d -m 700 "$IMPORT_DIR"
# Transferir por scp los ficheros aprobados a IMPORT_DIR y verificar sus SHA-256.
```

### 7.1 Ruta PDF provisional

Para conservar la protección del importador, trabajar con una copia mientras
Node está detenido y sustituir la DB solo después de validarla.

```bash
sudo -iu "$PM2_USER" pm2 stop guardias
export PRE_DATASET_BACKUP="$BACKUP_ROOT/guardias-before-dataset-$STAMP.sqlite"
sudo sqlite3 "$DB" ".backup '$PRE_DATASET_BACKUP'"
sudo sqlite3 "$PRE_DATASET_BACKUP" 'PRAGMA quick_check; PRAGMA foreign_key_check;'

export WORK_DB="/var/tmp/guardias-$RELEASE.tmp.sqlite"
sudo sqlite3 "$DB" ".backup '$WORK_DB'"
sudo chown "$USER" "$WORK_DB"
chmod 600 "$WORK_DB"

cd "$APP"
npm run schedule:prepare -- \
  --census "$IMPORT_DIR/censo-profesores-2026-27.json" \
  --pdf "$IMPORT_DIR/censo-profesores-2026-27.pdf" \
  --db "$WORK_DB" \
  --import | tee "$BACKUP_ROOT/dataset-import-$STAMP.txt"
```

La salida debe indicar `activated: false` y `status: validated`. Ejecutar todas
las consultas de la sección 7.3 sobre `$WORK_DB` antes de instalarla.

### 7.2 Ruta XML definitivo

El endpoint XML importa horarios, pero requiere que los 88 perfiles ya existan.
Como no hay un CLI de censo de producción, preparar los perfiles sobre la copia
de trabajo anterior mediante la librería ya probada:

```bash
export CENSUS_PATH="$IMPORT_DIR/censo-profesores-2026-27.json"
export WORK_DB="/var/tmp/guardias-$RELEASE.tmp.sqlite"

WORK_DB="$WORK_DB" CENSUS_PATH="$CENSUS_PATH" node <<'NODE'
const fs = require('fs');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const { importTeacherProfiles } = require('./server/schedule-model');
(async () => {
  const db = await open({ filename: process.env.WORK_DB, driver: sqlite3.Database });
  try {
    await db.exec('PRAGMA foreign_keys = ON');
    const census = JSON.parse(fs.readFileSync(process.env.CENSUS_PATH, 'utf8'));
    console.log(await importTeacherProfiles(db, census, { expectedCount: 88 }));
  } finally {
    await db.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
NODE
```

Instalar la copia validada, arrancar Node y usar el panel admin
`Importar XML anual`. La respuesta debe ser `validated`, nunca `active`. Si este
procedimiento de una sola vez no se aprueba en el ensayo, bloquear el lanzamiento
y crear un comando dedicado.

### 7.3 Validación obligatoria

Definir la DB inspeccionada y listar versiones:

```bash
export CHECK_DB="$WORK_DB"   # Antes de instalar; después será "$DB"
sqlite3 -header -column "$CHECK_DB" \
  "SELECT d.id,y.code,d.label,d.source_format,d.status,d.validated_at,d.activated_at
   FROM schedule_datasets d JOIN academic_years y ON y.id=d.academic_year_id
   ORDER BY d.id;"
```

Guardar el ID que se pretende activar:

```bash
export DATASET_ID='<id-validado>'
```

Cobertura y estructura:

```bash
sqlite3 -header -column "$CHECK_DB" \
  "SELECT COUNT(*) AS teachers FROM schedule_dataset_teachers WHERE dataset_id=$DATASET_ID;
   SELECT COUNT(*) AS sessions FROM teacher_schedule_sessions WHERE dataset_id=$DATASET_ID;
   SELECT session_type,COUNT(*) AS total FROM teacher_schedule_sessions
     WHERE dataset_id=$DATASET_ID GROUP BY session_type ORDER BY session_type;
   SELECT period_type,COUNT(*) AS total FROM schedule_periods
     WHERE dataset_id=$DATASET_ID GROUP BY period_type;
   SELECT COUNT(*) AS p7_sessions FROM teacher_schedule_sessions s
     JOIN schedule_periods p ON p.id=s.period_id
     WHERE s.dataset_id=$DATASET_ID AND p.period_key='P7';"
```

Duplicados: debe devolver cero filas.

```bash
sqlite3 "$CHECK_DB" \
  "SELECT teacher_profile_id,weekday,period_id,COUNT(*)
   FROM teacher_schedule_sessions WHERE dataset_id=$DATASET_ID
   GROUP BY teacher_profile_id,weekday,period_id HAVING COUNT(*)>1;"
```

Actividades `other` y anomalías:

```bash
sqlite3 -header -column "$CHECK_DB" \
  "SELECT label,COUNT(*) AS total FROM teacher_schedule_sessions
   WHERE dataset_id=$DATASET_ID AND session_type='other'
   GROUP BY label ORDER BY total DESC,label;"
sqlite3 "$CHECK_DB" \
  "SELECT validation_report_json FROM schedule_datasets WHERE id=$DATASET_ID;"
```

Para el PDF actualmente auditado se esperan exactamente: 88 docentes, 2.059
sesiones, 1.235 `class`, 157 `guardia`, 332 `meeting`, 335 `other`, 9 periodos,
2 breaks, 156 sesiones P7, cero duplicados y cero anomalías. Para XML definitivo,
registrar y aprobar sus propios totales; no forzar los números del PDF.

Revisar varias identidades, no solo RMLL:

```bash
sqlite3 -header -column "$CHECK_DB" \
  "SELECT i.external_key,p.display_name,COUNT(s.id) AS sessions
   FROM schedule_dataset_teachers r
   JOIN teacher_profiles p ON p.id=r.teacher_profile_id
   JOIN teacher_external_identities i ON i.id=r.teacher_external_identity_id
   LEFT JOIN teacher_schedule_sessions s
     ON s.dataset_id=r.dataset_id AND s.teacher_profile_id=p.id
   WHERE r.dataset_id=$DATASET_ID
   GROUP BY i.external_key,p.display_name
   ORDER BY i.external_key LIMIT 12;"
```

### 7.4 Instalar la copia validada

Solo con PM2 detenido y sin escritores:

```bash
sudo sqlite3 "$WORK_DB" 'PRAGMA wal_checkpoint(TRUNCATE); PRAGMA quick_check; PRAGMA foreign_key_check;'
sudo cp --preserve=mode,ownership "$DB" "$DB.pre-dataset-$STAMP"
sudo install -o "$APP_USER" -g "$APP_GROUP" -m 600 "$WORK_DB" "$DB.next"
sudo rm -f "$DB-wal" "$DB-shm"
sudo mv -f "$DB.next" "$DB"
sudo sqlite3 "$DB" 'PRAGMA quick_check; PRAGMA foreign_key_check;'

sudo -iu "$PM2_USER" bash -lc \
  "cd '$APP' && set -a && . ./.env && set +a && pm2 restart guardias --update-env"
```

Volver a ejecutar el smoke de código. El dataset nuevo debe seguir `validated`.

## 8. Activación explícita

### 8.1 Backup y estado anterior

```bash
export PRE_ACTIVATION_BACKUP="$BACKUP_ROOT/guardias-before-activation-$STAMP.sqlite"
sudo sqlite3 "$DB" ".backup '$PRE_ACTIVATION_BACKUP'"
sudo chmod 600 "$PRE_ACTIVATION_BACKUP"
sudo sqlite3 "$PRE_ACTIVATION_BACKUP" 'PRAGMA quick_check; PRAGMA foreign_key_check;'

sqlite3 -header -column "$DB" \
  "SELECT id,label,status,activated_at FROM schedule_datasets
   WHERE status='active' ORDER BY id;"
sqlite3 -header -column "$DB" \
  "SELECT id,label,status,validation_report_json FROM schedule_datasets
   WHERE id=$DATASET_ID;"
```

Repetir la sección 7.3 sobre la DB operativa. No activar si difiere de la copia
aprobada.

### 8.2 Activar con superadmin

No poner la contraseña en la línea de comandos ni conservar la cookie:

```bash
read -rsp 'Contraseña superadmin: ' SUPERADMIN_PASSWORD; echo
export SUPERADMIN_PASSWORD
LOGIN_JSON="$(node -e 'process.stdout.write(JSON.stringify({role:"superadmin",password:process.env.SUPERADMIN_PASSWORD}))')"
unset SUPERADMIN_PASSWORD

COOKIE_JAR="/tmp/guardias-superadmin-$STAMP.cookies"
umask 077
curl -fsS -c "$COOKIE_JAR" \
  -H 'Content-Type: application/json' \
  --data "$LOGIN_JSON" \
  http://127.0.0.1:3000/api/auth/login
unset LOGIN_JSON

curl -fsS -b "$COOKIE_JAR" \
  -H 'Content-Type: application/json' \
  -H 'Origin: http://127.0.0.1:3000' \
  --data '{}' \
  "http://127.0.0.1:3000/api/schedule/datasets/$DATASET_ID/activate"

curl -fsS -b "$COOKIE_JAR" -X POST \
  -H 'Content-Type: application/json' --data '{}' \
  http://127.0.0.1:3000/api/auth/logout
rm -f "$COOKIE_JAR"
```

### 8.3 Verificación posterior

```bash
sqlite3 -header -column "$DB" \
  "SELECT d.id,y.code,d.label,d.status,d.activated_at
   FROM schedule_datasets d JOIN academic_years y ON y.id=d.academic_year_id
   ORDER BY d.id;"

curl -fsS http://127.0.0.1:3000/api/schedule/active >/tmp/active-schedule.json
node -e '
const data=require("/tmp/active-schedule.json");
console.log({dataset:data.datasetId,year:data.academicYear,teachers:data.teachers.length,periods:data.periods.length});
for(const teacher of data.teachers.slice(0,5)) console.log(teacher.sourceCode,teacher.displayName,teacher.sessions.length);
'

curl -fsS http://127.0.0.1:3000/api/schedule/legacy.js \
  | grep -F 'canonical_v1_legacy_adapter'
```

En Chrome validar RMLL y al menos otros cuatro docentes de departamentos/horarios
distintos. Comprobar consola y red, `guardias.html`, `/app/`, admin, superadmin y
un rechazo de privilegios de profesor.

## 9. Aceptación local aislada

### 9.1 Crear DB, migrar, importar, validar y activar

PowerShell, siempre fuera de `BD/guardias.sqlite`:

```powershell
Set-Location 'C:\Users\usuario\Documents\GitHub\horario-ies-alcalans'

$testRoot = Join-Path $env:TEMP ('guardias-final-smoke-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $testRoot | Out-Null
$db = Join-Path $testRoot 'guardias-final.test.sqlite'
$census = 'C:\Users\usuario\Desktop\Censo_docente_26-27\censo-profesores-2026-27.json'
$pdf = 'C:\Users\usuario\Desktop\Censo_docente_26-27\censo-profesores-2026-27.pdf'

if ($db -like '*\BD\guardias.sqlite') { throw 'Base operativa bloqueada' }
if (-not (Test-Path -LiteralPath $census)) { throw 'Falta el censo externo' }
if (-not (Test-Path -LiteralPath $pdf)) { throw 'Falta el PDF externo' }

$adminSecret = Read-Host 'Clave admin SOLO PRUEBA' -AsSecureString
$superSecret = Read-Host 'Clave superadmin SOLO PRUEBA' -AsSecureString
$env:GUARDIAS_ADMIN_PASSWORD = [Net.NetworkCredential]::new('', $adminSecret).Password
$env:GUARDIAS_SUPERADMIN_PASSWORD = [Net.NetworkCredential]::new('', $superSecret).Password
$env:GUARDIAS_SESSION_SECRET = 'local-final-smoke-session-secret-change-every-run'
$env:GUARDIAS_DB_PATH = $db

npm.cmd run db:init
npm.cmd run schedule:prepare -- --census $census --pdf $pdf
npm.cmd run schedule:prepare -- --census $census --pdf $pdf --db $db --import

$datasetId = node -e "const{open}=require('sqlite');const sqlite3=require('sqlite3');(async()=>{const d=await open({filename:process.argv[1],driver:sqlite3.Database});const r=await d.get(\"SELECT id FROM schedule_datasets WHERE status='validated' ORDER BY id DESC LIMIT 1\");console.log(r.id);await d.close()})()" $db
npm.cmd run schedule:activate -- --db $db --dataset-id $datasetId
```

La primera ejecución de `schedule:prepare` es solo informe; la segunda importa a
la DB temporal. Comprobar que el informe coincide con los totales auditados.

### 9.2 Crear usuarios de prueba

Crear RMLL titular tras activar el curso temporal:

```powershell
$teacherSecret = Read-Host 'Clave docente SOLO PRUEBA' -AsSecureString
$env:GUARDIAS_LOCAL_TEACHER_PASSWORD = [Net.NetworkCredential]::new('', $teacherSecret).Password
npm.cmd run schedule:local-teacher -- --db $db --username rmll.test --source-code RMLL
```

Repetir con 2–4 `source_code` seleccionados del informe para cubrir guardia,
libre, reunión y P7. No usar nombres o credenciales reales.

Fixture opcional de sustitución, solo en esta DB temporal. Reutiliza la clave de
prueba presente en `GUARDIAS_LOCAL_TEACHER_PASSWORD` y asigna al sustituto el
perfil horario de RMLL durante septiembre:

```powershell
$substituteFixture = @'
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const { hashPassword } = require('./server/auth');
(async () => {
  const db = await open({ filename: process.argv[1], driver: sqlite3.Database });
  try {
    await db.exec('PRAGMA foreign_keys = ON');
    const target = await db.get(`
      SELECT p.id profile_id,p.display_name,p.academic_year_id,a.id titular_assignment_id
      FROM teacher_external_identities i
      JOIN teacher_profiles p ON p.id=i.teacher_profile_id
      JOIN teacher_assignments a ON a.teacher_profile_id=p.id AND a.assignment_type='titular'
      WHERE i.external_key='RMLL' COLLATE NOCASE LIMIT 1`);
    if (!target) throw new Error('Falta titular RMLL');
    const credential = hashPassword(process.env.GUARDIAS_LOCAL_TEACHER_PASSWORD);
    const inserted = await db.run(
      `INSERT INTO users(username,display_name,password_hash,password_salt)
       VALUES('substitute.test','Sustituto de prueba',?,?)`,
      [credential.hash, credential.salt]);
    await db.run(`INSERT INTO user_roles(user_id,role_id)
                  SELECT ?,id FROM roles WHERE key='teacher'`, [inserted.lastID]);
    await db.run(
      `INSERT INTO teacher_assignments
       (user_id,teacher_profile_id,academic_year_id,assignment_type,starts_on,ends_on,replaces_assignment_id)
       VALUES(?,?,?,'sustituto','2026-09-01','2026-09-30',?)`,
      [inserted.lastID,target.profile_id,target.academic_year_id,target.titular_assignment_id]);
    console.log('substitute fixture ready');
  } finally { await db.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
'@
node -e $substituteFixture $db
```

### 9.3 Arrancar

```powershell
$env:PORT = '3237'
npm.cmd run dev
```

URLs:

- `http://127.0.0.1:3237/guardias.html`
- `http://127.0.0.1:3237/app/`
- `http://127.0.0.1:3237/?panel=superadmin`
- `http://127.0.0.1:3237/api/health`

Al terminar: `Ctrl+C`, comprobar que el puerto 3237 está libre, borrar únicamente
`$testRoot` después de validar que está dentro de `$env:TEMP`, y eliminar las
variables de contraseña del proceso.

## 10. Checklist manual Chrome para Rafa

### `/app/`

- [ ] Login individual válido y rechazo de clave incorrecta.
- [ ] Nombre, `source_code` y asignación corresponden al usuario.
- [ ] Estado actual correcto: clase/guardia/libre/recreo/fuera de horario según el momento.
- [ ] Clase muestra materia, grupo y aula.
- [ ] El siguiente tramo visible en la lista coincide con el dataset.
- [ ] Guardia aparece como guardia y no como clase/libre.
- [ ] Hueco lectivo sin sesión aparece libre.
- [ ] Los dos breaks aparecen como recreo aunque no tengan sesión.
- [ ] P7 aparece como lectiva cuando existe.
- [ ] La lista completa funciona como resumen diario y mantiene el orden.
- [ ] Recarga conserva sesión y datos; logout la invalida.
- [ ] Móvil estrecho y escritorio no cortan contenido ni controles.
- [ ] Usuario sin asignación, asignación expirada y perfil inactivo muestran error seguro.
- [ ] `substitute.test` resuelve RMLL durante el intervalo y deja de hacerlo fuera de él.

La UI no ofrece reloj simulado. Si el momento real no permite comprobar todos los
estados actuales, validar las filas diarias en Chrome y complementar con
`/api/schedule/me?date=YYYY-MM-DD`; registrar qué estados no pudieron observarse
como “actuales”.

### `guardias.html`

- [ ] Carga desde `canonical_v1_legacy_adapter` sin error ni datos 2025/26.
- [ ] Lista actual de 88 docentes y horarios de varios docentes.
- [ ] Guardias y disponibilidad coinciden con el dataset.
- [ ] Alta, edición, asignación y retirada de una ausencia de prueba.
- [ ] Flujo Jefatura: faltas futuras, tareas, historial y PDF si están en alcance del día.
- [ ] Sustitución visible se guarda y recarga.
- [ ] Admin puede escribir; profesor individual recibe 403.
- [ ] Superadmin abre salud y descarga backup SQLite.
- [ ] Consola sin errores inesperados y red sin 4xx/5xx no explicados.

### Roles

- [ ] `teacher`: solo sesión individual y `/app/`; sin acceso admin ni activación.
- [ ] `admin`/Jefatura: flujo diario e importación XML validada, no activación.
- [ ] `superadmin`: backup, salud y activación explícita.
- [ ] Manipular roles, userId, parámetros, body o cookie no eleva privilegios.
- [ ] Sustituto: perfil titular correcto solo dentro de sus fechas.

## 11. Rollback

Nunca ensayar estas operaciones contra producción. Ensayarlas sobre copia antes
de la ventana.

### 11.1 Release de código incorrecto

```bash
sudo -iu "$PM2_USER" pm2 stop guardias
export ROLLBACK_DIR="/srv/guardias/rollback-$STAMP"
sudo install -d -m 700 "$ROLLBACK_DIR"
sudo tar -xzf "$BACKUP_ROOT/app-full-$STAMP.tar.gz" -C "$ROLLBACK_DIR"
sudo rsync -an --delete --exclude='BD/' "$ROLLBACK_DIR/" "$APP/"
# Revisar la simulación y solo entonces:
sudo rsync -a --delete --exclude='BD/' "$ROLLBACK_DIR/" "$APP/"
sudo -iu "$PM2_USER" bash -lc \
  "cd '$APP' && set -a && . ./.env && set +a && pm2 restart guardias --update-env"
```

Verificar bind, health, login y operación básica.

### 11.2 Migración fallida

Restaurar código y la DB final previa. Node debe estar detenido:

```bash
sudo -iu "$PM2_USER" pm2 stop guardias
sudo mv "$DB" "$DB.failed-$STAMP"
sudo rm -f "$DB-wal" "$DB-shm"
sudo install -o "$APP_USER" -g "$APP_GROUP" -m 600 "$FINAL_DB_BACKUP" "$DB"
sudo sqlite3 "$DB" 'PRAGMA quick_check; PRAGMA foreign_key_check;'
# Restaurar aplicación como en 11.1 y arrancar.
```

### 11.3 Dataset incorrecto aún no activado

No afecta al runtime. No activarlo ni borrarlo durante la incidencia. Conservar
informe/huellas, corregir la fuente e importar otra versión `validated`.

### 11.4 Activación incorrecta

La API archiva el dataset anterior y no admite reactivarlo directamente. El
rollback soportado es restaurar inmediatamente el backup preactivación:

```bash
sudo -iu "$PM2_USER" pm2 stop guardias
sudo mv "$DB" "$DB.bad-activation-$STAMP"
sudo rm -f "$DB-wal" "$DB-shm"
sudo install -o "$APP_USER" -g "$APP_GROUP" -m 600 "$PRE_ACTIVATION_BACKUP" "$DB"
sudo sqlite3 "$DB" 'PRAGMA quick_check; PRAGMA foreign_key_check;'
sudo -iu "$PM2_USER" bash -lc \
  "cd '$APP' && set -a && . ./.env && set +a && pm2 restart guardias --update-env"
```

Esto pierde escrituras realizadas después del backup; por eso la verificación
postactivación debe ser inmediata y durante una ventana sin uso.

### 11.5 Corrupción SQLite

1. Parar PM2 y bloquear escrituras.
2. Conservar la DB corrupta y sus WAL/SHM con sufijo de incidente; no sobrescribirla.
3. Elegir el backup SQLite más reciente que pase ambos PRAGMA.
4. Restaurarlo con propietario/modo correctos y sin WAL/SHM antiguos.
5. Arrancar y verificar tablas, dataset activo, logins y varias operaciones.
6. Conservar hashes, tiempos y causa para análisis posterior.

Comandos base:

```bash
sudo -iu "$PM2_USER" pm2 stop guardias
sudo sqlite3 '<backup-candidato>' 'PRAGMA quick_check; PRAGMA foreign_key_check;'
sudo mv "$DB" "$DB.corrupt-$STAMP"
sudo test ! -e "$DB-wal" || sudo mv "$DB-wal" "$DB-wal.corrupt-$STAMP"
sudo test ! -e "$DB-shm" || sudo mv "$DB-shm" "$DB-shm.corrupt-$STAMP"
sudo install -o "$APP_USER" -g "$APP_GROUP" -m 600 '<backup-candidato>' "$DB"
sudo -iu "$PM2_USER" bash -lc \
  "cd '$APP' && set -a && . ./.env && set +a && pm2 restart guardias --update-env"
```

## 12. Cierre de ventana

- Guardar commit, hashes, backups, resultados PRAGMA y smoke.
- Confirmar PM2 online, Nginx válido y Node solo en loopback.
- Confirmar exactamente un curso y dataset activos.
- Confirmar 88 docentes y métricas aprobadas.
- Ejecutar backup SQLite postdespliegue y verificarlo.
- Eliminar cookies y fuentes externas temporales del servidor:

```bash
rm -f "/tmp/guardias-superadmin-$STAMP.cookies"
rm -f "/tmp/guardias-$RELEASE.tar.gz"
rm -rf -- "$IMPORT_DIR"  # verificar antes que coincide con /var/tmp/guardias-import-$RELEASE
```

- No desplegar cambios adicionales durante el periodo de observación.
