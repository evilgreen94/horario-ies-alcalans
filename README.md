# ARGOS · IES Alcalans

> **Documento actual / índice del repositorio.**  
> La entrada operativa y técnica canónica es
> [docs/START_HERE.md](docs/START_HERE.md).

**ARGOS — Aplicación de Registro y Gestión de Organización y Sustituciones** es
la aplicación interna del IES Alcalans para centralizar organización,
sustituciones, ausencias y otros procesos operativos del centro.

**Guardias** es actualmente su principal módulo operativo. Gestiona, entre otros:

- ausencias del profesorado;
- coberturas de clases;
- guardias ordinarias;
- puestos de apoyo como Biblioteca y Baños;
- guardias y obligaciones de patio;
- tareas del profesorado;
- sustituciones;
- información operativa para Sala de Guardias y TV.

La interfaz principal se sirve desde `guardias.html`.

La vista personal docente está disponible en `/app/`.

---

## Estado actual

La versión estable en producción es:

**ARGOS 1.0.3.4**

Tag:

```text
v1.0.3.4
```

Commit exacto desplegado:

```text
436a4af0b8287a68a7b2e0c673fea4b676105c6b
```

La etiqueta `v1.0.3.4` representa exactamente el código del artefacto desplegado
en producción.

`main` puede contener posteriormente cambios exclusivamente documentales,
mantenimiento del repositorio o trabajo posterior que todavía no forme parte de
una nueva release.

Estado de validación de la release:

```text
150/150 tests PASS
```

El historial detallado de versiones, incidencias y correcciones está en:

[docs/CHANGELOG_ARGOS.md](docs/CHANGELOG_ARGOS.md)

---

## Arquitectura

ARGOS sigue actualmente este principio:

```text
SQLite
  = hechos y estado operacional persistido

Servidor
  = lógica operacional autoritativa

Clientes
  = representación del estado
```

En producción:

```text
LAN del centro
      ↓
Nginx :80
      ↓
Node / Express
127.0.0.1:3000
      ↓
SQLite
/srv/guardias/data/guardias.sqlite
```

El proceso Node se gestiona mediante PM2.

El servidor no necesita GitHub ni acceso a Internet para ejecutar ARGOS.

Las releases se generan como artefactos Linux reproducibles y se despliegan
mediante el procedimiento descrito en:

[DEPLOYMENT_RUNBOOK.md](DEPLOYMENT_RUNBOOK.md)

---

## Modelo operacional de Guardias

Desde ARGOS 1.0.3.4, la decisión efectiva de cada tramo pertenece al servidor.

La prioridad operacional es:

```text
Clase real
   ↓
Biblioteca
   ↓
Baños
   ↓
Guardia disponible
```

Principios vigentes:

1. Una cobertura persistida válida se conserva.
2. Una clase real tiene prioridad sobre cualquier puesto auxiliar.
3. Biblioteca y Baños solo consumen docentes que continúan disponibles.
4. Un docente no puede ocupar dos funciones simultáneamente en el mismo tramo.
5. Un `GET`, un F5 o el polling nunca pueden reasignar una guardia.
6. PC, móvil, TV y vistas de impresión consumen el mismo estado efectivo.
7. Las reasignaciones deben proceder de una acción administrativa explícita.
8. Si no existe capacidad suficiente, la clase permanece explícitamente `Sin cubrir`.

El endpoint de lectura autoritativa es:

```text
GET /api/guardias/effective-slots?date=YYYY-MM-DD
```

La lógica de materialización de coberturas reside en el backend y persiste la
asignación final en SQLite.

---

## Persistencia operacional

SQLite es la autoridad sobre los hechos persistidos.

Una cobertura almacenada en base de datos no puede cambiar por:

- refrescar la página;
- polling;
- cambiar de navegador;
- abrir la aplicación desde otro dispositivo;
- reiniciar Node;
- abrir la TV;
- generar una vista imprimible.

Una modificación de cobertura debe producirse mediante una operación explícita
del backend.

El flujo conceptual es:

```text
Jefatura
   ↓
acción explícita
   ↓
motor servidor
   ↓
validación
   ↓
materialización
   ↓
SQLite
   ↓
clientes
```

El read-model del servidor es deliberadamente de solo lectura.

---

## Materialización de coberturas

La materialización de guardias se ejecuta desde el backend.

El motor:

1. detecta clases reales que requieren cobertura;
2. conserva asignaciones válidas previamente persistidas;
3. identifica docentes elegibles;
4. aplica el orden de balance;
5. reserva capacidad para clases antes de asignar puestos auxiliares;
6. persiste la cobertura resultante;
7. actualiza la carga de guardias;
8. confirma la transacción.

Si no existe capacidad suficiente, no se inventa ninguna cobertura.

La clase permanece `Sin cubrir` hasta que exista una acción administrativa que permita resolverla.

---

## Balance de guardias

El servidor utiliza criterios de carga para ordenar candidatos.

Actualmente se consideran:

```text
carga mensual
      ↓
carga semanal
      ↓
carga del día
      ↓
desempate determinista
```

Estos datos pertenecen al motor operacional.

La carga de guardias no se muestra al profesorado ordinario.

Los perfiles administrativos autorizados pueden consultar esta información con
fines de auditoría.

El endpoint correspondiente está protegido:

```text
GET /api/guardias/monthly-load
```

y requiere permisos administrativos.

---

## Puestos especiales

ARGOS gestiona actualmente puestos auxiliares como:

- Biblioteca;
- Baños.

Estos puestos se almacenan como estado persistido.

No son una cobertura de clase y nunca tienen prioridad sobre una clase real sin cubrir.

La prioridad definitiva es:

```text
Cobertura de clase
      ↓
Biblioteca
      ↓
Baños
      ↓
Guardia disponible
```

Un mismo docente no puede ocupar simultáneamente varios de estos estados en el mismo tramo.

---

## Guardia disponible

Los docentes que forman parte del pool de guardia de un tramo y que no tienen ninguna asignación operacional aparecen como `Guardia disponible` o `Sin asignación`.

Esto permite a Jefatura conocer qué capacidad real sigue disponible para una incidencia o necesidad sobrevenida.

---

## TV / Raspberry

La vista TV consume el mismo estado efectivo que Sala de Guardias.

Cuando existe backend:

- no recalcula guardias localmente;
- no decide Biblioteca;
- no decide Baños;
- no reasigna docentes;
- no modifica SQLite.

Si el servidor no puede proporcionar el estado efectivo, la TV muestra un estado de indisponibilidad en lugar de inventar una asignación local.

El fallback legacy se reserva exclusivamente a contextos sin backend.

---

## Identidad y permisos

Una única cuenta y sesión individual da acceso, según permisos, a:

- web principal;
- perfil docente;
- Jefatura;
- administración técnica;
- `/app/`.

Los roles principales son:

```text
teacher
admin
superadmin
```

Los roles son independientes. En particular, `superadmin ≠ admin`.

Un usuario puede disponer de uno o varios roles según la configuración persistida.

La identidad docente se enlaza mediante `source_code`, no mediante el nombre visible.

---

## Sustituciones

ARGOS separa la identidad persistida del horario de la identidad visible cuando existe una sustitución activa.

La identidad canónica del horario sigue siendo la referencia estructural.

La interfaz puede mostrar al sustituto efectivo sin alterar el vínculo interno con el perfil original.

Esta separación evita que una sustitución temporal modifique de forma irreversible la identidad asociada al horario oficial.

---

## Horario académico

El XML oficial de GHC es la fuente estructurada primaria para el horario académico 2026/27.

El PDF se utiliza como contraste independiente.

El flujo previsto es:

```text
XML oficial
     ↓
auditoría / importación
     ↓
dataset validated
     ↓
revisión
     ↓
activación explícita
     ↓
dataset active
```

La importación y la activación son operaciones separadas.

La activación es explícita y transaccional.

Los XML, PDF y censos operativos deben permanecer fuera del repositorio salvo documentación específica y deliberada.

---

## Fuente de verdad

En funcionamiento normal con backend:

```text
SQLite
   ↓
servidor
   ↓
clientes
```

No se considera fuente operacional autoritativa:

- `localStorage`;
- cálculos del navegador;
- sugerencias no aplicadas;
- HTML;
- caché del cliente.

`localStorage` puede seguir utilizándose para estado de interfaz o compatibilidad local, pero no sustituye al backend cuando este está disponible.

---

## Documentación

- [Empezar aquí](docs/START_HERE.md): orientación general, seguridad y jerarquía documental.
- [Cómo funciona Guardias](docs/HOW_GUARDIAS_WORKS.md): modelo mental completo del módulo Guardias.
- [Changelog](docs/CHANGELOG_ARGOS.md): historial de versiones, cambios arquitectónicos, bugs corregidos y releases.
- [Operaciones](docs/OPERATIONS.md): comprobaciones operativas, backup, diagnóstico y reinicio.
- [Incidentes](docs/INCIDENTS.md): procedimientos de recuperación y diagnóstico por síntomas.
- [Disposición del servidor](docs/SERVER_LAYOUT.md): rutas verificadas y estructura de producción.
- [Entrega a otro compañero](docs/HANDOVER.md): guía corta para continuidad operativa o intervención urgente.
- [Smoke manual](docs/MANUAL_SMOKE_CHECKLIST.md): validaciones manuales posteriores a cambios.
- [Auditoría de seguridad](docs/SECURITY_AUDIT_CHECKLIST.md): lista de comprobaciones de seguridad.
- [Plan de carga](docs/LOAD_TEST_PLAN.md): pruebas y criterios relacionados con carga y estabilidad.
- [Runbook de despliegue](DEPLOYMENT_RUNBOOK.md): procedimiento autorizado de despliegue, comprobación y rollback.
- [Estado del proyecto](PROJECT_STATUS.md): estado general y situación operativa del proyecto.
- [Hoja de ruta 2026/27](ROADMAP_2026-27.md): planificación y líneas de evolución.

La documentación histórica que ya no representa necesariamente el estado actual puede conservarse en `docs/history/`.

---

## Desarrollo local

Requisitos:

- Node.js `>=22.9 <23`;
- npm 10/11;
- SQLite de desarrollo independiente.

No utilizar la base de datos real de producción ni una copia operativa como base de desarrollo ordinario.

En Windows:

```powershell
Set-Location 'C:\Users\usuario\Documents\GitHub\horario-ies-alcalans'
.\start-local.ps1
```

El script carga `.env.local.ps1`, que debe permanecer fuera de Git.

La configuración local debe definir, como mínimo, un secreto de sesión válido.

---

## Validación local

```powershell
npm.cmd test
git diff --check
```

Para la release `v1.0.3.4`:

```text
150/150 tests PASS
```

Antes de generar una release se debe trabajar siempre con un working tree limpio.

---

## Scripts relevantes

- `npm run db:init`: inicializa esquema y migraciones.
- `npm run schedule:prepare`: preparación o informe local del horario.
- `npm run schedule:prepare-ghc`: audita e importa el XML oficial como dataset `validated`.
- `npm run schedule:reconcile`: compara fuentes externas sin activarlas.
- `npm run schedule:activate`: activa explícitamente un dataset validado.
- `npm run security:bootstrap-superadmin -- --db <ruta.test.sqlite> --source-code RMLL`: bootstrap explícito e idempotente de la primera cuenta Superadmin.
- `npm run security:reset-superadmin`: recuperación break-glass con las confirmaciones de seguridad correspondientes.
- `npm run course:reset`: operación destructiva; consultar siempre el runbook antes de ejecutarla.

---

## Scripts operativos

Los scripts operativos de producción se encuentran en `ops/`:

```text
ops/backup.sh
ops/diagnostics.sh
ops/restart.sh
ops/status.sh
```

Estos scripts forman parte del modelo operativo de ARGOS y se incluyen en las releases de producción.

---

## Build de release

Las releases Linux se generan mediante:

```text
deploy/build-release.ps1
```

El script utiliza Docker para producir un artefacto Linux reproducible.

El build no debe sustituirse por un empaquetado manual desde Windows.

Flujo:

```text
Ares / Windows
      ↓
build-release.ps1
      ↓
Docker
      ↓
node:22-bookworm-slim
      ↓
artefacto Linux x64
```

---

## Release 1.0.3.4

La release estable actual fue generada con:

```text
build image: node:22-bookworm-slim
architecture: Linux x64
Node: 22.23.2
npm: 10.9.8
```

Compatibilidad nativa validada:

```text
Node requiere GLIBC 2.28
sqlite3 requiere GLIBC 2.34
compatibilidad máxima validada: GLIBC 2.35
```

Artefacto:

```text
guardias-release-436a4af0b828-linux-x64.tar.gz
```

SHA-256:

```text
d5ac85545035283603382ae802f4036a8f61d5b95e48f001a7f8b389a2f2dcfe
```

---

## Producción

Las releases se almacenan en:

```text
/srv/guardias/releases/<commit>
```

La release activa se referencia mediante:

```text
/srv/guardias/current
```

El script de arranque utilizado por PM2 es:

```text
/srv/guardias/current/deploy/linux/start-guardias.sh
```

La base de datos operacional se encuentra en:

```text
/srv/guardias/data/guardias.sqlite
```

El proceso PM2 se llama `guardias`.

---

## Despliegue

No desplegar ARGOS siguiendo instrucciones aisladas de este README.

Todo despliegue debe realizarse siguiendo exclusivamente [DEPLOYMENT_RUNBOOK.md](DEPLOYMENT_RUNBOOK.md).

El procedimiento incluye, como mínimo:

```text
tests
  ↓
working tree limpio
  ↓
build Docker Linux
  ↓
SHA-256
  ↓
backup SQLite
  ↓
PRAGMA integrity_check
  ↓
copia del artefacto
  ↓
sha256sum -c
  ↓
extracción de release
  ↓
switch atómico de current
  ↓
restart PM2
  ↓
smoke HTTP / DB
  ↓
validación Sala / TV / móvil
```

---

## Rollback

ARGOS utiliza un modelo de releases inmutables bajo `/srv/guardias/releases/`.

El symlink `/srv/guardias/current` identifica la release activa.

El rollback de aplicación se realiza apuntando `current` nuevamente a una release estable anterior y reiniciando el proceso de forma controlada.

La restauración de base de datos es una operación distinta y solo debe realizarse cuando esté expresamente justificada.

Consultar siempre [DEPLOYMENT_RUNBOOK.md](DEPLOYMENT_RUNBOOK.md).

---

## Backups

Antes de un despliegue o cambio sensible debe existir un backup SQLite consistente.

Los backups deben validarse mediante `PRAGMA integrity_check;` y registrar su SHA-256 cuando formen parte de una operación de release o recuperación.

No utilizar un `cp` bruto de una SQLite activa como procedimiento normal de backup cuando existe un mecanismo SQLite consistente.

---

## Seguridad

Principios generales:

- secretos fuera de Git;
- bases de datos reales fuera del repositorio;
- credenciales temporales no persistidas en documentación;
- autenticación individual;
- roles explícitos;
- operaciones administrativas auditables;
- acciones destructivas con confirmación;
- acceso técnico restringido;
- producción sin puertos innecesarios expuestos.

Las decisiones específicas de seguridad están documentadas en [docs/SECURITY_AUDIT_CHECKLIST.md](docs/SECURITY_AUDIT_CHECKLIST.md).

---

## Invariantes de ARGOS

Los siguientes invariantes deben preservarse en futuras versiones:

1. SQLite es la autoridad de los hechos persistidos.
2. El servidor es la autoridad de la lógica operacional.
3. Los clientes representan el estado; no toman decisiones operativas autoritativas.
4. Un GET nunca modifica asignaciones.
5. F5 y polling nunca reasignan guardias.
6. Una clase real tiene prioridad sobre Biblioteca y Baños.
7. Un docente no puede ocupar simultáneamente varias funciones en el mismo tramo.
8. Las coberturas persistidas válidas se conservan.
9. Las reasignaciones proceden de acciones explícitas.
10. Si no existe capacidad suficiente, ARGOS debe mostrar `Sin cubrir`.
11. PC, móvil, TV e impresión deben representar el mismo estado.
12. Una release desplegada debe poder identificarse mediante commit y artefacto.

---

## Historial

ARGOS ha evolucionado desde una aplicación de guardias basada principalmente en frontend hacia un sistema con backend, identidad individual, persistencia SQLite, importación de horario, sustituciones y estado operacional autoritativo.

Las principales etapas documentadas incluyen:

```text
1.0 RC
   ↓
1.0.2
   ↓
1.0.3
   ↓
1.0.3.1
   ↓
1.0.3.2
   ↓
1.0.3.3
   ↓
1.0.3.4
```

El detalle completo está disponible en [docs/CHANGELOG_ARGOS.md](docs/CHANGELOG_ARGOS.md).

---

## Estado de 1.0.3.4

La versión `1.0.3.4` quedó validada en producción con:

```text
150/150 tests PASS
HTTP raíz 200
/api/schedule/active 200
SQLite integrity_check = ok
PM2 online y estable
F5 sin reasignaciones
reinicio de servidor sin reasignaciones
Sala y TV consumiendo el mismo estado
materialización persistida de coberturas
```

Esta versión establece la separación actual entre:

```text
persistencia
    ↓
lógica operacional
    ↓
presentación
```

y constituye la baseline estable sobre la que se desarrollarán las siguientes versiones de ARGOS.

---

## Autoridad documental

Ante cualquier discrepancia entre documentos:

1. `DEPLOYMENT_RUNBOOK.md` prevalece para despliegue y rollback.
2. `docs/START_HERE.md` prevalece como entrada técnica y operativa.
3. `docs/HOW_GUARDIAS_WORKS.md` describe el modelo funcional de Guardias.
4. `docs/CHANGELOG_ARGOS.md` recoge la evolución histórica.
5. Este README actúa como índice y resumen general del repositorio.

No ejecutar operaciones de producción basándose únicamente en fragmentos, comandos aislados o documentación histórica.


Scripts relevantes:

- `npm run db:init`: esquema y migraciones; **no** ejecuta mantenimiento semanal.
- `npm run schedule:prepare`: informe/importación local; una ruta operativa exige
  la confirmación textual exacta documentada en el runbook.
- `npm run schedule:prepare-ghc`: audita/importa el XML oficial como `validated`.
- `npm run schedule:reconcile`: compara XML y PDF externos sin persistirlos.
- `npm run schedule:activate`: activación explícita; la DB local real del repo
  permanece bloqueada incluso con confirmación.
- `npm run security:reset-superadmin`: recuperación break-glass solo con acceso OS,
  ruta SQLite absoluta y confirmación exacta; la clave temporal se muestra una vez.
- `npm run security:bootstrap-superadmin -- --db <ruta.test.sqlite> --source-code RMLL`:
  bootstrap explícito e idempotente de la primera cuenta, siempre sobre una DB
  indicada y con identidad presente en un dataset `validated` o `active`.
- `npm run course:reset`: operación destructiva; consultar primero el runbook.

## Persistencia y fuentes

Toda la persistencia backend está en SQLite. `localStorage` solo actúa como estado
de interfaz donde el código lo contempla. Los horarios anuales JSON/JS de cursos
anteriores no son fuente runtime ni fallback.

El XML oficial GHC es la fuente estructurada primaria 2026/27. El PDF es contraste
independiente. Ambos y el censo permanecen fuera del repositorio; la importación
deja el dataset `validated` y la activación es posterior, explícita y transaccional.

## Producción

No desplegar siguiendo instrucciones sueltas de este README. Usar exclusivamente
[DEPLOYMENT_RUNBOOK.md](DEPLOYMENT_RUNBOOK.md), con backup SQLite verificado,
inventario del servidor, aprobación humana y ventana de mantenimiento.
