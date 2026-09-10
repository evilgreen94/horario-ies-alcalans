# Incidentes de Guardias

> **OPERATIVO / ACTUAL.** Diagnóstico por síntomas. Ante cualquier duda, recopilar
> información con `ops/diagnostics.sh` y evitar cambios irreversibles.

Supone que se han verificado `APP`, `GUARDIAS_DB_PATH`, `BACKUP_ROOT` y el
usuario PM2 según [SERVER_LAYOUT.md](SERVER_LAYOUT.md).

## El sitio no abre

1. Desde el servidor:

   ```bash
   cd "$APP"
   bash ./ops/status.sh
   curl -v --max-time 5 http://127.0.0.1:3000/api/health
   curl -v --max-time 5 http://127.0.0.1/api/health
   ```

2. Si ambos funcionan, comprobar URL/IP LAN, cable/red y cliente; no abrir puertos.
3. Si Node falla, ir a «Proceso Guardias parado».
4. Si Node funciona y Nginx falla, ir a «Node funciona pero Nginx no».

## Nginx devuelve 502

```bash
systemctl is-active nginx
sudo nginx -t
pm2 pid guardias
ss -ltnp | grep ':3000'
curl -v --max-time 5 http://127.0.0.1:3000/api/health
journalctl -u nginx --since '-15 min' --no-pager
```

- Sin PID/listener: diagnosticar PM2.
- Node sano en 127.0.0.1:3000: comprobar que `proxy_pass` apunta exactamente ahí.
- No cambiar Nginx durante el incidente sin guardar configuración y aprobarlo.

## El proceso Guardias está parado

```bash
pm2 status
pm2 logs guardias --lines 150 --nostream
sqlite3 -readonly "$GUARDIAS_DB_PATH" 'PRAGMA quick_check;'
sqlite3 -readonly "$GUARDIAS_DB_PATH" 'PRAGMA foreign_key_check;'
```

Si SQLite devuelve `ok` y cero filas:

```bash
cd "$APP"
bash ./ops/restart.sh
```

Si el proceso no existe en PM2, no ejecutar un `pm2 start` improvisado. Registrar
usuario, cwd, release y entorno esperado y escalar.

## El login no funciona

```bash
curl -fsS http://127.0.0.1:3000/api/health
date -Is
timedatectl status
pm2 logs guardias --lines 100 --nostream
```

Después comprobar desde el navegador:

- URL servida por Nginx, no `:3000` desde la LAN;
- cookies habilitadas y recarga;
- usuario activo para login individual;
- asignación/perfil solo si el login funciona pero `/app/` no encuentra horario.

No pegar contraseñas, cookies, hashes o `.env` en diagnósticos. No restablecer
credenciales desde SQL durante una incidencia rutinaria.

ARGOS 1.0.2 usa la misma cuenta/sesión en la web normal, el perfil docente,
Jefatura, Administración técnica y `/app/`. Comprobar cada rol por separado:
`admin` no concede Superadmin y `superadmin` no concede Jefatura. El gesto de
siete pulsaciones solo descubre el panel a quien ya tiene permiso; nunca corrige
un problema de autorización. Un login docente correcto sin horario apunta a su
asignación/`source_code` o al dataset, no a la contraseña.

## Falta el horario

```bash
curl -sS -i http://127.0.0.1:3000/api/schedule/active
curl -sS http://127.0.0.1:3000/api/schedule/legacy.js | head -c 300
sqlite3 -readonly -header -column "$GUARDIAS_DB_PATH" "
  SELECT d.id,y.code,d.label,d.status,d.activated_at
  FROM schedule_datasets d
  JOIN academic_years y ON y.id=d.academic_year_id
  ORDER BY d.id;"
```

Un `503` con «No hay un dataset horario activo y validado» es un fallo visible
del estado, no una razón para restaurar datos 2025/26.

## No hay dataset académico activo

1. Confirmar que existe exactamente una versión aprobada `validated`.
2. No activarla por intuición.
3. Reunir ID, curso, etiqueta, formato, huella e informe de validación.
4. Crear backup SQLite verificado.
5. Obtener aprobación de Rafa/Jefatura y seguir las secciones 7–8 del runbook.

No modificar el estado directamente con SQL.

## Horario o dataset equivocado

```bash
sqlite3 -readonly -header -column "$GUARDIAS_DB_PATH" "
  SELECT id,label,source_system,source_format,source_fingerprint,status,
         validated_at,activated_at
  FROM schedule_datasets ORDER BY id;"
```

- Si el incorrecto solo está `validated`: no activarlo; conservarlo para análisis.
- Si ya está activo: detener nuevas escrituras si el impacto es grave y aplicar
  el rollback de activación del runbook usando el backup preactivación.
- No «reactivar» manualmente el anterior con SQL: hay índices y transición
  transaccional que respetar.

## Las guardias de patio parecen incorrectas

Comprobar por separado:

1. dataset activo y periodos B1/B2;
2. obligaciones importadas;
3. configuración fechada `js/data/patio_guardias.js`;
4. cobertura semanal `app_state.patio_guardias`;
5. bloqueos `app_state.patio_teacher_blocks`.

```bash
sqlite3 -readonly -header -column "$GUARDIAS_DB_PATH" "
  SELECT p.period_key,s.session_type,s.label,COUNT(*) AS total
  FROM teacher_schedule_sessions s
  JOIN schedule_periods p ON p.id=s.period_id
  JOIN schedule_datasets d ON d.id=s.dataset_id
  WHERE d.status='active' AND p.period_type='break'
  GROUP BY p.period_key,s.session_type,s.label
  ORDER BY p.period_key,s.label;"
```

En el candidato oficial validado el 10/9 aparecen 57 `guardia_patio`, cinco
`biblioteca_patio` y seis `patio_inclusivo`; una revisión posterior puede tener
recuentos legítimamente distintos. Solo `guardia_patio` espera la futura
rotación; `biblioteca_patio` tiene Biblioteca fija y `patio_inclusivo` no es una
guardia. Ninguno genera cobertura automática por ausencia.

## Falla la integridad SQLite

**STOP. No intentar reparación automática.**

1. Detener Guardias para bloquear escrituras:

   ```bash
   pm2 stop guardias
   ```

2. Registrar rutas, propietario, tamaño, hora y espacio:

   ```bash
   date -Is
   ls -l "$GUARDIAS_DB_PATH" "$GUARDIAS_DB_PATH-wal" "$GUARDIAS_DB_PATH-shm" 2>&1
   df -h "$(dirname "$GUARDIAS_DB_PATH")"
   ```

3. Preservar DB, WAL y SHM. No borrar, copiar parcialmente, sobrescribir ni mover
   sin el procedimiento de incidente aprobado.
4. Ejecutar `ops/diagnostics.sh` si puede hacerlo sin reabrir/modificar la DB.
5. Escalar con la salida exacta y el inventario de backups.

La selección/restauración de una copia está en la sección de rollback del
runbook. Primero se verifica en una ruta nueva.

## Disco casi lleno o lleno

```bash
df -h "$APP" "$BACKUP_ROOT"
df -i "$APP" "$BACKUP_ROOT"
du -xhd1 /srv/guardias /var/backups/guardias /var/log 2>/dev/null | sort -h
journalctl --disk-usage
```

No borrar «lo más grande» a ciegas. Conservar release actual, uno anterior
conocido, DB/WAL/SHM y backup preincidente. Inventariar tarballs, releases, logs y
temporales; obtener aprobación antes de limpiar.

## El backup falla

```bash
cd "$APP"
GUARDIAS_DB_PATH="$GUARDIAS_DB_PATH" BACKUP_ROOT="$BACKUP_ROOT" bash ./ops/backup.sh
df -h "$BACKUP_ROOT"
ls -ld "$BACKUP_ROOT"
journalctl -u guardias-backup-daily.service -n 100 --no-pager
```

No considerar válido un archivo `.tmp` ni una copia sin `quick_check=ok` y FK
vacías. No borrar el último backup bueno para hacer espacio sin aprobación.

## Falla una migración

1. No arrancar la aplicación contra la DB parcialmente migrada.
2. Guardar logs, SHA del release y salida de `schema_migrations`.
3. Preservar DB/WAL/SHM fallidos.
4. Identificar el backup inmediatamente anterior ya verificado.
5. Aplicar «Rollback de migración» del runbook, restaurando código y DB juntos.

```bash
sqlite3 -readonly -header -column "$GUARDIAS_DB_PATH" 'SELECT name,applied_at FROM schema_migrations ORDER BY name;'
```

No marcar migraciones manualmente como aplicadas.

## Node funciona localmente pero no a través de Nginx

```bash
curl -fsS http://127.0.0.1:3000/api/health
curl -v --max-time 5 http://127.0.0.1/api/health
sudo nginx -t
sudo nginx -T | grep -n -A8 -B4 'proxy_pass.*127.0.0.1:3000'
systemctl status nginx --no-pager
journalctl -u nginx --since '-15 min' --no-pager
```

Confirmar permisos de red local, virtual host correcto y cabeceras proxy. No hacer
que Node escuche en `0.0.0.0` para «arreglarlo».

## Qué enviar al escalar

- hora, síntoma y pasos que lo reproducen;
- salida de `ops/diagnostics.sh` revisada;
- SHA de `.deployed-release`;
- estado PM2/Nginx/listener;
- resultados HTTP e integridad;
- ruta y fecha del último backup verificado;
- cambios realizados desde el último estado bueno.

Nunca enviar secretos ni los ficheros de censo/PDF.
