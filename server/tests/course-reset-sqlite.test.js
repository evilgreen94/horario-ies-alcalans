const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { verifySqliteBackup } = require('../sqlite-backup');
const {
  cleanupTestEnvironment,
  createTestEnvironment
} = require('./helpers/integration-harness');

function runScript(argumentsList, dbPath) {
  const result = spawnSync(process.execPath, argumentsList, {
    cwd: path.resolve(__dirname, '..', '..'),
    encoding: 'utf8',
    env: {
      ...process.env,
      GUARDIAS_DB_PATH: dbPath,
      GUARDIAS_SESSION_SECRET: 'course-reset-test-session-secret',
      GUARDIAS_ADMIN_PASSWORD: 'Course-reset-admin-2026',
      GUARDIAS_SUPERADMIN_PASSWORD: 'Course-reset-superadmin-2026'
    }
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
}

async function testCourseResetCreatesOnlySqliteArchive() {
  const environment = createTestEnvironment();
  try {
    runScript(['server/scripts/init-db.js'], environment.dbPath);
    runScript(['server/scripts/reset-course.js', '--yes'], environment.dbPath);

    const backupDirectory = path.join(environment.root, 'backups');
    const files = fs.readdirSync(backupDirectory);
    const sqliteArchives = files.filter(name => /^course-archive-.*\.sqlite$/i.test(name));
    assert.equal(sqliteArchives.length, 1);
    assert.deepEqual(files.filter(name => /\.json$/i.test(name)), []);
    await verifySqliteBackup(path.join(backupDirectory, sqliteArchives[0]));
  } finally {
    cleanupTestEnvironment(environment);
  }
}

module.exports = [
  {
    name: 'course reset archives the complete backend as SQLite without JSON sidecars',
    fn: testCourseResetCreatesOnlySqliteArchive
  }
];
