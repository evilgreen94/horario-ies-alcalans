# Estado de Guardias 2026/27

> **Documento contextual y de planificación.** Actualizado el 7 de septiembre de
> 2026. Para operar, empezar por [docs/START_HERE.md](docs/START_HERE.md).

## Resumen

La arquitectura, persistencia SQLite, identidad individual, horario canónico,
importadores provisionales y obligaciones de recreo están implementados. La base
de código auditada es `59de86bd42cf8a733777f1516435f7f567e15a77` en
`rescue/preproduction-2026-09`; su suite pasa 77/77.

La fase de código está cerrada. Esto **no equivale a producción lista**: aún se
deben verificar físicamente la infraestructura del servidor, los backups y el
smoke interactivo, además de ejecutar el runbook con aprobación expresa.

Producción y la SQLite operativa no se inspeccionaron ni modificaron durante esta
sesión. No hay constancia en el repositorio de un dataset 2026/27 activo en
producción.

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
| Infraestructura real | **POR VERIFICAR EN EL CENTRO:** PM2, Nginx, usuarios, rutas, firewall, timers y espacio. |
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

1. Jefatura debe definir puestos/rotaciones físicos de patio y el significado
   operativo de `BIBLIOTECA PATI`.
2. Verificar en el servidor: ruta, propietario, usuario PM2, proceso único,
   Nginx, listener, `.env`, timers, backups restaurables y espacio.
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
- Configuración Nginx o PM2 real verificada/versionada.

La priorización actual está en [ROADMAP_2026-27.md](ROADMAP_2026-27.md).
