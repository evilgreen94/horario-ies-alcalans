# Estado de Guardias 2026/27

> **Documento contextual y de planificación.** Actualizado el 7 de septiembre de
> 2026. Para operar, empezar por [docs/START_HERE.md](docs/START_HERE.md).

## Resumen

La arquitectura, persistencia SQLite, identidad individual, horario canónico,
importadores provisionales y obligaciones de recreo están implementados en
`rescue/preproduction-2026-09`. La suite actual pasa 78/78; el caso adicional
protege el opt-in explícito de los comandos operativos de dataset.

La fase de código está cerrada salvo defectos de despliegue. El procedimiento
seleccionado es un **redeploy limpio controlado** mediante artefacto Linux
offline; no se actualizará incrementalmente el checkout contaminado.

Producción se inspeccionó en modo lectura el 7-09-2026 y no se modificó. La
SQLite operativa legacy permanece intacta y no hay dataset 2026/27 activo.

## Estado técnico

| Área | Estado comprobado en repositorio |
|---|---|
| Node/Express | Bind fijo a `127.0.0.1`; puerto por `PORT`, 3000 por defecto. |
| SQLite | WAL, FK, timeout, transacciones, migraciones 001/002 y backup consistente. |
| Migraciones | Ensayadas sobre base heredada representativa; `db:init` no ejecuta mantenimiento semanal. |
| Autenticación | Sesiones legacy e individuales, roles servidor, scrypt, cambio de clave propia y auditoría. |
| Identidad docente | Usuario persistente; perfil/asignación/identidad externa por curso; `source_code` no es PK. |
| Horario canónico | Periodos dinámicos, breaks explícitos y datasets versionados `draft/validated/active/archived`. |
| Compatibilidad | SQLite canónica → adaptador → `PROFESORADO_SOURCE` → `guardias.html`; sin fallback 2025/26. |
| `/app/` | Vista personal autenticada con estados clase/guardia/reunión/otra/libre/recreo/patio/fuera. |
| Patio | Obligaciones PDF integradas sin inventar puesto y fusionadas con configuración explícita. |
| Producción auditada | `rafa`, PM2 `guardias`, `pm2-rafa.service`, Nginx `:80 → localhost:3000`, app/DB legacy bajo `/srv/guardias/horario-ies-alcalans`. |
| Riesgo producción | Node expuesto en `*:3000`, checkout no reproducible, WAL activo y sin backup periódico Guardias verificado. |
| Destino | Releases por SHA + `current`; DB `/var/lib/guardias`; entorno `/etc/guardias`; backups `/var/backups/guardias`. |
| Validación visual | Pendiente de smoke manual antes de producción; navegador integrado no disponible. |

## Dataset PDF provisional aprobado operativamente

Fuente externa no versionada. Resultado reproducible del adaptador 2026/27:

| Métrica | Total |
|---|---:|
| Docentes enlazados por `source_code` | 88/88 |
| Sesiones lectivas/operativas | 2.059 |
| Clases | 1.290 |
| Guardias en periodo lectivo | 157 |
| Reuniones | 332 |
| Otras actividades en periodo lectivo | 280 |
| `GUÀRDIES PATI` | 57 |
| `BIBLIOTECA PATI` | 5 |
| Total canónico, incluyendo recreos con obligación | 2.121 |
| Periodos / breaks explícitos | 9 / 2 |
| Duplicados docente/día/periodo | 0 |
| Anomalías estructurales | 0 |

Toda sesión u obligación significa ocupado. Las cinco `BIBLIOTECA PATI` siguen
sin puesto físico automático; la existencia del puesto `0.1` no determina su
significado. Las 57 `GUÀRDIES PATI` tampoco reciben puestos inventados.

## Decisiones y verificaciones pendientes reales

1. Jefatura debe definir puestos/rotaciones físicos de patio, `PATIS INCLUSIUS`,
   `BIBLIOTECA PATI` y el efecto de ausencias/sustituciones en patio.
2. Ejecutar en la ventana el preflight, backup fuera del servidor, migración,
   cambio PM2/Nginx y timers del runbook.
3. Ejecutar smoke visual manual de `guardias.html` y `/app/` con el dataset
   aprobado antes de abrir el servicio.
4. Aprobar el procedimiento de importación/instalación/activación en producción.
5. Definir el alta gradual de cuentas y el procedimiento doble de sustituciones
   mientras `teacher_assignments` y `teacher_substitutions` sigan separados.
6. Confirmar el XML definitivo de Peñalara cuando llegue; debe alimentar el mismo
   modelo canónico.

## No implementado

- PWA, trabajo offline o Web Push.
- Gestión administrativa completa de usuarios/asignaciones.
- Importador del XML real definitivo aún no recibido.
- Acceso remoto desde Internet.

La priorización actual está en [ROADMAP_2026-27.md](ROADMAP_2026-27.md).
