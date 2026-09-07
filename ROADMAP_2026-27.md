# Hoja de ruta operativa 2026/27

> **Documento de planificación, no procedimiento.** Los comandos autorizados de
> despliegue están en [DEPLOYMENT_RUNBOOK.md](DEPLOYMENT_RUNBOOK.md).

El código base está congelado salvo defecto P0/P1 real. El trabajo pendiente es
principalmente verificación humana, configuración de negocio y lanzamiento
controlado.

## P0 — antes de producción

1. **Inventario del servidor en el centro.** Confirmar rutas, propietarios,
   usuario PM2, ausencia de un segundo gestor, Nginx, listener loopback, espacio,
   timers y backup más reciente. Usar [docs/SERVER_LAYOUT.md](docs/SERVER_LAYOUT.md).
2. **Backup y restauración reales.** Crear una copia SQLite verificada y probar su
   restauración en una ruta aislada, nunca sobre la DB operativa.
3. **Smoke visual manual.** Probar en Chrome `guardias.html` y `/app/`, móvil y
   escritorio, incluyendo roles, recreos, P7 y ausencia de fallback.
4. **Ensayo completo del release.** Artefacto, migración, dataset aún `validated`,
   activación explícita, smoke y rollback sobre copia representativa.
5. **Aprobación de ventana.** No desplegar ni activar hasta que Rafa/Jefatura
   aprueben commit, dataset, backup y plan de vuelta atrás.

## P1 — configuración y piloto

1. Definir puestos y rotación de las 57 `GUÀRDIES PATI`.
2. Decidir el significado y puesto, si lo hubiera, de las cinco
   `BIBLIOTECA PATI`; actualmente están ocupadas y sin puesto.
3. Crear un piloto pequeño de cuentas individuales; no 88 credenciales masivas.
4. Documentar la doble actualización temporal de sustituciones: asignación
   individual en `teacher_assignments` y sustitución visible de la interfaz en
   `app_state.teacher_substitutions`.
5. Validar durante un día real clases, guardias, reuniones, libres, recreos,
   patio, tareas y una sustitución controlada.

## P2 — después de estabilizar

- Comandos administrativos auditables para usuarios, asignaciones e importación
  operativa sin intercambio manual de DB.
- Rollback soportado de activación sin restaurar toda la SQLite.
- Unificar el flujo operativo y de identidad de sustituciones.
- Monitorizar espacio, backups, errores HTTP, logs y reinicios PM2.
- Sustituir el adaptador XML provisional cuando llegue el XML real de Peñalara.
- Revisar la política anual de `grupos_estado` y otros estados que sobreviven al
  reset de curso.

## Fuera del alcance actual

- PWA, Web Push, rediseño visual o exposición a Internet.
- Funcionalidades nuevas antes de cerrar la operación básica.

## Base ya completada

- Node enlazado a `127.0.0.1`.
- Persistencia backend consolidada en SQLite.
- Migraciones independientes del mantenimiento semanal y ensayo de rollback.
- Identidad individual, roles, titular/sustituto y auditoría.
- Datasets canónicos, activación transaccional y error visible sin dataset.
- PDF provisional operativo: 88 docentes, 2.121 sesiones canónicas, 57 guardias
  de patio y cinco obligaciones de biblioteca sin puesto automático.
