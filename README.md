# Horario IES Alcalans

Aplicación interna para gestionar ausencias del profesorado, reparto de guardias, sustituciones, tareas dejadas por el docente ausente e informes PDF.

El proyecto está pensado para uso en red local del centro. El estado actual ya cubre la operativa diaria de Jefatura, un panel específico de Profesorado y un panel técnico de Superadmin.

## Estado actual

- Frontend: `HTML + CSS + JavaScript` sin framework
- Backend: `Node.js + Express`
- Base de datos: `SQLite`
- Rama de trabajo: `backend`
- Puerto por defecto: `3000`
- Uso previsto: red local / servidor interno

## Funcionalidad disponible

### Jefatura

- Alta, edición y borrado de ausencias por día y hora
- Reparto automático de guardias
- Liberación automática de reservas de biblioteca y baños si hacen falta para cubrir
- Gestión de sustituciones temporales
- Validación o rechazo de faltas futuras comunicadas por profesorado
- Generación de `Informe diario` y `Informe semanal`

### Profesorado

- Acceso por selector de profesor
- Vista del horario del día
- Edición de tarea dejada para una sesión
- Visualización de la faena dejada cuando le toca cubrir una guardia
- Aviso de faltas futuras por fecha y horas lectivas concretas
- Consulta del estado de sus avisos: `Pendiente`, `Validada`, `Rechazada`, `Aplicada`

### Superadmin

- Acceso separado por URL
- Login independiente del modo Jefatura
- Panel técnico orientado a mantenimiento
- Exportación y restauración
- Monitor/log técnico de cambios y sincronización

## Estructura relevante

```text
horario-ies-alcalans/
|-- BD/
|   `-- guardias.sqlite
|-- guardias.html
|-- css/
|   `-- guardias.css
|-- js/
|   |-- app/
|   |   |-- guardias.js
|   |   `-- storage.js
|   `-- data/
|       `-- profesorado_horarios_guardias.js
|-- server/
|   |-- app.js
|   |-- auth.js
|   |-- db.js
|   |-- schema.sql
|   |-- session.js
|   `-- routes/
|       |-- auth.js
|       |-- profesorado.js
|       |-- report.js
|       `-- validation.js
|-- deploy/
|   `-- linux/
|       |-- backup-guardias.sh
|       |-- guardias-backup-daily.service
|       |-- guardias-backup-daily.timer
|       |-- guardias-backup-weekly.service
|       |-- guardias-backup-weekly.timer
|       |-- guardias-backup-monthly.service
|       `-- guardias-backup-monthly.timer
|-- .env.example
|-- start-local.cmd
`-- start-local.ps1
```

## Requisitos

- `Node.js`
- `npm`
- Windows PowerShell o `cmd`

## Arranque local

La forma recomendada es arrancar desde la carpeta raíz del proyecto usando PowerShell.

### Opción PowerShell

```powershell
cd "C:\Users\usuario\Documents\GitHub\horario-ies-alcalans"
Set-ExecutionPolicy -Scope Process Bypass
.\start-local.ps1
```

Si prefieres no cambiar la política de ejecución, abre una sesión nueva de PowerShell y ejecuta solo el script.

### Opción CMD

```bat
cd /d "C:\Users\usuario\Documents\GitHub\horario-ies-alcalans"
start-local.cmd
```

### URL principal

```text
http://localhost:3000
```

### URL de Superadmin

```text
http://localhost:3000/?panel=superadmin
```

## Variables de entorno

La plantilla base está en [`.env.example`](C:\Users\usuario\Documents\GitHub\horario-ies-alcalans\.env.example).

### Obligatoria

```text
GUARDIAS_SESSION_SECRET=<secreto-largo-y-estable>
```

### Recomendadas

```text
PORT=3000
GUARDIAS_DB_PATH=BD/guardias.sqlite
GUARDIAS_TRUST_PROXY=1
GUARDIAS_CORS_ORIGINS=
```

### Solo para inicializar una base nueva

```text
GUARDIAS_ADMIN_PASSWORD=<clave-admin-inicial>
GUARDIAS_SUPERADMIN_PASSWORD=<clave-superadmin-inicial>
```

## Roles

### `admin`

- Gestión operativa diaria
- Ausencias
- Guardias
- Sustituciones
- Faltas futuras
- Informes PDF

### `superadmin`

- Mantenimiento técnico
- Exportación y restauración
- Monitor de estado
- No comparte interfaz operativa con Jefatura

## Base de datos

La aplicación usa por defecto:

- [`BD/guardias.sqlite`](C:\Users\usuario\Documents\GitHub\horario-ies-alcalans\BD\guardias.sqlite)

Si quieres mover el proyecto entre equipos sin servidor central, debes copiar esa base.

## Despliegue en servidor local

Para pasar esto a un servidor local del centro no hace falta rehacer la aplicación. Lo necesario es:

1. Un equipo fijo en la red local con `Node.js`
2. Una ruta estable para la base SQLite
3. Un `.env` o variables de entorno con:
   - `GUARDIAS_SESSION_SECRET`
   - `GUARDIAS_DB_PATH`
   - `PORT`
4. Arrancar el servicio de forma persistente
5. Si se quiere algo más serio, poner un proxy delante (`Nginx` o equivalente)

### Paquetes recomendados en Linux Server

En una instalación base sin interfaz gráfica, conviene instalar:

- `git`
- `nodejs`
- `npm`
- `nginx`
- `sqlite3`
- `ufw`

Ejemplo en Ubuntu / Debian:

```bash
sudo apt update
sudo apt install -y git nginx sqlite3 ufw curl
```

### Recomendación práctica

- Mantener `SQLite` por ahora
- Exponer solo en red interna
- Usar un único equipo como servidor
- Hacer copia periódica de `guardias.sqlite`

### Datos actuales del servidor

- IP interna prevista: `172.28.244.178`
- Usuario operativo actual: `superadmin`
- La contraseña no debe guardarse en este repositorio; conviene mantenerla en un documento local seguro o en el sistema de credenciales del centro

### Migración prevista al servidor

Al migrar al servidor Linux, hay que mover:

1. El proyecto completo
2. La base de datos [`BD/guardias.sqlite`](C:\Users\usuario\Documents\GitHub\horario-ies-alcalans\BD\guardias.sqlite)
3. El archivo `.env` definitivo del servidor
4. Los ficheros de despliegue de [`deploy/linux`](C:\Users\usuario\Documents\GitHub\horario-ies-alcalans\deploy\linux)

Orden recomendado:

1. Copiar proyecto al servidor
2. Copiar la base SQLite actual
3. Crear `.env` estable del servidor
4. Instalar dependencias con `npm`
5. Probar arranque manual
6. Activar servicio persistente
7. Activar backups automáticos
8. Abrir acceso solo en red interna

### Qué no hace falta todavía

- No hace falta cambiar de base de datos
- No hace falta framework frontend
- No hace falta internet pública
- No hace falta separar frontend y backend

## Comprobaciones útiles

### Healthcheck

```text
http://localhost:3000/api/health
```

Respuesta esperada:

```json
{"ok":true}
```

### Verificación de sintaxis

```powershell
node --check js/app/guardias.js
node --check server/routes/report.js
```

### Smoke test

```powershell
npm.cmd run smoke
```

## Pruebas futuras

### Prueba de carga / estrés

Cuando la aplicación esté montada en el equipo definitivo del centro, conviene hacer una prueba de carga para estimar:

1. Cuántos usuarios pueden consultar la web a la vez
2. Cuántos pueden operar simultáneamente sin degradación apreciable
3. Qué impacto tienen las escrituras concurrentes y la generación de PDF

Escenarios recomendados:

- Consulta simple de panel principal
- Acceso de profesorado a su panel
- Alta y edición de ausencias desde Jefatura
- Envío y revisión de faltas futuras
- Generación de informe diario y semanal

Métricas a registrar:

- Latencia media
- Percentil 95 / 99
- Errores HTTP
- Uso de CPU
- Uso de RAM
- Uso de disco
- Bloqueos o esperas derivados de SQLite

Herramientas libres que encajan bien:

- `k6`
- `Apache JMeter`
- `wrk`
- `hey`

Nota: al usar `SQLite`, el cuello de botella más probable no será la lectura concurrente sino las escrituras simultáneas y ciertos picos de exportación / informes.

## Notas operativas

- El horario base que consume la app está en [`js/data/profesorado_horarios_guardias.js`](C:\Users\usuario\Documents\GitHub\horario-ies-alcalans\js\data\profesorado_horarios_guardias.js)
- La fuente anual predeterminada es [`json_profes/profesorado_horarios_guardias_con_guardias_updated.json`](C:\Users\usuario\Documents\GitHub\horario-ies-alcalans\json_profes\profesorado_horarios_guardias_con_guardias_updated.json)
- Si hace falta usar otra fuente, se indica de forma explícita con `--source ...` o con `ANNUAL_SOURCE_PATH=...`
- Si se actualiza la fuente anual, luego hay que regenerar la fuente `.js` que usa la web con:

```powershell
npm.cmd run annual:build
```

## Separación anual / semanal

### Datos anuales

- Plantilla de profesorado
- Horario base
- Guardias base

Fuente editable principal y predeterminada:

- [`json_profes/profesorado_horarios_guardias_con_guardias_updated.json`](C:\Users\usuario\Documents\GitHub\horario-ies-alcalans\json_profes\profesorado_horarios_guardias_con_guardias_updated.json)

Otras fuentes, solo si se piden de forma explícita:

- [`json_profes/profesorado_horarios_guardias_definitvo.json`](C:\Users\usuario\Documents\GitHub\horario-ies-alcalans\json_profes\profesorado_horarios_guardias_definitvo.json)
- [`json_profes/profesorado_horarios_guardias_con_guardias.json`](C:\Users\usuario\Documents\GitHub\horario-ies-alcalans\json_profes\profesorado_horarios_guardias_con_guardias.json)
- [`json_profes/profesorado_horarios_guardias_limpio.json`](C:\Users\usuario\Documents\GitHub\horario-ies-alcalans\json_profes\profesorado_horarios_guardias_limpio.json)

Artefacto generado que consume la web:

- [`js/data/profesorado_horarios_guardias.js`](C:\Users\usuario\Documents\GitHub\horario-ies-alcalans\js\data\profesorado_horarios_guardias.js)

### Datos semanales / operativos

- Ausencias
- Biblioteca y baños
- Tareas dejadas
- Historial
- Sustituciones temporales
- Faltas futuras
- Ajustes puntuales de sesiones

### Cambio de curso recomendado

1. Guardar copia del estado actual:
   el script de reinicio crea un backup JSON en `BD/backups/`
2. Regenerar la fuente anual:

```powershell
npm.cmd run annual:build
```

   Si hiciera falta usar otra fuente, se pasa de forma explícita:

```powershell
npm.cmd run annual:build -- --source json_profes/profesorado_horarios_guardias_limpio.json
```

3. Reiniciar el curso operativo:

```powershell
npm.cmd run course:reset -- --yes
```

Ese reinicio borra datos semanales y temporales, mantiene credenciales y archiva un snapshot del curso anterior.

## Backup pendiente

### Copia integral automática de la base

Queda ya preparado en el repo para activarlo después en el servidor Linux.

Se ha planificado esta rotación:

1. Copia diaria a las `19:00`
2. Copia semanal el `domingo a las 23:30`
3. Copia mensual el `último día del mes a las 23:45`

Todas las copias se hacen sobre [`BD/guardias.sqlite`](C:\Users\usuario\Documents\GitHub\horario-ies-alcalans\BD\guardias.sqlite) y se guardan fuera de la carpeta activa del proyecto, por defecto en:

```text
/var/backups/guardias
```

Estructura prevista:

```text
/var/backups/guardias/
|-- daily/
|-- weekly/
`-- monthly/
```

Rotación por defecto del script:

- diarias: `14`
- semanales: `8`
- mensuales: `12`

### Recomendación práctica

- Backup diario automático de la base SQLite
- Snapshot JSON técnico adicional de forma periódica
- Restauración documentada y ensayada al menos una vez

### Nota técnica

Como la aplicación usa `SQLite`, la estrategia de copia debe contemplar una copia consistente de la base completa y no depender solo de exportaciones manuales desde la interfaz.

### Ficheros preparados en el repositorio

- [`deploy/linux/backup-guardias.sh`](C:\Users\usuario\Documents\GitHub\horario-ies-alcalans\deploy\linux\backup-guardias.sh)
- [`deploy/linux/guardias-backup-daily.service`](C:\Users\usuario\Documents\GitHub\horario-ies-alcalans\deploy\linux\guardias-backup-daily.service)
- [`deploy/linux/guardias-backup-daily.timer`](C:\Users\usuario\Documents\GitHub\horario-ies-alcalans\deploy\linux\guardias-backup-daily.timer)
- [`deploy/linux/guardias-backup-weekly.service`](C:\Users\usuario\Documents\GitHub\horario-ies-alcalans\deploy\linux\guardias-backup-weekly.service)
- [`deploy/linux/guardias-backup-weekly.timer`](C:\Users\usuario\Documents\GitHub\horario-ies-alcalans\deploy\linux\guardias-backup-weekly.timer)
- [`deploy/linux/guardias-backup-monthly.service`](C:\Users\usuario\Documents\GitHub\horario-ies-alcalans\deploy\linux\guardias-backup-monthly.service)
- [`deploy/linux/guardias-backup-monthly.timer`](C:\Users\usuario\Documents\GitHub\horario-ies-alcalans\deploy\linux\guardias-backup-monthly.timer)

### Qué hace el script de backup

El script:

1. Usa `sqlite3 .backup` si está disponible
2. Guarda la copia según el tipo: `daily`, `weekly` o `monthly`
3. Aplica rotación automática
4. Puede copiar también un JSON técnico si se activa `JSON_BACKUP_ENABLED=1`

### Variables útiles del script

Se pueden ajustar por entorno:

```text
PROJECT_ROOT=/srv/guardias/horario-ies-alcalans
GUARDIAS_DB_PATH=/srv/guardias/horario-ies-alcalans/BD/guardias.sqlite
BACKUP_ROOT=/var/backups/guardias
DAILY_KEEP=14
WEEKLY_KEEP=8
MONTHLY_KEEP=12
JSON_BACKUP_ENABLED=0
```

### Activación posterior en el servidor

Cuando se haga la migración real, los pasos previstos serán:

```bash
chmod +x /srv/guardias/horario-ies-alcalans/deploy/linux/backup-guardias.sh
sudo cp /srv/guardias/horario-ies-alcalans/deploy/linux/guardias-backup-*.service /etc/systemd/system/
sudo cp /srv/guardias/horario-ies-alcalans/deploy/linux/guardias-backup-*.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now guardias-backup-daily.timer
sudo systemctl enable --now guardias-backup-weekly.timer
sudo systemctl enable --now guardias-backup-monthly.timer
```

Antes de activarlos conviene revisar en cada `.service` la ruta de `WorkingDirectory` para que coincida con la ruta real del proyecto en el servidor.

## Revisión antes de lanzamiento

### Pendiente UX en profesorado

Antes del lanzamiento conviene valorar una mejora ligera y opcional en el acceso al panel de profesorado:

1. Al abrir el panel, preguntar al docente cómo se siente o cuál es su estado de ánimo.
2. Permitir elegir una opción visual rápida con emojis.
3. Estados sugeridos:
   - contento
   - cansado
   - enfadado
   - triste
   - guiño gracioso / tono ligero
4. Mantenerlo como interacción breve, amable y no bloqueante.
5. Decidir antes de implementarlo si:
   - solo se muestra en local al propio docente
   - se guarda temporalmente
   - no se persiste en absoluto

La idea sería que funcione como detalle de acogida y cercanía, no como dato operativo crítico.

## Siguiente paso recomendado

Si el proyecto pasa a servidor local del centro, lo razonable sería:

1. Fijar la máquina servidora
2. Crear un `.env` estable
3. Arrancarlo como servicio
4. Hacer backup automático diario de `guardias.sqlite`
