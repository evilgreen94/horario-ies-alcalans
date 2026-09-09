const path = require('path');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const { withImmediateTransaction } = require('../db');
const { generateTemporaryPassword, hashPassword } = require('../auth');
const { appendAuditEvent } = require('../audit');

function valueAfter(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? String(args[index + 1] || '').trim() : '';
}

async function main() {
  const args = process.argv.slice(2);
  const dbPath = valueAfter(args, '--db');
  const username = valueAfter(args, '--username');
  const confirmed = valueAfter(args, '--confirm') === 'RESET_SUPERADMIN_ACCESS';
  if (!dbPath || !path.isAbsolute(dbPath) || !dbPath.toLowerCase().endsWith('.sqlite')) {
    throw new Error('Indica la ruta SQLite absoluta con --db.');
  }

  const db = await open({ filename: path.resolve(dbPath), driver: sqlite3.Database });
  try {
    await db.exec('PRAGMA foreign_keys = ON');
    const candidates = await db.all(
      `SELECT u.id, u.username, u.display_name, u.is_active
       FROM users u JOIN user_roles ur ON ur.user_id = u.id
       JOIN roles r ON r.id = ur.role_id
       WHERE r.key = 'superadmin' ORDER BY u.username COLLATE NOCASE`
    );
    if (!username) {
      console.log(JSON.stringify({ superadmins: candidates.map(row => ({
        username: row.username, displayName: row.display_name, active: !!row.is_active
      })) }, null, 2));
      throw new Error('Indica --username y --confirm RESET_SUPERADMIN_ACCESS para realizar un restablecimiento de emergencia.');
    }
    if (!confirmed) {
      throw new Error('Falta --confirm RESET_SUPERADMIN_ACCESS; no se ha modificado ninguna cuenta.');
    }
    const target = candidates.find(row => row.username.toLowerCase() === username.toLowerCase());
    if (!target) throw new Error('La cuenta indicada no es Superadmin.');

    const temporaryPassword = generateTemporaryPassword();
    const { salt, hash } = hashPassword(temporaryPassword);
    await withImmediateTransaction(db, async () => {
      await db.run(
        `UPDATE users SET password_hash = ?, password_salt = ?, is_active = 1,
         must_change_password = 1, session_version = session_version + 1,
         updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [hash, salt, target.id]
      );
      await appendAuditEvent(db, {
        action: 'security.break_glass_password_reset',
        targetType: 'user', targetId: String(target.id),
        details: { recovery: 'authorized-os-access' }
      });
    }, { label: 'security:break-glass' });
    console.log('Contraseña temporal (se muestra una sola vez):');
    console.log(temporaryPassword);
    console.log('La cuenta deberá cambiarla al iniciar sesión; las sesiones anteriores han sido revocadas.');
  } finally {
    await db.close();
  }
}

main().catch(error => {
  console.error(error.message || error);
  process.exitCode = 1;
});
