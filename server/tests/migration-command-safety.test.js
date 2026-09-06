const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const {
  cleanupTestEnvironment,
  createTestEnvironment,
  openDatabase
} = require('./helpers/integration-harness');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

async function testInitDbDoesNotRunWeeklyMaintenance() {
  const environment = createTestEnvironment();
  try {
    const db = await openDatabase(environment.dbPath);
    try {
      await db.exec(fs.readFileSync(path.join(PROJECT_ROOT, 'server', 'schema.sql'), 'utf8'));
      await db.run(
        "INSERT INTO app_state (key, value) VALUES ('school_week_key', '2000-01-03')"
      );
      await db.run(
        "INSERT INTO ausencias (dia, hora, ausente) VALUES (0, 1, 'MIGRATION_TEST')"
      );
      await db.run(
        "INSERT INTO historial (id, title, ts) VALUES ('migration-test', 'Migration test', '2000-01-03T08:00:00.000Z')"
      );
    } finally {
      await db.close();
    }

    const result = spawnSync(process.execPath, ['server/scripts/init-db.js'], {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
      env: {
        ...process.env,
        GUARDIAS_DB_PATH: environment.dbPath,
        GUARDIAS_ADMIN_PASSWORD: 'Migration-admin-test-2026',
        GUARDIAS_SUPERADMIN_PASSWORD: 'Migration-superadmin-test-2026'
      }
    });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);

    const migrated = await openDatabase(environment.dbPath);
    try {
      assert.equal((await migrated.get('SELECT COUNT(*) AS total FROM ausencias')).total, 1);
      assert.equal((await migrated.get('SELECT COUNT(*) AS total FROM historial')).total, 1);
      assert.equal(
        (await migrated.get("SELECT value FROM app_state WHERE key = 'school_week_key'")).value,
        '2000-01-03'
      );
      assert.deepEqual(
        (await migrated.all('SELECT name FROM schema_migrations ORDER BY name')).map(row => row.name),
        ['001_individual_teacher_auth.sql', '002_academic_schedule_model.sql']
      );
    } finally {
      await migrated.close();
    }
  } finally {
    cleanupTestEnvironment(environment);
  }
}

module.exports = [
  {
    name: 'db:init applies migrations without running weekly operational maintenance',
    fn: testInitDbDoesNotRunWeeklyMaintenance
  }
];
