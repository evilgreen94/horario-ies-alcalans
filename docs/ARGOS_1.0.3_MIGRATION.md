# ARGOS 1.0.3: migración de sustituciones y trazabilidad

La migración `004_substitution_requests_and_traceability.sql` es aditiva. Crea
las solicitudes y la cola de reconciliación legacy, añade metadatos al historial
y a `audit_log`, y refuerza los triggers de `teacher_assignments`. No elimina
usuarios, perfiles, asignaciones, datasets, historial ni auditoría existentes.

Las filas previas de `app_state.teacher_substitutions` se copian al consultar la
cola de reconciliación. Cada pareja de nombres se conserva como `unresolved`; no
se busca una cuenta por nombre y no se crea ni activa ninguna identidad. La ruta
legacy de lectura se calcula exclusivamente desde `teacher_assignments` activos.

El flujo operativo queda separado por capacidades:

```text
Jefatura crea solicitud
  → pending_provisioning cuando aún no existe una cuenta
  → Superadmin enlaza o provisiona únicamente una identidad teacher
  → Superadmin activa el teacher_assignment temporal
  → el sustituto usa su cuenta propia con el horario efectivo del titular
  → la cuenta y la asignación titular permanecen intactas
```

Los aliases legacy se conservan como `unresolved`, `resolved` u `obsolete`. La
reconciliación exige IDs y fechas explícitos; nunca infiere identidades por el
nombre libre. La escritura de `teacher_substitutions` está retirada y su lectura
es solo una proyección compatible de las asignaciones efectivas.

El historial operativo registra el actor de la sesión y un timestamp del
servidor. La acción de limpiar de Jefatura archiva las entradas en vez de
eliminarlas. `audit_log` permanece separado para eventos de seguridad, solo es
legible por Superadmin y no se borra al archivar el historial operativo.

Antes de activar un dataset, el servidor comprueba las sustituciones. Si falta
en el roster el perfil titular de una sustitución activa, la activación se
bloquea. Si la sustitución ya es histórica, la activación continúa con un
warning explícito.

Antes de aplicar la migración en cualquier entorno operativo se requiere una
copia SQLite coherente y verificada. La aplicación usa `schema_migrations`, por
lo que reiniciar o ejecutar de nuevo la inicialización no repite la migración.

No existe un downgrade SQL seguro porque SQLite no permite retirar estas
columnas sin reconstruir tablas y porque la nueva trazabilidad debe conservarse.
El rollback consiste en detener la aplicación, conservar una copia de la base
migrada para análisis y restaurar conjuntamente el binario anterior y la copia
SQLite verificada tomada antes de migrar. Nunca debe ejecutarse un binario 1.0.2
contra una base ya usada por 1.0.3 sin validar antes esa compatibilidad en una
copia aislada.
