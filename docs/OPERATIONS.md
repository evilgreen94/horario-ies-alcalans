# Operaciones de Guardias

> **OPERATIVO / ACTUAL.** Referencia diaria. No sustituye al
> [runbook de despliegue](../DEPLOYMENT_RUNBOOK.md).

Los ejemplos usan las rutas esperadas de los archivos versionados:

```bash
export APP=/srv/guardias/current
export GUARDIAS_DB_PATH=/var/lib/guardias/guardias.sqlite
export BACKUP_ROOT=/var/backups/guardias
export PM2_PROCESS=guardias
```

El inventario confirmó `PM2_USER=rafa`. Los scripts no cargan el entorno secreto
ni muestran sus valores. Durante el redeploy, confirmar que `current` y la DB
resuelven exactamente a las rutas aprobadas.

## SAFE / READ-ONLY

### Estado general

```bash
cd "$APP"
bash ./ops/status.sh
echo "exit=$?"
```

El script devuelve distinto de cero si falla un control crítico. Comprueba
release, PM2, Nginx, listener, HTTP, SQLite, espacio, backup, curso y dataset.

### Diagnóstico para compartir

```bash
cd "$APP"
bash ./ops/diagnostics.sh
```

Genera un texto con permisos restrictivos bajo
`/tmp/guardias-diagnostics` (o `DIAGNOSTICS_DIR`). Revisa aun así el informe
antes de compartirlo: la redacción automática reduce secretos conocidos, pero no
puede reconocer cualquier dato sensible inventado en un comentario de usuario.

### PM2

```bash
pm2 pid guardias
pm2 status
pm2 logs guardias --lines 100 --nostream
```

Si PM2 usa otra cuenta:

```bash
sudo -iu '<usuario-pm2-verificado>' pm2 status
```

No ejecutar `pm2 describe` en un informe público sin revisar su salida: puede
mostrar metadatos de entorno.

### Nginx

```bash
systemctl is-active nginx
sudo nginx -t
sudo nginx -T | grep -n -E 'server_name|listen|proxy_pass'
journalctl -u nginx --since '-30 min' --no-pager
```

`nginx -T` puede contener nombres internos; conservarlo como diagnóstico
privado.

### Listener Node

```bash
ss -ltnp | grep ':3000'
```

Resultado permitido: `127.0.0.1:3000`. `0.0.0.0:3000`, `*:3000` o
`[::]:3000` es un fallo de seguridad.

### HTTP

```bash
curl -fsS http://127.0.0.1:3000/api/health
curl -fsS http://127.0.0.1/api/health
```

La primera URL prueba Node directo; la segunda prueba Nginx local. Para probar
desde otro equipo de la LAN usar la URL interna **verificada**, no una IP copiada
de documentación antigua.

### SQLite e integridad

```bash
test -f "$GUARDIAS_DB_PATH"
sqlite3 -readonly "$GUARDIAS_DB_PATH" 'PRAGMA quick_check;'
sqlite3 -readonly "$GUARDIAS_DB_PATH" 'PRAGMA foreign_key_check;'
```

Resultado correcto: `ok` en la primera y ninguna fila en la segunda.

Estado del curso/dataset:

```bash
sqlite3 -readonly -header -column "$GUARDIAS_DB_PATH" "
  SELECT id,code,status,starts_on,ends_on FROM academic_years ORDER BY id;
  SELECT id,label,source_format,status,validated_at,activated_at
  FROM schedule_datasets ORDER BY id;"
```

### Release instalado

```bash
test -f "$APP/.deployed-release" && cat "$APP/.deployed-release"
git -C "$APP" rev-parse HEAD 2>/dev/null || true
```

`.deployed-release` es la referencia del despliegue por artefacto. Un checkout
Git local es solo una segunda evidencia.

### Backups, disco y memoria

```bash
find "$BACKUP_ROOT" -type f -name '*.sqlite' -printf '%T@ %TY-%Tm-%Td %TH:%TM %p\n' |
  sort -n | tail -1
df -h "$APP" "$BACKUP_ROOT"
df -i "$APP" "$BACKUP_ROOT"
free -h
```

Que exista un fichero no demuestra que sea restaurable: debe haber pasado ambas
comprobaciones SQLite.

### Timers

```bash
systemctl list-timers 'guardias-backup-*' --all
systemctl status guardias-backup-daily.timer --no-pager
journalctl -u guardias-backup-daily.service -n 50 --no-pager
```

## STATE-CHANGING

### Crear un backup manual verificado

```bash
cd "$APP"
bash ./ops/backup.sh
```

Puede definirse `BACKUP_ROOT`; no acepta JSON. Crea la copia mediante
`.backup`, verifica integridad y FK, calcula SHA-256 y solo entonces publica el
fichero final.

### Reiniciar solamente Guardias

```bash
cd "$APP"
bash ./ops/restart.sh
```

Comprueba SQLite antes, reinicia únicamente el proceso PM2 `guardias`, espera
listener/health y falla si no recupera. No reinicia Nginx ni el servidor.

### Parada/arranque controlados

Solo si se entiende la interrupción:

```bash
pm2 stop guardias
pm2 restart guardias
pm2 status
```

No usar `pm2 delete`. Si el proceso no existe, no recrearlo improvisando:
confirmar primero la definición/cwd/entorno real.

## DANGEROUS / REQUIRES RUNBOOK

Estas operaciones exigen [DEPLOYMENT_RUNBOOK.md](../DEPLOYMENT_RUNBOOK.md),
backup verificado y aprobación humana:

- reemplazar SQLite o mover DB/WAL/SHM;
- ejecutar migraciones en producción;
- desplegar/cambiar release o dependencias;
- importar/instalar/activar un dataset;
- restaurar un backup;
- ejecutar `npm run course:reset -- --yes`;
- cambiar Nginx, PM2, firewall, usuarios o permisos;
- limpiar releases, tarballs, logs o backups;
- reactivar un dataset archivado.
- ejecutar la recuperación `security:reset-superadmin` (acceso OS, backup,
  usuario explícito y confirmación exacta; la clave temporal se muestra una vez).

Nunca probar una operación peligrosa directamente en producción. Primero usar una
copia SQLite aislada con sufijo `.test.sqlite` o `.tmp.sqlite`.
