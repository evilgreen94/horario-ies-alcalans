# Hoja de ruta de ARGOS 2026/27

> Planificación; los comandos de producción están solo en [DEPLOYMENT_RUNBOOK.md](DEPLOYMENT_RUNBOOK.md).

## Antes del despliegue

1. Finalizar y congelar el RC local: suite, artefacto Linux, extracción limpia,
   smoke HTTP/runtime y Git sincronizado.
2. Realizar auditoría adversarial independiente y prueba de carga escalonada
   (kiosco, 25, 80, 100 y certificación 150).
3. Obtener de Jefatura la primera rotación física de `GUÀRDIES PATI`; no bloquea
   la corrección del horario ni autoriza inventar puestos.
4. Aprobar el XML final, backup, rollback, ventana y activación transaccional.
5. Completar el smoke humano del bootstrap/provisionamiento 1.0.2, resolver de
   forma inequívoca el segundo Superadmin y aprobar su ejecución en la ventana.

## Después de estabilizar

- Unificar el doble flujo temporal de sustituciones operativas e identidad.
- Observar latencia, SQLite BUSY/LOCKED, CPU/RAM, backups y reinicios.
- Alta gradual de cuentas individuales; nunca credenciales masivas improvisadas.
- Mejoras de UI, PWA y eventual rename del repositorio.

## Completado

- Identidad web individual unificada y navegación por roles en `guardias.html`;
  las operaciones docentes propias se resuelven desde la sesión.
- Identidad visual ARGOS aprobada, descubrimiento Superadmin sin efecto de
  autorización y smoke visual manual de ARGOS 1.0.1 completado.
- Persistencia backend SQLite y retirada de datasets anuales legacy.
- Modelo anual, perfiles/identidades externas/asignaciones y periodos dinámicos.
- Importadores PDF y GHC XML al mismo contrato canónico.
- XML oficial ISO-8859-1 por `source_code`, validado sin autoactivación.
- Semántica final de guardias/patio/biblioteca/Patis Inclusius.
- Gestión Superadmin segura, cambio forzado y revocación inmediata de sesiones.
- Bootstrap RMLL explícito e idempotente y provisión transaccional por
  `source_code`, con preview y credenciales de un solo uso generadas en cliente.
- Listener loopback, tooling de backup, artefacto Linux offline y redeploy limpio documentado.
