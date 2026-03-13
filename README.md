# Horario IES Alcalans

Aplicacion de guardias para uso interno del centro.

La rama de backend sirve una aplicacion web en `Node.js + Express` y guarda los datos en una base SQLite.

## Estado actual

- Rama de trabajo backend: `backend`
- Backend: `server/app.js`
- Frontend principal: `guardias.html`
- Base de datos compartida del proyecto: `BD/guardias.sqlite`
- Puerto por defecto: `3000`

## Estructura relevante

```text
horario-ies-alcalans/
├── BD/
│   └── guardias.sqlite
├── guardias.html
├── js/
├── css/
└── server/
    ├── app.js
    ├── auth.js
    ├── db.js
    ├── session.js
    ├── schema.sql
    └── routes/
```

## Requisitos

- `Node.js` instalado
- `npm` disponible
- En PowerShell de Windows conviene usar `npm.cmd` en vez de `npm`

Version comprobada en este entorno:

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

El backend ahora exige un secreto de sesion.

En la terminal integrada de VS Code, desde la raiz del proyecto:

```powershell
cd "C:\Users\Familia\Documents\GitHub\horario-ies-alcalans"
$env:GUARDIAS_SESSION_SECRET="pon-aqui-un-secreto-largo-y-random"
npm.cmd start
```

Abrir en navegador:

```text
http://localhost:3000
```

Comprobacion rapida:

```text
http://localhost:3000/api/health
```

Debe devolver algo como:

```json
{"ok":true,"dbPath":"C:\\Users\\Familia\\Documents\\GitHub\\horario-ies-alcalans\\BD\\guardias.sqlite"}
```

## Base de datos

La aplicacion resuelve la BD con esta prioridad:

1. Variable de entorno `GUARDIAS_DB_PATH`
2. Archivo `BD/guardias.sqlite` dentro del proyecto
3. Carpeta local del sistema (`AppData/Local/...`) como ultimo recurso

En esta rama se esta usando `BD/guardias.sqlite` para facilitar mover la BD entre ordenadores.

## Flujo entre ordenadores

Como ahora mismo no hay servidor central, la forma de trabajar es copiar el archivo SQLite entre equipos.

Archivo a conservar:

```text
BD\guardias.sqlite
```

Flujo recomendado:

1. En el equipo donde has trabajado, copia `BD\guardias.sqlite`
2. Pasa ese archivo al otro equipo
3. Sustituyelo dentro de la carpeta `BD`
4. Arranca el proyecto con el mismo flujo local

GitHub no sincroniza automaticamente la base de datos salvo que el archivo este dentro del repo, no este ignorado y se haga `commit` y `push`.

## Variables de entorno

### Obligatorias para arrancar

```powershell
$env:GUARDIAS_SESSION_SECRET="un-secreto-largo-y-random"
```

Se usa para firmar las cookies de sesion. Si falta, el servidor no arranca.

### Opcionales

```powershell
$env:GUARDIAS_DB_PATH="C:\ruta\custom\guardias.sqlite"
$env:GUARDIAS_TRUST_PROXY="1"
```

- `GUARDIAS_DB_PATH`: fuerza una ruta de base de datos concreta
- `GUARDIAS_TRUST_PROXY`: util cuando la app este detras de proxy inverso o HTTPS terminado fuera de Node

### Solo para inicializar una base nueva

```powershell
$env:GUARDIAS_ADMIN_PASSWORD="una-clave-inicial-segura"
$env:GUARDIAS_SUPERADMIN_PASSWORD="otra-clave-inicial-segura"
```

Estas variables solo se usan si la base de datos todavia no tiene creadas las credenciales de `admin` y `superadmin`.

No cambian la contraseña de una base ya inicializada.

## Credenciales

### Roles

- `admin`
- `superadmin`

### Estado real de las contraseñas

Las contraseñas activas estan guardadas en la propia base SQLite, en la tabla `auth_credentials`.

Eso significa:

- Si la BD ya existe, manda lo que haya guardado en esa tabla
- Las variables `GUARDIAS_ADMIN_PASSWORD` y `GUARDIAS_SUPERADMIN_PASSWORD` solo crean las credenciales iniciales si faltan

### Acceso superadmin

URL para habilitar el panel de superadmin:

```text
http://localhost:3000/?panel=superadmin
```

## Seguridad aplicada en esta rama

Se han endurecido varios puntos del backend:

- ya no existe una secret de sesion por defecto conocida
- el servidor falla al arrancar si no se define `GUARDIAS_SESSION_SECRET`
- ya no se crean usuarios nuevos con claves por defecto conocidas
- el login tiene limitacion basica de intentos: 10 fallos por IP y rol en 15 minutos
- la cookie de sesion marca `Secure` cuando la peticion entra por HTTPS

## Despliegue futuro en servidor del centro

Si se despliega para acceso desde movil o fuera del equipo local, lo minimo recomendable es:

1. HTTPS
2. reverse proxy o servidor frontal
3. `GUARDIAS_TRUST_PROXY=1`
4. `GUARDIAS_SESSION_SECRET` fuerte y estable
5. copias de seguridad periodicas de `guardias.sqlite`
6. control de quien conoce las claves de `admin` y `superadmin`

## Comandos utiles

Instalar dependencias:

```powershell
npm.cmd install
```

Arrancar:

```powershell
$env:GUARDIAS_SESSION_SECRET="pon-aqui-un-secreto-largo-y-random"
npm.cmd start
```

Arrancar en otro puerto:

```powershell
$env:GUARDIAS_SESSION_SECRET="pon-aqui-un-secreto-largo-y-random"
$env:PORT="3001"
npm.cmd start
```

Inicializar una BD nueva con claves iniciales:

```powershell
$env:GUARDIAS_SESSION_SECRET="pon-aqui-un-secreto-largo-y-random"
$env:GUARDIAS_ADMIN_PASSWORD="clave-admin-inicial"
$env:GUARDIAS_SUPERADMIN_PASSWORD="clave-superadmin-inicial"
npm.cmd start
```

## Notas de PowerShell

Si `npm` falla por politica de ejecucion, usa:

```powershell
npm.cmd start
```

En vez de:

```powershell
npm start
```

## Estado pendiente razonable

- revisar y asegurar exportacion y restauracion de backups
- valorar un flujo mejor de copias de la BD entre equipos
- documentar despliegue del centro cuando se decida el servidor final
