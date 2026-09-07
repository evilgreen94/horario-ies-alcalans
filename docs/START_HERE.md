# Empezar aquí

> **AUTORITATIVO / ACTUAL.** Entrada canónica para una persona mantenedora o un
> asistente de programación. Revisado el 7 de septiembre de 2026.

## Qué es y dónde encaja

Guardias es el servicio interno del IES Alcalans para horarios docentes,
ausencias, coberturas, tareas, guardias ordinarias, patio y consulta personal.

```text
red local del centro
        │
     Nginx :80
        │ proxy
Node/Express 127.0.0.1:3000
        │
      SQLite
```

- Release objetivo: `/srv/guardias/current` → `releases/<sha>`.
- SQLite objetivo: `/var/lib/guardias/guardias.sqlite`.
- Backups: `/var/backups/guardias`.
- Proceso: PM2 de `rafa`, nombre `guardias`.
- Nginx recibe las conexiones LAN y es el único frontal de red.
- PM2 mantiene Node en ejecución y permite consultar logs/reiniciarlo.

El inventario de lectura del 7-09-2026 confirmó el estado legacy bajo
`/srv/guardias/horario-ies-alcalans`, PM2 y Nginx. Ese checkout está contaminado
y Node escucha en todas las interfaces: el próximo cambio será el redeploy limpio
del runbook, no un upgrade incremental.

El primer comando ante un fallo es:

```bash
cd /srv/guardias/current
bash ./ops/status.sh
```

Si la ruta no existe o el script no puede ejecutarse, no adivines: sigue
[HANDOVER.md](HANDOVER.md) y registra `pwd`, `ls -la /srv/guardias`,
`pm2 status` y `systemctl status nginx --no-pager`.

Después lee:

- [HOW_GUARDIAS_WORKS.md](HOW_GUARDIAS_WORKS.md) para entender el sistema.
- [OPERATIONS.md](OPERATIONS.md) para trabajo cotidiano.
- [INCIDENTS.md](INCIDENTS.md) si hay una avería.
- [../DEPLOYMENT_RUNBOOK.md](../DEPLOYMENT_RUNBOOK.md) solo para despliegue o rollback.

## NEVER DO THIS WITHOUT UNDERSTANDING THE CONSEQUENCES

- Exponer Node directamente a la LAN o a Internet.
- Abrir puertos públicos para Guardias o saltarse Nginx.
- Suponer que existe acceso remoto desde fuera del centro.
- Borrar, reemplazar o reparar SQLite sin un backup verificado.
- Borrar `guardias.sqlite-wal` o `guardias.sqlite-shm` a ciegas.
- Ejecutar `npm run course:reset` como mantenimiento rutinario.
- Activar un dataset que no esté `validated` y aprobado.
- Inferir identidad docente a partir de `display_name`.
- Usar el horario de un curso anterior como fallback.
- Confiar en roles, usuarios o perfiles enviados por el cliente.
- Ejecutar migraciones en producción sin backup, `quick_check`,
  `foreign_key_check` y plan de rollback.
- Imprimir o compartir `.env`, cookies, tokens, hashes, salts o contraseñas.

**No hay acceso remoto desde fuera de la red escolar y no debe asumirse.** Una
intervención puede requerir que un compañero esté físicamente en el centro o
conectado a su LAN.

## Qué documento gana si hay contradicción

1. Código actual y migraciones.
2. `AGENTS.md` para seguridad y proceso de agentes.
3. `docs/HOW_GUARDIAS_WORKS.md` para el modelo del sistema.
4. `DEPLOYMENT_RUNBOOK.md` para despliegue, migración y rollback.
5. `docs/OPERATIONS.md` y `docs/INCIDENTS.md` para mantenimiento.
6. `PROJECT_STATUS.md` y `ROADMAP_2026-27.md` para estado y planificación.

Durante la ventana, cualquier dato que difiera del inventario obliga a detenerse
y actualizar el runbook antes de seguir.
