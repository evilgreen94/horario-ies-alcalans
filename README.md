# Horario IES Alcalans

Aplicacion interna para gestionar ausencias, guardias, avisos de profesorado, TV de sala de profesores e informes.

La app sirve frontend y backend desde el mismo proyecto Node.js y trabaja con SQLite.

## Estado actual

- Rama de trabajo habitual: `preproduccion`
- IP provisional del servidor: `10.185.39.94`
- Ruta del proyecto en servidor: `/srv/guardias/horario-ies-alcalans`
- Puerto habitual: `3000`
- URL principal local de red: `http://10.185.39.94:3000`
- URL superadmin: `http://10.185.39.94:3000/?panel=superadmin`

Si el servicio se publica sin puerto por proxy inverso, las URLs pasarian a:

- `http://10.185.39.94/`
- `http://10.185.39.94/?panel=superadmin`

## Para que sirve cada modo

- `Principal`: tabla de ausencias y guardias del dia.
- `Jefatura`: alta y edicion de ausencias, faltas futuras, historial, sustituciones, avisos e impresion.
- `Profesorado`: consulta de horario, guardias y gestion de faena o faltas futuras.
- `TV`: muestra el tramo actual y los siguientes para sala de profesores.
- `Superadmin`: exportacion, restauracion, salud del sistema y operaciones tecnicas.

## Estructura que importa

```text
horario-ies-alcalans/
|-- BD/guardias.sqlite
|-- css/guardias.css
|-- guardias.html
|-- imagenes/
|-- js/
|   |-- app/
|   |   |-- guardias.js
|   |   |-- guardias-aux-panels.js
|   |   |-- guardias-core.js
|   |   `-- storage.js
|   `-- data/
|       |-- profesorado_horarios_guardias.js
|       `-- patio_guardias.js
|-- server/
|   |-- app.js
|   |-- db.js
|   |-- session.js
|   |-- telemetry.js
|   `-- routes/
|       |-- auth.js
|       |-- export.js
|       |-- guardias.js
|       |-- historial.js
|       |-- profesorado.js
|       |-- report.js
|       `-- validation.js
|-- deploy/linux/
|-- .env.example
`-- package.json
```

## Como funciona el proyecto

### Frontend

- La entrada principal es `guardias.html`.
- El comportamiento visual y gran parte de la logica estan en `js/app/guardias.js`.
- El modo TV y la vista imprimible dependen tambien de `js/app/guardias-aux-panels.js`.
- Los estilos globales estan en `css/guardias.css`.

### Backend

- El servidor arranca desde `server/app.js`.
- La API cuelga de `/api`.
- La autenticacion de `admin` y `superadmin` va por sesion.
- La persistencia operativa va a SQLite.

### Datos

- Horario anual del profesorado: `js/data/profesorado_horarios_guardias.js`
- Configuracion de patio: `js/data/patio_guardias.js`
- Base de datos operativa: `BD/guardias.sqlite`

En SQLite se guardan:

- ausencias
- guardias
- biblioteca
- historial
- tareas
- sustituciones
- faltas futuras
- avisos TV
- configuraciones operativas auxiliares

## URLs utiles

- Principal: `/`
- TV: `/?view=tv`
- Impresion: `/?view=print&day=0&weekOffset=0`
- Superadmin: `/?panel=superadmin`
- Healthcheck: `/api/health`

## Variables de entorno

Minimo necesario:

```text
GUARDIAS_SESSION_SECRET=<secreto-largo-y-estable>
```

Variables habituales:

```text
PORT=3000
GUARDIAS_DB_PATH=/srv/guardias/horario-ies-alcalans/BD/guardias.sqlite
GUARDIAS_TRUST_PROXY=1
```

Solo para inicializacion de una base nueva:

```text
GUARDIAS_ADMIN_PASSWORD=<clave-inicial>
GUARDIAS_SUPERADMIN_PASSWORD=<clave-inicial>
```

## Arranque local

PowerShell:

```powershell
cd "C:\Users\usuario\Documents\GitHub\horario-ies-alcalans"
Set-ExecutionPolicy -Scope Process Bypass
.\start-local.ps1
```

Manual:

```powershell
cd "C:\Users\usuario\Documents\GitHub\horario-ies-alcalans"
$env:GUARDIAS_SESSION_SECRET="pon-aqui-un-secreto"
npm.cmd start
```

Tests:

```powershell
npm.cmd test
```

## Despliegue en servidor

Ruta de trabajo:

```bash
cd /srv/guardias/horario-ies-alcalans
```

Actualizacion por git:

```bash
git fetch origin
git switch preproduccion
git pull origin preproduccion
pm2 restart guardias
```

Si se suben archivos manualmente por SSH o `rsync`, hay que respetar la estructura interna del repo.

Ejemplo local:

```bash
cd "C:/Users/usuario/Documents/GitHub/horario-ies-alcalans"
rsync -avz guardias.html css/guardias.css js/app/guardias.js usuario@10.185.39.94:/srv/guardias/horario-ies-alcalans/
```

## PM2

Arranque:

```bash
pm2 start server/app.js --name guardias
pm2 save
```

Comandos utiles:

```bash
pm2 status
pm2 logs guardias --lines 100
pm2 restart guardias
pm2 stop guardias
```

## Backups

Los timers y scripts estan en `deploy/linux/`.

Ficheros importantes:

- `deploy/linux/backup-guardias.sh`
- `deploy/linux/guardias-backup-daily.timer`
- `deploy/linux/guardias-backup-weekly.timer`
- `deploy/linux/guardias-backup-monthly.timer`

## Accesos que hay que recordar

- Jefatura y superadmin requieren contraseña.
- El modo superadmin no aparece como vista normal: se entra con `?panel=superadmin`.
- La contraseña no debe guardarse en este repositorio.

## Si entra otra persona al proyecto

Orden recomendado para entenderlo rapido:

1. Leer este `README.md`.
2. Abrir `guardias.html`.
3. Revisar `js/app/guardias.js`.
4. Revisar `js/app/guardias-aux-panels.js`.
5. Revisar `server/app.js` y `server/routes/`.
6. Confirmar en servidor que rama, `.env`, base de datos y `pm2` coinciden.

## Nota de mantenimiento

Cuando cambien estos datos, actualizar este README:

- IP del servidor
- ruta real del proyecto
- forma de arranque (`pm2`, proxy, puerto)
- rama operativa de despliegue
