# Disposición del servidor y plan de limpieza

> **OPERATIVO / ACTUAL.** Inventario realizado en lectura el 7 de septiembre de
> 2026. No autoriza cambios ni limpieza.

## Estado legacy verificado

| Elemento | Estado observado |
|---|---|
| SO/arquitectura | Ubuntu Linux x86_64; kernel 6.8 observado |
| glibc | Versión instalada no inventariada; mínimo del release: 2.34. El gate de build se validó hasta un máximo admitido de 2.35, que no es el mínimo productivo. |
| Usuario runtime | `rafa` (`HOME=/home/rafa`) |
| Aplicación | `/srv/guardias/horario-ies-alcalans` |
| SQLite | `$APP/BD/guardias.sqlite`, legacy, sin `schema_migrations` |
| WAL/SHM | WAL activo y más nuevo/grande que la DB; preservar el trío |
| PM2 | proceso `guardias`, cwd/app legacy, `PM2_HOME=/home/rafa/.pm2` |
| Persistencia PM2 | `/etc/systemd/system/pm2-rafa.service`, enabled/active, `pm2 resurrect` |
| Nginx | `/etc/nginx/sites-enabled/guardias` → `sites-available/guardias` |
| Proxy | `listen 80`, `server_name _`, `proxy_pass http://localhost:3000` |
| Listener Node | `*:3000` — debe corregirse mediante el nuevo release |
| Backups | sin timer/cron Guardias verificado; una copia antigua no basta |
| Git | HEAD legacy `d5790d1`; checkout modificado y no reproducible |

La aplicación contiene copias históricas de `.pm2`, `.npm`, `.ssh`, `.local`,
`.config`, `.cache` y `.bash_history`, aunque el HOME real es `/home/rafa`. Ese
directorio se usó como HOME en el pasado. Nada de ello debe copiarse al release.

El tarball root-owned `/srv/guardias/guardias-predeploy-2026-09-04.tar.gz`
incluye `.env`, una clave privada SSH, PM2/logs y DB/WAL/SHM. Debe conservarse
restringido solo durante rollback y obliga a rotar secretos/claves tras el
redeploy. No abrir ni publicar su contenido.

## Disposición objetivo

ARGOS 1.0.2 es el candidato actual para esta disposición; aún no está instalado
en producción. Su artefacto está vinculado al commit
`ccb2f7a88fbf9815c13df501d1aa972d31384129`. Los tags y artefactos congelados
`argos-v1.0.1-rc1` y `argos-v1.0-rc1` no se modifican.

```text
/srv/guardias/
├── releases/
│   ├── <sha-actual>/           código + node_modules Linux + marker
│   └── <sha-anterior>/
├── current -> releases/<sha-actual>
└── horario-ies-alcalans/       legacy congelado hasta cerrar piloto

/var/lib/guardias/
├── guardias.sqlite
├── guardias.sqlite-wal         solo mientras SQLite lo necesite
└── guardias.sqlite-shm

/etc/guardias/
└── guardias.env                rafa:rafa, 0600

/var/backups/guardias/
├── daily/                      retención 14
├── weekly/                     retención 8
├── monthly/                    retención 12
└── deployments/                backups de la ventana/rollback
```

PM2 ejecuta `/srv/guardias/current/deploy/linux/start-guardias.sh` con cwd
`/srv/guardias/current`. Nginx es el único listener LAN y proxifica a
`127.0.0.1:3000`. La unidad alternativa `guardias.service` no se instala ni se
activa junto con PM2.

## Qué se conserva en el redeploy

- dump PM2 y configuración Nginx previos;
- release legacy completo, sin usarlo como fuente del release nuevo;
- DB/WAL/SHM congelados después de detener escritores;
- backup SQLite coherente previo al redeploy, copiado fuera del servidor;
- backup previo a la importación y previo a la activación;
- hashes, recuentos y resultados de integridad.

## Qué nunca pasa al release nuevo

- `.git`, `.env`, `.ssh`, `.pm2`, `.npm`, cachés, HOME o historial shell;
- `BD/`, SQLite, WAL/SHM, backups y tarballs antiguos;
- PDF/censo/XML externos o datos personales;
- exportaciones de credenciales o contraseñas temporales de aprovisionamiento;
- `json_profes` y datasets 2025/26 retirados;
- `node_modules` Windows, tests, temporales o metadatos de editor.

## Limpieza posterior, nunca automática

```text
inventario → clasificación → backup verificado → aprobación → limpieza
```

Solo tras el piloto se decidirá qué archivar/borrar. Conservar al menos el
release actual, uno anterior bueno, la DB operativa, el último backup verificado,
Nginx/PM2/timers y toda evidencia de incidente. No borrar WAL/SHM separados ni
la única copia de ningún estado.

El procedimiento exacto, incluida la reversión, está en
[DEPLOYMENT_RUNBOOK.md](../DEPLOYMENT_RUNBOOK.md).

## Higiene del repositorio

- `BD/` y `.env.local.*` están ignorados y no son fixtures.
- `.codex-main-worktree/` es otro worktree Git; no es runtime y no se borra con
  operaciones recursivas.
- `js/data/patio_guardias.js` es un contenedor runtime vacío; la rotación aprobada
  se cargará por periodo y `source_code`, sin datos históricos embebidos.
- `json_profes` solo permanece como nombre defensivo en el bloqueo HTTP; no es
  dependencia runtime.
- `deploy/linux/guardias.service` es alternativa documentada, no el gestor
  seleccionado.
- No hay candidatos de borrado del repositorio demostrados en esta fase.
