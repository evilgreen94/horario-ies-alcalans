# Disposición del servidor y limpieza futura

> **OPERATIVO / ACTUAL.** Distingue hechos del código de datos aún no observados
> en producción. No autoriza acceso ni limpieza.

## Estados usados

- **CURRENT / VERIFIED IN REPOSITORY:** demostrado por código o archivos versionados.
- **EXPECTED / TO VERIFY ON SERVER:** valor previsto; debe comprobarse físicamente.
- **TARGET:** disposición deseada tras inventario/aprobación.

## Mapa

| Elemento | Ruta/estado | Clasificación |
|---|---|---|
| Release/aplicación | `/srv/guardias/horario-ies-alcalans` | EXPECTED / TO VERIFY |
| SQLite operativa | `$APP/BD/guardias.sqlite` | EXPECTED / TO VERIFY |
| WAL/SHM | `guardias.sqlite-wal`, `guardias.sqlite-shm` junto a DB | CURRENT behavior / TO VERIFY presence |
| Backups | `/var/backups/guardias/{daily,weekly,monthly}` | EXPECTED / TO VERIFY |
| Backups de despliegue | `/var/backups/guardias/deployments` | TARGET / runbook |
| Releases preparados | `/srv/guardias/releases/<sha>` | TARGET / runbook |
| Marca de release | `$APP/.deployed-release` | TARGET / TO VERIFY |
| Logs Node | PM2 del usuario operativo | EXPECTED / TO VERIFY |
| Configuración Nginx | salida de `nginx -T`; ruta concreta desconocida | TO VERIFY |
| Proceso | PM2, nombre `guardias` | EXPECTED / TO VERIFY |
| Unidad app systemd | `deploy/linux/guardias.service` existe en Git | VERIFIED file; deployment unknown |
| Timers backup | `guardias-backup-{daily,weekly,monthly}.timer` | VERIFIED files / TO VERIFY installed |
| Artefactos transferidos | `/tmp/guardias-<sha>.tar.gz` durante ventana | TARGET temporary |

Hechos de código:

- Node escucha en `127.0.0.1` y puerto `PORT`/3000.
- `GUARDIAS_DB_PATH` fija la DB; sin ella el código puede elegir
  `BD/guardias.sqlite` si existe o una ruta de datos del usuario.
- Nginx no está configurado en este repositorio.
- No hay `ecosystem.config.js` de PM2 versionado.
- Existe una unidad systemd alternativa. PM2 y esa unidad no deben ejecutar
  Guardias simultáneamente.

## Disposición objetivo sencilla

```text
/srv/guardias/
├── horario-ies-alcalans/       release operativo
│   ├── .env                    secretos, 600, no Git
│   ├── .deployed-release       SHA exacto
│   ├── BD/
│   │   ├── guardias.sqlite
│   │   ├── guardias.sqlite-wal (solo cuando SQLite lo usa)
│   │   └── guardias.sqlite-shm
│   └── código + node_modules Linux
├── releases/
│   ├── <sha-actual>/
│   └── <sha-anterior-conocido>/
└── staging temporal            vacío fuera de ventanas

/var/backups/guardias/
├── daily/
├── weekly/
├── monthly/
├── deployments/
└── logs/                       solo logs de backup necesarios
```

Nginx debe ser el único servicio LAN en `:80`; Node solo debe aparecer en
`127.0.0.1:3000`.

## Inventario futuro desde el centro

Ejecutar en modo lectura y guardar la salida en una ubicación privada. No mostrar
`.env`.

```bash
date -Is
hostname
id
pwd

sudo find /srv/guardias -xdev -maxdepth 3 -printf '%M %u:%g %s %TY-%Tm-%TdT%TH:%TM %p\n' |
  sort
sudo du -xhd2 /srv/guardias | sort -h

sudo find /var/backups/guardias -xdev -maxdepth 3 -type f -printf '%M %u:%g %s %TY-%Tm-%TdT%TH:%TM %p\n' | sort
sudo du -xhd2 /var/backups/guardias | sort -h

sudo find /tmp /var/tmp -maxdepth 1 -type f \( -name 'guardias-*' -o -name '*.sqlite' -o -name '*.tar.gz' \) -printf '%M %u:%g %s %TY-%Tm-%TdT%TH:%TM %p\n'

find /srv/guardias -xdev -type f \( -name '*.sqlite' -o -name '*.sqlite-wal' -o -name '*.sqlite-shm' -o -name '*.tar' -o -name '*.tar.gz' \) -printf '%M %u:%g %s %TY-%Tm-%TdT%TH:%TM %p\n'

pm2 status
pm2 pid guardias
pm2 logs guardias --lines 100 --nostream
systemctl is-active guardias.service || true
systemctl status nginx --no-pager
sudo nginx -t
sudo nginx -T > /tmp/guardias-nginx-inventory.txt
ss -ltnp

systemctl list-timers 'guardias*' --all
systemctl list-unit-files 'guardias*'
systemctl list-timers 'guardias-backup-*' --all
crontab -l 2>/dev/null | grep -i guardias || true
sudo crontab -l 2>/dev/null | grep -i guardias || true
sudo grep -Rni -- 'guardias' /etc/cron.d /etc/cron.daily /etc/cron.weekly /etc/cron.monthly 2>/dev/null || true

df -h /srv/guardias /var/backups/guardias /tmp /var/tmp
df -i /srv/guardias /var/backups/guardias
journalctl --disk-usage
```

Comprobar release y DB sin secretos:

```bash
APP=/srv/guardias/horario-ies-alcalans
DB=$APP/BD/guardias.sqlite
test -f "$APP/.deployed-release" && cat "$APP/.deployed-release"
git -C "$APP" rev-parse HEAD 2>/dev/null || true
stat "$APP" "$DB" "$DB-wal" "$DB-shm" 2>&1
sqlite3 -readonly "$DB" 'PRAGMA quick_check; PRAGMA foreign_key_check;'
```

Revisar el informe Nginx antes de compartirlo y eliminarlo solo después de
archivar el diagnóstico autorizado.

## Qué no debe acumularse

- tarballs de releases ya instalados sin identificación;
- directorios temporales de despliegues fallidos;
- clones arbitrarios o repositorios completos antiguos;
- copias SQLite sueltas sin fecha, hash o verificación;
- WAL/SHM separados de su DB;
- JSON/JS generados de horarios antiguos;
- logs ilimitados;
- backups fuera de la retención sin clasificación.

Nada de esa lista se borra solo por parecer antiguo.

## Flujo de limpieza obligatorio

```text
inventario → clasificación → backup verificado → aprobación humana → limpieza
```

Conservar siempre:

- release actual y su SHA;
- un release anterior conocido y probado;
- SQLite operativa con sus WAL/SHM actuales;
- backup verificado inmediatamente anterior a la limpieza;
- configuración Nginx, PM2/systemd y timers;
- material necesario para rollback;
- evidencias de un incidente abierto.

### Checklist de una futura sesión

- [ ] Rafa/Joaquín están en el centro o LAN y tienen autorización.
- [ ] Se ejecutó el inventario completo sin imprimir secretos.
- [ ] Cada elemento tiene propietario: KEEP, ARCHIVE o DELETE aprobado.
- [ ] `ops/status.sh` registra estado previo.
- [ ] Se creó `ops/backup.sh` y se verificó también en ruta aislada.
- [ ] Se conoce el proceso PM2 y se descartó doble gestor.
- [ ] Se identificaron release actual y anterior bueno.
- [ ] La lista exacta de borrado fue revisada por otra persona.
- [ ] No incluye DB/WAL/SHM, último backup, configuración o rollback.
- [ ] Se usa `--` y rutas literales verificadas; no globs ambiguos.
- [ ] Tras limpiar se repiten espacio, status, health e integridad.

## Higiene del repositorio

### KEEP

- código runtime, migraciones, tests y scripts `server/scripts` referenciados en
  `package.json`;
- `.env.example`, que contiene solo marcadores y documenta las variables;
- ambos logos usados (frontend e informes PDF), mapa de patio y estilos;
- scripts locales de arranque y unidades/timers de backup;
- adaptador de compatibilidad `/api/schedule/legacy.js`.

### KEEP / DOCUMENT

- `js/data/patio_guardias.js`: runtime, pero su periodo es histórico y fechado;
- `deploy/linux/guardias.service`: alternativa versionada; confirmar si debe
  archivarse cuando PM2 quede verificado como único gestor;
- snapshot JSON de export/restore: parcial, no rollback oficial;
- referencia defensiva `json_profes` en el bloqueo de estáticos: no es una
  dependencia de datos;
- `/BD/` y `.env.local.*`: estado/secretos locales deliberadamente ignorados;
  nunca versionarlos ni confundirlos con fixtures;
- `.codex-main-worktree/`: worktree Git registrado para `main`, no contenido de
  esta rama ni dependencia runtime. No borrarlo recursivamente; retirarlo solo
  con el flujo de `git worktree` y aprobación expresa.

### ARCHIVE CANDIDATE

- `deploy/linux/guardias.service`, si producción usa exclusivamente PM2;
- `server/scripts/back _horarios/opencollection.yml`: colección Bruno vacía,
  sin peticiones y sin referencias.

### DELETE CANDIDATE

Ninguno demostrado con seguridad. Primero confirmar los dos candidatos de
archivo y su uso externo.

### UNKNOWN / REVIEW

- ruta/configuración Nginx real;
- definición y usuario PM2 reales;
- `.obsidian/*.json` y `.vscode/extensions.json`: metadatos de editor sin
  dependencia runtime; decidir si aportan valor compartido antes de archivarlos;
- artefactos y copias presentes solo en producción.
