const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { importTeacherProfiles, importScheduleDataset, activateScheduleDataset } = require('../schedule-model');
const { cleanupTestEnvironment, createTestEnvironment, loginIndividual, openDatabase,
  request, seedIndividualUser, startServer, stopServer } = require('./helpers/integration-harness');

async function fixture() {
  const environment = createTestEnvironment();
  const server = await startServer({ dbPath: environment.dbPath });
  try {
  const db = await openDatabase(environment.dbPath);
  try {
    const teachers = ['AA', 'BB', 'CC', 'DD', 'BUSY', 'MEET', 'OTHER', 'PATIO', 'LIBRARY', 'INCLUSIVE', 'FREE', 'INACTIVE'].map(code => ({
      source_code: code, display_name: `Teacher ${code}`, active: true
    }));
    await importTeacherProfiles(db, { academic_year: '2026/27', source_system: 'test', teachers, teacher_count: teachers.length });
    const imported = await importScheduleDataset(db, {
      academic_year: '2026/27', label: 'Coverage regression', source: { system: 'test', format: 'test' },
      teacher_source_codes: teachers.map(t => t.source_code),
      periods: [
        { key: 'P1', position: 1, type: 'teaching', starts_at: '08:15', ends_at: '09:10' },
        { key: 'P2', position: 2, type: 'teaching', starts_at: '09:10', ends_at: '10:05' },
        { key: 'P3', position: 3, type: 'teaching', starts_at: '10:05', ends_at: '11:00' },
        { key: 'B1', position: 4, type: 'break', starts_at: '11:00', ends_at: '11:25' },
        { key: 'B2', position: 5, type: 'break', starts_at: '11:25', ends_at: '11:40' },
        { key: 'P4', position: 6, type: 'teaching', starts_at: '11:40', ends_at: '12:35' }
      ],
      sessions: [
        ...['AA', 'BB'].flatMap(code => ['P1', 'P2', 'P3', 'P4'].map(period_key => ({
          teacher_source_code: code, weekday: 0, period_key, type: 'class',
          subject: code === 'AA' ? 'Matemáticas' : '', group: '1ESO', room: code === 'AA' ? 'A-101' : ''
        }))),
        ...['CC', 'DD'].flatMap(code => ['P1', 'P2', 'P3', 'P4'].map(period_key => ({
          teacher_source_code: code, weekday: 0, period_key, type: 'guardia'
        }))),
        { teacher_source_code: 'BUSY', weekday: 0, period_key: 'P1', type: 'class' },
        { teacher_source_code: 'MEET', weekday: 0, period_key: 'P2', type: 'meeting' },
        { teacher_source_code: 'OTHER', weekday: 0, period_key: 'P3', type: 'other' },
        { teacher_source_code: 'PATIO', weekday: 0, period_key: 'B1', type: 'guardia_patio' },
        { teacher_source_code: 'LIBRARY', weekday: 0, period_key: 'B2', type: 'biblioteca_patio' },
        { teacher_source_code: 'INCLUSIVE', weekday: 0, period_key: 'P4', type: 'patio_inclusivo' },
        { teacher_source_code: 'INACTIVE', weekday: 0, period_key: 'P1', type: 'guardia' }
      ]
    });
    await activateScheduleDataset(db, imported.datasetId);
    await db.run("UPDATE teacher_profiles SET is_active = 0 WHERE display_name = 'Teacher INACTIVE'");
  } finally { await db.close(); }
  await seedIndividualUser(environment.dbPath, { username: 'coverage.admin', password: 'Coverage-fixture-2026!', roles: ['admin'] });
  await seedIndividualUser(environment.dbPath, { username: 'coverage.teacher', password: 'Coverage-fixture-2026!', roles: ['teacher'] });
  const admin = await loginIndividual(server.baseUrl, 'coverage.admin', 'Coverage-fixture-2026!');
  return { environment, server, admin };
  } catch (error) {
    await stopServer(server);
    cleanupTestEnvironment(environment);
    throw error;
  }
}

const absence = (ausente, guardia = '', hora = 1) => ({ dia: 0, hora, ausente, guardia, aula: 'STALE-ROOM', faena: false, obs: '' });

// Exercise the production parser, override resolver and shared desktop/mobile markup
// against the real HTTP payloads; this is not a browser-interaction test.
function renderer(payload, overrides) {
  const source = fs.readFileSync(path.join(__dirname, '../../js/app/guardias.js'), 'utf8');
  const extract = name => {
    const start = source.indexOf(`function ${name}(`);
    assert.ok(start >= 0);
    return source.slice(start, source.indexOf('\n}', start) + 2);
  };
  const context = {
    cleanText: value => String(value ?? '').replace(/\s+/g, ' ').trim(),
    isGuardiaTexto: text => /guardia/i.test(text),
    getVisibleTeacherName: value => String(value || '').trim(),
    escapeHtml: value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])),
    getHorarioProfesorDia: (name, day) => Object.fromEntries((payload.teachers.find(t => t.nombre === name)?.horario || [])
      .filter(s => s.dia === ['Lunes', 'Martes'][day]).map(s => [s.slot, context.parseSesion(s)])),
    getSessionOverride: (name, day, hour) => overrides.find(o => o.profesor === name && o.dia === day && o.hora === hour)
  };
  vm.createContext(context);
  vm.runInContext(['parseSesion', 'resolveTeacherSession', 'getAbsenceSessionDisplay', 'getAbsenceCoverageDisplay', 'buildTvAbsenceAssignment', 'renderAbsenceSessionDetails'].map(extract).join('\n'), context);
  const render = row => context.renderAbsenceSessionDetails(context.getAbsenceSessionDisplay(row));
  render.coverageDisplay = row => context.getAbsenceCoverageDisplay(row);
  render.tvAssignment = row => context.buildTvAbsenceAssignment(row);
  return render;
}

function tvAssignments(rows, buildTvAbsenceAssignment) {
  const source = fs.readFileSync(path.join(__dirname, '../../js/app/guardias-aux-panels.js'), 'utf8');
  const document = {};
  const window = { document, location: { search: '', protocol: 'http:', href: 'http://localhost/' } };
  vm.runInNewContext(source, { window, console, URL, URLSearchParams, Date, Math, Set, Map, performance });
  return window.GuardiasAuxPanels.createTvPanelDomain({
    document,
    window,
    horaMap: { 1: { label: '1a', rango: '08:15-09:10' } },
    horasPatio: new Set(),
    dias: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'],
    getRowsForWeekOffset: () => rows,
    getVisibleTeacherName: value => value,
    buildTvAbsenceAssignment,
    getBibliotecaAsignada: () => '',
    getBanosAsignado: () => ''
  }).getTvSlotAssignments({ dia: 0, hora: 1 }, rows);
}

module.exports = [
  {
    name: 'coverage rejects busy, absent, unknown and duplicate teachers atomically in single and batch writes',
    async fn() {
      const f = await fixture();
      let server = f.server;
      try {
        const write = (url, body, method = 'POST', jar = f.admin.jar) => request(server.baseUrl, url, { method, body }, jar);
        assert.equal((await write('/api/guardias', absence('AA', 'CC'), 'POST', null)).response.status, 401);
        const teacher = await loginIndividual(server.baseUrl, 'coverage.teacher', 'Coverage-fixture-2026!');
        assert.equal((await write('/api/guardias', { ...absence('AA', 'CC'), roles: ['admin'] }, 'POST', teacher.jar)).response.status, 403);
        for (const guardia of ['BUSY', 'FREE', 'INACTIVE', 'MISSING', 'AA']) {
          assert.equal((await write('/api/guardias', absence('AA', guardia))).response.status, 409, guardia);
        }
        for (const [guardia, hora] of [['MEET', 2], ['OTHER', 3], ['PATIO', 4], ['LIBRARY', 5], ['INCLUSIVE', 6]]) {
          assert.equal((await write('/api/guardias', absence('AA', guardia, hora))).response.status, 409, guardia);
        }
        const first = await write('/api/guardias', absence('AA', 'CC'));
        assert.equal(first.response.status, 201);
        assert.equal((await write(`/api/guardias/${first.body.id}`, absence('AA', 'Teacher CC'), 'PUT')).response.status, 200);
        assert.equal((await write('/api/guardias', absence('BB', ' cc '))).response.status, 409);
        assert.equal((await write('/api/guardias', absence('Teacher CC'))).response.status, 409);
        const second = await write('/api/guardias', absence('BB', 'DD'));
        assert.equal(second.response.status, 201);
        assert.equal((await write(`/api/guardias/${second.body.id}`, absence('BB', 'CC'), 'PUT')).response.status, 409);
        assert.equal((await write(`/api/guardias/${second.body.id}`, absence('BB', 'BUSY'), 'PUT')).response.status, 409);
        const snapshot = (await request(server.baseUrl, '/api/guardias')).body;
        assert.equal((await write('/api/guardias/replace', [absence('AA', 'DD'), absence('BB', 'Teacher DD')], 'PUT')).response.status, 409);
        assert.deepEqual((await request(server.baseUrl, '/api/guardias')).body, snapshot);
        const swapped = [absence('AA', 'DD'), absence('BB', 'CC')];
        assert.equal((await write('/api/guardias/replace', swapped, 'PUT')).response.status, 200);
        const saved = (await request(server.baseUrl, '/api/guardias')).body;
        assert.equal((await write('/api/guardias/replace', swapped, 'PUT')).response.status, 200);
        assert.deepEqual((await request(server.baseUrl, '/api/guardias')).body, saved);
        assert.equal((await write('/api/guardias/replace', [absence('AA', 'BUSY')], 'PUT')).response.status, 409);
        assert.equal((await write('/api/guardias/replace', [], 'PUT')).response.status, 200);
        const concurrent = await Promise.all([write('/api/guardias', absence('AA', 'CC')), write('/api/guardias', absence('BB', 'Teacher CC'))]);
        assert.deepEqual(concurrent.map(r => r.response.status).sort(), [201, 409]);
        const final = (await request(server.baseUrl, '/api/guardias')).body;
        await stopServer(server);
        server = await startServer({ dbPath: f.environment.dbPath });
        assert.deepEqual((await request(server.baseUrl, '/api/guardias')).body, final);
        const db = await openDatabase(f.environment.dbPath);
        try {
          assert.equal(Object.values(await db.get('PRAGMA integrity_check'))[0], 'ok');
          assert.deepEqual(await db.all('PRAGMA foreign_key_check'), []);
        } finally { await db.close(); }
      } finally { await stopServer(server); cleanupTestEnvironment(f.environment); }
    }
  },
  {
    name: 'absence markup shows effective group, room and subject from HTTP canonical data and overrides without invented rooms',
    async fn() {
      const { environment, server, admin } = await fixture();
      try {
        for (const name of ['Teacher AA', 'Teacher BB', 'Teacher BUSY']) {
          assert.equal((await request(server.baseUrl, '/api/guardias', { method: 'POST', body: absence(name) }, admin.jar)).response.status, 201);
        }
        const legacy = await request(server.baseUrl, '/api/schedule/legacy.js');
        assert.equal(legacy.response.status, 200);
        const context = { window: {} };
        vm.runInNewContext(legacy.body.toString(), context);
        const payload = context.window.PROFESORADO_SOURCE;
        const rows = (await request(server.baseUrl, '/api/guardias')).body;
        let render = renderer(payload, []);
        assert.match(render(rows[0]), /Grupo 1ESO/);
        assert.match(render(rows[0]), /Aula A-101/);
        assert.match(render(rows[0]), /Matemáticas/);
        assert.match(render(rows[1]), /Grupo 1ESO/);
        assert.match(render(rows[1]), /Aula no indicada/);
        assert.doesNotMatch(render(rows[1]), /Aula 1ESO|STALE-ROOM/);
        assert.match(render(rows[2]), /Grupo no indicado/);
        assert.match(render(rows[2]), /Aula no indicada/);
        assert.match(render(absence('Unknown')), /Aula no indicada/);
        for (const aula of ['B-204', '', '<img src=x onerror=alert(1)>']) {
          const override = { id: 'room-override', profesor: 'Teacher AA', dia: 0, hora: 1, grupo: '2ESO', materia: 'Matemáticas', aula };
          assert.equal((await request(server.baseUrl, '/api/profesorado/session-overrides', { method: 'POST', body: override }, admin.jar)).response.status, 200);
          const overrides = await request(server.baseUrl, '/api/profesorado/session-overrides');
          assert.equal(overrides.response.status, 200);
          render = renderer(payload, overrides.body);
          const html = render(rows[0]);
          assert.match(html, /Grupo 2ESO/);
          assert.match(html, /Matemáticas/);
          assert.doesNotMatch(html, /A-101|STALE-ROOM|<img/);
          assert.ok(html.includes(aula === '' ? 'Aula no indicada' : aula === 'B-204' ? 'Aula B-204' : '&lt;img'));
        }
        const tvOverride = { id: 'room-override', profesor: 'Teacher AA', dia: 0, hora: 1, grupo: '2ESO', materia: 'Matemáticas', aula: 'B-204' };
        assert.equal((await request(server.baseUrl, '/api/profesorado/session-overrides', { method: 'POST', body: tvOverride }, admin.jar)).response.status, 200);
        render = renderer(payload, (await request(server.baseUrl, '/api/profesorado/session-overrides')).body);
        const tv = tvAssignments([
          { ...rows[0], guardia: '' },
          { ...rows[1], guardia: 'Teacher CC' }
        ], render.tvAssignment);
        assert.deepEqual(JSON.parse(JSON.stringify(tv)), [
          { teacher: 'Sin cubrir', location: 'Grupo 2ESO · Aula B-204', meta: 'Pendiente · Ausente: Teacher AA · Matemáticas', tone: 'general' },
          { teacher: 'Teacher CC', location: 'Grupo 1ESO · Aula no indicada', meta: 'Cubierta · Ausente: Teacher BB', tone: 'general' }
        ]);
        assert.equal((await request(server.baseUrl, '/api/guardias')).response.status, 200);
      } finally { await stopServer(server); cleanupTestEnvironment(environment); }
    }
  }
];
