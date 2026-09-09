# Cómo funciona ARGOS / Guardias

> **AUTORITATIVO / ACTUAL.** Radiografía funcional y técnica. El inventario de
> producción del 7-09-2026 está recogido en `SERVER_LAYOUT.md`; la disposición
> nueva solo será real después del redeploy autorizado.

## 1. El problema que resuelve

ARGOS es el producto; Guardias es el módulo operativo actual. En un día lectivo Jefatura necesita saber quién falta, qué clases requieren
cobertura, qué docentes tienen guardia, dónde se imparte la sesión y si el
profesor ausente dejó tarea. Guardias mantiene ese estado común, ayuda a repartir
coberturas, muestra la información en pantallas/impresos y permite a cada docente
consultar su horario.

El sistema reúne:

- horario anual versionado por curso;
- ausencias y profesor de guardia asignado;
- tarea, comentario y aula;
- estado activo/inactivo de grupos y overrides de sesiones;
- guardias ordinarias y carga mensual;
- obligaciones y cobertura de patio;
- avisos, vista TV, informes e historial;
- vista personal móvil `/app/`.

## 2. Actores y permisos

### Docente

Una cuenta individual con rol `teacher` puede iniciar/cerrar sesión, cambiar su
propia contraseña y consultar `/app/`. El backend resuelve su usuario desde la
cookie firmada y su perfil desde una asignación vigente. No puede convertirse en
admin enviando roles, IDs o parámetros, ni activar datasets, restaurar backups o
escribir en rutas administrativas.

### Jefatura / admin

Una cuenta individual con rol explícito `admin` puede gestionar la operación
diaria: ausencias, coberturas, tareas, estados, avisos, importación XML a estado
`validated` e informes. No puede activar datasets ni descargar/restaurar la
SQLite completa cuando la ruta exige `superadmin`.

### Superadmin

Administra cuentas, roles, resets temporales, sesiones y auditoría. Nunca puede
ver una contraseña actual. Conserva las operaciones técnicas ya autorizadas
(salud, backup/restore y activación explícita), pero el rol por sí solo no ofrece
un editor de sesiones canónicas ni permite saltarse backup o validación.

También puede previsualizar y ejecutar la provisión docente desde un dataset
`validated` o `active`. La vista clasifica `READY`, `ALREADY_LINKED`, `CONFLICT`
e `INVALID`, y muestra aparte cuentas docentes sin perfil en el roster elegido.
Un conflicto bloquea toda la operación. Las cuentas nuevas reciben únicamente
`teacher`; las existentes conservan contraseña, roles y estado de seguridad.
Las credenciales nuevas se devuelven una sola vez y el CSV se construye solo en
el navegador: no se guarda en SQLite, logs, auditoría, backups ni servidor.

El reset genera aleatoriamente una contraseña temporal, persiste solo scrypt,
incrementa `session_version` y exige cambio propio. La clave se entrega una vez y
no entra en auditoría/logs. Desactivar, revocar o cambiar roles sensibles también
invalida cookies previas. Con acceso OS autorizado, el único break-glass es:

```bash
node server/scripts/reset-superadmin.js --db /ruta/absoluta/guardias.sqlite \
  --username USUARIO --confirm RESET_SUPERADMIN_ACCESS
```

No es un endpoint HTTP y debe ejecutarse solo tras backup y autorización.

La primera cuenta puede crearse mediante el CLI explícito e idempotente
`server/scripts/bootstrap-superadmin.js`, resolviendo un `source_code` único en
un dataset validado. No existe bypass por código: los permisos proceden de los
roles almacenados. Perder una clave temporal requiere un reset; ARGOS no ofrece
recuperación de contraseña. Para evitar un único punto humano de fallo deben
existir dos Superadmins activos, promoviendo la segunda cuenta solo después de
confirmar inequívocamente su identidad y sin añadir `admin` por implicación.

Los roles `teacher`, `admin` y `superadmin` son independientes y pueden
combinarse solo mediante asignación explícita. `superadmin` no implica `admin`.
Una única sesión individual sirve `guardias.html`, el perfil, Jefatura,
Administración técnica y `/app/`. Las siete pulsaciones sobre el logo ARGOS son
solo descubrimiento visual para un Superadmin ya autenticado: no cambian roles y
conocer el gesto no evita la autorización del servidor.

### Sustituto

Es un usuario independiente, con sus propias credenciales. Durante el intervalo
de su asignación temporal resuelve el perfil operativo del titular sustituido.
No comparte usuario ni contraseña con el titular.

## 3. Identidad docente

```text
user
  ├─ user_roles ──> roles
  └─ teacher_assignment (fechas, titular/sustituto)
         └─ teacher_profile (registro interno del curso)
                ├─ academic_year
                └─ teacher_external_identity
                       └─ source_system + source_format + external_key
```

- `users.id` es la identidad interna persistente de una cuenta.
- Los permisos salen de `user_roles`, consultados por el servidor al hacer login.
- `teacher_assignments` relaciona una cuenta con el perfil operativo durante un
  intervalo.
- `teacher_profiles.id` es interno y pertenece a un curso.
- `source_code` es la clave externa del fichero de origen; se guarda como
  `external_key`, no como primary key.
- `display_name` es una etiqueta humana y **no es única**. Dos docentes con el
  mismo nombre siguen separados por identidad externa e ID interno.

Nunca se reconcilia una identidad canónica solo por nombre. La configuración
legacy de patio basada en nombres solo se enlaza si ese nombre resuelve de manera
inequívoca a un `source_code`; si no, la obligación queda sin puesto.

## 4. Qué cambia cada curso

Persisten entre cursos:

- usuarios y hashes de credenciales;
- roles de cuenta;
- historial de migraciones;
- auditoría que deba conservarse según la política operativa.

Se crean o versionan por curso:

- `academic_years`;
- perfiles docentes;
- identidades externas del perfil;
- asignaciones titular/sustituto;
- datasets, roster, periodos y sesiones.

Una persona puede usar la misma cuenta en 2027/28, pero debe tener un nuevo perfil
y una nueva asignación anual. No se reutiliza el registro operativo 2026/27.

Los datos diarios/semanales (ausencias, tareas, coberturas y determinados estados
de `app_state`) tienen su propio ciclo operativo. El cambio automático de semana
limpia las colecciones definidas en `ensureWeeklyResetIfNeeded`; no debe
confundirse con el destructivo reset de curso.

## 5. Entrada del horario

```text
XML oficial GHC (primario) o PDF (contraste)
          │
      adaptador de entrada
          │ valida source_code, celdas y periodos
          ▼
  modelo canónico en memoria
          │
          ▼
 dataset SQLite: validated
          │
   auditoría humana/sistema
          │ activación explícita superadmin
          ▼
 dataset SQLite: active
          │
      backend y frontends
```

**Importado no significa activo.** La importación calcula una huella reproducible,
valida estructura y escribe una versión `validated`. La activación es otra
transacción: archiva la versión activa anterior, activa la elegida y actualiza el
curso. Si no hay dataset activo, el backend devuelve un error visible; no usa
datos 2025/26.

El XML GHC oficial usa relaciones e IDs explícitos, `source_code` y su marco de
periodos. El PDF 2026/27 conserva una plantilla específica de coordenadas para
contraste. Ambos producen el mismo contrato canónico sin cambiar runtime ni frontends.
Una revisión posterior del horario en septiembre se importa como un dataset
nuevo `validated`, se compara y necesita otra aprobación antes de activarse.

## 6. Modelo canónico de horario

Un dataset contiene:

- curso, etiqueta, origen, formato, huella y estado;
- roster que enlaza perfil e identidad externa;
- periodos ordenados con clave, tipo, inicio y fin;
- sesiones por perfil, identidad, día y periodo;
- informe de validación y marcas de validación/activación.

Los periodos pueden ser `teaching` o `break`. Los breaks son explícitos, no
huecos inferidos. Las sesiones son `class`, `guardia`, `meeting`, `other`,
`guardia_patio`, `biblioteca_patio` o `patio_inclusivo`.

El modelo no supone permanentemente nueve posiciones, siete horas lectivas,
claves P1–P7, breaks en 4/8 ni los relojes 2026/27. Esos datos pertenecen al
adaptador provisional y al dataset de cada curso.

Restricciones y triggers impiden duplicados docente/día/periodo y enlaces entre
curso, dataset, perfil o identidad incompatibles.

## 7. Resolución del estado diario

Para `/app/`, el backend:

1. valida la sesión individual;
2. resuelve la asignación activa del usuario para la fecha;
3. localiza ese perfil en el dataset activo;
4. cruza sesiones del día con todos los periodos del dataset;
5. compara la hora actual para determinar el tramo actual o «fuera».

Estados:

| Periodo y contenido | Estado |
|---|---|
| Teaching + clase | `class`, ocupado |
| Teaching + guardia | `guardia`, ocupado |
| Teaching + reunión | `meeting`, ocupado |
| Teaching + otra actividad | `other`, ocupado |
| Teaching vacío | `free` |
| Break vacío | `break` |
| Break + `GUÀRDIES PATI` | `guardia_patio`, ocupado |
| Break + `BIBLIOTECA PATI` | `biblioteca_patio`, ocupado |
| Teaching + `PATIS INCLUSIUS` | `patio_inclusivo`, ocupado |
| Ningún periodo actual | `outside` |

Invariante central:

```text
existe sesión u obligación → el docente está ocupado
```

El «siguiente» tramo se deduce del orden dinámico de periodos; la interfaz actual
muestra la lista diaria, no una funcionalidad PWA ni notificaciones.

## 8. Guardias ordinarias

Jefatura registra una ausencia por docente, día y periodo, o genera las sesiones
cubribles de un día completo desde el dataset activo. El backend rechaza
duplicados y no genera cobertura para sesiones de grupos marcados inactivos.

La interfaz cruza:

- horario y tipo de sesión del ausente;
- docentes con guardia en ese tramo;
- otras coberturas ya asignadas y carga mensual;
- tarea/observaciones dejadas;
- aula, grupo y overrides manuales.

La sugerencia y reparto visible ayudan a Jefatura, pero la asignación guardada es
explícita. Las escrituras de ausencias, historial, tareas y overrides están
protegidas como operaciones admin. `faena` indica si existe tarea; el texto puede
venir de la propia ausencia o de `tareas_profesorado`.

`grupos_estado` evita mostrar o crear guardias para grupos inactivos. Los
`session_overrides` corrigen temporalmente datos de una sesión sin alterar el
dataset anual.

## 9. Patio

Patio es independiente de las guardias de periodos lectivos. En 2026/27 los
breaks canónicos son B1 y B2, pero el runtime consume sus definiciones del
dataset.

Capas:

1. `js/data/patio_guardias.js`: contenedor vacío para una futura configuración
   aprobada por periodo, `source_code` y puesto; el release no inventa rotaciones.
2. Dataset canónico: evidencia semanal importada por `source_code`,
   día y B1/B2.
3. Fusión: conserva configuración explícita; enlaza solo mediante código externo
   inequívoco; no crea puestos para obligaciones sin asignar.
4. `app_state.patio_guardias`: cobertura/nota manual por semana, día, break y
   puesto; tiene precedencia visual sobre el estado automático.
5. `app_state.patio_teacher_blocks`: indisponibilidad manual de un docente en
   ese puesto/tramo.

`GUÀRDIES PATI` está ocupada, entra en la futura rotación y no tiene puesto
inventado. `BIBLIOTECA PATI` está ocupada en el puesto fijo Biblioteca y no rota.
`PATIS INCLUSIUS` es un bloque especial ocupado, no una guardia ni un puesto.
La ausencia en cualquiera de los tres puede mostrarse, pero nunca crea cobertura,
sustituto o vacante automática. Solo falta la tabla física de rotación de Jefatura.

## 10. Sustituciones

```text
usuario sustituto
    │ credencial propia
teacher_assignment temporal (sustituto, inicio/fin)
    │ replaces_assignment_id
perfil operativo del titular
    │
horario del titular durante el intervalo
```

`resolveActiveTeacherProfile` filtra usuario y perfil activos, curso y fechas.
Prioriza una sustitución vigente sobre una titularidad, después inicio más
reciente e ID, de forma determinista. El último día es inclusivo; al expirar deja
de resolver. Las restricciones evitan solapamientos ambiguos nuevos.

Hay una deuda operativa: la sustitución individual usa `teacher_assignments`,
mientras la sustitución mostrada por `guardias.html` usa
`app_state.teacher_substitutions`. Hasta unificarlas, el procedimiento debe
actualizar ambas de forma consciente.

## 11. Persistencia SQLite

Categorías conceptuales:

- operación diaria: `ausencias`, `biblioteca_guardias`, `historial`,
  `tareas_profesorado`, `alumnos_fuera_aula`, `session_overrides`,
  `grupos_estado`, `app_state`;
- autenticación: `auth_credentials`, `users`, `roles`, `user_roles`;
- identidad: `teacher_profiles`, `teacher_assignments`,
  `teacher_external_identities`, `academic_years`;
- horario: `schedule_datasets`, `schedule_dataset_teachers`,
  `schedule_periods`, `teacher_schedule_sessions`;
- control: `audit_log`, `schema_migrations`.

SQLite usa WAL, FK, `busy_timeout` y transacciones serializadas en proceso. Los
JSON/JS anuales ya no son persistencia backend. El backup JSON del panel es un
snapshot operativo parcial; el rollback oficial utiliza SQLite completa.

## 12. Compatibilidad legacy y frontends

```text
SQLite canónica
      │
buildLegacySchedulePayload
      │
/api/schedule/legacy.js
      │ define PROFESORADO_SOURCE
      ▼
guardias.html
```

«Legacy-compatible» describe el contrato que aún consume `guardias.html`, no una
fuente antigua. El adaptador genera profesores, horario, guardias, periodos y
obligaciones de break desde la SQLite activa. Si no hay dataset, define fuente
nula y muestra indisponibilidad.

### `guardias.html`

Interfaz central para operación diaria, Jefatura, TV, impresión y superadmin. Su
estado backend se sincroniza por API/SQLite; `localStorage` conserva estado de
interfaz donde corresponde, no sustituye al backend.

### `/app/`

Panel móvil individual: login, identidad resuelta, estado actual, detalle diario,
cambio de contraseña y logout. No es todavía PWA, offline ni Web Push.

## 13. Mapa del backend

- `server/app.js`: Express, seguridad HTTP, estáticos, rutas y listener loopback.
- `server/db.js`: ruta SQLite, PRAGMA, esquema, migraciones, credenciales legacy
  iniciales y mantenimiento semanal.
- `server/session.js`, `auth.js`, rutas auth y `audit.js`: credenciales,
  cookie firmada, permisos y redacción.
- `teacher-identity.js`: asignación docente activa por fecha.
- `schedule-model.js` y `teacher-schedule.js`: validación, persistencia,
  activación y lectura del horario.
- `ghc-xml-import.js`, `annual-source.js` y `pdf-schedule-import.js`: adaptadores GHC/XML/PDF.
- `schedule-source-types.js` y `session-semantics.js`: mapeo y semántica central.
- `routes/users.js`: administración segura de cuentas Superadmin.
- `user-provisioning.js`: preview, enlace anual, provisión transaccional y
  bootstrap explícito de cuentas.
- rutas `guardias`, `profesorado`, `grupos`, `biblioteca`: operación.
- rutas `schedule`: dataset activo, compatibilidad, vista personal y activación.
- rutas `export` y `sqlite-backup.js`: snapshots, SQLite y restore.

## 14. Servicio y arranque

```text
LAN → Nginx :80 → 127.0.0.1:3000 → Express → SQLite
```

El release nuevo escucha únicamente en loopback. PM2 ejecutará el wrapper
`deploy/linux/start-guardias.sh` desde `/srv/guardias/current`; este carga el
entorno `0600` de `/etc/guardias/guardias.env` y usa la SQLite externa de
`/var/lib/guardias`. Existe una unidad alternativa
`deploy/linux/guardias.service`, pero no debe activarse junto con PM2.

El servidor puede carecer de Internet/GitHub. Un release debe prepararse como
artefacto externo siguiendo el runbook, no mediante un `git pull` supuesto.

Al arrancar normalmente:

1. se exige `GUARDIAS_SESSION_SECRET`;
2. se abre la SQLite indicada por `GUARDIAS_DB_PATH`;
3. se aplican esquema y migraciones pendientes;
4. se validan restricciones complementarias;
5. se crean credenciales legacy solo si faltan y existen variables iniciales;
6. se ejecuta mantenimiento semanal si cambió la semana;
7. Express escucha en `127.0.0.1:PORT`.

`npm run db:init` llama al mismo inicializador con `skipWeeklyReset: true`:
aplica migraciones, pero no limpia la operación semanal.

## 15. Migraciones, backup y rollback

`schema_migrations` registra cada SQL aplicado. Las migraciones 001/002/003 son
aditivas e idempotentes bajo ese control y han sido ensayadas sobre una base
heredada representativa. En producción siempre se requiere backup inmediato,
integridad antes/después y ventana sin escritores.

Un backup válido se crea con la API `.backup`, no copiando a ciegas una DB WAL
en uso. Debe pasar:

```sql
PRAGMA quick_check;
PRAGMA foreign_key_check;
```

WAL/SHM pertenecen al estado de la base abierta. No deben borrarse ni mezclarse
con otra DB. El rollback puede afectar:

- artefacto de aplicación;
- SQLite previa a migración;
- SQLite previa a activación;
- dataset aún no activo, que simplemente se deja sin activar.

Los movimientos/restauraciones exactos están solo en
[../DEPLOYMENT_RUNBOOK.md](../DEPLOYMENT_RUNBOOK.md).

## 16. Cambio anual

```text
fuente aprobada
 → informe
 → importación a copia aislada
 → dataset validated
 → auditoría de identidades/periodos/sesiones
 → backup producción
 → instalación aún validated
 → activación explícita
 → smoke
 → archivo del curso/dataset anterior
```

No se borra el histórico por conveniencia ni se usa el contenido anterior como
fallback. Las cuentas continúan; perfiles, identidades, asignaciones y horario se
crean para el curso nuevo.

## 17. Fallos principales

- Nginx caído: la LAN no entra aunque Node esté sano.
- Node/PM2 caído: Nginx suele responder 502.
- SQLite ausente/corrupta: detener; preservar DB/WAL/SHM; no reparar a ciegas.
- Sin dataset activo: health puede estar bien, pero horario devuelve 503 visible.
- Login fallido: comprobar servicio, sesión, reloj y cuenta; nunca volcar secretos.
- Migración fallida: no arrancar; conservar evidencias y restaurar conjuntamente.
- Dataset incorrecto: si está `validated`, no activarlo; si está activo, aplicar
  rollback de activación del runbook.
- Disco lleno: parar escrituras si es necesario y no borrar backups sin inventario.

Los comandos concretos están en [INCIDENTS.md](INCIDENTS.md).

## 18. Pendientes actuales

- Ejecutar el redeploy limpio controlado y verificar Node/Nginx/PM2/backups.
- Configurar la primera rotación física de `GUÀRDIES PATI` suministrada por Jefatura.
- Aprobar y ejecutar el alta controlada de cuentas, incluido el reparto explícito
  de roles administrativos; no crear credenciales antes de esa aprobación.
- Ejecutar auditoría adversarial y certificación de carga del RC.

## 19. Modelo mental en una página

```text
PERSONAS
  teacher ─┐
  admin ───┼─> login servidor ─> cookie firmada ─> permisos servidor
  super ───┘
                │
                └─ user → assignment por fecha → profile del curso
                                               → external identity/source_code

HORARIO
  XML oficial/PDF → adaptador → dataset validated → revisión → activación explícita
                                                     │
                                                     ▼
                                               SQLite active
                                                   ├─> /app/
                                                   └─> adaptador legacy
                                                        └─> guardias.html

REGLA DIARIA
  sesión/obligación = ocupado
  teaching vacío = libre
  break vacío = recreo
  guardia patio/biblioteca/Patis Inclusius = ocupado y sin cobertura automática

OPERACIÓN
  ausencia + sesión cubrible → fila de guardia → asignación + tarea/comentario
  patio importado → obligación por source_code → puesto solo por configuración

SERVIDOR
  LAN → Nginx :80 → Node 127.0.0.1:3000 → SQLite(+WAL/SHM)
                       PM2                  │
                                           └─ backups SQLite verificados

SEGURIDAD
  no Internet supuesto · no fallback viejo · no identidad por nombre
  no dataset sin validar · no DB sin backup · no borrar WAL/SHM a ciegas
```
