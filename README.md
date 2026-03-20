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
|-- .env.example
|-- start-local.cmd
`-- start-local.ps1
```

## Requisitos

- `Node.js`
- `npm`
- Windows PowerShell o `cmd`

## Arranque local

### Opción PowerShell

```powershell
cd "C:\Users\usuario\Documents\GitHub\horario-ies-alcalans"
Set-ExecutionPolicy -Scope Process Bypass
.\start-local.ps1
```

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

### Recomendación práctica

- Mantener `SQLite` por ahora
- Exponer solo en red interna
- Usar un único equipo como servidor
- Hacer copia periódica de `guardias.sqlite`

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

## Notas operativas

- El horario base que consume la app está en [`js/data/profesorado_horarios_guardias.js`](C:\Users\usuario\Documents\GitHub\horario-ies-alcalans\js\data\profesorado_horarios_guardias.js)
- El JSON limpio de trabajo sigue aparte en [`json_profes/profesorado_horarios_guardias_limpio.json`](C:\Users\usuario\Documents\GitHub\horario-ies-alcalans\json_profes\profesorado_horarios_guardias_limpio.json)
- Si se actualiza ese JSON, luego habrá que sincronizar la fuente `.js` que usa la web

## Siguiente paso recomendado

Si el proyecto pasa a servidor local del centro, lo razonable sería:

1. Fijar la máquina servidora
2. Crear un `.env` estable
3. Arrancarlo como servicio
4. Hacer backup automático diario de `guardias.sqlite`
