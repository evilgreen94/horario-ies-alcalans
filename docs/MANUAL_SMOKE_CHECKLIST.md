# Smoke manual de ARGOS para Rafa

Marcar cada fila como `PASS`, `FAIL` o `QUESTION`. Esta lista no se considera
superada hasta que Rafa la ejecute contra el RC exacto.

| Área | Comprobación | Resultado |
|---|---|---|
| Auth | Login Superadmin, docente normal, clave errónea y logout | |
| Auth | Reset: clave temporal visible una vez; cambio forzado; sesión antigua inválida | |
| Usuarios | Lista/búsqueda, roles, activar/desactivar, reset y revocación | |
| Secreto | Superadmin nunca ve la clave privada final del usuario | |
| Docente | RMLL y otro docente: actual, siguiente y día completo | |
| Estados | Clase, guardia, reunión, otra, libre, recreo y fuera de horario | |
| Patio | Guardia patio, Biblioteca fija y Patis Inclusius ocupados | |
| Ausencia | Clase cubrible sigue flujo normal | |
| Ausencia | Los tres tipos especiales no generan cobertura/sustituto automático | |
| Persistencia | Guardar, refrescar, cerrar/abrir y reiniciar release local | |
| Persistencia | Distinguir SQLite backend de preferencias `localStorage` | |
| Jefatura | CRUD relevante, cancelar/confirmar y persistencia tras recarga | |
| Móvil | `/app/` en vertical: scroll, ahora/siguiente y acciones clave | |
| Escritorio | `guardias.html` y panel técnico sin roturas visuales | |
| Navegador | Consola sin error y red sin 4xx/5xx inesperados/recursos rotos | |
