# Horario IES Alcalans

Aplicacion interna para gestionar ausencias del profesorado, reparto de guardias, avisos para sala de profesores, tareas dejadas por el docente ausente, faltas futuras e informes PDF.

El proyecto esta pensado para uso en red local del centro. Frontend y backend se sirven desde la misma aplicacion Node.js.

## Resumen rapido

- Frontend: `HTML + CSS + JavaScript` sin framework
- Backend: `Node.js + Express`
- Base de datos: `SQLite`
- Puerto por defecto: `3000`
- Entrada principal: `guardias.html`
- API: prefijo `/api`
- Modos principales:
  - Jefatura
  - Profesorado
  - Sala de profesores / TV
  - Superadmin

## Que hace la aplicacion

### Jefatura

- Alta, edicion y borrado de ausencias por dia y hora
- Reparto automatico de guardias
- Gestion de biblioteca y banos
- Sustituciones temporales
- Validacion de faltas futuras comunicadas por profesorado
- Avisos para sala de profesores
- Informes PDF diario y semanal

### Profesorado

- Acceso por seleccion de profesor
- Vista de horario diario
- Consulta de guardias asignadas
- Edicion de tarea dejada para el grupo
- Aviso de faltas futuras por fecha y horas lectivas
- Consulta del estado de sus avisos

### Sala de profesores / TV

- Vista pensada para pantalla compartida
- Muestra guardias del tramo actual, siguiente y posterior
- Puede mostrar un aviso activo en cabecera

### Superadmin

- Exportacion y restauracion
- Estado tecnico del sistema
- Monitor de sincronizacion
- Operaciones de mantenimiento

## Estructura del proyecto

```text
horario-ies-alcalans/
|-- BD/
|   `-- guardias.sqlite
|-- css/
|   `-- guardias.css
|-- deploy/
|   `-- linux/
|       |-- backup-guardias.sh
|       |-- guardias.service
|       |-- guardias-backup-daily.service
|       |-- guardias-backup-daily.timer
|       |-- guardias-backup-weekly.service
|       |-- guardias-backup-weekly.timer
|       |-- guardias-backup-monthly.service
|       `-- guardias-backup-monthly.timer
|-- guardias.html
|-- imagenes/
|-- js/
|   |-- app/
|   |   |-- guardias-core.js
|   |   |-- guardias.js
|   |   `-- storage.js
|   `-- data/
|       `-- profesorado_horarios_guardias.js
|-- json_profes/
|-- server/
|   |-- app.js
|   |-- auth.js
|   |-- db.js
|   |-- maintenance.js
|   |-- schema.sql
|   |-- session.js
|   |-- telemetry.js
|   |-- routes/
|   |   |-- auth.js
|   |   |-- avisos.js
|   |   |-- biblioteca.js
|   |   |-- export.js
|   |   |-- guardias.js
|   |   |-- historial.js
|   |   |-- profesorado.js
|   |   |-- profesorado/
|   |   |   |-- alumnos-fuera-aula.js
|   |   |   |-- annual-import.js
|   |   |   |-- session-overrides.js
|   |   |   |-- shared.js
|   |   |   |-- state-collections.js
|   |   |   `-- tareas.js
|   |   |-- report.js
|   |   `-- validation.js
|   `-- scripts/
|       |-- build-profesorado-source.js
|       |-- init-db.js
|       |-- reset-course.js
|       |-- run-tests.js
|       `-- smoke-test.js
|-- .env.example
|-- package.json
|-- start-local.cmd
`-- start-local.ps1
```

## Rutas importantes

### Frontend

- `/` -> vista principal
- `/tv` -> modo sala de profesores / TV
- `/print` -> vista preparada para impresion
- `/?panel=superadmin` -> acceso al panel superadmin

### API

- `/api/health`
- `/api/auth/*`
- `/api/guardias/*`
- `/api/biblioteca/*`
- `/api/historial/*`
- `/api/profesorado/*`
- `/api/avisos/*`
- `/api/report/*`
- `/api/export/*`

## Datos y persistencia

### Base de datos

Por defecto la aplicacion usa:

- local Windows: `BD/guardias.sqlite`
- servidor Linux: `/srv/guardias/horario-ies-alcalans/BD/guardias.sqlite`

### Datos anuales

La web consume:

- `js/data/profesorado_horarios_guardias.js`

Ese fichero se genera a partir de una fuente JSON anual. La fuente habitual es:

- `json_profes/profesorado_horarios_guardias_con_guardias_updated.json`

Si cambias la fuente anual, hay que regenerar el JS:

```powershell
npm.cmd run annual:build
```

### Datos operativos

Se guardan en SQLite:

- ausencias
- guardias asignadas
- biblioteca
- historial
- tareas
- sustituciones
- faltas futuras
- avisos TV
- estado tecnico

## Variables de entorno

La plantilla base esta en:

- `.env.example`

### Obligatorias

```text
GUARDIAS_SESSION_SECRET=<secreto-largo-y-estable>
```

Si falta esta variable, el backend no arranca.

### Recomendadas

```text
PORT=3000
GUARDIAS_DB_PATH=/srv/guardias/horario-ies-alcalans/BD/guardias.sqlite
GUARDIAS_TRUST_PROXY=1
GUARDIAS_CORS_ORIGINS=
```

### Solo para inicializar una base vacia

```text
GUARDIAS_ADMIN_PASSWORD=<clave-admin-inicial>
GUARDIAS_SUPERADMIN_PASSWORD=<clave-superadmin-inicial>
```

## Arranque local

### PowerShell

```powershell
cd "C:\Users\usuario\Documents\GitHub\horario-ies-alcalans"
Set-ExecutionPolicy -Scope Process Bypass
.\start-local.ps1
```

### CMD

```bat
cd /d "C:\Users\usuario\Documents\GitHub\horario-ies-alcalans"
start-local.cmd
```

### Arranque manual

```powershell
$env:GUARDIAS_SESSION_SECRET="pon-aqui-un-secreto"
npm.cmd start
```

### Test rapido local

```powershell
npm.cmd test
```

Ese comando ejecuta el runner ligero `server/scripts/run-tests.js` sin dependencias extra.

### URLs locales

- principal: `http://localhost:3000`
- superadmin: `http://localhost:3000/?panel=superadmin`
- healthcheck: `http://localhost:3000/api/health`

## Despliegue en servidor

## Estado actual del servidor

Actualizar estos datos cuando cambien:

- IP interna actual: `172.28.244.260`
- Ruta del proyecto en servidor: `/srv/guardias/horario-ies-alcalans`
- Usuario operativo: `superadmin`

La contrasena no debe guardarse en este repositorio.

## Como se levanta en servidor

La aplicacion se levanta con `pm2`.

Los timers de backup estan preparados con `systemd`.

### Requisitos minimos en Linux

```bash
sudo apt update
sudo apt install -y git nginx sqlite3 ufw curl
```

Node.js y `pm2` deben estar instalados.

Ejemplo:

```bash
sudo npm install -g pm2
```

### Preparacion del proyecto

```bash
cd /srv/guardias
git clone <REPO_URL> horario-ies-alcalans
cd /srv/guardias/horario-ies-alcalans
npm install
```

### Archivo `.env` del servidor

Ejemplo minimo:

```text
PORT=3000
GUARDIAS_SESSION_SECRET=<secreto-largo>
GUARDIAS_DB_PATH=/srv/guardias/horario-ies-alcalans/BD/guardias.sqlite
GUARDIAS_TRUST_PROXY=1
GUARDIAS_CORS_ORIGINS=
```

### Arranque con pm2

Desde la carpeta del proyecto:

```bash
cd /srv/guardias/horario-ies-alcalans
pm2 start server/app.js --name guardias
pm2 save
pm2 status
```

Si prefieres arrancar usando el script de `npm`:

```bash
pm2 start npm --name guardias -- start
pm2 save
```

### Comandos utiles de pm2

```bash
pm2 status
pm2 logs guardias
pm2 restart guardias
pm2 stop guardias
pm2 delete guardias
pm2 save
```

### Nginx

El uso esperado es:

- `nginx` delante
- Node escuchando en `127.0.0.1:3000`
- acceso desde red interna

Si algo falla por cabeceras o cookies detras del proxy, revisar:

- `GUARDIAS_TRUST_PROXY=1`

## Backups

Los backups de SQLite estan preparados en:

- `deploy/linux/backup-guardias.sh`
- `deploy/linux/guardias-backup-daily.service`
- `deploy/linux/guardias-backup-daily.timer`
- `deploy/linux/guardias-backup-weekly.service`
- `deploy/linux/guardias-backup-weekly.timer`
- `deploy/linux/guardias-backup-monthly.service`
- `deploy/linux/guardias-backup-monthly.timer`

### Que hacen

- copia diaria
- copia semanal
- copia mensual
- rotacion automatica
- opcion de exportar tambien snapshot JSON

### Rutas previstas

```text
BD principal:
/srv/guardias/horario-ies-alcalans/BD/guardias.sqlite

Backups:
/var/backups/guardias
```

### Activacion de timers

```bash
chmod +x /srv/guardias/horario-ies-alcalans/deploy/linux/backup-guardias.sh
sudo cp /srv/guardias/horario-ies-alcalans/deploy/linux/guardias-backup-*.service /etc/systemd/system/
sudo cp /srv/guardias/horario-ies-alcalans/deploy/linux/guardias-backup-*.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now guardias-backup-daily.timer
sudo systemctl enable --now guardias-backup-weekly.timer
sudo systemctl enable --now guardias-backup-monthly.timer
```

### Revision de backups

```bash
systemctl status guardias-backup-daily.timer
systemctl status guardias-backup-weekly.timer
systemctl status guardias-backup-monthly.timer
ls -la /var/backups/guardias
```

## Operaciones habituales

### Regenerar datos anuales

```powershell
npm.cmd run annual:build
```

En Linux:

```bash
npm run annual:build
```

### Reinicio de curso

```powershell
npm.cmd run course:reset -- --yes
```

Esto borra datos operativos temporales del curso y deja snapshot.

### Smoke test

Con servidor levantado:

```powershell
npm.cmd run smoke
```

Si quieres probar otro host:

```powershell
$env:GUARDIAS_BASE_URL="http://127.0.0.1:3000"
npm.cmd run smoke
```

### Test unitarios ligeros

Sin levantar servidor:

```powershell
npm.cmd test
```

Cubre validacion basica de autenticacion, sesion y fuente anual. Los tests viven en `server/tests/`.

## Que revisar si falla

## 1. El backend no arranca

Comprobar:

- existe `.env`
- `GUARDIAS_SESSION_SECRET` esta definido
- la ruta de `GUARDIAS_DB_PATH` existe
- `node_modules` esta instalado

Comandos:

```bash
cd /srv/guardias/horario-ies-alcalans
pm2 logs guardias --lines 100
cat .env
ls -la BD
```

## 2. La web abre pero no guarda cambios

Comprobar:

- que la API responde
- que el usuario tiene sesion
- que SQLite es escribible
- que no hay restauracion en curso

Comandos:

```bash
curl http://127.0.0.1:3000/api/health
ls -la /srv/guardias/horario-ies-alcalans/BD
pm2 logs guardias --lines 200
```

## 3. La web carga mal o faltan estilos/scripts

Comprobar:

- que `guardias.html`, `css/guardias.css`, `js/app/guardias-core.js` y `js/app/guardias.js` existen
- que `nginx` no sirve una copia antigua
- que el navegador no esta cacheando una version vieja

## 4. El panel TV no muestra avisos

Comprobar:

- que existe al menos un aviso activo
- que `/tv` apunta al proyecto actual
- que no se esta sirviendo una rama antigua

## 5. Los informes PDF fallan

Comprobar:

- logs del backend
- permisos de lectura de la base
- estado de `pdfkit`

## 6. Los backups no aparecen

Comprobar:

- timers de systemd activos
- permisos sobre `/var/backups/guardias`
- `sqlite3` instalado

Comandos:

```bash
systemctl list-timers | grep guardias
journalctl -u guardias-backup-daily.service -n 100 --no-pager
which sqlite3
```

## Checklist rapida de diagnostico

Si alguien retoma el proyecto y "no funciona", seguir este orden:

1. `pm2 status`
2. `pm2 logs guardias --lines 100`
3. `curl http://127.0.0.1:3000/api/health`
4. revisar `.env`
5. revisar que existe `BD/guardias.sqlite`
6. comprobar permisos de escritura en `BD/`
7. verificar que la rama desplegada es la correcta
8. si hay cambios anuales, regenerar `js/data/profesorado_horarios_guardias.js`

## Notas para quien venga detras

- El proyecto no usa framework frontend; la logica cliente sigue concentrada en `js/app/guardias.js`, pero las utilidades puras ya se estan sacando a `js/app/guardias-core.js`.
- El router `server/routes/profesorado.js` ahora actua como punto de entrada y delega en modulos bajo `server/routes/profesorado/`.
- Si algo "visual" falla, normalmente el problema estara en `guardias.html`, `css/guardias.css`, `js/app/guardias-core.js` o `js/app/guardias.js`.
- Si algo "de datos" falla, normalmente estara en `server/routes/*`, `server/db.js` o la propia `BD/guardias.sqlite`.
- Antes de tocar logica anual, revisar el flujo `json_profes -> annual:build -> js/data/profesorado_horarios_guardias.js`.
- Antes de tocar despliegue, revisar si el servidor real sigue levantando con `pm2` y no con otro mecanismo.
- Si cambias IP, ruta del proyecto o usuario operativo, actualiza este README.
