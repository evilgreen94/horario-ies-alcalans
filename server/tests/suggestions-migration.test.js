const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const { applyMigrations } = require('../db');

const migrationNames = [
  '001_individual_teacher_auth.sql',
  '002_academic_schedule_model.sql',
  '003_final_session_security_and_schedule_types.sql',
  '004_substitution_requests_and_traceability.sql'
];

async function createBase(db) {
  await db.exec('PRAGMA foreign_keys = ON');
  await db.exec(fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8'));
  await db.exec(`CREATE TABLE schema_migrations (
    name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
}

module.exports = [
  {
    name: 'suggestions migration creates constrained foreign keys and indexes on a fresh database idempotently',
    async fn() {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'guardias-suggestions-fresh-'));
      const db = await open({ filename: path.join(root, 'fresh.sqlite'), driver: sqlite3.Database });
      try {
        await createBase(db);
        assert.deepEqual(await applyMigrations(db), [...migrationNames, '005_suggestions.sql']);
        assert.deepEqual(await applyMigrations(db), []);
        const table = await db.get("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'suggestions'");
        assert.match(table.sql, /created_by_user_id INTEGER NOT NULL/);
        assert.match(table.sql, /implemented/);
        const foreignKeys = await db.all('PRAGMA foreign_key_list(suggestions)');
        assert.deepEqual(foreignKeys.map(row => row.table).sort(), ['users', 'users']);
        const indexes = (await db.all('PRAGMA index_list(suggestions)')).map(row => row.name);
        assert.ok(indexes.includes('idx_suggestions_author_created'));
        assert.ok(indexes.includes('idx_suggestions_status_created'));
        assert.equal((await db.get('PRAGMA quick_check')).quick_check, 'ok');
        assert.deepEqual(await db.all('PRAGMA foreign_key_check'), []);
      } finally {
        await db.close();
        fs.rmSync(root, { recursive: true, force: true });
      }
    }
  },
  {
    name: 'suggestions migration upgrades a 1.0.3 database additively and preserves existing data',
    async fn() {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'guardias-suggestions-upgrade-'));
      const db = await open({ filename: path.join(root, 'upgrade.sqlite'), driver: sqlite3.Database });
      try {
        await createBase(db);
        for (const name of migrationNames) {
          await db.exec(fs.readFileSync(path.join(__dirname, '..', 'migrations', name), 'utf8'));
          await db.run('INSERT INTO schema_migrations (name) VALUES (?)', [name]);
        }
        await db.run(`INSERT INTO users
          (username, display_name, password_hash, password_salt)
          VALUES ('suggestion.upgrade', 'Suggestion Upgrade', 'synthetic-hash', 'synthetic-salt')`);
        await db.run(`INSERT INTO historial
          (id, title, detail, type, actor, ts)
          VALUES ('suggestion-upgrade-history', 'Conservar', 'Dato 1.0.3', 'other', 'Sistema', CURRENT_TIMESTAMP)`);
        assert.deepEqual(await applyMigrations(db), ['005_suggestions.sql']);
        assert.deepEqual(await applyMigrations(db), []);
        assert.equal((await db.get("SELECT display_name FROM users WHERE username = 'suggestion.upgrade'")).display_name, 'Suggestion Upgrade');
        assert.equal((await db.get("SELECT detail FROM historial WHERE id = 'suggestion-upgrade-history'")).detail, 'Dato 1.0.3');
        assert.equal((await db.get('SELECT COUNT(*) total FROM schema_migrations')).total, 5);
        assert.equal((await db.get('PRAGMA quick_check')).quick_check, 'ok');
        assert.deepEqual(await db.all('PRAGMA foreign_key_check'), []);
      } finally {
        await db.close();
        fs.rmSync(root, { recursive: true, force: true });
      }
    }
  }
];
