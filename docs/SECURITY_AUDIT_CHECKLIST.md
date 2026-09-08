# Auditoría de seguridad independiente del RC

Ejecutar después del freeze, contra una SQLite aislada y el artefacto exacto.
No usar datos/credenciales reales ni producción.

- autenticación, logout, expiración, cambio propio, reset y revocación;
- autorización por API, IDOR/BOLA, cambio de IDs/códigos/roles y suplantación;
- profesor contra `/api/users`, importación, activación y mutaciones admin;
- inyección SQL, XSS persistente/reflejado, CSRF/origen y payloads malformados;
- XML: tamaño, encoding, referencias, DTD/entidades y estructuras hostiles;
- traversal y exposición de `.env`, Git, SSH, SQLite, backups y lockfiles;
- auditoría sin claves, hashes, salts, cookies, tokens ni cabeceras de autorización.

Registrar petición, resultado esperado/real, severidad y evidencia no sensible.
Un P0/P1 reabre el RC y obliga a reconstruir el artefacto.
