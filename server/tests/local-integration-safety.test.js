const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
  cleanupTestEnvironment,
  createConsistentBackup,
  createTestEnvironment,
  login,
  loginIndividual,
  openDatabase,
  request,
  seedActiveSchedule,
  startServer,
  stopServer
} = require('./helpers/integration-harness');
const { hashPassword, verifyPassword } = require('../auth');

const INITIAL_ADMIN_PASSWORD = 'Admin-integration-2026';
const CHANGED_ADMIN_PASSWORD = 'Admin-changed-2026';
const SUPERADMIN_PASSWORD = 'Super-integration-2026';
const SYNTHETIC = 'QA_2C_SYNTHETIC';

async function assertQuickCheck(dbPath) {
  const db = await openDatabase(dbPath);
  try {
    const row = await db.get('PRAGMA quick_check');
    assert.strictEqual(Object.values(row)[0], 'ok');
  } finally {
    await db.close();
  }
}

async function readDatabaseSnapshot(dbPath) {
  const db = await openDatabase(dbPath);
  try {
    const tables = [
      'ausencias',
      'biblioteca_guardias',
      'historial',
      'tareas_profesorado',
      'alumnos_fuera_aula',
      'session_overrides',
      'auth_credentials',
      'app_state',
      'grupos_estado',
      'users',
      'roles',
      'user_roles',
      'teacher_profiles',
      'teacher_assignments',
      'academic_years',
      'teacher_external_identities',
      'schedule_datasets',
      'schedule_dataset_teachers',
      'schedule_periods',
      'teacher_schedule_sessions',
      'audit_log',
      'schema_migrations'
    ];
    const existingTables = await db.all("SELECT name FROM sqlite_master WHERE type = 'table'");
    const existingNames = new Set(existingTables.map(row => row.name));
    assert.ok(
      tables.every(table => existingNames.has(table)),
      `SQLite backup is incomplete; expected application schema, found: ${[...existingNames].sort().join(', ') || '(no tables)'}`
    );
    const counts = {};
    for (const table of tables) counts[table] = (await db.get(`SELECT COUNT(*) AS total FROM ${table}`)).total;
    return {
      counts,
      absence: await db.get('SELECT dia, hora, ausente, guardia, aula, faena, obs FROM ausencias WHERE ausente = ?', SYNTHETIC),
      credentials: await db.all('SELECT role, password_hash, salt FROM auth_credentials ORDER BY role')
    };
  } finally {
    await db.close();
  }
}

async function testHttpLifecycle() {
  const environment = createTestEnvironment();
  let server = null;
  let restoredServer = null;
  try {
    server = await startServer({
      dbPath: environment.dbPath,
      adminPassword: INITIAL_ADMIN_PASSWORD,
      superadminPassword: SUPERADMIN_PASSWORD
    });
    await seedActiveSchedule(environment.dbPath);

    const anonymous = await request(server.baseUrl, '/api/guardias', {
      method: 'POST',
      body: { dia: 0, hora: 1, ausente: SYNTHETIC }
    });
    assert.strictEqual(anonymous.response.status, 401);

    const badLogin = await login(server.baseUrl, 'admin', 'Wrong-password-2026');
    assert.strictEqual(badLogin.response.status, 401);
    const badSession = await request(server.baseUrl, '/api/auth/session', {}, badLogin.jar);
    assert.strictEqual(badSession.body.authenticated, false);

    const goodLogin = await login(server.baseUrl, 'admin', INITIAL_ADMIN_PASSWORD);
    assert.strictEqual(goodLogin.response.status, 200);
    assert.ok(goodLogin.jar.value().includes('guardias_session='));
    const session = await request(server.baseUrl, '/api/auth/session', {}, goodLogin.jar);
    assert.strictEqual(session.body.authenticated, true);
    assert.strictEqual(session.body.role, 'admin');

    const created = await request(server.baseUrl, '/api/guardias', {
      method: 'POST',
      body: { dia: 0, hora: 1, ausente: SYNTHETIC, guardia: '', aula: 'QA-01', faena: false, obs: 'fase-2c' }
    }, goodLogin.jar);
    assert.strictEqual(created.response.status, 201);
    const absenceId = created.body.id;

    const assigned = await request(server.baseUrl, `/api/guardias/${absenceId}`, {
      method: 'PUT',
      body: { dia: 0, hora: 1, ausente: SYNTHETIC, guardia: `${SYNTHETIC}_COVER`, aula: 'QA-01', faena: true, obs: 'fase-2c-assigned' }
    }, goodLogin.jar);
    assert.strictEqual(assigned.response.status, 200);
    assert.strictEqual(assigned.body.guardia, `${SYNTHETIC}_COVER`);

    const listed = await request(server.baseUrl, '/api/guardias');
    assert.ok(listed.body.some(row => row.id === absenceId && row.guardia === `${SYNTHETIC}_COVER`));
    const db = await openDatabase(environment.dbPath);
    const stored = await db.get('SELECT * FROM ausencias WHERE id = ?', absenceId);
    assert.strictEqual(stored.guardia, `${SYNTHETIC}_COVER`);
    await db.close();

    const changedPassword = await request(server.baseUrl, '/api/auth/change-password', {
      method: 'POST',
      body: { role: 'admin', currentPassword: INITIAL_ADMIN_PASSWORD, newPassword: CHANGED_ADMIN_PASSWORD }
    }, goodLogin.jar);
    assert.strictEqual(changedPassword.response.status, 200);

    const logout = await request(server.baseUrl, '/api/auth/logout', { method: 'POST', body: {} }, goodLogin.jar);
    assert.strictEqual(logout.response.status, 200);
    const afterLogout = await request(server.baseUrl, '/api/guardias', {
      method: 'POST',
      body: { dia: 0, hora: 2, ausente: `${SYNTHETIC}_LOGOUT` }
    }, goodLogin.jar);
    assert.strictEqual(afterLogout.response.status, 401);

    await stopServer(server);
    server = await startServer({
      dbPath: environment.dbPath,
      adminPassword: INITIAL_ADMIN_PASSWORD,
      superadminPassword: SUPERADMIN_PASSWORD
    });
    const oldCredentials = await login(server.baseUrl, 'admin', INITIAL_ADMIN_PASSWORD);
    assert.strictEqual(oldCredentials.response.status, 401);
    const persistedCredentials = await login(server.baseUrl, 'admin', CHANGED_ADMIN_PASSWORD);
    assert.strictEqual(persistedCredentials.response.status, 200);
    const persistedRows = await request(server.baseUrl, '/api/guardias');
    assert.ok(persistedRows.body.some(row => row.id === absenceId && row.guardia === `${SYNTHETIC}_COVER`));

    const backupPath = path.join(environment.root, 'guardias-consistent-backup.sqlite');
    await createConsistentBackup(environment.dbPath, backupPath);
    await assertQuickCheck(backupPath);
    const backupSnapshot = await readDatabaseSnapshot(backupPath);

    const superadmin = await login(server.baseUrl, 'superadmin', SUPERADMIN_PASSWORD);
    assert.strictEqual(superadmin.response.status, 200);
    const databaseDownload = await request(server.baseUrl, '/api/export/database.sqlite', {}, superadmin.jar);
    assert.strictEqual(databaseDownload.response.status, 200);
    const downloadedPath = path.join(environment.root, 'database-endpoint-download.sqlite');
    fs.writeFileSync(downloadedPath, databaseDownload.body);

    const second = await request(server.baseUrl, '/api/guardias', {
      method: 'POST',
      body: { dia: 0, hora: 2, ausente: `${SYNTHETIC}_SECOND`, guardia: '', aula: 'QA-02', faena: false, obs: 'concurrency' }
    }, persistedCredentials.jar);
    assert.strictEqual(second.response.status, 201);

    const updateOne = request(server.baseUrl, `/api/guardias/${absenceId}`, {
      method: 'PUT',
      body: { dia: 0, hora: 1, ausente: SYNTHETIC, guardia: `${SYNTHETIC}_WRITE_A`, aula: 'QA-01', faena: true, obs: 'parallel-a' }
    }, persistedCredentials.jar);
    const updateTwo = request(server.baseUrl, `/api/guardias/${second.body.id}`, {
      method: 'PUT',
      body: { dia: 0, hora: 2, ausente: `${SYNTHETIC}_SECOND`, guardia: `${SYNTHETIC}_WRITE_B`, aula: 'QA-02', faena: false, obs: 'parallel-b' }
    }, persistedCredentials.jar);
    const concurrentReads = [
      request(server.baseUrl, '/api/guardias'),
      request(server.baseUrl, '/api/guardias')
    ];
    const concurrentResults = await Promise.all([updateOne, updateTwo, ...concurrentReads]);
    assert.ok(concurrentResults.every(result => result.response.status === 200));
    const concurrentState = await request(server.baseUrl, '/api/guardias');
    assert.strictEqual(concurrentState.body.find(row => row.id === absenceId).guardia, `${SYNTHETIC}_WRITE_A`);
    assert.strictEqual(concurrentState.body.find(row => row.id === second.body.id).guardia, `${SYNTHETIC}_WRITE_B`);
    assert.ok(!server.output.join('').includes('SQLITE_BUSY'));
    assert.ok(!server.output.join('').includes('SQLITE_LOCKED'));

    await stopServer(server);
    server = null;
    const restoredPath = path.join(environment.root, 'guardias-restored.sqlite');
    fs.copyFileSync(backupPath, restoredPath);
    restoredServer = await startServer({
      dbPath: restoredPath,
      adminPassword: INITIAL_ADMIN_PASSWORD,
      superadminPassword: SUPERADMIN_PASSWORD
    });
    const restoredLogin = await login(restoredServer.baseUrl, 'admin', CHANGED_ADMIN_PASSWORD);
    assert.strictEqual(restoredLogin.response.status, 200);
    const restoredRows = await request(restoredServer.baseUrl, '/api/guardias');
    assert.ok(restoredRows.body.some(row => row.id === absenceId && row.guardia === `${SYNTHETIC}_COVER`));
    assert.ok(!restoredRows.body.some(row => row.ausente === `${SYNTHETIC}_SECOND`));
    await assertQuickCheck(restoredPath);
    const restoredSnapshot = await readDatabaseSnapshot(restoredPath);
    assert.deepStrictEqual(restoredSnapshot, backupSnapshot);

    await assertQuickCheck(downloadedPath);
    const downloadedSnapshot = await readDatabaseSnapshot(downloadedPath);
    assert.deepStrictEqual(downloadedSnapshot, backupSnapshot);
  } finally {
    await stopServer(restoredServer).catch(() => {});
    await stopServer(server).catch(() => {});
    cleanupTestEnvironment(environment);
  }
}

async function testIndividualAuthenticationLifecycle() {
  const environment = createTestEnvironment();
  let server = null;
  try {
    server = await startServer({
      dbPath: environment.dbPath,
      adminPassword: INITIAL_ADMIN_PASSWORD,
      superadminPassword: SUPERADMIN_PASSWORD
    });
    const credential = hashPassword('Teacher-integration-2026');
    const victimCredential = hashPassword('Victim-integration-2026');
    const db = await openDatabase(environment.dbPath);
    const user = await db.run(
      `INSERT INTO users (username, display_name, password_hash, password_salt)
       VALUES ('teacher.integration', 'Teacher Integration', ?, ?)`,
      [credential.hash, credential.salt]
    );
    const victim = await db.run(
      `INSERT INTO users (username, display_name, password_hash, password_salt)
       VALUES ('victim.integration', 'Victim Integration', ?, ?)`,
      [victimCredential.hash, victimCredential.salt]
    );
    await db.run(
      `INSERT INTO user_roles (user_id, role_id)
       SELECT ?, id FROM roles WHERE key = 'teacher'`,
      [user.lastID]
    );
    await db.close();

    const denied = await loginIndividual(server.baseUrl, 'teacher.integration', 'Wrong-teacher-password');
    assert.strictEqual(denied.response.status, 401);

    const authenticated = await loginIndividual(
      server.baseUrl,
      'TEACHER.INTEGRATION',
      'Teacher-integration-2026',
      { userId: victim.lastID, role: 'superadmin', roles: ['superadmin'] }
    );
    assert.strictEqual(authenticated.response.status, 200);
    assert.strictEqual(authenticated.body.username, 'teacher.integration');
    assert.deepStrictEqual(authenticated.body.roles, ['teacher']);
    assert.strictEqual(authenticated.body.isAdmin, false);

    const session = await request(server.baseUrl, '/api/auth/session', {}, authenticated.jar);
    assert.strictEqual(session.body.authenticated, true);
    assert.strictEqual(session.body.userId, user.lastID);
    assert.strictEqual(session.body.role, 'teacher');

    const forbiddenAdminWrite = await request(server.baseUrl, '/api/guardias', {
      method: 'POST',
      body: { dia: 0, hora: 1, ausente: 'NO_DEBE_GUARDARSE' }
    }, authenticated.jar);
    assert.strictEqual(forbiddenAdminWrite.response.status, 403);

    const forbiddenDatasetActivation = await request(server.baseUrl, '/api/schedule/datasets/1/activate', {
      method: 'POST',
      body: {}
    }, authenticated.jar);
    assert.strictEqual(forbiddenDatasetActivation.response.status, 403);

    const changed = await request(server.baseUrl, '/api/auth/change-password', {
      method: 'POST',
      body: {
        currentPassword: 'Teacher-integration-2026',
        newPassword: 'Teacher-changed-2026',
        userId: victim.lastID,
        username: 'victim.integration',
        role: 'superadmin'
      }
    }, authenticated.jar);
    assert.strictEqual(changed.response.status, 200);

    const afterDb = await openDatabase(environment.dbPath);
    const stored = await afterDb.get(
      'SELECT password_hash, password_salt FROM users WHERE id = ?',
      [user.lastID]
    );
    const victimStored = await afterDb.get(
      'SELECT password_hash, password_salt FROM users WHERE id = ?',
      [victim.lastID]
    );
    const audit = await afterDb.all(
      'SELECT action, outcome FROM audit_log WHERE actor_user_id = ? ORDER BY id',
      [user.lastID]
    );
    await afterDb.close();
    assert.notStrictEqual(stored.password_hash, 'Teacher-changed-2026');
    assert.ok(verifyPassword('Teacher-changed-2026', stored.password_salt, stored.password_hash));
    assert.ok(verifyPassword('Victim-integration-2026', victimStored.password_salt, victimStored.password_hash));
    assert.equal(verifyPassword('Teacher-changed-2026', victimStored.password_salt, victimStored.password_hash), false);
    assert.deepStrictEqual(audit, [
      { action: 'auth.login', outcome: 'failure' },
      { action: 'auth.login', outcome: 'success' },
      { action: 'auth.password_changed', outcome: 'success' }
    ]);

    const oldPassword = await loginIndividual(server.baseUrl, 'teacher.integration', 'Teacher-integration-2026');
    assert.strictEqual(oldPassword.response.status, 401);
    const newPassword = await loginIndividual(server.baseUrl, 'teacher.integration', 'Teacher-changed-2026');
    assert.strictEqual(newPassword.response.status, 200);
  } finally {
    await stopServer(server).catch(() => {});
    cleanupTestEnvironment(environment);
  }
}

async function testWeeklyReset() {
  const environment = createTestEnvironment();
  let server = null;
  try {
    server = await startServer({ dbPath: environment.dbPath, adminPassword: INITIAL_ADMIN_PASSWORD, superadminPassword: SUPERADMIN_PASSWORD });
    await stopServer(server);
    server = null;

    const db = await openDatabase(environment.dbPath);
    await db.exec('BEGIN');
    try {
      await db.run("INSERT INTO ausencias (dia, hora, ausente) VALUES (0, 1, ?)", SYNTHETIC);
      await db.run("INSERT INTO biblioteca_guardias (dia, hora, profesor) VALUES (0, 1, ?)", SYNTHETIC);
      await db.run("INSERT INTO historial (id, title, ts) VALUES (?, 'QA', '2026-09-02T08:00:00.000Z')", `${SYNTHETIC}_H`);
      await db.run("INSERT INTO tareas_profesorado (id, profesor, dia, hora) VALUES (?, ?, 0, 1)", `${SYNTHETIC}_T`, SYNTHETIC);
      await db.run("INSERT INTO alumnos_fuera_aula (profesor, dia, hora, cantidad) VALUES (?, 0, 1, 1)", SYNTHETIC);
      await db.run("INSERT INTO session_overrides (id, profesor, dia, hora) VALUES (?, ?, 0, 1)", `${SYNTHETIC}_O`, SYNTHETIC);
      await db.run("INSERT INTO grupos_estado (grupo, activo) VALUES (?, 0)", `${SYNTHETIC}_G`);
      await db.run("INSERT INTO app_state (key, value) VALUES ('qa_preserved', 'yes')");
      await db.run("UPDATE app_state SET value = '1900-01-01' WHERE key = 'school_week_key'");
      await db.exec('COMMIT');
    } catch (error) {
      await db.exec('ROLLBACK');
      throw error;
    }
    const tables = [
      'ausencias',
      'historial',
      'biblioteca_guardias',
      'tareas_profesorado',
      'alumnos_fuera_aula',
      'session_overrides',
      'grupos_estado',
      'auth_credentials',
      'app_state',
      'users',
      'roles',
      'user_roles',
      'teacher_profiles',
      'teacher_assignments',
      'academic_years',
      'teacher_external_identities',
      'schedule_datasets',
      'schedule_dataset_teachers',
      'schedule_periods',
      'teacher_schedule_sessions',
      'audit_log',
      'schema_migrations'
    ];
    const before = {};
    for (const table of tables) before[table] = (await db.get(`SELECT COUNT(*) AS total FROM ${table}`)).total;
    await db.close();

    server = await startServer({ dbPath: environment.dbPath, adminPassword: INITIAL_ADMIN_PASSWORD, superadminPassword: SUPERADMIN_PASSWORD });
    const afterDb = await openDatabase(environment.dbPath);
    const after = {};
    for (const table of tables) after[table] = (await afterDb.get(`SELECT COUNT(*) AS total FROM ${table}`)).total;
    const storedWeek = await afterDb.get("SELECT value FROM app_state WHERE key = 'school_week_key'");
    const preservedState = await afterDb.get("SELECT value FROM app_state WHERE key = 'qa_preserved'");
    await afterDb.close();

    for (const table of ['ausencias', 'historial', 'biblioteca_guardias', 'tareas_profesorado', 'alumnos_fuera_aula', 'session_overrides']) {
      assert.strictEqual(before[table], 1);
      assert.strictEqual(after[table], 0, `${table} should be cleared by weekly maintenance`);
    }
    assert.strictEqual(after.grupos_estado, 1);
    assert.strictEqual(after.auth_credentials, 2);
    assert.strictEqual(after.roles, 3);
    assert.strictEqual(after.schema_migrations, 2);
    for (const table of ['users', 'user_roles', 'teacher_profiles', 'teacher_assignments', 'audit_log']) {
      assert.strictEqual(after[table], before[table], `${table} should survive weekly maintenance`);
    }
    assert.strictEqual(preservedState.value, 'yes');
    assert.notStrictEqual(storedWeek.value, '1900-01-01');
    assert.ok(after.app_state >= 2);
    process.stdout.write(`WEEKLY_RESET_COUNTS ${JSON.stringify({ before, after })}\n`);
  } finally {
    await stopServer(server).catch(() => {});
    cleanupTestEnvironment(environment);
  }
}

module.exports = [
  { name: 'local HTTP integration covers auth, Jefatura, restart, backup/restore and basic concurrency', fn: testHttpLifecycle },
  { name: 'individual teacher auth supports sessions, permissions, audit and own password changes', fn: testIndividualAuthenticationLifecycle },
  { name: 'weekly maintenance clears only the characterized operational tables', fn: testWeeklyReset }
];
