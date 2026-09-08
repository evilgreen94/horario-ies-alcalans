const assert = require('node:assert/strict');
const { activateScheduleDataset, importScheduleDataset, importTeacherProfiles } = require('../schedule-model');
const {
  cleanupTestEnvironment, createTestEnvironment, login, openDatabase,
  request, startServer, stopServer
} = require('./helpers/integration-harness');

module.exports = [{
  name: 'special patio-related absences remain visible but server rejects automatic coverage assignments',
  async fn() {
    const environment = createTestEnvironment();
    let server;
    try {
      server = await startServer({ dbPath: environment.dbPath });
      const db = await openDatabase(environment.dbPath);
      try {
        await importTeacherProfiles(db, {
          academic_year: '2026/27', source_system: 'test', teacher_count: 1,
          teachers: [{ source_code: 'T001', display_name: 'Test Teacher', active: true }]
        }, { sourceFormat: 'test' });
        const imported = await importScheduleDataset(db, {
          academic_year: '2026/27', label: 'Special coverage test',
          source: { system: 'test', format: 'test' }, teacher_source_codes: ['T001'],
          periods: [
            { key: 'P1', position: 1, type: 'teaching', starts_at: '08:00', ends_at: '09:00' },
            { key: 'P2', position: 2, type: 'teaching', starts_at: '09:00', ends_at: '10:00' },
            { key: 'B1', position: 3, type: 'break', starts_at: '10:00', ends_at: '10:20' },
            { key: 'B2', position: 4, type: 'break', starts_at: '11:20', ends_at: '11:40' }
          ],
          sessions: [
            { teacher_source_code: 'T001', weekday: 0, period_key: 'P1', type: 'class' },
            { teacher_source_code: 'T001', weekday: 0, period_key: 'P2', type: 'patio_inclusivo' },
            { teacher_source_code: 'T001', weekday: 0, period_key: 'B1', type: 'guardia_patio' },
            { teacher_source_code: 'T001', weekday: 0, period_key: 'B2', type: 'biblioteca_patio' }
          ]
        });
        await activateScheduleDataset(db, imported.datasetId);
      } finally { await db.close(); }

      const admin = await login(server.baseUrl, 'admin', 'Admin-integration-2026');
      const origin = { origin: server.baseUrl };
      for (const hour of [2, 3, 4]) {
        const covered = await request(server.baseUrl, '/api/guardias', {
          method: 'POST', headers: origin,
          body: { dia: 0, hora: hour, ausente: 'Test Teacher', guardia: 'Replacement', aula: '', faena: false, obs: '' }
        }, admin.jar);
        assert.equal(covered.response.status, 409, `hour ${hour}`);
        const visible = await request(server.baseUrl, '/api/guardias', {
          method: 'POST', headers: origin,
          body: { dia: 0, hora: hour, ausente: 'Test Teacher', guardia: '', aula: '', faena: false, obs: '' }
        }, admin.jar);
        assert.equal(visible.response.status, 201, `hour ${hour}`);
      }
      const sourceCodeAttempt = await request(server.baseUrl, '/api/guardias', {
        method: 'POST', headers: origin,
        body: {
          dia: 0, hora: 3, ausente: 'T001', guardia: 'Replacement', aula: '', faena: false, obs: '',
          password: 'DO_NOT_LOG_THIS_SECRET'
        }
      }, admin.jar);
      assert.equal(sourceCodeAttempt.response.status, 409);
      assert.equal(server.output.join('').includes('DO_NOT_LOG_THIS_SECRET'), false);
      const ordinary = await request(server.baseUrl, '/api/guardias', {
        method: 'POST', headers: origin,
        body: { dia: 0, hora: 1, ausente: 'Test Teacher', guardia: 'Replacement', aula: '', faena: false, obs: '' }
      }, admin.jar);
      assert.equal(ordinary.response.status, 201);
      const absences = await request(server.baseUrl, '/api/guardias');
      assert.equal(absences.body.length, 4);
      assert.equal(absences.body.filter(row => row.guardia).length, 1);
    } finally {
      await stopServer(server).catch(() => {});
      cleanupTestEnvironment(environment);
    }
  }
}];
