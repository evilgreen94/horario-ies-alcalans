# ARGOS — checkpoint previo a la conmutación

Fecha: 11/09/2026. **PREPARACIÓN COMPLETADA; CONMUTACIÓN NO AUTORIZADA.**

Este documento registra la preparación y propone comandos para otra ventana.
Los bloques de conmutación y rollback **NO se han ejecutado**. No ejecutar el
documento como un script: cada puerta requiere verificar su resultado antes de
pasar a la siguiente. Un fallo no autoriza reparaciones improvisadas.

## Evidencia de preparación

| Elemento | Resultado |
|---|---|
| Host remoto / usuario | `admin` / `rafa` |
| Backup vivo consistente | `/srv/guardias/backups/deployments/prepare-20260911T074031Z/guardias-live.sqlite` |
| Método | API de backup SQLite, origen abierto en lectura; WAL incorporado por SQLite |
| Tamaño / permisos | 581.632 bytes / `0600`; directorio privado `0700` |
| `quick_check` | `ok`, comprobado de nuevo en este checkpoint |
| `foreign_key_check` | Cero violaciones, comprobado de nuevo |
| SHA-256 | `16cf1f657eeef0ca9bde789de0de3bbbc7c6b9e7fb185eef5b53d5f1dba4d923` |
| Copia fuera del servidor | `C:\Users\rafae\Documents\ARGOS\production-backups\prepare-20260911T074031Z\guardias-live.sqlite`, en Ares |
| Verificación Ares | SHA-256 coincidente; ACL sin herencia, acceso para `ARES\rafae` |
| Credenciales legacy | Filas `admin` y `superadmin` presentes en el backup; valores secretos no mostrados |
| Artefacto | `guardias-release-ccb2f7a88fbf-linux-x64.tar.gz` |
| SHA-256 artefacto | `8275e5162f9a392a17ff33b9f111a2d8708ecfae6fa923aa6ae0aa6756f38cf8` |
| Release | `/srv/guardias/releases/ccb2f7a88fbf9815c13df501d1aa972d31384129` |
| Runtime | Node `v22.23.2`, ejecutado sin iniciar la aplicación |
| Dependencias | Carga de `sqlite3`, `sqlite`, `express`, `fast-xml-parser` y `pdfkit`: correcta |
| Contenido | Todos los archivos regulares extraídos coinciden con el tar |
| Permisos release | Directorios/ejecutables `0555`, archivos restantes `0444`, propietario `rafa` |
| Entorno | `/etc/guardias/guardias.env`, `rafa:rafa`, `0600`; directorio `0700`; `bash -n` correcto |
| Estado activo | PM2 PID 1189, Node legacy PID 1209, Nginx PID 939; activos |
| No activado | No existen `current` ni `/srv/guardias/data/guardias.sqlite` |

Tablas del backup: `alumnos_fuera_aula`, `announcements`, `app_state`,
`ausencias`, `auth_credentials`, `biblioteca_guardias`, `grupos_estado`,
`historial`, `session_overrides`, `sqlite_sequence`, `tareas_profesorado`.
No se han mostrado registros personales.

El directorio privado del backup incluye `verification.json`, checksum y copias
`0600` de la configuración Nginx, unidad `pm2-rafa` y dump PM2 histórico.
Estas copias de configuración están en el servidor, no se declara una copia
externa de ellas. El backup vivo no sustituye al backup final tras detener al
escritor, ni acredita todavía un ensayo de restauración.

Se inspeccionaron 3.532 entradas del tar y sus enlaces. No aparecen `.git`,
`.ssh`, `.pm2`, `.npm`, `.bash_history`, `.env`, `BD`, backups ni SQLite/WAL/SHM.
La plantilla `.env.example` no es el entorno legacy. No se encontraron marcadores
de claves privadas en archivos del producto examinados; esto no es una garantía
universal de ausencia de cualquier secreto en dependencias. No se copió el
checkout legacy. Los modos sin escritura previenen cambios ordinarios, pero el
propietario `rafa` puede revertirlos: no se ha aplicado inmutabilidad del kernel
ni cambiado el propietario a root.

## Estructura preparada y entorno

```text
/srv/guardias/
  releases/ccb2f7a88fbf9815c13df501d1aa972d31384129/
  legacy/                         # vacío, 0700
  data/                           # vacío, 0700
  backups/
    daily/                        # 0700
    weekly/                       # 0700
    monthly/                      # 0700
    deployments/prepare-20260911T074031Z/
  incoming/                       # tar aprobado, directorio 0700
  horario-ies-alcalans/            # legacy activo, sin mover
/etc/guardias/guardias.env
```

Valores preparados; el marcador de secreto de este documento NO es el valor del
archivo y no debe copiarse sobre él:

```dotenv
NODE_ENV=production
PORT=3000
GUARDIAS_DB_PATH=/srv/guardias/data/guardias.sqlite
GUARDIAS_SESSION_SECRET=<generado, no mostrado>
GUARDIAS_TRUST_PROXY=1
GUARDIAS_CORS_ORIGINS=
BACKUP_ROOT=/srv/guardias/backups
```

Se generó un secreto aleatorio nuevo con 48 bytes de entropía. No se reutilizó el
entorno legacy. No se añaden contraseñas administrativas: las credenciales legacy
se conservan en la BD y se comprobarán de nuevo antes de migrar.

Las rutas de datos/backups/legacy adaptan el runbook a la instrucción explícita
del usuario. El artefacto queda intacto; su documentación y sus unidades de backup
pueden conservar los defaults `/var/lib/guardias` y `/var/backups/guardias`.
No instalar esas unidades sin adaptarlas en una fase posterior autorizada.

## Comandos propuestos: puertas previas

**NO EJECUTADOS.** Ejecutar como `rafa` en el servidor, solo tras aprobación
explícita de conmutación y con una ventana que no coincida con el reinicio
recurrente aún pendiente de explicación. Sudo puede pedir contraseña en terminal.
No activar trazas de shell (`set -x`), ni mostrar entornos/dumps/logs sin filtrar.

```bash
set -euo pipefail
umask 077
export ROOT=/srv/guardias
export RELEASE=ccb2f7a88fbf9815c13df501d1aa972d31384129
export RELEASE_DIR="$ROOT/releases/$RELEASE"
export OLD_APP="$ROOT/horario-ies-alcalans"
export OLD_DB="$OLD_APP/BD/guardias.sqlite"
export DB="$ROOT/data/guardias.sqlite"
export ENV_FILE=/etc/guardias/guardias.env
export STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
export B="$ROOT/backups/deployments/switch-$STAMP"
export LEGACY_APP="$ROOT/legacy/$STAMP-d5790d1226ba"
export FINAL_BACKUP="$B/guardias-final.sqlite"
test -d "$OLD_APP" && test ! -L "$OLD_APP"
test ! -e "$LEGACY_APP" && test ! -L "$LEGACY_APP"
test ! -e "$ROOT/current" && test ! -L "$ROOT/current"
test ! -e "$ROOT/current.next" && test ! -L "$ROOT/current.next"
test ! -e "$DB" && test ! -e "$DB-wal" && test ! -e "$DB-shm"
test "$(stat -c %a "$ENV_FILE")" = 600
test "$(sed -n 's/^commit=//p' "$RELEASE_DIR/.deployed-release")" = "$RELEASE"
test ! -e "$B"
install -d -m 700 "$B"
export OLD_PID="$(pm2 pid guardias)"
test "$OLD_PID" -gt 1
test "$(readlink -f "/proc/$OLD_PID/cwd")" = "$OLD_APP"
test "$(readlink -f "/proc/$OLD_PID/exe")" = /usr/bin/node
```

Capturar la configuración efectiva para rollback ANTES de parar. El fichero
resultante contiene entorno sensible y nunca debe imprimirse. No se usa el dump
histórico como prueba de los valores efectivos actuales.

```bash
python3 - <<'PY'
import os, pathlib, json
b=pathlib.Path(os.environ['B'])
pid=int(os.environ['OLD_PID'])
raw=pathlib.Path(f'/proc/{pid}/environ').read_bytes()
env={k.decode():v.decode() for item in raw.split(b'\0') if item
     for k,v in [item.split(b'=',1)]}
env['GUARDIAS_DB_PATH']=os.environ['DB']
env['PWD']=os.environ['LEGACY_APP']
config={'apps':[{'name':'guardias',
    'script':os.environ['LEGACY_APP']+'/server/app.js',
    'cwd':os.environ['LEGACY_APP'],'interpreter':'/usr/bin/node',
    'exec_mode':'fork','instances':1,'env':env}]}
with (b/'rollback.config.json').open('x') as f: json.dump(config,f)
os.chmod(b/'rollback.config.json',0o600)
for src,name in [('/etc/nginx/sites-available/guardias','nginx.conf'),
                 ('/home/rafa/.pm2/dump.pm2','pm2-dump.pm2')]:
    with (b/name).open('xb') as f: f.write(pathlib.Path(src).read_bytes())
    os.chmod(b/name,0o600)
with (b/'paths.json').open('x') as f:
    json.dump({k:os.environ[k] for k in
      ['ROOT','RELEASE_DIR','OLD_APP','OLD_DB','DB','B','LEGACY_APP','FINAL_BACKUP']},f)
PY
```

## Parar legacy, comprobar escritores y backup final

```bash
pm2 stop guardias
test ! -e "/proc/$OLD_PID"
if ss -lntp | grep -q ':3000 '; then echo 'STOP: listener residual'; exit 1; fi
sudo python3 - "$OLD_DB" <<'PY'
import pathlib,os,sys
targets={sys.argv[1],sys.argv[1]+'-wal',sys.argv[1]+'-shm'}
holders=[]
for proc in pathlib.Path('/proc').iterdir():
    if not proc.name.isdigit(): continue
    try:
        for fd in (proc/'fd').iterdir():
            try:
                if os.readlink(fd) in targets: holders.append(proc.name)
            except FileNotFoundError: pass
    except FileNotFoundError: pass
assert not holders,'STOP: procesos mantienen abierta la BD'
PY
sqlite3 -cmd '.timeout 5000' "$OLD_DB" ".backup '$FINAL_BACKUP'"
chmod 600 "$FINAL_BACKUP"
test "$(sqlite3 -readonly "$FINAL_BACKUP" 'PRAGMA quick_check;')" = ok
test -z "$(sqlite3 -readonly "$FINAL_BACKUP" 'PRAGMA foreign_key_check;')"
test "$(sqlite3 -readonly "$FINAL_BACKUP" \
  "SELECT COUNT(DISTINCT role) FROM auth_credentials WHERE role IN ('admin','superadmin');")" = 2
sha256sum "$FINAL_BACKUP" > "$FINAL_BACKUP.sha256"
```

**Puerta obligatoria:** transferir el directorio privado `$B` a Ares, con ACL
equivalente a la copia previa, y verificar el SHA del backup final. Incluye la
configuración sensible de rollback; no guardarla en Git ni mostrarla. En Ares:

```powershell
$switchStamp = Read-Host 'Valor exacto de STAMP mostrado por el operador'
if ($switchStamp -notmatch '^\d{8}T\d{6}Z$') { throw 'STAMP inválido' }
$switchDest = "C:\Users\rafae\Documents\ARGOS\production-backups\switch-$switchStamp"
if (Test-Path -LiteralPath $switchDest) { throw 'El destino ya existe' }
New-Item -ItemType Directory -Path $switchDest -ErrorAction Stop | Out-Null
$acl = Get-Acl -LiteralPath $switchDest
$acl.SetAccessRuleProtection($true,$false)
$sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
$acl.SetAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new(
  $sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow'))
Set-Acl -LiteralPath $switchDest -AclObject $acl
scp -r "rafa@172.28.244.250:/srv/guardias/backups/deployments/switch-$switchStamp/." $switchDest
if ($LASTEXITCODE -ne 0) { throw 'Transferencia fallida' }
$expected = ((Get-Content -LiteralPath "$switchDest\guardias-final.sqlite.sha256") -split '\s+')[0]
if ((Get-FileHash -Algorithm SHA256 -LiteralPath "$switchDest\guardias-final.sqlite").Hash -ne $expected) {
  throw 'STOP: hash externo distinto'
}
```

No seguir sin confirmación del hash externo. Si se cancela aquí, antes de mover
legacy, `pm2 start guardias` permite reanudar el proceso existente; verificarlo
antes de guardar su estado. Ese arranque puede ejecutar mantenimiento legacy.

## Preservar legacy y migrar la copia externa

```bash
mv -- "$OLD_APP" "$LEGACY_APP"
test ! -e "$OLD_APP"
install -m 600 "$FINAL_BACKUP" "$DB"
test "$(sqlite3 -readonly "$DB" 'PRAGMA quick_check;')" = ok
test -z "$(sqlite3 -readonly "$DB" 'PRAGMA foreign_key_check;')"
```

No se crea symlink en la ruta antigua. El rollback usará su configuración
explícita y la BD externa. No se pone `current` a apuntar al árbol legacy.

Guardar recuentos estructurales de tablas operativas, migrar DOS veces mediante
el mecanismo oficial y comparar. Estas operaciones escriben en la NUEVA BD.

```bash
export COUNTS_SQL="SELECT 'ausencias',COUNT(*) FROM ausencias UNION ALL
SELECT 'biblioteca_guardias',COUNT(*) FROM biblioteca_guardias UNION ALL
SELECT 'historial',COUNT(*) FROM historial UNION ALL
SELECT 'tareas_profesorado',COUNT(*) FROM tareas_profesorado UNION ALL
SELECT 'app_state',COUNT(*) FROM app_state;"
sqlite3 -readonly "$DB" "$COUNTS_SQL" > "$B/counts-before.txt"
for pass in 1 2; do
  ( set -a; . "$ENV_FILE"; set +a
    cd "$RELEASE_DIR"
    ./runtime/node server/scripts/init-db.js )
done
sqlite3 -readonly "$DB" "$COUNTS_SQL" > "$B/counts-after.txt"
cmp "$B/counts-before.txt" "$B/counts-after.txt"
test "$(sqlite3 -readonly "$DB" 'PRAGMA quick_check;')" = ok
test -z "$(sqlite3 -readonly "$DB" 'PRAGMA foreign_key_check;')"
sqlite3 -readonly "$DB" 'SELECT name FROM schema_migrations ORDER BY name;'
```

Deben aparecer exactamente:

- `001_individual_teacher_auth.sql`
- `002_academic_schedule_model.sql`
- `003_final_session_security_and_schedule_types.sql`

`db:init` evita el reset semanal; no activa datasets ni provisiona cuentas. No
ejecutar las migraciones SQL sueltas: su idempotencia depende del registro del
proyecto. Ante cualquier discrepancia, STOP y rollback compatible.

## Activar current, arrancar ARGOS y ajustar Nginx

```bash
ln -s "$RELEASE_DIR" "$ROOT/current.next"
mv -T "$ROOT/current.next" "$ROOT/current"
test "$(readlink -f "$ROOT/current")" = "$RELEASE_DIR"
pm2 delete guardias
GUARDIAS_ENV_FILE="$ENV_FILE" pm2 start "$ROOT/current/deploy/linux/start-guardias.sh" \
  --name guardias --interpreter bash --cwd "$ROOT/current"
ss -lntp
curl -fsS http://127.0.0.1:3000/api/health
```

STOP si el listener no es exactamente `127.0.0.1:3000`, hay más de un escritor o
falla la salud. No ejecutar `pm2 save` todavía. El arranque normal y las rutas
`/api` pueden ejecutar mantenimiento semanal: son acciones con escritura.

Actualizar exclusivamente el sitio existente, después de validar Node:

```bash
test ! -e /etc/nginx/sites-available/guardias.new
sudo install -m 644 "$RELEASE_DIR/deploy/linux/guardias.nginx.conf" \
  /etc/nginx/sites-available/guardias.new
sudo mv -T /etc/nginx/sites-available/guardias.new /etc/nginx/sites-available/guardias
sudo nginx -t
sudo systemctl reload nginx
curl -fsS http://127.0.0.1/api/health
systemctl is-active nginx pm2-rafa
```

## Validación y decisión operativa

```bash
curl -fsSI http://127.0.0.1/
curl -fsSI http://127.0.0.1/guardias.html
curl -fsSI http://127.0.0.1/app/
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1/api/schedule/active
ss -lntp
sqlite3 -readonly "$DB" 'PRAGMA quick_check; PRAGMA foreign_key_check;'
```

En Ares, repetir la comprobación TCP desde el equipo que pudo conectar al legacy:

```powershell
Test-NetConnection -ComputerName 172.28.244.250 -Port 3000 -InformationLevel Detailed
```

Debe fallar TCP/3000 mientras HTTP/80 sigue disponible. Verificar también desde
una máquina de la LAN escolar si la ruta de Ares no representa esa red.

**No declarar disponibilidad funcional completa:** sin un dataset aprobado y
activo, se espera un estado visible sin horario (`503` donde corresponda), no
fallback legacy. Importación, activación y provisión de cuentas necesitan la
aprobación separada indicada en el runbook. Definir antes de la ventana si se
autoriza esta indisponibilidad funcional transitoria; en caso contrario no
conmutar todavía.

Login/logout, cambio de contraseña, permisos de Jefatura/profesorado, ausencias,
coberturas, pruebas de restart/recovery y backups de prueba **pueden escribir**
datos, sesiones, auditoría, archivos o estado PM2. Deben identificarse y aprobarse
antes de ejecutarlas; no se han realizado en esta preparación. Revisar logs de
forma acotada y filtrada, nunca volcar entornos, cookies, claves o registros
personales. El ensayo de rollback tampoco se ha ejecutado.

Solo tras validación aceptada, generar backup posterior y verificar su copia en
Ares; entonces persistir PM2. No instalar timers en esta fase:

```bash
GUARDIAS_DB_PATH="$DB" BACKUP_ROOT="$ROOT/backups" \
  bash "$RELEASE_DIR/ops/backup.sh"
# PAUSA: verificar copia externa del nuevo backup antes de persistir.
pm2 save
systemctl is-enabled pm2-rafa
```

## Rollback propuesto, sin dependencia de Git ni reconstrucción

Usar los valores registrados en `$B/paths.json` si se ha perdido la terminal.
No leer ni imprimir `rollback.config.json`: contiene el entorno legacy.
La configuración capturada usa Node 18, el legacy preservado y `$DB` restaurada
desde el backup final. No necesita un symlink hacia la ubicación antigua.

```bash
pm2 stop guardias
if ss -lntp | grep -q ':3000 '; then echo 'STOP: listener residual'; exit 1; fi
sudo python3 - "$DB" <<'PY'
import pathlib,os,sys
targets={sys.argv[1],sys.argv[1]+'-wal',sys.argv[1]+'-shm'}
holders=[]
for proc in pathlib.Path('/proc').iterdir():
    if not proc.name.isdigit(): continue
    try:
        for fd in (proc/'fd').iterdir():
            try:
                if os.readlink(fd) in targets: holders.append(proc.name)
            except FileNotFoundError: pass
    except FileNotFoundError: pass
assert not holders,'STOP: procesos mantienen abierta la BD'
PY
test "$(sqlite3 -readonly "$FINAL_BACKUP" 'PRAGMA quick_check;')" = ok
test -z "$(sqlite3 -readonly "$FINAL_BACKUP" 'PRAGMA foreign_key_check;')"
export FAILED="$B/failed-$(date -u +%Y%m%dT%H%M%SZ)"
test ! -e "$FAILED"
install -d -m 700 "$FAILED"
for file in "$DB" "$DB-wal" "$DB-shm"; do
  if test -e "$file"; then mv -- "$file" "$FAILED/"; fi
done
install -m 600 "$FINAL_BACKUP" "$DB"
test "$(sqlite3 -readonly "$DB" 'PRAGMA quick_check;')" = ok
test -z "$(sqlite3 -readonly "$DB" 'PRAGMA foreign_key_check;')"
if test -L "$ROOT/current"; then mv -- "$ROOT/current" "$FAILED/current-link"; fi
pm2 delete guardias
pm2 start "$B/rollback.config.json" --only guardias
sudo install -m 644 "$B/nginx.conf" /etc/nginx/sites-available/guardias
sudo nginx -t
sudo systemctl reload nginx
systemctl is-active nginx pm2-rafa
curl -fsS http://127.0.0.1/api/health
# PAUSA: verificar recuperación funcional y logs antes de persistir.
pm2 save
```

Si una puerta falla después de mover legacy pero antes de crear la BD nueva,
usar el mismo backup final y configuración capturada; preservar únicamente los
archivos nuevos que existan. Si `pm2 delete guardias` ya ocurrió y no existe esa
entrada, omitir stop/delete tras comprobar su ausencia: no ocultar otros errores
con `|| true`. No repetir a ciegas bloques parcialmente ejecutados.

El rollback recupera también limitaciones del legacy, incluida su escucha global
en 3000. No se ha corregido ese riesgo ni se declara el rollback una instalación
limpia de ARGOS. No existe todavía una segunda release limpia aceptada.

## Confirmación de límites

En esta última etapa solo se creó `guardias.env` en el servidor y se realizaron
lecturas de verificación. No hubo parada, migración, activación de `current`,
alteración de PM2/Nginx, cambios de firewall/NTP ni limpieza. El checkpoint es un
documento local, sin secretos. **Esperar aprobación explícita; no conmutar.**
