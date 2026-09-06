# Hoja de ruta mínima 2026/27

Objetivo: llegar a una operación diaria fiable sin ampliar alcance ni rediseñar
la aplicación.

Estado global actual: **NOT READY — 78% preparado para producción**.

## P0 — bloquea producción segura

### P0.1 Fijar Node a loopback

`server/app.js` usa actualmente `app.listen(PORT)` y no garantiza
`127.0.0.1:3000`. El release de producción debe fijar explícitamente el host y
tener una prueba que lo demuestre. Tras arrancar, `ss -ltnp` no puede mostrar
`0.0.0.0:3000` ni `[::]:3000`.

Criterio de salida:

- Node escucha solo en `127.0.0.1:3000`.
- Nginx es la única entrada LAN por `:80`.
- healthcheck directo y vía Nginx responden.

### P0.2 Ensayar migración y rollback con una copia representativa

Ejecutar el release final sobre una copia SQLite reciente de producción, nunca
sobre la base real durante el ensayo. Verificar antes y después:

- `PRAGMA quick_check` devuelve `ok`;
- `PRAGMA foreign_key_check` no devuelve filas;
- aparecen las migraciones 001 y 002;
- login legacy, lectura y escritura operativa siguen funcionando;
- el backup completo puede restaurarse;
- volver al código y DB anteriores funciona.

Criterio de salida: acta de ensayo con commit, copia usada, resultados y tiempos.

### P0.3 Aprobar el dataset 2026/27 y su vía de importación

El PDF provisional es estructuralmente válido: 88/88 docentes, 2.059 sesiones,
157 guardias, 2 breaks, 156 sesiones P7, cero duplicados y cero anomalías. Aún
contiene 335 sesiones `other` agrupadas en 33 etiquetas.

Jefatura debe revisar esas 33 etiquetas y confirmar cuáles representan actividad
ocupada no cubrible. En especial: `COMPLEMENTARIAS AUTORIZADAS`, jefaturas de
departamento, funciones directivas, `LECTIVAS AUTORIZADAS` y mantenimiento.

Si el XML se retrasa, el PDF puede usarse provisionalmente solo cuando:

- Jefatura apruebe la semántica `other`;
- se repita la validación con las huellas de los ficheros aprobados;
- se ensaye el procedimiento de base de trabajo del runbook;
- el dataset llegue a producción como `validated`, nunca ya activo;
- se inspeccione antes de la activación.

El CLI actual bloquea deliberadamente la DB operativa. No se debe eludir esa
protección. El camino mínimo es preparar una copia SQLite durante una ventana sin
escrituras, importarla y validarla fuera de la ruta operativa y sustituir la DB de
forma reversible, tal como describe el runbook. Si ese ensayo no se aprueba, se
necesita un comando de importación de producción dedicado antes del lanzamiento.

### P0.4 Verificar infraestructura y entorno reales

En el Ubuntu real confirmar:

- proceso único bajo PM2; la unidad systemd de la aplicación no está activa a la
  vez;
- cwd, usuario y variables de entorno correctos;
- Nginx válido y proxy a loopback;
- espacio suficiente para aplicación, staging y al menos tres copias SQLite;
- `sqlite3`, Node y dependencias nativas compatibles;
- timers de backup instalados y último backup restaurable;
- secreto de sesión y credenciales iniciales fuera del repositorio.

### P0.5 Smoke manual antes de abrir el servicio

La aceptación del riesgo visual permitió cerrar los commits, pero no autoriza el
despliegue sin prueba manual. Rafa debe completar en Chrome la lista de
`DEPLOYMENT_RUNBOOK.md` con `/app/` y `guardias.html`, primero en local aislado y
después en la ventana de lanzamiento.

## P1 — alrededor del lanzamiento

1. **Piloto de cuentas individuales.** Crear solo un grupo pequeño de usuarios,
   entregar credenciales por canal seguro y verificar cambio de contraseña. No
   crear 88 cuentas de golpe.
2. **Procedimiento de sustituciones.** Documentar la doble actualización actual:
   mapa de sustitución de `guardias.html` y `teacher_assignments` para `/app/`.
   Si los sustitutos usarán `/app/` desde el primer día, este punto pasa a P0.
3. **Provisionamiento operativo.** Añadir o aprobar un comando administrativo
   específico para usuarios/asignaciones, con auditoría y confirmación explícita;
   no usar el helper local contra producción.
4. **Activación controlada.** Usar superadmin, backup inmediatamente anterior,
   ID exacto y comprobación de varios docentes. La ruta de activación debería
   recibir la misma protección explícita de origen que otras escrituras sensibles.
5. **Backups reales.** Ejecutar manualmente los tres niveles, verificar permisos,
   retención, `quick_check` y una restauración fuera de producción.
6. **Curso nuevo.** Revisar si `alumnos_fuera_aula` y `grupos_estado` deben
   reiniciarse al cambiar de curso; el script actual no los borra.
7. **Aclarar backup JSON.** Mantenerlo, si se necesita, como snapshot operativo
   parcial; el rollback oficial debe ser siempre SQLite completo.
8. **Piloto gradual.** Un día con Jefatura y 3–5 docentes, incluyendo una guardia,
   un tramo libre, un recreo y, si existe, una sustitución real controlada.

## P2 — útil después de estabilizar el lanzamiento

- Comando dedicado y auditable para importar censo/datasets sin copia manual de
  DB, manteniendo importación y activación separadas.
- Comando soportado para volver a activar un dataset archivado, con validación y
  backup, evitando restaurar toda la DB por un error de activación.
- Unificar progresivamente el mapa operativo de sustituciones con las asignaciones
  docentes sin cambiar el contrato visible durante el curso.
- Monitorización de espacio, backups, errores HTTP, reinicios PM2 y crecimiento de
  SQLite.
- Rotación/retención documentada de logs y auditoría.
- Sustituir el parser XML provisional por el adaptador del XML definitivo cuando
  se reciba, conservando el modelo canónico.
- Pruebas automatizadas con reloj controlable para todos los estados temporales de
  `/app/`.

## P3 — cosmético o futuro

- PWA y uso offline.
- Web Push/notificaciones.
- Rediseño visual, animaciones y transiciones.
- Tarjeta específica de “siguiente actividad” si la lista diaria no resulta
  suficiente en el piloto.
- Mejoras estéticas que no afecten a la operación diaria.

## Secuencia corta recomendada

1. Resolver bind loopback y probarlo.
2. Aprobar las 33 etiquetas `other` y elegir PDF provisional o XML definitivo.
3. Ensayar migración, importación, activación y rollback sobre una copia reciente.
4. Ejecutar smoke local manual completo.
5. Verificar PM2, Nginx, entorno y backups del servidor.
6. Desplegar código con dataset aún `validated`.
7. Hacer smoke de código y confirmar ausencia de fallback.
8. Crear backup preactivación y activar explícitamente.
9. Validar varios docentes y ejecutar piloto reducido.
10. Abrir al uso general solo tras cerrar incidencias P0/P1 del piloto.
