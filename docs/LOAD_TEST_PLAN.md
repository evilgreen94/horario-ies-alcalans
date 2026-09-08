# Plan reproducible de carga de ARGOS

Ejecutar contra el artefacto final en un host aislado, con SQLite temporal y
datos sintéticos. No certificar carga contra producción.

## Escalones

1. kiosco permanente: una lectura/polling sostenida;
2. 15–25 usuarios normales durante 10 minutos;
3. ráfaga de cambio de hora de 60–80 usuarios;
4. pico fuerte de 100;
5. certificación de 150, solo después de superar los anteriores.

La mezcla debe incluir health, horario activo, adaptador legacy, `/app/` y una
proporción pequeña de escrituras legítimas autenticadas en filas distintas. No
reutilizar una cookie entre identidades ni imprimirla.

## Criterios y evidencias

- HTTP 5xx = 0 y SQLite BUSY/LOCKED = 0;
- latencia p50/p95/p99 por ruta y escalón;
- ningún reinicio del proceso; CPU y RAM registrados;
- toda escritura aceptada persiste exactamente una vez;
- al terminar: `PRAGMA quick_check = ok` y `foreign_key_check` vacío.

Conservar configuración del generador, duración, concurrencia, SHA del release y
resumen sin datos personales. Optimizar solo después de medir un cuello real.
