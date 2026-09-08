const assert = require('node:assert/strict');

const { hashPassword } = require('../auth');
const {
  activateScheduleDataset,
  importScheduleDataset,
  importTeacherProfiles
} = require('../schedule-model');
const {
  cleanupTestEnvironment,
  createTestEnvironment,
  loginIndividual,
  openDatabase,
  request,
  startServer,
  stopServer
} = require('./helpers/integration-harness');

async function testEverySessionTypeRemainsOccupied() {
  const environment = createTestEnvironment();
  let server = null;
  try {
    server = await startServer({ dbPath: environment.dbPath });
    await stopServer(server);
    server = null;

    const db = await openDatabase(environment.dbPath);
    try {
      await importTeacherProfiles(db, {
        schema_version: 1,
        academic_year: '2026/27',
        source_system: 'test',
        teacher_count: 1,
        teachers: [{ source_code: 'STATE', display_name: 'Runtime State Test', active: true }]
      }, { expectedCount: 1 });
      const imported = await importScheduleDataset(db, {
        schema_version: 1,
        academic_year: '2026/27',
        label: 'Runtime state fixture',
        source: { system: 'test', format: 'test', provisional: true },
        periods: [
          { key: 'P1', position: 1, type: 'teaching', label: 'P1', starts_at: '08:00', ends_at: '08:50' },
          { key: 'P2', position: 2, type: 'teaching', label: 'P2', starts_at: '08:50', ends_at: '09:40' },
          { key: 'P3', position: 3, type: 'teaching', label: 'P3', starts_at: '09:40', ends_at: '10:30' },
          { key: 'B1', position: 4, type: 'break', label: 'Break', starts_at: '10:30', ends_at: '10:50' },
          { key: 'P4', position: 5, type: 'teaching', label: 'P4', starts_at: '10:50', ends_at: '11:40' },
          { key: 'P5', position: 6, type: 'teaching', label: 'P5', starts_at: '11:40', ends_at: '12:30' },
          { key: 'B2', position: 7, type: 'break', label: 'Break 2', starts_at: '12:30', ends_at: '12:45' }
        ],
        sessions: [
          { teacher_source_code: 'STATE', weekday: 0, period_key: 'P1', type: 'class', subject: 'Class' },
          { teacher_source_code: 'STATE', weekday: 0, period_key: 'P2', type: 'guardia', label: 'Guardia' },
          { teacher_source_code: 'STATE', weekday: 0, period_key: 'P3', type: 'meeting', label: 'Meeting' },
          { teacher_source_code: 'STATE', weekday: 0, period_key: 'B1', type: 'guardia_patio', label: 'GUÀRDIES PATI' },
          { teacher_source_code: 'STATE', weekday: 0, period_key: 'P4', type: 'other', label: 'Other obligation' },
          { teacher_source_code: 'STATE', weekday: 1, period_key: 'B1', type: 'biblioteca_patio', room: 'Biblioteca', label: 'BIBLIOTECA PATI' }
        ]
      });
      await activateScheduleDataset(db, imported.datasetId);

      const credential = hashPassword('Runtime-state-password-2026');
      const user = await db.run(
        `INSERT INTO users (username, display_name, password_hash, password_salt)
         VALUES ('runtime.state', 'Runtime State Test', ?, ?)`,
        [credential.hash, credential.salt]
      );
      const role = await db.get("SELECT id FROM roles WHERE key = 'teacher'");
      await db.run('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [user.lastID, role.id]);
      const profile = await db.get(
        `SELECT profile.id, profile.academic_year_id
         FROM teacher_profiles profile
         JOIN teacher_external_identities identity ON identity.teacher_profile_id = profile.id
         WHERE identity.external_key = 'STATE'`
      );
      await db.run(
        `INSERT INTO teacher_assignments
          (user_id, teacher_profile_id, academic_year_id, assignment_type, starts_on)
         VALUES (?, ?, ?, 'titular', '2026-09-01')`,
        [user.lastID, profile.id, profile.academic_year_id]
      );
    } finally {
      await db.close();
    }

    server = await startServer({ dbPath: environment.dbPath });
    const login = await loginIndividual(server.baseUrl, 'runtime.state', 'Runtime-state-password-2026');
    assert.equal(login.response.status, 200);
    const madridParts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Madrid',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(new Date()).map(part => [part.type, part.value]));
    const todayInMadrid = `${madridParts.year}-${madridParts.month}-${madridParts.day}`;
    const mondayDate = todayInMadrid === '2026-09-07' ? '2026-09-14' : '2026-09-07';
    const result = await request(server.baseUrl, `/api/schedule/me?date=${mondayDate}`, {}, login.jar);
    assert.equal(result.response.status, 200);
    assert.deepEqual(
      Object.fromEntries(result.body.periods.map(period => [period.key, period.state])),
      { P1: 'class', P2: 'guardia', P3: 'meeting', B1: 'guardia_patio', P4: 'other', P5: 'free', B2: 'break' }
    );
    for (const key of ['P1', 'P2', 'P3', 'P4']) {
      assert.notEqual(result.body.periods.find(period => period.key === key).state, 'free');
    }
    assert.equal(result.body.periods.find(period => period.key === 'B1').session.label, 'GUÀRDIES PATI');
    const library = await request(server.baseUrl, '/api/schedule/me?date=2026-09-08', {}, login.jar);
    assert.equal(library.response.status, 200);
    assert.equal(library.body.periods.find(period => period.key === 'B1').state, 'biblioteca_patio');
    assert.equal(library.body.periods.find(period => period.key === 'B1').session.label, 'BIBLIOTECA PATI');
    const ordinaryBreak = await request(server.baseUrl, '/api/schedule/me?date=2026-09-09', {}, login.jar);
    assert.equal(ordinaryBreak.response.status, 200);
    assert.equal(ordinaryBreak.body.periods.find(period => period.key === 'B1').state, 'break');
    assert.equal(result.body.currentState, 'outside');
  } finally {
    await stopServer(server).catch(() => {});
    cleanupTestEnvironment(environment);
  }
}

module.exports = [
  {
    name: 'canonical runtime distinguishes occupied patio and library duties from ordinary breaks and free periods',
    fn: testEverySessionTypeRemainsOccupied
  }
];
