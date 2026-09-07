# Guardias: guía de emergencia para otro compañero

> **OPERATIVO / ACTUAL.** Para Joaquín u otra persona con conocimientos básicos
> de Linux, físicamente en el centro o conectada a su LAN.

## 1. ¿Qué es?

Guardias es la aplicación interna del IES Alcalans para horarios, ausencias,
coberturas, tareas y patio. La red entra por Nginx; el proceso Node se llama
`guardias` en PM2 y usa una base SQLite.

No hay acceso remoto desde fuera de la red escolar y no debe suponerse.

## 2. ¿Cómo sé si funciona?

En el servidor:

```bash
cd /srv/guardias/current
bash ./ops/status.sh
```

Un estado sano muestra PM2 activo, Nginx activo, Node en
`127.0.0.1:3000`, dos healthchecks correctos, SQLite `ok`, cero errores FK y
un dataset activo.

## 3. ¿Cómo recojo información?

```bash
bash ./ops/diagnostics.sh
```

Guarda la ruta que muestra al final. Revisa el texto antes de enviarlo y no
adjuntes `.env`, cookies o contraseñas.

## 4. ¿Cómo reinicio solo Guardias?

```bash
bash ./ops/restart.sh
```

El script verifica SQLite, reinicia solo el proceso PM2 y prueba la salud. Si
falla, no reinicies el servidor entero: conserva la salida y escala.

## 5. ¿Dónde está la base?

Ruta esperada:

```text
/var/lib/guardias/guardias.sqlite
```

Confírmala antes con `ops/status.sh`. Los archivos `-wal` y `-shm` junto a
ella forman parte del estado SQLite cuando está abierta.

## 6. ¿Dónde están las copias?

Ruta esperada:

```text
/var/backups/guardias/
```

Puede contener `daily`, `weekly`, `monthly` y `deployments`.

## 7. ¿Cómo creo una copia segura?

```bash
bash ./ops/backup.sh
```

Debe terminar mostrando la ruta, `quick_check=ok`, cero errores FK y SHA-256.
Un fichero a medio crear o no verificado no es backup válido.

## 8. ¿Qué versión está instalada?

```bash
cat /srv/guardias/current/.deployed-release 2>/dev/null
readlink -f /srv/guardias/current
```

El marker identifica el commit y el symlink identifica el directorio instalado;
el release no contiene `.git`.

## 9. ¿Qué no debo borrar?

- `guardias.sqlite`, `guardias.sqlite-wal`, `guardias.sqlite-shm`;
- el último backup verificado;
- `.env`;
- release actual y anterior bueno;
- configuración Nginx, PM2/systemd o timers;
- archivos de un incidente antes de que se analicen.

No ejecutes `course:reset`, migraciones, restore, activación de dataset, limpieza
o `pm2 delete`.

## 10. ¿Qué envío si falla?

- hora y síntoma;
- informe de `ops/diagnostics.sh`;
- SHA de release;
- salida de `ops/status.sh`;
- qué cambió justo antes;
- fecha/ruta del último backup bueno.

No envíes datos del censo, PDF de horarios, contraseñas, cookies, tokens, hashes,
salts ni `.env`.

Para pasos por síntoma: [INCIDENTS.md](INCIDENTS.md). Para entender el sistema:
[HOW_GUARDIAS_WORKS.md](HOW_GUARDIAS_WORKS.md).
