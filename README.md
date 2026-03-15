# Horario IES Alcalans

Aplicacion web interna para gestionar ausencias del profesorado, reparto de guardias, biblioteca, baños, historial y copias de seguridad.

Este `README` esta pensado para que otra persona pueda continuar el proyecto sin depender del contexto de desarrollo original.

## Objetivo del proyecto

- Registrar ausencias del profesorado por dia y hora
- Asignar automaticamente profesorado de guardia
- Reservar automaticamente biblioteca y baños por tramo horario
- Permitir a Jefatura registrar si hay tarea/faena dejada
- Generar informe PDF diario
- Permitir backup y restore desde `superadmin`

## Estado actual

- Rama principal de trabajo: `backend`
- Backend: `Node.js + Express`
- Frontend: HTML/CSS/JS sin framework
- Base de datos: SQLite
- Puerto por defecto: `3000`
- Entorno actual de trabajo: local / red interna, no internet publica

## Arquitectura

### Backend

- Entrada principal: [server/app.js](C:\Users\Familia\Documents\GitHub\horario-ies-alcalans\server\app.js)
- Base de datos y arranque de esquema: [server/db.js](C:\Users\Familia\Documents\GitHub\horario-ies-alcalans\server\db.js)
- Sesiones: [server/session.js](C:\Users\Familia\Documents\GitHub\horario-ies-alcalans\server\session.js)
- Hash de credenciales: [server/auth.js](C:\Users\Familia\Documents\GitHub\horario-ies-alcalans\server\auth.js)
- Rutas API: `server/routes/`

### Frontend

- Pantalla principal: [guardias.html](C:\Users\Familia\Documents\GitHub\horario-ies-alcalans\guardias.html)
- Logica principal: [js/app/guardias.js](C:\Users\Familia\Documents\GitHub\horario-ies-alcalans\js\app\guardias.js)
- Cliente de API / cache local: [js/app/storage.js](C:\Users\Familia\Documents\GitHub\horario-ies-alcalans\js\app\storage.js)
- Horarios fuente del profesorado: [js/data/profesorado_horarios_guardias.js](C:\Users\Familia\Documents\GitHub\horario-ies-alcalans\js\data\profesorado_horarios_guardias.js)

### Datos

- Esquema SQL: [schema.sql](C:\Users\Familia\Documents\GitHub\horario-ies-alcalans\server\schema.sql)
- Base usada por defecto en esta rama: [guardias.sqlite](C:\Users\Familia\Documents\GitHub\horario-ies-alcalans\BD\guardias.sqlite)

## Estructura relevante

```text
horario-ies-alcalans/
|-- BD/
|   `-- guardias.sqlite
|-- guardias.html
|-- css/
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
|   |-- maintenance.js
|   |-- schema.sql
|   |-- session.js
|   |-- routes/
|   `-- scripts/
|       `-- smoke-test.js
|-- .env.example
|-- start-local.cmd
`-- start-local.ps1
```

## Requisitos

- `Node.js`
- `npm`
- En PowerShell de Windows conviene usar `npm.cmd`

Versiones comprobadas en el entorno de desarrollo:

- `node`: `v24.14.0`
- `npm.cmd`: `11.9.0`

## Instalacion

Desde la raiz del proyecto:

```powershell
cd "C:\Users\Familia\Documents\GitHub\horario-ies-alcalans"
git switch backend
git pull origin backend
npm.cmd install
```

## Arranque local

### Metodo recomendado en Windows

1. Editar [.env.local.cmd](C:\Users\Familia\Documents\GitHub\horario-ies-alcalans\.env.local.cmd)
2. Sustituir el placeholder por un secreto real
3. Ejecutar:

```powershell
.\start-local.cmd
```

### Alternativa PowerShell

1. Editar [.env.local.ps1](C:\Users\Familia\Documents\GitHub\horario-ies-alcalans\.env.local.ps1)
2. Ejecutar:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\start-local.ps1
```

### Arranque manual

```powershell
$env:GUARDIAS_SESSION_SECRET="pon-aqui-un-secreto-largo-y-random"
npm.cmd start
```

Aplicacion:

```text
http://localhost:3000
```

Healthcheck:

```text
http://localhost:3000/api/health
```

Respuesta esperada:

```json
{"ok":true}
```

## Variables de entorno

Plantilla del repositorio:

- [.env.example](C:\Users\Familia\Documents\GitHub\horario-ies-alcalans\.env.example)

### Obligatorias

```text
GUARDIAS_SESSION_SECRET=<secret-largo-estable-y-privado>
```

Sin esta variable el servidor no arranca.

### Recomendadas para despliegue

```text
PORT=3000
GUARDIAS_TRUST_PROXY=1
GUARDIAS_DB_PATH=/srv/horario-ies-alcalans/guardias.sqlite
GUARDIAS_CORS_ORIGINS=
```

Uso:

- `PORT`: puerto interno de Node
- `GUARDIAS_TRUST_PROXY`: necesaria si la app va detras de proxy inverso / HTTPS terminado fuera de Node
- `GUARDIAS_DB_PATH`: ruta fija de la BD
- `GUARDIAS_CORS_ORIGINS`: lista de origenes permitidos separados por comas; dejar vacio si frontend y backend salen del mismo dominio

### Solo para inicializacion de una base nueva

```text
GUARDIAS_ADMIN_PASSWORD=<clave-inicial-admin>
GUARDIAS_SUPERADMIN_PASSWORD=<clave-inicial-superadmin>
```

Estas variables:

- solo se usan si faltan las credenciales en la tabla `auth_credentials`
- no cambian contraseñas ya existentes
- no conviene dejarlas puestas permanentemente en el servicio

## Base de datos

Resolucion de la ruta de la BD:

1. `GUARDIAS_DB_PATH`
2. `BD/guardias.sqlite`
3. carpeta local del sistema

En esta rama se usa `BD/guardias.sqlite` para facilitar trabajo entre equipos.

## Flujo entre ordenadores

Como no hay todavia servidor central, la sincronizacion real de datos se hace copiando el archivo SQLite.

Archivo a conservar:

```text
BD\guardias.sqlite
```

Flujo recomendado:

1. Trabajar en un equipo
2. Copiar `BD\guardias.sqlite`
3. Llevarla al otro equipo
4. Sustituir la BD local
5. Arrancar normalmente

GitHub no sincroniza automaticamente el contenido de SQLite.

## Seguridad aplicada

Ya implementado:

- secreto de sesion obligatorio
- cookies de sesion firmadas
- `Secure` en cookie cuando la peticion llega por HTTPS
- limitacion basica de intentos de login
- cierre de endpoints sensibles sin autenticacion
- `guardias`, `biblioteca`, `historial` y datos de profesorado protegidos
- export/restore restringido a `superadmin`
- CORS cross-origin deshabilitado por defecto
- comparacion segura de firma de sesion

## Roles y acceso

Roles soportados:

- `admin`
- `superadmin`

Panel `superadmin`:

```text
http://localhost:3000/?panel=superadmin
```

Estado real de las contraseñas:

- viven en la tabla `auth_credentials`
- si la BD ya existe, mandan esas credenciales
- no hay contraseñas por defecto conocidas en arranque

## Comportamiento funcional actual

### Guardias

- las ausencias se registran por dia y hora
- la guardia se asigna automaticamente
- si se crea, edita o borra una ausencia, el reparto se recalcula

### Biblioteca y baños

- se calculan automaticamente por hora
- no dependen ya de boton manual
- si hacen falta para cubrir ausencias, se liberan como reserva

### Profesorado

- existe panel de profesorado en local / entorno interno
- actualmente no esta pensado para exposicion abierta a internet
- fase 1 asumida: Jefatura o un compañero registran la tarea/faena

### Backup y restore

Disponible en `superadmin`:

- `Backup JSON`
- `Restaurar JSON`
- `Base SQLite`

Uso recomendado en fase 1:

1. `Backup JSON` como copia logica frecuente
2. `Base SQLite` como respaldo tecnico completo
3. probar `restore` periodicamente

## API y permisos

Resumen operativo:

- `admin`: gestion diaria
- `superadmin`: backup / restore / acceso tecnico

Matriz simplificada:

- anonimo:
  - no puede leer `guardias`, `biblioteca`, `historial`, `profesorado`, `report`, `export`
  - no puede escribir ningun endpoint sensible
- `admin`:
  - puede trabajar con guardias, biblioteca, historial, profesorado y report
  - no puede exportar ni restaurar backups de `superadmin`
- `superadmin`:
  - puede usar `snapshot.json`, `database.sqlite` y `restore`

## Tests y comprobaciones

### Smoke test

Script:

- [smoke-test.js](C:\Users\Familia\Documents\GitHub\horario-ies-alcalans\server\scripts\smoke-test.js)

Comando:

```powershell
npm.cmd run smoke
```

Cubre:

- `health`
- rutas protegidas sin login
- escrituras anonimas bloqueadas

Version completa con credenciales reales:

```powershell
$env:GUARDIAS_SMOKE_ADMIN_PASSWORD="clave-admin-real"
$env:GUARDIAS_SMOKE_SUPERADMIN_PASSWORD="clave-superadmin-real"
npm.cmd run smoke
```

Entonces prueba tambien:

- login `admin`
- login `superadmin`
- permisos diferenciales entre `admin` y `superadmin`
- export JSON
- descarga SQLite
- restore JSON

## Despliegue previsto

Escenario previsto para fase 1:

- servidor Linux interno del centro
- acceso en red interna
- no exponer internet publica por ahora
- `Node + reverse proxy + SQLite`

Pendiente de decision externa:

- disponibilidad de equipo
- aprobacion de direccion
- hostname / IP fija
- proxy inverso final
- HTTPS final

## Roadmap funcional acordado

### Fase 1

- uso interno del centro
- Jefatura gestiona ausencias
- Jefatura o un compañero indican tarea/faena
- sin acceso remoto del profesorado desde casa
- prioridad en estabilidad, seguridad y operativa

### Fase 2 posible

- identificacion local del profesorado al llegar al centro
- automatizacion mayor de presencia / ausencia
- posible ajuste del reparto automatico de guardias

### Fase 3 posible

- acceso remoto del profesorado con autenticacion individual real
- esto requeriria rediseño serio de seguridad y sesiones

## Operativa recomendada

### Antes de tocar despliegue

- mantener backup JSON y copia SQLite
- ejecutar smoke test tras cambios sensibles
- no exponer el modo profesorado actual a internet

### Si otra persona hereda el proyecto

Orden recomendado de lectura:

1. [README.md](C:\Users\Familia\Documents\GitHub\horario-ies-alcalans\README.md)
2. [app.js](C:\Users\Familia\Documents\GitHub\horario-ies-alcalans\server\app.js)
3. [db.js](C:\Users\Familia\Documents\GitHub\horario-ies-alcalans\server\db.js)
4. [session.js](C:\Users\Familia\Documents\GitHub\horario-ies-alcalans\server\session.js)
5. [guardias.js](C:\Users\Familia\Documents\GitHub\horario-ies-alcalans\js\app\guardias.js)
6. [schema.sql](C:\Users\Familia\Documents\GitHub\horario-ies-alcalans\server\schema.sql)

## Comandos utiles

Instalar dependencias:

```powershell
npm.cmd install
```

Arrancar:

```powershell
.\start-local.cmd
```

Smoke test:

```powershell
npm.cmd run smoke
```

Inicializar una BD nueva con claves iniciales:

```powershell
$env:GUARDIAS_SESSION_SECRET="pon-aqui-un-secreto-largo-y-random"
$env:GUARDIAS_ADMIN_PASSWORD="clave-admin-inicial"
$env:GUARDIAS_SUPERADMIN_PASSWORD="clave-superadmin-inicial"
npm.cmd start
```
