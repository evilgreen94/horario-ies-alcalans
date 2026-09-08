const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { activateScheduleDataset, importScheduleDataset, importTeacherProfiles } = require('../schedule-model');
const {
  cleanupTestEnvironment,
  createTestEnvironment,
  login,
  loginIndividual,
  openDatabase,
  request,
  seedIndividualUser,
  startServer,
  stopServer
} = require('./helpers/integration-harness');

const PASSWORD = 'Unified-web-identity-2026!';
const TEACHERS = [
  ['RMLL', 'RAFAEL MINANA LLIBRER'],
  ['JGP1', 'JOSE GARCIA PEREZ'],
  ['JGP2', 'JOSE GARCIA PEREZ'],
  ['TADM', 'TEACHER ADMIN'],
  ['TSUP', 'TEACHER SUPER'],
  ['TALL', 'TEACHER ALL']
];

async function seedIdentityModel(dbPath) {
  const db = await openDatabase(dbPath);
  try {
    await importTeacherProfiles(db, {
      academic_year: '2026/27',
      source_system: 'test',
      teacher_count: TEACHERS.length,
      teachers: TEACHERS.map(([source_code, display_name]) => ({ source_code, display_name, active: true }))
    }, { expectedCount: TEACHERS.length, sourceFormat: 'test' });
    const imported = await importScheduleDataset(db, {
      academic_year: '2026/27',
      label: 'Unified identity test schedule',
      source: { system: 'test', format: 'test' },
      teacher_source_codes: TEACHERS.map(([code]) => code),
      periods: [
        { key: 'P1', position: 1, type: 'teaching', starts_at: '08:15', ends_at: '09:10' },
        { key: 'B1', position: 2, type: 'break', starts_at: '09:10', ends_at: '09:30' }
      ],
      sessions: TEACHERS.map(([teacher_source_code], weekday) => ({
        teacher_source_code,
        weekday: weekday % 5,
        period_key: 'P1',
        type: 'class',
        subject: 'TEST'
      }))
    });
    await activateScheduleDataset(db, imported.datasetId);
  } finally {
    await db.close();
  }
}

async function assignTeacher(dbPath, userId, sourceCode) {
  const db = await openDatabase(dbPath);
  try {
    const row = await db.get(
      `SELECT profile.id AS profile_id, profile.academic_year_id
       FROM teacher_profiles profile
       JOIN teacher_external_identities identity ON identity.teacher_profile_id = profile.id
       WHERE identity.external_key = ?`,
      [sourceCode]
    );
    await db.run(
      `INSERT INTO teacher_assignments
        (user_id, teacher_profile_id, academic_year_id, assignment_type, starts_on, ends_on)
       VALUES (?, ?, ?, 'titular', '2026-09-01', '2027-08-31')`,
      [userId, row.profile_id, row.academic_year_id]
    );
  } finally {
    await db.close();
  }
}

async function createAccount(dbPath, username, roles, sourceCode = '') {
  const userId = await seedIndividualUser(dbPath, { username, password: PASSWORD, roles });
  if (sourceCode) await assignTeacher(dbPath, userId, sourceCode);
  return userId;
}

async function loginAccount(server, username) {
  const result = await loginIndividual(server.baseUrl, username, PASSWORD);
  assert.equal(result.response.status, 200, username);
  return result;
}

module.exports = [{
  name: 'normal web uses one individual identity with exact role separation and session-owned teacher writes',
  async fn() {
    const environment = createTestEnvironment();
    let server;
    try {
      server = await startServer({ dbPath: environment.dbPath });
      await seedIdentityModel(environment.dbPath);
      const ids = {
        teacher: await createAccount(environment.dbPath, 'teacher.only', ['teacher'], 'RMLL'),
        duplicateOne: await createAccount(environment.dbPath, 'duplicate.one', ['teacher'], 'JGP1'),
        duplicateTwo: await createAccount(environment.dbPath, 'duplicate.two', ['teacher'], 'JGP2'),
        admin: await createAccount(environment.dbPath, 'admin.only', ['admin']),
        teacherAdmin: await createAccount(environment.dbPath, 'teacher.admin', ['teacher', 'admin'], 'TADM'),
        superadmin: await createAccount(environment.dbPath, 'super.only', ['superadmin']),
        teacherSuper: await createAccount(environment.dbPath, 'teacher.super', ['teacher', 'superadmin'], 'TSUP'),
        all: await createAccount(environment.dbPath, 'teacher.all', ['teacher', 'admin', 'superadmin'], 'TALL'),
        unmapped: await createAccount(environment.dbPath, 'teacher.unmapped', ['teacher'])
      };
      const origin = { origin: server.baseUrl };

      const html = await request(server.baseUrl, '/guardias.html');
      assert.equal(html.response.status, 200);
      const htmlText = html.body.toString('utf8');
      assert.match(htmlText, />Acceso personal</);
      assert.match(htmlText, />Sala del profesorado</);
      assert.match(htmlText, /id="btnAdmin"[^>]*style="display:none"/);
      assert.doesNotMatch(htmlText, /onclick="changeTeacherUser\(\)"/);
      assert.match(htmlText, /name="username"/);
      assert.match(htmlText, /name="password"/);
      assert.match(htmlText, /class="argos-brand"[^>]*role="img"[^>]*aria-label="A\.R\.G\.O\.S, identidad del sistema"/);
      assert.match(htmlText, /class="argos-eye__pupil"/);
      assert.match(htmlText, />A\.R\.G\.O\.S</);
      assert.equal((await request(server.baseUrl, '/app/')).response.status, 200);
      const webStyles = (await request(server.baseUrl, '/css/guardias.css')).body.toString('utf8');
      assert.match(webStyles, /\.argos-eye\s*\{/);
      assert.match(webStyles, /background:\s*var\(--accent\)/);
      assert.match(webStyles, /@keyframes argos-pupil-watch/);
      assert.match(webStyles, /@media \(prefers-reduced-motion: reduce\)/);
      const webRuntime = (await request(server.baseUrl, '/js/app/guardias.js')).body.toString('utf8');
      assert.match(webRuntime, /canAdmin=roles\.includes\('admin'\)/);
      assert.match(webRuntime, /canSuperAdmin=roles\.includes\('superadmin'\)/);
      assert.match(webRuntime, /storage\.loginIndividual\(username,password\)/);
      assert.doesNotMatch(webRuntime, /storage\.loginRole\('admin'/);
      assert.match(webRuntime, /url\.searchParams\.delete\('panel'\)/);
      assert.match(webRuntime, /if\(isSuperAdmin\)\{\s*window\.location\.href=getMainRouteUrl\(\);\s*return;/);

      const teacher = await loginAccount(server, 'teacher.only');
      const own = await request(server.baseUrl, '/api/schedule/me?date=2026-09-07&source_code=JGP2&teacherProfileId=999&userId=999', {}, teacher.jar);
      assert.equal(own.response.status, 200);
      assert.equal(own.body.teacher.sourceCode, 'RMLL');
      assert.equal(own.body.teacher.displayName, 'RAFAEL MINANA LLIBRER');
      const forgedAbsence = await request(server.baseUrl, '/api/profesorado/future-absences', {
        method: 'POST', headers: origin, body: {
          id: 'owned-future', profesor: 'OTHER TEACHER', sourceCode: 'JGP2', userId: ids.duplicateTwo,
          date: '2026-09-14', hours: [1], note: 'Session owned', status: 'approved',
          reviewedAt: '2026-09-08T10:00:00.000Z', reviewerNote: 'forged', appliedAt: '',
          createdAt: '2026-09-08T09:00:00.000Z'
        }
      }, teacher.jar);
      assert.equal(forgedAbsence.response.status, 200);
      assert.notEqual(forgedAbsence.body.entry.id, 'owned-future');
      assert.equal(forgedAbsence.body.entry.profesor, 'RAFAEL MINANA LLIBRER');
      assert.equal(forgedAbsence.body.entry.sourceCode, 'RMLL');
      assert.equal(forgedAbsence.body.entry.status, 'pending');
      assert.equal(forgedAbsence.body.entry.reviewerNote, '');
      const corridor = await request(server.baseUrl, '/api/profesorado/alumnos-fuera-aula', {
        method: 'POST', headers: origin,
        body: { profesor: 'OTHER TEACHER', userId: ids.duplicateTwo, dia: 0, hora: 1, cantidad: 2 }
      }, teacher.jar);
      assert.equal(corridor.response.status, 201);
      assert.equal(corridor.body.entry.profesor, 'RAFAEL MINANA LLIBRER');
      const patioUnavailable = await request(server.baseUrl, '/api/profesorado/patio-teacher-blocks/own', {
        method: 'PUT', headers: origin,
        body: { weekKey: '2026-09-07', dia: 1, hora: 4, profesor: 'OTHER TEACHER', sourceCode: 'JGP2', active: true }
      }, teacher.jar);
      assert.equal(patioUnavailable.response.status, 200);
      assert.equal(patioUnavailable.body.entry.profesor, 'RAFAEL MINANA LLIBRER');
      assert.equal(patioUnavailable.body.entry.sourceCode, 'RMLL');
      const teacherAdminDenied = await request(server.baseUrl, '/api/guardias', {
        method: 'POST', body: { dia: 0, hora: 1, ausente: 'FORGED' }
      }, teacher.jar);
      assert.equal(teacherAdminDenied.response.status, 403);
      assert.equal((await request(server.baseUrl, '/api/users', {}, teacher.jar)).response.status, 403);

      const duplicateOne = await loginAccount(server, 'duplicate.one');
      const duplicateTwo = await loginAccount(server, 'duplicate.two');
      const oneProfile = await request(server.baseUrl, '/api/schedule/me?date=2026-09-07', {}, duplicateOne.jar);
      const twoProfile = await request(server.baseUrl, '/api/schedule/me?date=2026-09-08', {}, duplicateTwo.jar);
      assert.equal(oneProfile.body.teacher.displayName, twoProfile.body.teacher.displayName);
      assert.equal(oneProfile.body.teacher.sourceCode, 'JGP1');
      assert.equal(twoProfile.body.teacher.sourceCode, 'JGP2');
      assert.equal((await request(server.baseUrl, '/api/auth/logout', { method: 'POST', body: {} }, duplicateOne.jar)).response.status, 200);
      assert.equal((await request(server.baseUrl, '/api/schedule/me?date=2026-09-07', {}, duplicateOne.jar)).response.status, 401);

      const unmapped = await loginAccount(server, 'teacher.unmapped');
      assert.equal((await request(server.baseUrl, '/api/schedule/me?date=2026-09-07', {}, unmapped.jar)).response.status, 404);

      const legacyAdmin = await login(server.baseUrl, 'admin', 'Admin-integration-2026');
      assert.equal(legacyAdmin.response.status, 200);
      assert.equal((await request(server.baseUrl, '/api/guardias', {
        method: 'POST', body: { dia: 0, hora: 2, ausente: 'LEGACY' }
      }, legacyAdmin.jar)).response.status, 403);

      const admin = await loginAccount(server, 'admin.only');
      assert.equal((await request(server.baseUrl, '/api/guardias', {
        method: 'POST', body: { dia: 0, hora: 2, ausente: 'ADMIN TARGET' }
      }, admin.jar)).response.status, 201);
      assert.equal((await request(server.baseUrl, '/api/users', {}, admin.jar)).response.status, 403);
      assert.equal((await request(server.baseUrl, '/api/schedule/me?date=2026-09-07', {}, admin.jar)).response.status, 404);

      const superOnly = await loginAccount(server, 'super.only');
      const superSession = await request(server.baseUrl, '/api/auth/session', {}, superOnly.jar);
      assert.equal(superSession.body.isAdmin, false);
      assert.equal(superSession.body.isSuperAdmin, true);
      assert.equal((await request(server.baseUrl, '/api/users', {}, superOnly.jar)).response.status, 200);
      assert.equal((await request(server.baseUrl, '/api/guardias', {
        method: 'POST', body: { dia: 1, hora: 1, ausente: 'SUPER TARGET' }
      }, superOnly.jar)).response.status, 403);

      const teacherAdmin = await loginAccount(server, 'teacher.admin');
      assert.equal((await request(server.baseUrl, '/api/schedule/me?date=2026-09-09', {}, teacherAdmin.jar)).body.teacher.sourceCode, 'TADM');
      assert.equal((await request(server.baseUrl, '/api/guardias', {
        method: 'POST', body: { dia: 1, hora: 1, ausente: 'TEACHER ADMIN TARGET' }
      }, teacherAdmin.jar)).response.status, 201);
      const teacherAdminSession = await request(server.baseUrl, '/api/auth/session', {}, teacherAdmin.jar);
      assert.equal(teacherAdminSession.body.userId, ids.teacherAdmin);

      const teacherSuper = await loginAccount(server, 'teacher.super');
      assert.equal((await request(server.baseUrl, '/api/schedule/me?date=2026-09-10', {}, teacherSuper.jar)).body.teacher.sourceCode, 'TSUP');
      assert.equal((await request(server.baseUrl, '/api/users', {}, teacherSuper.jar)).response.status, 200);
      assert.equal((await request(server.baseUrl, '/api/guardias', {
        method: 'POST', body: { dia: 2, hora: 1, ausente: 'TEACHER SUPER TARGET' }
      }, teacherSuper.jar)).response.status, 403);

      const all = await loginAccount(server, 'teacher.all');
      assert.equal((await request(server.baseUrl, '/api/schedule/me?date=2026-09-11', {}, all.jar)).body.teacher.sourceCode, 'TALL');
      assert.equal((await request(server.baseUrl, '/api/users', {}, all.jar)).response.status, 200);
      assert.equal((await request(server.baseUrl, '/api/guardias', {
        method: 'POST', body: { dia: 3, hora: 1, ausente: 'ALL TARGET' }
      }, all.jar)).response.status, 201);
      const allSession = await request(server.baseUrl, '/api/auth/session', {}, all.jar);
      assert.equal(allSession.body.userId, ids.all);
      assert.equal(allSession.body.isAdmin, true);
      assert.equal(allSession.body.isSuperAdmin, true);

      const auditDb = await openDatabase(environment.dbPath);
      try {
        const audit = await auditDb.get(
          `SELECT actor_user_id, target_id FROM audit_log
           WHERE action = 'teacher.future_absence.created' AND target_id = 'RMLL'`
        );
        assert.deepEqual(audit, { actor_user_id: ids.teacher, target_id: 'RMLL' });
      } finally {
        await auditDb.close();
      }

      assert.equal(fs.existsSync(path.join(environment.root, 'guardias-test.sqlite')), true);
    } finally {
      await stopServer(server).catch(() => {});
      cleanupTestEnvironment(environment);
    }
  }
}];
