# Estado real del proyecto Guardias 2026/27

Fecha de auditoría: 6 de septiembre de 2026.

## Resumen ejecutivo

El modelo de datos, la autenticación individual y el horario canónico están
implementados y cubiertos por pruebas automatizadas. El sistema aún no está listo
para producción: falta asegurar que Node escuche solo en loopback, ensayar las
migraciones y la restauración sobre una copia representativa de producción, y
aprobar e importar el dataset 2026/27.

Commit candidato auditado: `b854507af7e1d6bafacc5bac4f66b6b2d0bb31fb` en
`rescue/preproduction-2026-09`. La suite registrada para ese commit pasa 65/65.

Los ficheros externos de censo y PDF no forman parte del repositorio. La base
SQLite operativa y producción no se inspeccionaron ni modificaron durante esta
auditoría.

## Leyenda

- **READY**: implementado y con evidencia automatizada suficiente para su función.
- **IMPLEMENTED / NEEDS MANUAL VALIDATION**: existe y está probado parcialmente,
  pero requiere comprobación real en el servidor o navegador.
- **PROVISIONAL**: utilizable con revisión y límites explícitos; no es la fuente o
  flujo definitivo.
- **PENDING**: necesario pero aún no resuelto o no verificado.
- **OBSOLETE**: retirado como fuente operativa; solo puede quedar historial Git o
  compatibilidad de contrato.

## Inventario por subsistema

| Subsistema | Estado | Evidencia y límites actuales |
|---|---|---|
| Arquitectura LAN → Nginx → Node → SQLite | IMPLEMENTED / NEEDS MANUAL VALIDATION | Express y SQLite están en el repositorio. La configuración Nginx real no está versionada ni se inspeccionó. |
| Nginx | PENDING | Debe verificarse `nginx -T`, el proxy a `127.0.0.1:3000`, cabeceras `Host`/`X-Forwarded-*` y acceso LAN por `:80`. |
| Node/Express | IMPLEMENTED / NEEDS MANUAL VALIDATION | API y estáticos se sirven desde `server/app.js`. `app.listen(PORT)` no fija host y puede escuchar en todas las interfaces. |
| PM2 | IMPLEMENTED / NEEDS MANUAL VALIDATION | El README describe PM2, pero no hay `ecosystem.config.js`. Deben verificarse cwd, entorno, usuario, logs y arranque persistente. Existe además una unidad systemd; no deben operar ambos gestores a la vez. |
| SQLite operativo | READY | WAL, `busy_timeout`, claves foráneas y transacciones serializadas. Toda persistencia backend vigente reside en SQLite. |
| Autenticación legacy | READY | `admin` y `superadmin` conservan login por rol y cookie firmada de 12 horas. Contraseñas scrypt y comparación temporalmente segura. |
| Autenticación individual | READY | Login por usuario activo y roles obtenidos en servidor. Se ignoran roles/IDs enviados por cliente. Cambio de contraseña limitado al propio usuario. |
| Cookies/sesiones | READY | HMAC-SHA256, `HttpOnly`, `SameSite=Lax`, expiración y `Secure` cuando la petición se considera HTTPS. El secreto de sesión es obligatorio. |
| Roles y autorización | READY | `teacher`, `admin` y `superadmin`; escrituras administrativas protegidas. Activación y backups completos requieren `superadmin`. |
| Auditoría | READY | Eventos individuales y cambio de contraseña; redacción recursiva de claves, hashes, salts, cookies, sesiones y tokens. |
| Perfiles docentes | READY | Registros internos por curso, nombre no único e identidades externas separadas. `source_code` se guarda como identidad externa, no como PK. |
| Identidades externas | READY | Clave externa acotada por curso, sistema y formato; integridad entre perfil, curso, roster y sesiones mediante restricciones/triggers. |
| Asignaciones docentes | READY | Titular/sustituto, intervalos, referencia al titular y restricciones contra solapamientos ambiguos. |
| Resolución de identidad activa | READY | Determinista por fecha; prioriza sustituto, respeta expiración, curso, usuario y perfil activos. |
| Flujo operativo de sustituciones | PROVISIONAL | El resolver individual usa `teacher_assignments`; `guardias.html` mantiene además el mapa operativo `teacher_substitutions` en `app_state`. No existe una operación única que actualice ambos. |
| Cursos académicos | READY | Estados `preparation`, `active`, `archived`; una única anualidad activa. Usuarios persisten entre cursos y perfiles/asignaciones son anuales. |
| Dataset horario canónico | READY | Periodos dinámicos, breaks explícitos, sesiones `class`, `guardia`, `meeting`, `other`, versiones y huella reproducible. |
| Estados y activación del dataset | READY | `draft`, `validated`, `active`, `archived`; importación no activa y activación superadmin explícita/transaccional. No hay fallback silencioso. |
| Adaptador PDF 2026/27 | PROVISIONAL | Extrae el PDF concreto por coordenadas y plantilla horaria 2026/27. Estructuralmente válido; quedan 335 actividades `other` para revisión humana. |
| Importador XML anual | PROVISIONAL | Importa por `source_code`, admite nombres duplicados y rechaza contradicciones. El parser y la plantilla son específicos del formato provisional 2026/27. |
| Importación de perfiles en producción | PENDING | La librería existe, pero no hay un comando de producción dedicado. Los scripts suministrados bloquean deliberadamente la base operativa. |
| Activación en producción | IMPLEMENTED / NEEDS MANUAL VALIDATION | Existe API `POST /api/schedule/datasets/:id/activate`; no hay interfaz de activación. El CLI incluido solo admite bases dev/test/tmp. |
| `guardias.html` | IMPLEMENTED / NEEDS MANUAL VALIDATION | Conserva el contrato funcional y consume el adaptador canónico. Falta el smoke visual manual completo con datos 2026/27. |
| Adaptador canónico → legacy | READY | Genera `{nombre, horario, guardias}` y periodos desde SQLite; conserva `sourceCode`. Sin dataset activo muestra error visible. |
| `/app/` | IMPLEMENTED / NEEDS MANUAL VALIDATION | Login individual, identidad, estado actual, detalle y lista diaria, logout. La lista permite ver el siguiente tramo, pero no hay tarjeta separada de “siguiente actividad”. |
| Backups SQLite | READY | `.backup` consistente, descarga superadmin y verificación `quick_check`; pruebas cubren copia/restauración completa. |
| Timers de backup | IMPLEMENTED / NEEDS MANUAL VALIDATION | Unidades diaria/semanal/mensual y retención. Deben verificarse instalación, ejecución, permisos, espacio y restaurabilidad en Ubuntu. |
| Backup/restore JSON | PROVISIONAL | Snapshot operativo heredado. No incluye cuentas ni modelo horario completo y no debe usarse como rollback de despliegue. |
| Reset de curso | IMPLEMENTED / NEEDS MANUAL VALIDATION | Crea y verifica archivo SQLite, limpia varias colecciones y archiva curso/dataset activos. Debe revisarse manualmente el tratamiento deseado de `alumnos_fuera_aula` y `grupos_estado`. |
| Migración 001 | READY | Aditiva; crea usuarios, roles, perfiles, asignaciones y auditoría sin retirar autenticación heredada. |
| Migración 002 | IMPLEMENTED / NEEDS MANUAL VALIDATION | Añade anualidad, identidades y horario canónico. La ejecución está controlada por `schema_migrations`; falta ensayo sobre copia representativa de producción. |
| Tests | READY | 65/65: auth, permisos, sustituciones, migraciones, SQLite, importación, activación, backup/restore, HTTP y robustez frontend. |
| Prueba visual integrada | PENDING | El navegador integrado no estaba disponible. El riesgo se aceptó para los commits, no para el despliegue. |
| Persistencia JSON/JS 2025/26 | OBSOLETE | Fuentes de profesorado/horario retiradas. Solo queda el contrato `PROFESORADO_SOURCE`, servido dinámicamente desde SQLite. |
| Configuración de patio JS | IMPLEMENTED / NEEDS MANUAL VALIDATION | `js/data/patio_guardias.js` sigue siendo configuración frontend, no persistencia backend. |

## Auditoría del PDF provisional 2026/27

Informe regenerado en modo solo lectura con los ficheros externos disponibles:

| Métrica | Resultado |
|---|---:|
| Docentes en censo | 88 |
| Páginas docentes detectadas | 88 |
| Docentes enlazados por `source_code` | 88 |
| Docentes ausentes del PDF | 0 |
| Sesiones totales | 2.059 |
| `class` | 1.235 |
| `guardia` | 157 |
| `meeting` | 332 |
| `other` | 335 |
| Etiquetas distintas dentro de `other` | 33 |
| Periodos | 9 |
| Breaks explícitos | 2 |
| Sesiones en P7 | 156 |
| Anomalías estructurales | 0 |
| Duplicados docente/día/periodo | 0; la validación canónica los rechaza |

Las mayores etiquetas `other` son `COMPLEMENTARIAS AUTORIZADAS` (159),
`JEFE-DIRECIÓN DE DEPART. DIDÁCTIC` (44), `FUNCIONES DIRECTIVAS (L)` (31),
`LECTIVAS AUTORIZADAS` (9) y `MANTENIMIENTO DE EQUIPOS` (9). Que una celda sea
`other` no la convierte en libre: ocupa el tramo en `/app/`, pero no se trata como
clase cubrible en la lógica de guardias. Jefatura debe confirmar que esa semántica
es correcta para las 33 etiquetas antes de activar el PDF.

## Riesgos conocidos

1. **Exposición directa de Node:** el código no asegura todavía el bind a
   `127.0.0.1`; Nginx no debe ser solo una convención.
2. **Despliegue sin dataset activo:** al retirarse el fallback 2025/26,
   `guardias.html` mostrará indisponibilidad hasta activar un dataset canónico.
3. **Importación operativa:** los CLI actuales protegen la base real; hace falta
   ensayar y aprobar el procedimiento de copia de trabajo/instalación descrito en
   `DEPLOYMENT_RUNBOOK.md` o proporcionar un comando dedicado.
4. **Semántica PDF:** 335 actividades requieren aprobación, aunque no hay errores
   estructurales.
5. **Doble flujo de sustituciones:** la sustitución visible en `guardias.html` y la
   identidad que abre `/app/` se gestionan en estructuras distintas.
6. **Provisionamiento:** no hay UI ni comando de producción para altas iniciales;
   `create-local-teacher.js` está deliberadamente limitado a pruebas.
7. **Infraestructura no observada:** no se ha confirmado el PM2, Nginx, firewall,
   espacio, timers ni `.env` reales.
8. **Rollback de activación:** la API archiva el dataset anterior y no reactiva uno
   archivado; el rollback soportado es restaurar el backup SQLite previo.

## Qué no existe todavía

- PWA, Service Worker o Web Push.
- Interfaz administrativa de usuarios/asignaciones.
- Interfaz de listado/activación de datasets.
- Configuración Nginx o PM2 versionada para el entorno real.
- Importador definitivo del XML real de Peñalara.
- Smoke visual manual de producción/preproducción con el dataset 2026/27.
