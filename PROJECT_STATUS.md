# Estado de ARGOS 2026/27

> Documento contextual. Para operar, empezar por [docs/START_HERE.md](docs/START_HERE.md).

ARGOS / A.R.G.O.S es el producto, sin expansión oficial aprobada; Guardias es el
módulo actual. ARGOS 1.0.1 es el candidato de despliegue en la rama
`feat/argos-1.0.1-unified-web-auth`, desde el ARGOS 1.0 congelado en
`argos-v1.0-rc1`. Producción y su SQLite no se han modificado.

## Estado técnico

| Área | Estado |
|---|---|
| Runtime | Node `>=22.9 <23`, Express en `127.0.0.1`, SQLite con WAL/FK/timeout. |
| Datos | Toda persistencia backend en SQLite; sin fallback anual 2025/26. |
| Migraciones | 001–003; ensayo legado, segunda ejecución, integridad y recuentos requeridos. |
| Identidad | Cuenta persistente; perfil, identidad externa y asignación por curso/fecha. |
| Horario | Periodos dinámicos y datasets `draft/validated/active/archived`. |
| Fuente 2026/27 | XML oficial GHC ISO-8859-1 primario; PDF solo contraste independiente. |
| Autenticación | Una cuenta/sesión compartida por web normal, perfil docente, Jefatura, Administración técnica y `/app/`. |
| Superadmin | Gestión de cuentas, reset temporal, cambio forzado, auditoría y recuperación break-glass. |
| Roles | `teacher`, `admin` y `superadmin` independientes; Superadmin no implica Jefatura/admin. |
| Descubrimiento | Siete pulsaciones sobre ARGOS solo revelan la UI a un Superadmin ya autenticado; el backend decide el permiso. |
| Despliegue | Redeploy limpio por artefacto Linux offline; nunca upgrade del checkout contaminado. |

## XML oficial validado localmente

| Métrica | Total |
|---|---:|
| Docentes / `source_code` únicos | 88 / 88 |
| Referencias sin resolver | 0 |
| Periodos / recreos | 9 / 2 |
| Sesiones totales | 2.143 |
| Clases | 1.206 |
| Guardias ordinarias | 155 |
| Reuniones | 220 |
| Otras actividades | 494 |
| `GUÀRDIES PATI` | 57 |
| `BIBLIOTECA PATI` | 5 |
| `PATIS INCLUSIUS` | 6 |

La importación deja el dataset `validated` y nunca lo activa. El XML del 7/9 y
el PDF/censo del 4/9 comparten periodos y 2.061 slots. Hay 82 slots solo XML, 60
solo PDF y dos códigos de plantilla distintos en cada roster; se documentan como
revisión de fuente más reciente y mayor precisión estructural del XML oficial,
sin forzar recuentos del PDF.

## Reglas finales de patio

- `guardia_patio`: ocupado, rotatable, sin puesto inventado y sin cobertura automática.
- `biblioteca_patio`: ocupado, puesto fijo Biblioteca, no rotatable y sin cobertura automática.
- `patio_inclusivo`: bloque ocupado, no guardia, sin puesto/rotación/cobertura automática.
- La rotación física 2026/27 todavía no se incluye; Jefatura debe suministrarla por
  periodo y `source_code`.

## Pendiente antes de producción

- El smoke funcional visual de ARGOS 1.0.1 fue completado y aceptado el 9-09-2026.
- Auditoría adversarial independiente y certificación de carga hasta 150 usuarios.
- Aprobar ventana, backup/rollback, XML final exacto, activación explícita y
  aprovisionamiento de cuentas/roles.
