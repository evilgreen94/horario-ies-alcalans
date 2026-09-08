const assert = require('assert');
const { spawnSync } = require('child_process');
const path = require('path');
const { hashPassword, verifyPassword } = require('../auth');
const {
  cleanupTestEnvironment, createTestEnvironment, openDatabase, startServer, stopServer
} = require('./helpers/integration-harness');

module.exports = [{
  name: 'break-glass reset requires explicit OS-side confirmation and stores only a hash',
  async fn() {
    const environment = createTestEnvironment();
    let server;
    try {
      server = await startServer({ dbPath: environment.dbPath });
      await stopServer(server);
      server = null;
      const db = await openDatabase(environment.dbPath);
      let userId;
      try {
        const credential = hashPassword('Old-superadmin-password-2026!');
        const inserted = await db.run(
          `INSERT INTO users (username, display_name, password_hash, password_salt, is_active)
           VALUES ('recovery.super', 'Recovery Superadmin', ?, ?, 0)`,
          [credential.hash, credential.salt]
        );
        userId = inserted.lastID;
        await db.run(
          `INSERT INTO user_roles (user_id, role_id)
           SELECT ?, id FROM roles WHERE key = 'superadmin'`,
          [userId]
        );
      } finally { await db.close(); }

      const script = path.join(__dirname, '..', 'scripts', 'reset-superadmin.js');
      const denied = spawnSync(process.execPath, [script, '--db', environment.dbPath, '--username', 'recovery.super'], {
        encoding: 'utf8'
      });
      assert.notStrictEqual(denied.status, 0);
      const before = await openDatabase(environment.dbPath);
      try {
        const row = await before.get('SELECT session_version, is_active FROM users WHERE id = ?', [userId]);
        assert.deepStrictEqual({ version: row.session_version, active: row.is_active }, { version: 1, active: 0 });
      } finally { await before.close(); }

      const reset = spawnSync(process.execPath, [
        script, '--db', environment.dbPath, '--username', 'recovery.super',
        '--confirm', 'RESET_SUPERADMIN_ACCESS'
      ], { encoding: 'utf8' });
      assert.strictEqual(reset.status, 0, reset.stderr);
      const lines = reset.stdout.split(/\r?\n/).map(value => value.trim()).filter(Boolean);
      const temporaryPassword = lines.find(line => /^A7![A-Za-z0-9_-]+$/.test(line));
      assert.ok(temporaryPassword.length >= 20);
      assert.strictEqual(reset.stdout.split(temporaryPassword).length - 1, 1);

      const after = await openDatabase(environment.dbPath);
      try {
        const row = await after.get(
          'SELECT password_hash, password_salt, session_version, must_change_password, is_active FROM users WHERE id = ?',
          [userId]
        );
        assert.strictEqual(verifyPassword(temporaryPassword, row.password_salt, row.password_hash), true);
        assert.strictEqual(row.password_hash.includes(temporaryPassword), false);
        assert.deepStrictEqual(
          { version: row.session_version, forced: row.must_change_password, active: row.is_active },
          { version: 2, forced: 1, active: 1 }
        );
        const audit = JSON.stringify(await after.all('SELECT action, details_json FROM audit_log'));
        assert.ok(audit.includes('security.break_glass_password_reset'));
        assert.strictEqual(audit.includes(temporaryPassword), false);
      } finally { await after.close(); }
    } finally {
      await stopServer(server).catch(() => {});
      cleanupTestEnvironment(environment);
    }
  }
}];
