# Guardias IES Alcalans

> **Documento actual / índice del repositorio.** La entrada operativa y técnica
> canónica es [docs/START_HERE.md](docs/START_HERE.md).

Guardias es la aplicación interna del IES Alcalans para organizar ausencias,
coberturas, tareas del profesorado, guardias ordinarias y obligaciones de patio.
Incluye la interfaz central `guardias.html` y la vista personal móvil `/app/`.

```text
LAN del centro → Nginx :80 → Node/Express 127.0.0.1:3000 → SQLite
```

No se debe asumir acceso remoto desde Internet ni conectividad del servidor con
GitHub. Las rutas, usuarios y servicios reales del servidor deben verificarse en
el propio centro antes de operar.

## Documentación

- [Empezar aquí](docs/START_HERE.md): orientación, seguridad y autoridad.
- [Cómo funciona Guardias](docs/HOW_GUARDIAS_WORKS.md): modelo mental completo.
- [Operaciones](docs/OPERATIONS.md): comprobaciones, backup y reinicio.
- [Incidentes](docs/INCIDENTS.md): recuperación por síntomas.
- [Disposición del servidor](docs/SERVER_LAYOUT.md): rutas verificadas, esperadas
  y pendientes de confirmar.
- [Entrega a otro compañero](docs/HANDOVER.md): guía corta para una urgencia.
- [Runbook de despliegue](DEPLOYMENT_RUNBOOK.md): único procedimiento autorizado
  para despliegue y rollback.
- [Estado](PROJECT_STATUS.md) y [hoja de ruta](ROADMAP_2026-27.md): contexto y
  planificación; no sustituyen a los documentos operativos.

## Desarrollo local

Requisitos: Node.js compatible con el `package-lock.json` y una SQLite de prueba.
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
- `npm run schedule:prepare`: informe/importación a DB `.dev/.test/.tmp.sqlite`.
- `npm run schedule:activate`: activación limitada a DB local aislada.
- `npm run course:reset`: operación destructiva; consultar primero el runbook.

## Persistencia y fuentes

Toda la persistencia backend está en SQLite. `localStorage` solo actúa como estado
de interfaz donde el código lo contempla. Los horarios anuales JSON/JS de cursos
anteriores no son fuente runtime ni fallback.

Los PDF, XML y censos personales son fuentes externas temporales: nunca deben
copiarse al repositorio. Importar un dataset lo deja `validated`; activarlo es una
operación posterior, explícita y transaccional.

## Producción

No desplegar siguiendo instrucciones sueltas de este README. Usar exclusivamente
[DEPLOYMENT_RUNBOOK.md](DEPLOYMENT_RUNBOOK.md), con backup SQLite verificado,
inventario del servidor, aprobación humana y ventana de mantenimiento.
