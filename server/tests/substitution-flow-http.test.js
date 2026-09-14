const assert = require('node:assert/strict');
const {
  cleanupTestEnvironment,
  createTestEnvironment,
  loginIndividual,
  openDatabase,
  request,
  seedActiveSchedule,
  seedIndividualUser,
  startServer,
  stopServer
} = require('./helpers/integration-harness');

const PASSWORD = 'Substitution-http-2026!';

async function seedTitular(dbPath, titularUserId) {
  const db = await openDatabase(dbPath);
  try {
    const year = await db.get("SELECT id FROM academic_years WHERE code = '2026/27'");
    const dataset = await db.get("SELECT id FROM schedule_datasets WHERE source_fingerprint = 'integration-canonical-v1'");
    const profile = await db.run(
      `INSERT INTO teacher_profiles (academic_year_id, schedule_key, display_name)
       VALUES (?, 'HTTP-TITULAR', 'Titular HTTP')`, [year.id]
    );
    const identity = await db.run(
      `INSERT INTO teacher_external_identities
        (teacher_profile_id, academic_year_id, source_system, source_format, external_key)
       VALUES (?, ?, 'test', 'test', 'HTTP-TITULAR')`, [profile.lastID, year.id]
    );
    await db.run(
      `INSERT INTO schedule_dataset_teachers
        (dataset_id, teacher_profile_id, teacher_external_identity_id) VALUES (?, ?, ?)`,
      [dataset.id, profile.lastID, identity.lastID]
    );
    const period = await db.get("SELECT id FROM schedule_periods WHERE dataset_id = ? AND period_key = 'P1'", [dataset.id]);
    await db.run(
      `INSERT INTO teacher_schedule_sessions
        (dataset_id, teacher_profile_id, teacher_external_identity_id, period_id,
         weekday, session_type, subject, group_code, room)
       VALUES (?, ?, ?, ?, 0, 'class', 'Matemáticas', '1ESO-A', 'Aula 12')`,
      [dataset.id, profile.lastID, identity.lastID, period.id]
    );
    const assignment = await db.run(
      `INSERT INTO teacher_assignments
        (user_id, teacher_profile_id, academic_year_id, assignment_type, starts_on, ends_on)
       VALUES (?, ?, ?, 'titular', '2026-09-01', '2027-08-31')`,
      [titularUserId, profile.lastID, year.id]
    );
    return assignment.lastID;
  } finally { await db.close(); }
}

module.exports = [{
  name: 'substitution HTTP flow enforces independent roles, safe public projection and restart persistence',
  async fn() {
    const environment = createTestEnvironment();
    let server;
    try {
      server = await startServer({ dbPath: environment.dbPath });
      await seedActiveSchedule(environment.dbPath);
      const adminId = await seedIndividualUser(environment.dbPath, {
        username: 'sub.http.admin', password: PASSWORD, displayName: 'Jefatura HTTP', roles: ['admin']
      });
      await seedIndividualUser(environment.dbPath, {
        username: 'sub.http.super', password: PASSWORD, displayName: 'Super HTTP', roles: ['superadmin']
      });
      await seedIndividualUser(environment.dbPath, {
        username: 'sub.http.teacher', password: PASSWORD, displayName: 'Teacher HTTP', roles: ['teacher']
      });
      const titularId = await seedIndividualUser(environment.dbPath, {
        username: 'sub.http.titular', password: PASSWORD, displayName: 'Titular HTTP', roles: ['teacher']
      });
      const titularAssignmentId = await seedTitular(environment.dbPath, titularId);

      const admin = await loginIndividual(server.baseUrl, 'sub.http.admin', PASSWORD);
      const superadmin = await loginIndividual(server.baseUrl, 'sub.http.super', PASSWORD);
      const teacher = await loginIndividual(server.baseUrl, 'sub.http.teacher', PASSWORD);
      assert.equal(admin.response.status, 200);
      assert.equal(superadmin.response.status, 200);
      assert.equal(teacher.response.status, 200);
      const write = { Origin: server.baseUrl };
      const payload = {
        titularAssignmentId,
        proposedDisplayName: 'Sustituta HTTP',
        proposedUsername: 'sustituta.http',
        startsOn: '2026-09-14',
        plannedEndsOn: '2026-09-30'
      };

      assert.equal((await request(server.baseUrl, '/api/substitutions', {
        method: 'POST', headers: write, body: payload
      }, teacher.jar)).response.status, 403);
      assert.equal((await request(server.baseUrl, '/api/substitutions', {
        method: 'POST', headers: write, body: payload
      }, superadmin.jar)).response.status, 403);
      const created = await request(server.baseUrl, '/api/substitutions', {
        method: 'POST', headers: write, body: payload
      }, admin.jar);
      assert.equal(created.response.status, 201);
      assert.equal(created.body.request.status, 'pending_provisioning');
      const requestId = created.body.request.id;

      assert.equal((await request(server.baseUrl, '/api/substitutions', {}, teacher.jar)).response.status, 403);
      assert.equal((await request(server.baseUrl, `/api/substitutions/${requestId}/provision`, {
        method: 'POST', headers: write, body: { username: 'sustituta.http', displayName: 'Sustituta HTTP' }
      }, admin.jar)).response.status, 403);
      const provisioned = await request(server.baseUrl, `/api/substitutions/${requestId}/provision`, {
        method: 'POST', headers: write, body: { username: 'sustituta.http', displayName: 'Sustituta HTTP' }
      }, superadmin.jar);
      assert.equal(provisioned.response.status, 201);
      assert.deepEqual(provisioned.body.user.roles, ['teacher']);
      assert.ok(provisioned.body.temporaryPassword);
      assert.equal((await request(server.baseUrl, `/api/substitutions/${requestId}/activate`, {
        method: 'POST', headers: write, body: {}
      }, admin.jar)).response.status, 403);
      const activated = await request(server.baseUrl, `/api/substitutions/${requestId}/activate`, {
        method: 'POST', headers: write, body: {}
      }, superadmin.jar);
      assert.equal(activated.response.status, 200);
      assert.equal(activated.body.request.status, 'active');

      const effective = await request(server.baseUrl, '/api/substitutions/effective?date=2026-09-14');
      assert.equal(effective.response.status, 200);
      assert.equal(effective.body.substitutions.length, 1);
      assert.equal(effective.body.substitutions[0].titular.displayName, 'Titular HTTP');
      assert.equal(effective.body.substitutions[0].substitute.displayName, 'Sustituta HTTP');
      assert.equal(effective.body.substitutions[0].substitute.password, undefined);
      const legacyProjection = await request(server.baseUrl, '/api/profesorado/substitutions?date=2026-09-14');
      assert.equal(legacyProjection.response.status, 200);
      assert.equal(legacyProjection.body[0].assignmentId, activated.body.request.assignmentId);

      const db = await openDatabase(environment.dbPath);
      await db.run('UPDATE users SET must_change_password = 0 WHERE id = ?', [provisioned.body.user.id]);
      await db.close();
      const substituteLogin = await loginIndividual(server.baseUrl, 'sustituta.http', provisioned.body.temporaryPassword);
      assert.equal(substituteLogin.response.status, 200);
      const substituteSchedule = await request(server.baseUrl, '/api/schedule/me?date=2026-09-14', {}, substituteLogin.jar);
      assert.equal(substituteSchedule.response.status, 200);
      assert.equal(substituteSchedule.body.teacher.user.displayName, 'Sustituta HTTP');
      assert.equal(substituteSchedule.body.teacher.sourceCode, 'HTTP-TITULAR');
      assert.equal(substituteSchedule.body.teacher.assignment.type, 'sustituto');
      assert.equal(substituteSchedule.body.teacher.substitution.role, 'substitute');
      assert.equal(substituteSchedule.body.periods[0].session.room, 'Aula 12');
      assert.equal((await request(server.baseUrl, '/api/schedule/me?date=2026-09-30', {}, substituteLogin.jar)).response.status, 200);
      assert.equal((await request(server.baseUrl, '/api/schedule/me?date=2026-10-01', {}, substituteLogin.jar)).response.status, 404);
      const titularLogin = await loginIndividual(server.baseUrl, 'sub.http.titular', PASSWORD);
      const titularSchedule = await request(server.baseUrl, '/api/schedule/me?date=2026-09-14', {}, titularLogin.jar);
      assert.equal(titularSchedule.response.status, 200);
      assert.equal(titularSchedule.body.teacher.assignment.type, 'titular');
      assert.equal(titularSchedule.body.teacher.substitution.role, 'titular');
      assert.equal(titularSchedule.body.teacher.substitution.substitute.displayName, 'Sustituta HTTP');

      assert.equal((await request(server.baseUrl, '/api/historial')).response.status, 401);
      const history = await request(server.baseUrl, '/api/historial', {}, admin.jar);
      assert.equal(history.response.status, 200);
      assert.ok(history.body.some(item => item.action === 'substitution.request_created' && item.actorIdentity.userId === adminId));
      const rejectedRoleChange = await request(server.baseUrl, `/api/users/${provisioned.body.user.id}/roles`, {
        method: 'PUT', headers: write, body: { confirm: true, roles: ['admin'] }
      }, superadmin.jar);
      assert.equal(rejectedRoleChange.response.status, 409);
      const beforeArchiveDb = await openDatabase(environment.dbPath);
      const historyBefore = (await beforeArchiveDb.get('SELECT COUNT(*) total FROM historial')).total;
      const auditBefore = (await beforeArchiveDb.get('SELECT COUNT(*) total FROM audit_log')).total;
      await beforeArchiveDb.close();
      const archived = await request(server.baseUrl, '/api/historial/archive', {
        method: 'POST', headers: write, body: {}
      }, admin.jar);
      assert.equal(archived.response.status, 200);
      assert.ok(archived.body.archived >= 1);
      const afterArchiveDb = await openDatabase(environment.dbPath);
      assert.equal((await afterArchiveDb.get('SELECT COUNT(*) total FROM historial')).total, historyBefore + 1);
      assert.equal((await afterArchiveDb.get('SELECT COUNT(*) total FROM audit_log')).total, auditBefore + 1);
      await afterArchiveDb.close();
      const visibleAfterArchive = await request(server.baseUrl, '/api/historial', {}, admin.jar);
      assert.deepEqual(visibleAfterArchive.body.map(item => item.action), ['history.archived']);
      assert.equal((await request(server.baseUrl, '/api/audit', {}, admin.jar)).response.status, 403);
      const audit = await request(server.baseUrl, '/api/audit', {}, superadmin.jar);
      assert.equal(audit.response.status, 200);
      assert.ok(audit.body.events.some(item => item.action === 'substitution.assignment_activated'));
      assert.equal((await request(server.baseUrl, '/api/profesorado/substitutions/replace', {
        method: 'PUT', body: [], headers: write
      }, admin.jar)).response.status, 410);

      const staleLegacyDb = await openDatabase(environment.dbPath);
      await staleLegacyDb.run(
        `INSERT OR REPLACE INTO app_state (key, value, updated_at)
         VALUES ('teacher_substitutions', ?, CURRENT_TIMESTAMP)`,
        [JSON.stringify([{ profesor: 'Titular HTTP', sustituto: 'Alias libre incorrecto' }])]
      );
      await staleLegacyDb.close();
      const snapshot = await request(server.baseUrl, '/api/export/snapshot.json', {}, superadmin.jar);
      assert.equal(snapshot.response.status, 200);
      assert.equal(snapshot.body.teacherSubstitutions[0].sustituto, 'Sustituta HTTP');
      const restored = await request(server.baseUrl, '/api/export/restore', {
        method: 'POST', headers: write, body: snapshot.body
      }, superadmin.jar);
      assert.equal(restored.response.status, 200);
      assert.equal(restored.body.counts.ignoredLegacySubstitutions, 1);
      const restoredDb = await openDatabase(environment.dbPath);
      assert.equal(await restoredDb.get("SELECT value FROM app_state WHERE key = 'teacher_substitutions'"), undefined);
      await restoredDb.close();

      await stopServer(server);
      server = await startServer({ dbPath: environment.dbPath });
      const afterRestart = await request(server.baseUrl, '/api/substitutions/effective?date=2026-09-14');
      assert.equal(afterRestart.response.status, 200);
      assert.equal(afterRestart.body.substitutions.length, 1);
      const relogin = await loginIndividual(server.baseUrl, 'sub.http.titular', PASSWORD);
      assert.equal(relogin.response.status, 200);
      const logout = await request(server.baseUrl, '/api/auth/logout', { method: 'POST', body: {} }, relogin.jar);
      assert.equal(logout.response.status, 200);
    } finally {
      await stopServer(server).catch(() => {});
      cleanupTestEnvironment(environment);
    }
  }
}];
