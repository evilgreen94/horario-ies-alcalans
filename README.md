# ARGOS · Guardias IES Alcalans

> **Documento actual / índice del repositorio.** La entrada operativa y técnica
> canónica es [docs/START_HERE.md](docs/START_HERE.md).

ARGOS / A.R.G.O.S es el producto interno del IES Alcalans; no tiene una expansión
oficial aprobada. Guardias es su módulo actual para organizar ausencias,
coberturas, tareas del profesorado, guardias ordinarias y obligaciones de patio.
Incluye la interfaz central `guardias.html` y la vista personal móvil `/app/`.

ARGOS 1.0.2 es la línea candidata actual, construida sobre el cierre aceptado de
ARGOS 1.0.1. Una única cuenta y sesión
individual sirve la web normal, el perfil docente, Jefatura, Administración
técnica y `/app/`. Los roles `teacher`, `admin` y `superadmin` son independientes:
`superadmin` no concede `admin`. La identidad docente se enlaza por `source_code`,
nunca por el nombre visible.

```text
LAN del centro → Nginx :80 → Node/Express 127.0.0.1:3000 → SQLite
```

El servidor no depende de Internet/GitHub para desplegar. El inventario legacy
está documentado y el objetivo es un redeploy limpio por artefacto Linux.

## Documentación

- [Empezar aquí](docs/START_HERE.md): orientación, seguridad y autoridad.
- [Cómo funciona Guardias](docs/HOW_GUARDIAS_WORKS.md): modelo mental completo.
- [Operaciones](docs/OPERATIONS.md): comprobaciones, backup y reinicio.
- [Incidentes](docs/INCIDENTS.md): recuperación por síntomas.
- [Disposición del servidor](docs/SERVER_LAYOUT.md): rutas verificadas, esperadas
  y pendientes de confirmar.
- [Entrega a otro compañero](docs/HANDOVER.md): guía corta para una urgencia.
- [Smoke manual](docs/MANUAL_SMOKE_CHECKLIST.md), [auditoría de seguridad](docs/SECURITY_AUDIT_CHECKLIST.md)
  y [carga](docs/LOAD_TEST_PLAN.md): validaciones posteriores al RC.
- [Runbook de despliegue](DEPLOYMENT_RUNBOOK.md): único procedimiento autorizado
  para despliegue y rollback.
- [Estado](PROJECT_STATUS.md) y [hoja de ruta](ROADMAP_2026-27.md): contexto y
  planificación; no sustituyen a los documentos operativos.

## Desarrollo local

Requisitos: Node.js `>=22.9 <23`, npm 10/11 y una SQLite de prueba.
No usar `BD/guardias.sqlite` para desarrollo.

```powershell
Set-Location 'C:\Users\usuario\Documents\GitHub\horario-ies-alcalans'
.\start-local.ps1
```

El script carga `.env.local.ps1`, que debe permanecer fuera de Git. Para validar:

```powershell
npm.cmd test
git diff --check
```

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
