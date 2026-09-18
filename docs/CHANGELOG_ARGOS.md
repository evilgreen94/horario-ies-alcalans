# ARGOS — Historial de versiones y cambios

**Aplicación:** ARGOS — Aplicación de Registro y Gestión de Organización y Sustituciones
**Centro:** IES Alcalans
**Estado actual documentado:** `1.0.3.4`
**Última actualización:** 2026-09-18

> Este documento recoge las versiones y hitos de ARGOS que han quedado documentados durante el ciclo de preproducción, despliegue y estabilización de septiembre de 2026. Cuando una versión intermedia fue de desarrollo y no una release de producción, se indica expresamente.

---

## 1. Resumen de versiones

| Versión | Estado | Commit / referencia | Tests conocidos | Resumen |
|---|---|---|---:|---|
| 1.0 RC | Release candidate | `5baeed9c54677f59c1a9a6bb244f6393fd8bf823` | 87/87 | Base estable, importación oficial, migraciones y rehearsal legacy |
| 1.0.2 | Funcionalidad consolidada | — | — | Provisión de usuarios, roles y cuentas docentes |
| 1.0.3 | Código congelado | `d9008c70dac4ea651e2733dc45b29154150aa45c` | 107/107 | Sustituciones y auditoría operativa |
| 1.0.3.1 | Desarrollo intermedio | rama `feat/argos-1.0.3.1-suggestions` | — | Validación del horario oficial actualizado y trabajo sobre sugerencias |
| 1.0.3.2 | Producción | `d46b555b34fa48559d840c47c7c4ea32459b41cf` | — | Persistencia operacional: SQLite pasa a ser autoridad |
| 1.0.3.3 | Producción | `f00ad9c0461f5df71d78f0fc9612d2ee476af4fc` | 130/130 | Ausencias futuras, Biblioteca/Baños persistidos y prioridades |
| 1.0.3.4 | Producción | `436a4af0b8287a68a7b2e0c673fea4b676105c6b` | 150/150 | Estado de guardias autoritativo en servidor y materialización de coberturas |

---

# 2. Changelog detallado

## 1.0 RC

**Fecha documentada:** 2026-09-08
**Commit:** `5baeed9c54677f59c1a9a6bb244f6393fd8bf823`
**Rama:** `rescue/preproduction-2026-09`

### Cambios principales

- Cierre del primer candidato estable de ARGOS.
- Importación y validación del XML oficial de horarios.
- Migraciones de base de datos `001`, `002` y `003`.
- Rehearsal de migración desde la aplicación legacy.
- Comprobaciones de idempotencia de migraciones.
- Validación de integridad SQLite:
  - `quick_check=ok`
  - claves foráneas limpias.
- Tratamiento diferenciado de clases, guardias, reuniones, otras obligaciones, guardias de patio, biblioteca de patio y patios inclusivos.
- Preparación del artefacto Linux x64 para producción.

### Datos de validación del horario

- 88 docentes.
- 2.143 obligaciones.
- 155 guardias.
- 57 guardias de patio.
- 5 bibliotecas de patio.
- 6 patios inclusivos.

### Calidad

- **87/87 tests PASS.**

### Artefacto conocido

`guardias-release-5baeed9c5467-linux-x64.tar.gz`

SHA-256:

`59fed2d9e5c60a7ec6ad3a13c4c712fbbadfe355c6967bfe9a23ec9eafbdc131`

---

## 1.0.2

### Cambios principales

La rama 1.0.2 consolidó el sistema de identidad y provisión de usuarios.

- Bootstrap de la cuenta principal RMLL.
- Roles combinables: `teacher`, `admin`, `superadmin`.
- Provisión explícita de cuentas docentes.
- Usernames derivados del `source_code`.
- Contraseñas temporales almacenadas únicamente mediante hash.
- Cambio obligatorio de contraseña.
- Operaciones de provisión idempotentes.
- Detección de conflictos, perfiles huérfanos y enlaces incompatibles.
- Incorporación de un segundo Superadmin para JMH.
- Endpoint de preview de provisión.
- Endpoint de provisión definitiva por dataset.
- Modificación transaccional de roles.
- Invalidación de sesiones mediante `session_version` tras cambios de permisos.
- Auditoría de cambios administrativos.

### Problemas que resolvió

- Dependencia de cuentas creadas manualmente.
- Riesgo de duplicar usuarios durante nuevas importaciones.
- Falta de separación clara entre identidad docente y permisos administrativos.
- Ausencia de un flujo explícito y auditable de provisión.

---

## 1.0.3

**Fecha documentada de congelación:** 2026-09-14
**Commit:** `d9008c70dac4ea651e2733dc45b29154150aa45c`

### Cambios principales

- Consolidación del sistema de sustituciones.
- Auditoría operativa.
- Mejora de la integración entre usuarios, perfiles docentes, horario oficial y sustituciones.
- Validación de upgrade desde 1.0.2.
- Migración idempotente validada.

### Calidad

- **107/107 tests PASS.**
- Upgrade desde 1.0.2: PASS.
- Migración idempotente: PASS.

---

## 1.0.3.1

**Estado:** desarrollo intermedio, no documentado como release final de producción.
**Rama:** `feat/argos-1.0.3.1-suggestions`

### Cambios / hitos

- Trabajo sobre sugerencias operativas de guardia.
- Validación del horario oficial actualizado.
- XML `Horario_1.0.3.xml`.
- SHA-256 del XML:

`37914b6e3d83ff6a640c5a2b0f2e2258acf09162f15839579f4cc903eadfd6d5`

### Validación del dataset

- 88 docentes.
- 2.145 sesiones.
- 154 guardias.
- 0 referencias sin resolver.
- `anomalies: []`.

### Observación

Esta etapa ayudó a descubrir una limitación arquitectónica importante: una sugerencia calculada en cliente no podía considerarse estado operacional autoritativo.

---

## 1.0.3.2

**Estado:** desplegada en producción.
**Commit:** `d46b555b34fa48559d840c47c7c4ea32459b41cf`

### Cambio arquitectónico principal

```text
MOTOR / PROPUESTAS
        ↓ validación/aplicación explícita
ESTADO OPERATIVO PERSISTIDO = AUTORIDAD
        ↓
UI / TV / POLL = SOLO LECTURA
```

### Cambios principales

- Una asignación persistida deja de depender de F5, polling, navegador, dispositivo o cálculo futuro del motor.
- El estado persistido pasa a ser la referencia operacional.
- Se elimina la posibilidad de que un refresco provoque una reasignación.
- La reasignación queda reservada a acciones explícitas de Jefatura.

### Backup pre-hotfix conocido

`/srv/guardias/backups/pre-hotfix-1.0.3.2-20260916T101903.sqlite`

SHA-256:

`80b10df0e19e35a2a9459fe819d410e160b088149168117b9da600d500e1025a`

---

## 1.0.3.3

**Fecha de despliegue documentada:** 2026-09-17
**Commit:** `f00ad9c0461f5df71d78f0fc9612d2ee476af4fc`

### Cambios principales

#### Ausencias futuras

- Implementación de la fase A de ausencias futuras.
- Backend-first.
- Operaciones atómicas.
- Materialización en `ausencias`.
- Idempotencia.
- Sin reasignación global automática.
- Reparación de estados legacy.

#### Biblioteca

- Persistencia en `biblioteca_guardias`.
- El frontend deja de tratar la propuesta local como autoridad.

#### Baños

- Nueva tabla `banos_guardias`.
- Restricción `UNIQUE(dia,hora)`.
- Rutas, almacenamiento, lifecycle, export, restore y reset.
- Invariante: un mismo docente no puede ocupar simultáneamente Biblioteca y Baños en el mismo tramo.

#### Bootstrap semanal

Nuevo flujo explícito:

`POST /api/special-assignments/bootstrap`

Características:

- atómico,
- idempotente,
- ejecutado de forma administrativa.

Estado inicial documentado tras bootstrap:

- Biblioteca: 23 puestos.
- Baños: 31 puestos.
- 0 conflictos cruzados.

#### Prioridades

Se fija formalmente el orden operacional:

1. Cobertura de clase real.
2. Biblioteca.
3. Baños.
4. Guardia disponible.

Solo una sesión activa de tipo `class` con grupo requiere cobertura automática.

### Problema descubierto

PC/móvil y Raspberry podían mostrar resultados distintos porque `getEffectiveSpecialAssignments()` seguía calculándose localmente.

### Calidad

- **130/130 tests PASS.**

### Backup pre-release conocido

`/srv/guardias/backups/pre-1.0.3.3-20260917T081949Z.sqlite`

SHA-256:

`a8d8f9b04978496abfd5a9dba86f6955929e1524ae7566593bbd7f1d0cd455fc`

---

## 1.0.3.4

**Fecha de despliegue:** 2026-09-18
**Commit:** `436a4af0b8287a68a7b2e0c673fea4b676105c6b`
**Rama:** `fix/argos-1.0.3.4-server-authoritative-slots`

### Objetivo

Eliminar definitivamente cualquier discrepancia de estado entre Sala de Guardias, móvil, Raspberry/TV, impresión y recarga de página.

### Arquitectura resultante

```text
SQLite
  = hechos persistidos

Servidor
  = lógica operativa única
  = estado efectivo de cada tramo

Clientes
  = representación del estado
```

### C4.1 — Read-model autoritativo

Se introducen:

- `server/guardia-slot-policy.js`
- `server/guardia-slot-state.js`
- endpoint `GET /api/guardias/effective-slots?date=YYYY-MM-DD`

Comportamiento:

- conserva coberturas persistidas válidas;
- detecta coberturas pendientes;
- reserva capacidad antes de asignar puestos auxiliares;
- no inventa coberturas durante una lectura;
- informa de guardias elegibles, cobertura requerida, cobertura cubierta, cobertura pendiente, capacidad reservada, déficit y huecos de asignación.

Invariante:

> Si existe una clase real sin cubrir y un docente de guardia elegible sigue libre, existe un error de motor salvo incompatibilidad documentada.

### C4.2 — Migración de clientes

#### TV / Raspberry

- Consume el estado efectivo del servidor.
- Con backend disponible deja de recalcular localmente.
- Si el servidor no dispone del estado muestra “Estado no disponible”.
- El fallback legacy queda limitado al modo offline.

#### Sala de Guardias

- Renderizado basado en estado autoritativo.
- Distingue cobertura, Biblioteca, Baños y Guardia disponible.

#### Impresión

- El snapshot de impresión consume el mismo estado efectivo.
- La fecha seleccionada se refresca antes de construir la vista imprimible.

### C4.3 — Eliminación de decisiones operativas del cliente

- Con backend disponible, `getGuardiaSugerida()` deja de decidir asignaciones reales.
- Las sugerencias quedan limitadas a previews y fallback offline.
- Filtros, métricas y paneles consumen cobertura operacional persistida.
- El frontend deja de ser autoridad de asignación.

### C4.4 — Orden y materialización de coberturas

Se introducen:

- `server/guardia-candidate-order.js`
- `server/coverage-materialization.js`

#### Orden de candidatos

El servidor aplica balance según:

1. carga mensual,
2. carga semanal,
3. carga del día,
4. desempate determinista.

La carga del propio tramo se excluye de la penalización al reevaluarlo.

#### Materialización

Una acción explícita de Jefatura puede materializar coberturas en SQLite.

```text
Jefatura guarda/modifica ausencia
        ↓
servidor detecta clases reales a cubrir
        ↓
conserva asignaciones persistidas válidas
        ↓
elige candidatos elegibles
        ↓
persiste ausencias.guardia
        ↓
reconstruye carga mensual
        ↓
commit
```

Garantías:

- cobertura persistida válida → se conserva;
- cobertura vacía → se asigna si existe capacidad;
- falta de candidatos → permanece `Sin cubrir`;
- día completo → se procesa tramo a tramo;
- F5 / poll / GET → nunca escriben;
- reinicio de Node → no cambia asignaciones;
- PC / TV / móvil → leen el mismo estado.

### Corrección de estado heredado

Tras el despliegue se detectaron ausencias creadas bajo 1.0.3.3 con `guardia=''`.

El nuevo read-model las detectó correctamente como `uncovered`, con candidatos `cobertura-pendiente`.

La primera escritura administrativa posterior al despliegue hizo pasar el estado por el materializador y normalizó las coberturas heredadas pendientes.

Resultado verificado en producción:

- las coberturas quedaron persistidas físicamente en SQLite;
- las sesiones que no requerían cobertura automática permanecieron correctamente vacías;
- no fue necesaria ninguna modificación SQL manual.

### Visibilidad de carga de guardias

- La carga deja de mostrarse a profesorado ordinario.
- Jefatura / Superadmin pueden verla como dato de auditoría.
- `/api/guardias/monthly-load` queda restringido a administración.
- La TV no expone esta métrica.

### Validaciones realizadas

- F5 repetido: asignaciones estables.
- Reinicio completo del servidor: asignaciones estables.
- Persistencia SQLite confirmada.
- Sala y TV consumen el mismo estado.
- Integridad de DB en producción: `ok`.
- HTTP raíz: `200`.
- `/api/schedule/active`: `200`.
- PM2 estable sin restart loop.

### Calidad

- **150/150 tests PASS.**

### Artefacto de producción

`guardias-release-436a4af0b828-linux-x64.tar.gz`

SHA-256:

`d5ac85545035283603382ae802f4036a8f61d5b95e48f001a7f8b389a2f2dcfe`

Build:

- `node:22-bookworm-slim`
- Linux x64
- Node 22.23.2
- npm 10.9.8
- sqlite3 requiere GLIBC 2.34
- Node requiere GLIBC 2.28
- compatibilidad máxima validada: GLIBC 2.35

Release activa:

`/srv/guardias/releases/436a4af0b8287a68a7b2e0c673fea4b676105c6b`

---

# 3. Bugs relevantes corregidos

## Reasignación al refrescar

**Síntoma:** una cobertura podía cambiar tras F5 o polling.
**Causa:** el cliente participaba en la decisión operacional.
**Corregido en:** 1.0.3.2 → 1.0.3.4.

## PC/móvil y Raspberry mostraban personas distintas

**Síntoma:** distintos clientes calculaban diferentes ocupaciones para el mismo tramo.
**Causa:** cálculo local de puestos efectivos.
**Corregido en:** 1.0.3.4.

## Día completo sin guardias materializadas

**Síntoma:** una ausencia de día completo podía crear las filas pero dejarlas `Sin cubrir`.
**Causa:** el POST de día completo persistía `guardia=''` y el read-model no debía escribir.
**Corregido en:** 1.0.3.4 mediante `coverage-materialization.js`.

## Estado heredado anterior a 1.0.3.4

**Síntoma:** ausencias creadas antes del despliegue seguían apareciendo `Sin cubrir`.
**Causa:** el nuevo read-model es deliberadamente read-only y no reescribe datos antiguos durante GET/F5.
**Resolución:** la primera escritura administrativa posterior pasó el estado heredado por el materializador y persistió las coberturas pendientes.

## Biblioteca/Baños consumían capacidad necesaria para una clase

**Síntoma:** un docente podía quedar asignado a apoyo mientras existía una clase sin cubrir.
**Corregido en:** 1.0.3.3 / 1.0.3.4.
**Prioridad definitiva:** `Clase > Biblioteca > Baños > Guardia disponible`.

## Exposición de carga interna a profesorado

**Síntoma:** los chips mostraban contadores `0`, `1`, etc. sin contexto útil para el profesorado.
**Corregido en:** 1.0.3.4.
La carga queda reservada a Jefatura / Superadmin como dato de auditoría.

---

# 4. Invariantes operativos vigentes

1. **SQLite es la autoridad de los hechos persistidos.**
2. **El servidor es la única autoridad de la lógica efectiva.**
3. **Los clientes representan, no deciden.**
4. **Un GET nunca materializa ni modifica una asignación.**
5. **F5 y polling no pueden reasignar guardias.**
6. **Clase real tiene prioridad absoluta sobre puestos auxiliares.**
7. **Un docente no puede ocupar simultáneamente cobertura, Biblioteca, Baños y libre en el mismo tramo.**
8. **Las coberturas válidas persistidas se preservan.**
9. **La reasignación debe proceder de una acción administrativa explícita.**
10. **Sin capacidad real, la clase permanece explícitamente `Sin cubrir`.**

---

# 5. Arquitectura de producción

```text
Nginx :80
   ↓
Node / PM2
127.0.0.1:3000
   ↓
SQLite
/srv/guardias/data/guardias.sqlite
```

Proceso PM2: `guardias`

Script de arranque:

`/srv/guardias/current/deploy/linux/start-guardias.sh`

Modelo de releases:

```text
/srv/guardias/releases/<commit>
            ↑
     /srv/guardias/current
```

Los cambios de versión se realizan mediante cambio atómico del symlink `current`.

---

# 6. Política de despliegue

1. Tests completos en Ares.
2. Working tree limpio.
3. Build Linux x64 dentro de Docker.
4. Generación de SHA-256.
5. Backup consistente de SQLite.
6. Verificación `PRAGMA integrity_check`.
7. Copia del tar a producción.
8. Verificación `sha256sum -c`.
9. Extracción en `/srv/guardias/releases/<commit>`.
10. Cambio atómico de `current`.
11. Restart controlado de PM2.
12. Smoke: raíz HTTP 200, schedule activo HTTP 200, SQLite `ok`, PM2 estable.
13. Validación real en Sala, Raspberry/TV, móvil y permisos por rol.

---

# 7. Pendientes conocidos / siguientes líneas de trabajo

Estos puntos no forman parte del cierre de 1.0.3.4:

- Auditoría específica del informe diario/PDF de ausencias para garantizar que consume exclusivamente estado autoritativo.
- Resolución limpia del conflicto de identidad/provisioning del dataset 2 relacionado con Elena Jurado / `ejp`.
- Overlay operacional del horario personal docente.
- Revisión futura del panel técnico y delegación segura de administración.
- Sistema de tickets/incidencias para soporte interno.
- Revisión y actualización integral de documentación técnica y runbooks.
- Política formal de permisos y acciones destructivas para futuras automatizaciones/IA.
- Revisión de UX de Sala para mejorar jerarquía visual sin modificar lógica operacional.

---

# 8. Estado de cierre de 1.0.3.4

**Resultado:** estable en producción.

Comprobado:

- 150/150 tests PASS.
- Build Dockerizado Linux x64.
- SHA-256 validado.
- Release correcta enlazada en `current`.
- PM2 online y estable.
- DB íntegra.
- Coberturas materializadas.
- F5 no altera asignaciones.
- Reinicio del servidor no altera asignaciones.
- Sala y Raspberry leen el mismo estado.
- Estado heredado corregido mediante flujo administrativo soportado.

**Conclusión técnica:** ARGOS dispone ya de una separación clara entre persistencia, lógica operacional y presentación. Las decisiones de cobertura dejan de depender del cliente y pasan a ser deterministas, persistentes y auditables.
