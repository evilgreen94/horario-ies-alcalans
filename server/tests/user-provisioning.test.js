const assert = require('node:assert/strict');
const fs = require('node:fs');
const { verifyPassword } = require('../auth');
const {
  buildProvisioningPreview,
  bootstrapSuperadmin,
  provisionTeachers
} = require('../user-provisioning');
const {
  cleanupTestEnvironment,
  createTestEnvironment,
  loginIndividual,
  openDatabase,
  request,
  seedIndividualUser,
  startServer,
  stopServer
} = require('./helpers/integration-harness');

async function initializeEnvironment(environment) {
  const server = await startServer({ dbPath: environment.dbPath });
  await stopServer(server);
}

async function seedDataset(db, {
  yearCode = '2026/27',
  yearStatus = 'active',
  datasetStatus = 'active',
  fingerprint = `provisioning-${yearCode}`,
  teachers
}) {
  const startYear = Number(yearCode.slice(0, 4));
  await db.run(
    `INSERT INTO academic_years (code, starts_on, ends_on, status)
     VALUES (?, ?, ?, ?)`,
    [yearCode, `${startYear}-09-01`, `${startYear + 1}-08-31`, yearStatus]
  );
  const year = await db.get('SELECT * FROM academic_years WHERE code = ?', [yearCode]);
  await db.run(
    `INSERT INTO schedule_datasets
      (academic_year_id, label, source_system, source_format, source_fingerprint,
       status, validation_report_json, validated_at, activated_at)
     VALUES (?, ?, 'test', 'test', ?, ?, '{"valid":true}', CURRENT_TIMESTAMP,
       CASE WHEN ? = 'active' THEN CURRENT_TIMESTAMP ELSE NULL END)`,
    [year.id, `Dataset ${yearCode}`, fingerprint, datasetStatus, datasetStatus]
  );
  const dataset = await db.get('SELECT * FROM schedule_datasets WHERE source_fingerprint = ?', [fingerprint]);
  for (const teacher of teachers) {
    await db.run(
      `INSERT INTO teacher_profiles (schedule_key, display_name, is_active, academic_year_id)
       VALUES (?, ?, 1, ?)`,
      [`${yearCode}-${teacher.sourceCode}`, teacher.displayName, year.id]
    );
    const profile = await db.get('SELECT id FROM teacher_profiles WHERE schedule_key = ?', [`${yearCode}-${teacher.sourceCode}`]);
    await db.run(
      `INSERT INTO teacher_external_identities
        (teacher_profile_id, academic_year_id, source_system, source_format, external_key)
       VALUES (?, ?, 'test', 'test', ?)`,
      [profile.id, year.id, teacher.sourceCode]
    );
    const identity = await db.get(
      `SELECT id FROM teacher_external_identities
       WHERE teacher_profile_id = ? AND external_key = ?`,
      [profile.id, teacher.sourceCode]
    );
    await db.run(
      `INSERT INTO schedule_dataset_teachers
        (dataset_id, teacher_profile_id, teacher_external_identity_id)
       VALUES (?, ?, ?)`,
      [dataset.id, profile.id, identity.id]
    );
  }
  return { datasetId: dataset.id, year };
}

async function withDatabase(environment, callback) {
  const db = await openDatabase(environment.dbPath);
  try {
    await db.exec('PRAGMA foreign_keys = ON');
    return await callback(db);
  } finally {
    await db.close();
  }
}

module.exports = [{
  name: 'RMLL bootstrap creates one ordinary linked account and is credential-idempotent',
  async fn() {
    const environment = createTestEnvironment();
    try {
      await initializeEnvironment(environment);
      await withDatabase(environment, async db => {
        await seedDataset(db, { teachers: [
          { sourceCode: 'RMLL', displayName: 'RAFAEL MINANA LLIBRER' },
          { sourceCode: 'ABCD', displayName: 'DOCENTE ABCD' }
        ] });
        const captured = [];
        const originalInfo = console.info;
        console.info = message => captured.push(String(message));
        let created;
        try {
          created = await bootstrapSuperadmin(db, { sourceCode: 'RMLL' });
        } finally {
          console.info = originalInfo;
        }
        assert.equal(created.created, true);
        assert.equal(created.shownOnce, true);
        assert.equal(created.user.username, 'rmll');
        assert.equal(created.user.sourceCode, 'RMLL');
        assert.deepEqual(created.user.roles, ['teacher', 'admin', 'superadmin']);
        assert.ok(created.temporaryPassword.length >= 20);
        assert.equal(captured.join('\n').includes(created.temporaryPassword), false);

        const user = await db.get('SELECT * FROM users WHERE id = ?', [created.user.id]);
        assert.equal(user.must_change_password, 1);
        assert.equal(user.session_version, 1);
        assert.equal(user.password_hash === created.temporaryPassword, false);
        assert.equal(user.password_salt === created.temporaryPassword, false);
        assert.equal(verifyPassword(created.temporaryPassword, user.password_salt, user.password_hash), true);
        const assignment = await db.get(
          `SELECT identity.external_key AS source_code
           FROM teacher_assignments assignment
           JOIN teacher_external_identities identity ON identity.teacher_profile_id = assignment.teacher_profile_id
           WHERE assignment.user_id = ?`,
          [created.user.id]
        );
        assert.equal(assignment.source_code, 'RMLL');
        const originalHash = user.password_hash;

        const second = await bootstrapSuperadmin(db, { sourceCode: 'RMLL' });
        assert.equal(second.created, false);
        assert.equal(second.shownOnce, false);
        assert.equal('temporaryPassword' in second, false);
        assert.equal((await db.get('SELECT password_hash FROM users WHERE id = ?', [created.user.id])).password_hash, originalHash);
        assert.equal((await db.get('SELECT COUNT(*) AS total FROM users WHERE username = ?', ['rmll'])).total, 1);

        const auditText = JSON.stringify(await db.all("SELECT action, details_json FROM audit_log WHERE action = 'security.bootstrap_superadmin_created'"));
        assert.equal(auditText.includes(created.temporaryPassword), false);
        assert.equal(/password|hash|salt|cookie|secret/i.test(auditText), false);
        assert.match(auditText, /RMLL/);
      });
    } finally { cleanupTestEnvironment(environment); }
  }
}, {
  name: 'bootstrap fails safely for missing identity and conflicting deterministic username',
  async fn() {
    const environment = createTestEnvironment();
    try {
      await initializeEnvironment(environment);
      await seedIndividualUser(environment.dbPath, { username: 'rmll', password: 'Conflict-only-2026!', roles: ['teacher'] });
      await withDatabase(environment, async db => {
        await seedDataset(db, { teachers: [{ sourceCode: 'RMLL', displayName: 'RMLL TEST' }] });
        await assert.rejects(() => bootstrapSuperadmin(db, { sourceCode: 'MISSING' }), /No existe/);
        await assert.rejects(() => bootstrapSuperadmin(db, { sourceCode: 'RMLL' }), /no vinculada/);
        assert.equal((await db.get('SELECT COUNT(*) AS total FROM teacher_assignments')).total, 0);
      });
    } finally { cleanupTestEnvironment(environment); }
  }
}, {
  name: 'bulk provisioning creates only missing teachers once and survives a new dataset',
  async fn() {
    const environment = createTestEnvironment();
    try {
      await initializeEnvironment(environment);
      await withDatabase(environment, async db => {
        const first = await seedDataset(db, { teachers: [
          { sourceCode: 'RMLL', displayName: 'RMLL TEST' },
          { sourceCode: 'ABCD', displayName: 'DOCENTE ABCD' },
          { sourceCode: 'EFGH', displayName: 'DOCENTE EFGH' }
        ] });
        const bootstrap = await bootstrapSuperadmin(db, { sourceCode: 'RMLL' });
        const preview = await buildProvisioningPreview(db, first.datasetId);
        assert.deepEqual(preview.totals, {
          teacherIdentities: 3, alreadyLinked: 1, ready: 2,
          conflicts: 0, invalid: 0, orphanedAccounts: 0
        });
        assert.deepEqual(preview.rows.map(row => row.classification), ['READY', 'READY', 'ALREADY_LINKED']);

        const result = await provisionTeachers(db, { datasetId: first.datasetId, actorUserId: bootstrap.user.id });
        assert.deepEqual(result.summary, { created: 2, linked: 0, skipped: 1, conflicts: 0, failed: 0 });
        assert.equal(result.credentials.length, 2);
        assert.equal(new Set(result.credentials.map(row => row.temporary_password)).size, 2);
        for (const returned of result.credentials) {
          assert.equal(returned.username, returned.source_code.toLowerCase());
          const user = await db.get('SELECT * FROM users WHERE username = ?', [returned.username]);
          assert.equal(user.must_change_password, 1);
          assert.equal(verifyPassword(returned.temporary_password, user.password_salt, user.password_hash), true);
          const roles = await db.all(
            `SELECT role.key FROM user_roles user_role JOIN roles role ON role.id = user_role.role_id
             WHERE user_role.user_id = ? ORDER BY role.key`, [user.id]
          );
          assert.deepEqual(roles.map(row => row.key), ['teacher']);
        }
        const secrets = result.credentials.map(row => row.temporary_password);
        const audit = JSON.stringify(await db.all("SELECT action, details_json FROM audit_log WHERE action LIKE 'security.teacher_%'"));
        secrets.forEach(secret => assert.equal(audit.includes(secret), false));

        const second = await provisionTeachers(db, { datasetId: first.datasetId, actorUserId: bootstrap.user.id });
        assert.deepEqual(second.summary, { created: 0, linked: 0, skipped: 3, conflicts: 0, failed: 0 });
        assert.deepEqual(second.credentials, []);
        assert.equal((await db.get('SELECT COUNT(*) AS total FROM users')).total, 3);

        await db.run("UPDATE schedule_datasets SET status = 'archived' WHERE id = ?", [first.datasetId]);
        await db.run("UPDATE academic_years SET status = 'archived' WHERE id = ?", [first.year.id]);
        const next = await seedDataset(db, {
          yearCode: '2027/28', yearStatus: 'preparation', datasetStatus: 'validated',
          fingerprint: 'provisioning-2027-28',
          teachers: [
            { sourceCode: 'ABCD', displayName: 'DOCENTE ABCD' },
            { sourceCode: 'EFGH', displayName: 'DOCENTE EFGH' },
            { sourceCode: 'NEW1', displayName: 'DOCENTE NUEVO' }
          ]
        });
        const nextPreview = await buildProvisioningPreview(db, next.datasetId);
        assert.equal(nextPreview.totals.ready, 3);
        assert.equal(nextPreview.totals.orphanedAccounts, 3);
        assert.deepEqual(nextPreview.rows.map(row => row.action), ['LINK_EXISTING', 'LINK_EXISTING', 'CREATE']);
        const nextResult = await provisionTeachers(db, { datasetId: next.datasetId, actorUserId: bootstrap.user.id });
        assert.deepEqual(nextResult.summary, { created: 1, linked: 2, skipped: 0, conflicts: 0, failed: 0 });
        assert.equal(nextResult.credentials.length, 1);
        assert.equal((await db.get("SELECT COUNT(*) AS total FROM users WHERE username = 'rmll'")).total, 1);
        assert.equal((await db.get('SELECT is_active FROM users WHERE id = ?', [bootstrap.user.id])).is_active, 1);
      });
    } finally { cleanupTestEnvironment(environment); }
  }
}, {
  name: 'invalid source codes and username conflicts block bulk provisioning atomically',
  async fn() {
    const environment = createTestEnvironment();
    try {
      await initializeEnvironment(environment);
      const actor = await seedIndividualUser(environment.dbPath, { username: 'actor.super', password: 'Actor-only-2026!', roles: ['superadmin'] });
      await seedIndividualUser(environment.dbPath, { username: 'abcd', password: 'Conflict-only-2026!', roles: ['teacher'] });
      await withDatabase(environment, async db => {
        const fixture = await seedDataset(db, { teachers: [
          { sourceCode: 'ABCD', displayName: 'CONFLICT' },
          { sourceCode: 'A B', displayName: 'INVALID' },
          { sourceCode: 'READY', displayName: 'READY BUT BLOCKED' }
        ] });
        const preview = await buildProvisioningPreview(db, fixture.datasetId);
        assert.equal(preview.totals.conflicts, 1);
        assert.equal(preview.totals.invalid, 1);
        assert.equal(preview.totals.ready, 1);
        await assert.rejects(
          () => provisionTeachers(db, { datasetId: fixture.datasetId, actorUserId: actor }),
          error => error.status === 409 && error.details.totals.conflicts === 1
        );
        assert.equal((await db.get("SELECT COUNT(*) AS total FROM users WHERE username = 'ready'")).total, 0);
        assert.equal((await db.get('SELECT COUNT(*) AS total FROM teacher_assignments')).total, 0);
      });
    } finally { cleanupTestEnvironment(environment); }
  }
}, {
  name: 'provisioning service rejects a non-Superadmin actor without writing',
  async fn() {
    const environment = createTestEnvironment();
    try {
      await initializeEnvironment(environment);
      const teacherId = await seedIndividualUser(environment.dbPath, {
        username: 'actor.teacher', password: 'Teacher-only-2026!', roles: ['teacher']
      });
      await withDatabase(environment, async db => {
        const fixture = await seedDataset(db, {
          teachers: [{ sourceCode: 'READY', displayName: 'READY BUT FORBIDDEN' }]
        });
        await assert.rejects(
          () => provisionTeachers(db, { datasetId: fixture.datasetId, actorUserId: teacherId }),
          error => error.status === 403
        );
        assert.equal((await db.get("SELECT COUNT(*) AS total FROM users WHERE username = 'ready'")).total, 0);
        assert.equal((await db.get('SELECT COUNT(*) AS total FROM teacher_assignments')).total, 0);
      });
    } finally { cleanupTestEnvironment(environment); }
  }
}, {
  name: 'two Superadmins allow independent role removal while the last-Superadmin guard remains',
  async fn() {
    const environment = createTestEnvironment();
    let server;
    try {
      server = await startServer({ dbPath: environment.dbPath });
      const firstId = await seedIndividualUser(environment.dbPath, {
        username: 'first.super', password: 'First-super-2026!', roles: ['superadmin']
      });
      const secondId = await seedIndividualUser(environment.dbPath, {
        username: 'second.super', password: 'Second-super-2026!', roles: ['teacher', 'superadmin']
      });
      const first = await loginIndividual(server.baseUrl, 'first.super', 'First-super-2026!');
      const second = await loginIndividual(server.baseUrl, 'second.super', 'Second-super-2026!');
      const secondCookie = second.jar.value();
      const origin = { origin: server.baseUrl };
      const removed = await request(server.baseUrl, `/api/users/${secondId}/roles`, {
        method: 'PUT', headers: origin, body: { confirm: true, roles: ['teacher'] }
      }, first.jar);
      assert.equal(removed.response.status, 200);
      assert.deepEqual(removed.body.user.roles, ['teacher']);
      const stale = { value: () => secondCookie, update() {} };
      assert.equal((await request(server.baseUrl, '/api/auth/session', {}, stale)).body.authenticated, false);
      const lastGuard = await request(server.baseUrl, `/api/users/${firstId}/roles`, {
        method: 'PUT', headers: origin, body: { confirm: true, roles: ['teacher'] }
      }, first.jar);
      assert.equal(lastGuard.response.status, 409);
    } finally {
      await stopServer(server).catch(() => {});
      cleanupTestEnvironment(environment);
    }
  }
}, {
  name: 'provisioning HTTP API is Superadmin-only and temporary login forces a private password change',
  async fn() {
    const environment = createTestEnvironment();
    let server;
    try {
      server = await startServer({ dbPath: environment.dbPath });
      const teacherId = await seedIndividualUser(environment.dbPath, { username: 'plain.teacher', password: 'Teacher-only-2026!', roles: ['teacher'] });
      const adminId = await seedIndividualUser(environment.dbPath, { username: 'plain.admin', password: 'Admin-only-2026!', roles: ['admin'] });
      const superId = await seedIndividualUser(environment.dbPath, { username: 'plain.super', password: 'Super-only-2026!', roles: ['superadmin'] });
      assert.ok(teacherId && adminId && superId);
      const fixture = await withDatabase(environment, db => seedDataset(db, {
        teachers: [{ sourceCode: 'NEW1', displayName: 'NEW TEACHER' }]
      }));

      const anonymous = await request(server.baseUrl, '/api/users/provisioning/datasets');
      assert.equal(anonymous.response.status, 401);
      const teacher = await loginIndividual(server.baseUrl, 'plain.teacher', 'Teacher-only-2026!');
      const admin = await loginIndividual(server.baseUrl, 'plain.admin', 'Admin-only-2026!');
      const superadmin = await loginIndividual(server.baseUrl, 'plain.super', 'Super-only-2026!');
      assert.equal((await request(server.baseUrl, '/api/users/provisioning/preview?datasetId=1', {}, teacher.jar)).response.status, 403);
      assert.equal((await request(server.baseUrl, '/api/users/provisioning/preview?datasetId=1', {}, admin.jar)).response.status, 403);
      assert.equal((await request(server.baseUrl, `/api/users/provisioning/preview?datasetId=${fixture.datasetId}`, {}, superadmin.jar)).response.status, 200);

      const origin = { origin: server.baseUrl };
      const provisioned = await request(server.baseUrl, '/api/users/provisioning', {
        method: 'POST', headers: origin, body: { datasetId: fixture.datasetId, confirm: true }
      }, superadmin.jar);
      assert.equal(provisioned.response.status, 201);
      assert.equal(provisioned.body.credentials.length, 1);
      const temporaryPassword = provisioned.body.credentials[0].temporary_password;
      assert.equal(server.output.join('').includes(temporaryPassword), false);

      const firstLogin = await loginIndividual(server.baseUrl, 'new1', temporaryPassword, { role: 'superadmin' });
      assert.equal(firstLogin.response.status, 200);
      assert.deepEqual(firstLogin.body.roles, ['teacher']);
      assert.equal(firstLogin.body.mustChangePassword, true);
      assert.equal((await request(server.baseUrl, '/api/schedule/me', {}, firstLogin.jar)).response.status, 403);
      const changed = await request(server.baseUrl, '/api/auth/change-password', {
        method: 'POST', body: { currentPassword: temporaryPassword, newPassword: 'New-private-password-2026!' }
      }, firstLogin.jar);
      assert.equal(changed.response.status, 200);
      assert.equal((await loginIndividual(server.baseUrl, 'new1', temporaryPassword)).response.status, 401);
      const privateLogin = await loginIndividual(server.baseUrl, 'new1', 'New-private-password-2026!');
      assert.equal(privateLogin.response.status, 200);
      assert.equal(privateLogin.body.mustChangePassword, false);

      const dbBytes = fs.readFileSync(environment.dbPath);
      assert.equal(dbBytes.includes(Buffer.from(temporaryPassword)), false);
    } finally {
      await stopServer(server).catch(() => {});
      cleanupTestEnvironment(environment);
    }
  }
}];
