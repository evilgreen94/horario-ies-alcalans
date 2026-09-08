const assert = require('node:assert/strict');
const fs = require('node:fs');

const { importTeacherProfiles } = require('../schedule-model');
const {
  cleanupTestEnvironment,
  createTestEnvironment,
  login,
  openDatabase,
  request,
  startServer,
  stopServer
} = require('./helpers/integration-harness');

async function testAnnualXmlPersistsOnlyInSqlite() {
  const environment = createTestEnvironment();
  let server = null;
  try {
    server = await startServer({ dbPath: environment.dbPath });
    const db = await openDatabase(environment.dbPath);
    try {
      await importTeacherProfiles(db, {
        schema_version: 1,
        academic_year: '2026/27',
        source_system: 'Peñalara Software',
        teacher_count: 2,
        teachers: [
          { source_code: 'JGP1', display_name: 'JOSE GARCIA PEREZ', active: true },
          { source_code: 'JGP2', display_name: 'JOSE GARCIA PEREZ', active: true }
        ]
      }, { expectedCount: 2 });
    } finally {
      await db.close();
    }

    const xmlText = `
      <horarios fuente="Horario XML de prueba" academic_year="2026/27" source_system="Peñalara Software">
        <teacher nombre="JOSE GARCIA PEREZ" source_code="JGP1">
          <session dia="Lunes" inicio="08:15" fin="09:10" tipo="Clase" asignatura="Materia" grupo="Grupo" aula="A1" />
        </teacher>
        <teacher nombre="JOSE GARCIA PEREZ" source_code="JGP2">
          <session dia="Martes" inicio="09:10" fin="10:05" tipo="Clase" asignatura="Otra materia" grupo="Otro grupo" aula="B2" />
        </teacher>
      </horarios>
    `;
    const anonymous = await request(server.baseUrl, '/api/profesorado/annual-import/xml', {
      method: 'POST',
      headers: { origin: server.baseUrl },
      body: { fileName: 'horario.xml', academicYear: '2026/27', xmlBase64: Buffer.from(xmlText).toString('base64') }
    });
    assert.equal(anonymous.response.status, 401);

    const admin = await login(server.baseUrl, 'admin', 'Admin-integration-2026');
    assert.equal(admin.response.status, 200);
    const preview = await request(server.baseUrl, '/api/profesorado/annual-import/xml/preview', {
      method: 'POST',
      headers: { origin: server.baseUrl },
      body: { fileName: 'horario.xml', academicYear: '2026/27', xmlBase64: Buffer.from(xmlText).toString('base64') }
    }, admin.jar);
    assert.equal(preview.response.status, 200);
    assert.equal(preview.body.academicYear, '2026/27');
    assert.equal(preview.body.teachers, 2);
    assert.equal(preview.body.sessions, 2);

    const imported = await request(server.baseUrl, '/api/profesorado/annual-import/xml', {
      method: 'POST',
      headers: { origin: server.baseUrl },
      body: { fileName: 'horario.xml', academicYear: '2026/27', xmlBase64: Buffer.from(xmlText).toString('base64') }
    }, admin.jar);
    assert.equal(imported.response.status, 200);
    assert.equal(imported.body.datasetStatus, 'validated');
    assert.equal(imported.body.activated, false);
    assert.equal(imported.body.teachers, 2);
    assert.equal(imported.body.sessions, 2);
    assert.equal('sourceFile' in imported.body, false);
    assert.equal('outputFile' in imported.body, false);
    assert.equal('xmlSnapshotFile' in imported.body, false);

    const persisted = await openDatabase(environment.dbPath);
    try {
      assert.equal((await persisted.get("SELECT COUNT(*) AS total FROM schedule_datasets WHERE status = 'validated'")).total, 1);
      assert.equal((await persisted.get('SELECT COUNT(*) AS total FROM teacher_schedule_sessions')).total, 2);
      assert.equal((await persisted.get("SELECT COUNT(*) AS total FROM schedule_datasets WHERE status = 'active'")).total, 0);
      const identities = await persisted.all(
        `SELECT identity.external_key AS source_code,
                profile.display_name,
                session.weekday,
                period.period_key
         FROM teacher_schedule_sessions session
         JOIN teacher_profiles profile ON profile.id = session.teacher_profile_id
         JOIN teacher_external_identities identity ON identity.id = session.teacher_external_identity_id
         JOIN schedule_periods period ON period.id = session.period_id
         ORDER BY identity.external_key`
      );
      assert.deepEqual(identities, [
        { source_code: 'JGP1', display_name: 'JOSE GARCIA PEREZ', weekday: 0, period_key: 'P1' },
        { source_code: 'JGP2', display_name: 'JOSE GARCIA PEREZ', weekday: 1, period_key: 'P2' }
      ]);
    } finally {
      await persisted.close();
    }
    assert.deepEqual(
      fs.readdirSync(environment.root).filter(name => /\.(?:json|xml|js)$/i.test(name)),
      []
    );
  } finally {
    await stopServer(server).catch(() => {});
    cleanupTestEnvironment(environment);
  }
}

module.exports = [
  {
    name: 'annual XML import keeps duplicate display names independent and persists only in isolated SQLite',
    fn: testAnnualXmlPersistsOnlyInSqlite
  }
];
