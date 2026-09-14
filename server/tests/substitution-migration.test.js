const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const { applyMigrations } = require('../db');

module.exports = [{
  name: '1.0.3 migration upgrades a 1.0.2 database additively and remains idempotent',
  async fn() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'guardias-substitution-upgrade-'));
    const db = await open({ filename: path.join(root, 'upgrade.sqlite'), driver: sqlite3.Database });
    try {
      await db.exec('PRAGMA foreign_keys = ON');
      await db.exec(fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8'));
      await db.exec(`CREATE TABLE schema_migrations (
        name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`);
      for (const name of [
        '001_individual_teacher_auth.sql',
        '002_academic_schedule_model.sql',
        '003_final_session_security_and_schedule_types.sql'
      ]) {
        await db.exec(fs.readFileSync(path.join(__dirname, '..', 'migrations', name), 'utf8'));
        await db.run('INSERT INTO schema_migrations (name) VALUES (?)', [name]);
      }
      await db.run(
        `INSERT INTO historial (id, title, detail, type, actor, ts)
         VALUES ('legacy-history', 'Conservar', 'Dato previo', 'edit', 'Jefatura', '2026-09-01T08:00:00Z')`
      );
      await db.run(
        `INSERT INTO audit_log (action, target_type, target_id, details_json)
         VALUES ('legacy.audit', 'legacy', '1', '{"safe":true}')`
      );

      assert.deepEqual(await applyMigrations(db), ['004_substitution_requests_and_traceability.sql']);
      assert.deepEqual(await applyMigrations(db), []);
      assert.equal((await db.get("SELECT detail FROM historial WHERE id = 'legacy-history'")).detail, 'Dato previo');
      assert.equal((await db.get("SELECT action FROM audit_log WHERE action = 'legacy.audit'")).action, 'legacy.audit');
      assert.ok(await db.get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'substitution_requests'"));
      assert.ok(await db.get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'legacy_substitution_aliases'"));
      assert.equal((await db.get('SELECT COUNT(*) total FROM schema_migrations')).total, 4);
    } finally {
      await db.close();
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
}];
