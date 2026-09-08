const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const {
  cleanupTestEnvironment,
  createTestEnvironment,
  loginIndividual,
  request,
  seedActiveSchedule,
  seedIndividualUser,
  startServer,
  stopServer
} = require('./helpers/integration-harness');

const projectRoot = path.join(__dirname, '..', '..');
const source = fs.readFileSync(path.join(projectRoot, 'js', 'app', 'guardias-future-absences.js'), 'utf8');
const auxPanelsSource = fs.readFileSync(path.join(projectRoot, 'js', 'app', 'guardias-aux-panels.js'), 'utf8');

function createFutureAbsenceDomain(options = {}) {
  const writes = [];
  const window = {};
  vm.runInNewContext(source, { window, console, URL, Date, Math, Set, Map });
  const storage = {
    readJson(_key, fallback) { return fallback; },
    writeJson(key, value) { if (options.localCacheEnabled) writes.push({ key, value }); },
    hasBackend() { return true; },
    isBackendOnly() { return !options.localCacheEnabled; },
    async createTeacherFutureAbsence() { throw new Error('simulated connection loss'); },
    async updateTeacherFutureAbsence() { throw new Error('simulated connection loss'); },
    async deleteTeacherFutureAbsence() { throw new Error('simulated connection loss'); }
  };
  window.GuardiasFutureAbsences.init({
    storage,
    formatHoraLabel: hora => `Hora ${hora}`,
    getHorasLectivasProfesorDia: () => [1],
    getTeacherName: () => 'DOCENTE QA',
    getVisibleTeacherName: value => value,
    ensureTeacherIdentityConfirmed: async () => true,
    showToast() {},
    isAdmin: () => true,
    clearSuperAdminError() {},
    setSuperAdminError() {},
    pushSuperAdminEvent() {},
    renderSuperAdminMonitor() {}
  }, { loadFromLocalCache: false, renderOnInit: false, bindDom: false });
  return { domain: window.GuardiasFutureAbsences, writes };
}

function makeEntry(overrides = {}) {
  return {
    id: 'future-qa-2h',
    profesor: 'DOCENTE QA',
    date: '2026-09-03',
    note: '<b>TEST-XSS</b><img src=x onerror="window.__xss_test=1">',
    hours: [1],
    status: 'pending',
    reviewedAt: '',
    appliedAt: '',
    createdAt: '2026-09-02T12:00:00.000Z',
    ...overrides
  };
}

function renderActiveAnnouncementList(entry) {
  const list = { innerHTML: '' };
  const document = {
    activeElement: null,
    body: { classList: { toggle() {} } },
    getElementById(id) { return id === 'tvAnnouncementList' ? list : null; }
  };
  const window = { document };
  vm.runInNewContext(auxPanelsSource, { window, console, URL, Date, Math, Set, Map, performance });
  const domain = window.GuardiasAuxPanels.createTvAnnouncementsDomain({
    document,
    window,
    initialState: { items: [entry] }
  });
  domain.render();
  return list.innerHTML;
}

function renderUnallocatedPatioDuties() {
  const panel = { innerHTML: '' };
  const badge = { textContent: '' };
  const document = {
    getElementById(id) { return id === 'patioPanel' ? panel : id === 'patioBadge' ? badge : null; }
  };
  const window = { document, location: { search: '' } };
  vm.runInNewContext(auxPanelsSource, { window, console, URL, URLSearchParams, Date, Math, Set, Map, performance });
  let requestedSlot = null;
  const domain = window.GuardiasAuxPanels.createTvPanelDomain({
    document,
    window,
    horaMap: { 4: { label: 'Recreo', rango: '11:00-11:25' } },
    horasPatio: new Set([4]),
    dias: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'],
    getRowsForWeekOffset: () => [],
    getVisibleTeacherName: value => value,
    resolveAulaRegistro: () => '',
    assignGuardiasForRows: rows => rows,
    getBibliotecaAsignada: () => '',
    getBanosAsignado: () => '',
    getPatioCoverageSummary: () => ({
      total: 1,
      covered: 1,
      pending: 0,
      unresolved: 1,
      states: [{ sectorId: '0.1', covered: true, statusKind: 'covered', statusLabel: 'Cubierto', responsable: 'DOCENTE QB' }]
    }),
    getPatioSectors: (dia, hora) => {
      requestedSlot = { dia, hora };
      return [{ id: '0.1', label: '0.1 · Biblioteca (dins)', shortLabel: '0.1', mapClass: 'patio-sector-01' }];
    },
    getPatioExtraPosts: () => [
      { id: 'unallocated-patio-test', label: 'Guardia de patio', responsable: 'DOCENTE QA', covered: false, statusKind: 'pending', statusLabel: 'Sin puesto' }
    ]
  });
  domain.renderTvSlotPanel('patioPanel', { dia: 2, hora: 4 }, 'patioBadge', [], { isCurrentSlot: true });
  return { html: panel.innerHTML, requestedSlot };
}

function createExpiredAdminJar() {
  const payload = Buffer.from(JSON.stringify({ role: 'admin', exp: Date.now() - 1000 })).toString('base64url');
  const signature = crypto.createHmac('sha256', 'integration-session-secret-2026').update(payload).digest('base64url');
  return {
    value: () => `guardias_session=${payload}.${signature}`,
    update() {}
  };
}

async function testHttpEdgeCasesAndTwoClients() {
  const environment = createTestEnvironment();
  let server = null;
  try {
    server = await startServer({ dbPath: environment.dbPath });
    await seedActiveSchedule(environment.dbPath);
    await seedIndividualUser(environment.dbPath, {
      username: 'frontend.admin', password: 'Frontend-admin-2026!', roles: ['admin']
    });
    const clientA = await loginIndividual(server.baseUrl, 'frontend.admin', 'Frontend-admin-2026!');
    const clientB = await loginIndividual(server.baseUrl, 'frontend.admin', 'Frontend-admin-2026!');
    assert.strictEqual(clientA.response.status, 200);
    assert.strictEqual(clientB.response.status, 200);

    for (const route of ['/api/guardias', '/api/profesorado/tareas', '/api/profesorado/future-absences', '/api/historial']) {
      const empty = await request(server.baseUrl, route);
      assert.strictEqual(empty.response.status, 200);
      assert.deepStrictEqual(empty.body, []);
    }

    for (const route of ['/', '/js/app/guardias.js', '/css/guardias.css']) {
      const response = await request(server.baseUrl, route);
      assert.strictEqual(response.response.status, 200);
      assert.match(response.response.headers.get('cache-control') || '', /no-store/);
    }
    for (const route of ['/tv', '/print']) {
      const response = await request(server.baseUrl, route);
      assert.strictEqual(response.response.status, 200);
      assert.strictEqual(response.response.headers.get('cache-control'), 'public, max-age=0');
    }

    const invalidEmpty = await request(server.baseUrl, '/api/guardias', {
      method: 'POST',
      body: { dia: 0, hora: 1, ausente: '   ', obs: '<b>TEST-XSS</b>' }
    }, clientA.jar);
    assert.strictEqual(invalidEmpty.response.status, 400);
    const invalidHour = await request(server.baseUrl, '/api/guardias', {
      method: 'POST',
      body: { dia: 0, hora: -1, ausente: 'DOCENTE QA' }
    }, clientA.jar);
    assert.strictEqual(invalidHour.response.status, 400);

    const xssMarker = '<b>TEST-XSS</b><img src=x onerror="window.__xss_test=1">';
    const edgeEntry = makeEntry({
      profesor: "DOCENTE Ñ O'Connor — 😀",
      note: `  ${xssMarker}\nsegunda línea & < > " '  `
    });
    const originHeaders = { origin: server.baseUrl };
    const repeated = await Promise.all([
      request(server.baseUrl, '/api/profesorado/future-absences', { method: 'POST', headers: originHeaders, body: edgeEntry }, clientA.jar),
      request(server.baseUrl, '/api/profesorado/future-absences', { method: 'POST', headers: originHeaders, body: edgeEntry }, clientA.jar)
    ]);
    assert.ok(repeated.every(result => result.response.status === 200));
    const clientBView = await request(server.baseUrl, '/api/profesorado/future-absences', {}, clientB.jar);
    assert.strictEqual(clientBView.body.filter(row => row.id === edgeEntry.id).length, 1);
    assert.strictEqual(clientBView.body[0].profesor, edgeEntry.profesor);
    assert.ok(clientBView.body[0].note.includes(xssMarker));

    const longTask = 'áñ😀<script>TEST-XSS</script>'.repeat(4000);
    const taskId = 'task-qa-2h';
    const tasks = await Promise.all([
      request(server.baseUrl, '/api/profesorado/tareas', { method: 'POST', body: { id: taskId, profesor: 'DOCENTE QA', dia: 0, hora: 1, dejada: true, tarea: longTask } }, clientA.jar),
      request(server.baseUrl, '/api/profesorado/tareas', { method: 'POST', body: { id: taskId, profesor: 'DOCENTE QA', dia: 0, hora: 1, dejada: true, tarea: longTask } }, clientA.jar)
    ]);
    assert.ok(tasks.every(result => result.response.status === 200));
    const storedTasks = await request(server.baseUrl, '/api/profesorado/tareas', {}, clientB.jar);
    assert.strictEqual(storedTasks.body.filter(row => row.id === taskId).length, 1);
    assert.strictEqual(storedTasks.body[0].tarea.length, longTask.length);

    const absencePayload = { dia: 0, hora: 2, ausente: 'DOCENTE DOBLE ENVÍO', guardia: '', aula: 'QA', faena: true, obs: xssMarker };
    const duplicateAbsence = await Promise.all([
      request(server.baseUrl, '/api/guardias', { method: 'POST', body: absencePayload }, clientA.jar),
      request(server.baseUrl, '/api/guardias', { method: 'POST', body: absencePayload }, clientA.jar)
    ]);
    assert.deepStrictEqual(duplicateAbsence.map(result => result.response.status).sort(), [201, 409]);
    const afterDuplicate = await request(server.baseUrl, '/api/guardias', {}, clientB.jar);
    const created = afterDuplicate.body.find(row => row.ausente === absencePayload.ausente);
    assert.ok(created);
    assert.strictEqual(afterDuplicate.body.filter(row => row.ausente === absencePayload.ausente).length, 1);

    const updated = await request(server.baseUrl, `/api/guardias/${created.id}`, {
      method: 'PUT',
      body: { ...absencePayload, guardia: 'DOCENTE COBERTURA', obs: 'actualizada' }
    }, clientA.jar);
    assert.strictEqual(updated.response.status, 200);
    const afterUpdate = await request(server.baseUrl, '/api/guardias', {}, clientB.jar);
    assert.strictEqual(afterUpdate.body.find(row => row.id === created.id).guardia, 'DOCENTE COBERTURA');
    const deleted = await request(server.baseUrl, `/api/guardias/${created.id}`, { method: 'DELETE' }, clientA.jar);
    assert.strictEqual(deleted.response.status, 204);
    const afterDelete = await request(server.baseUrl, '/api/guardias', {}, clientB.jar);
    assert.ok(!afterDelete.body.some(row => row.id === created.id));

    const longNotice = '<svg onload="window.__xss_test=1">' + 'x'.repeat(700);
    const controlledNoticeId = "');window.__xss_test=1;//";
    const notice = await request(server.baseUrl, '/api/avisos/tv', {
      method: 'PUT',
      body: { items: [{ id: controlledNoticeId, text: longNotice, active: true, priority: 'urgent' }] }
    }, clientA.jar);
    assert.strictEqual(notice.response.status, 200);
    assert.strictEqual(notice.body.items[0].text.length, 600);
    assert.ok(notice.body.items[0].text.startsWith('<svg onload='));
    assert.strictEqual(notice.body.items[0].id, controlledNoticeId);

    const staleCookie = clientA.jar.value();
    await request(server.baseUrl, '/api/auth/logout', { method: 'POST', body: {} }, clientA.jar);
    const clearedWrite = await request(server.baseUrl, '/api/guardias', { method: 'POST', body: { ...absencePayload, hora: 3 } }, clientA.jar);
    assert.strictEqual(clearedWrite.response.status, 401);
    assert.ok(staleCookie.includes('guardias_session='));
    const afterRejectedWrite = await request(server.baseUrl, '/api/guardias');
    assert.ok(!afterRejectedWrite.body.some(row => row.hora === 3 && row.ausente === absencePayload.ausente));

    const expiredWrite = await request(server.baseUrl, '/api/guardias', {
      method: 'POST',
      body: { ...absencePayload, hora: 3 }
    }, createExpiredAdminJar());
    assert.strictEqual(expiredWrite.response.status, 401);
    const afterExpiredWrite = await request(server.baseUrl, '/api/guardias');
    assert.ok(!afterExpiredWrite.body.some(row => row.hora === 3 && row.ausente === absencePayload.ausente));
  } finally {
    await stopServer(server).catch(() => {});
    cleanupTestEnvironment(environment);
  }
}

async function testTemporaryConnectionLossAndRecovery() {
  const environment = createTestEnvironment();
  let server = null;
  try {
    server = await startServer({ dbPath: environment.dbPath });
    const port = Number(new URL(server.baseUrl).port);
    const baseUrl = server.baseUrl;
    const initialHealth = await request(baseUrl, '/api/health');
    assert.strictEqual(initialHealth.response.status, 200);

    await stopServer(server);
    server = null;
    await assert.rejects(fetch(`${baseUrl}/api/health`));

    server = await startServer({ dbPath: environment.dbPath, port });
    const recoveredHealth = await request(baseUrl, '/api/health');
    assert.strictEqual(recoveredHealth.response.status, 200);
    assert.strictEqual(recoveredHealth.body.ok, true);
  } finally {
    await stopServer(server).catch(() => {});
    cleanupTestEnvironment(environment);
  }
}

module.exports = [
  {
    name: 'active announcement rendering keeps controlled ids out of executable handlers',
    fn() {
      const controlledId = "');window.__xss_test=1;//";
      const html = renderActiveAnnouncementList({
        id: controlledId,
        text: '<b>TEST-XSS</b>',
        active: false,
        priority: 'normal'
      });
      assert.ok(html.includes('data-tv-announcement-id="&#39;);window.__xss_test=1;//"'));
      assert.ok(html.includes('&lt;b&gt;TEST-XSS&lt;/b&gt;'));
      assert.ok(!html.includes('onclick='));
      assert.ok(!html.includes('<b>TEST-XSS</b>'));
    }
  },
  {
    name: 'future absence rendering escapes inert XSS markers',
    fn() {
      const { domain } = createFutureAbsenceDomain();
      const html = domain.renderFutureAbsenceCard(makeEntry(), { showTeacherName: true });
      assert.ok(html.includes('&lt;b&gt;TEST-XSS&lt;/b&gt;'));
      assert.ok(html.includes('&lt;img src=x onerror=&quot;window.__xss_test=1&quot;&gt;'));
      assert.ok(!html.includes('<b>TEST-XSS</b>'));
      assert.ok(!html.includes('<img src=x'));
    }
  },
  {
    name: 'patio panel keeps imported break duties visible and explicitly unallocated',
    fn() {
      const result = renderUnallocatedPatioDuties();
      assert.deepStrictEqual(result.requestedSlot, { dia: 2, hora: 4 });
      assert.ok(result.html.includes('1 obligación sin puesto'));
      assert.ok(result.html.includes('Guardia de patio'));
      assert.ok(result.html.includes('Biblioteca (dins)'));
      assert.ok(result.html.includes('DOCENTE QA'));
      assert.ok(result.html.includes('DOCENTE QB'));
      assert.ok(result.html.includes('Sin puesto'));
      assert.ok(!result.html.includes('No hay configuraci'));
    }
  },
  {
    name: 'backend-only future absence reports failure and leaves no transient state when connection is lost',
    async fn() {
      const firstLoad = createFutureAbsenceDomain({ localCacheEnabled: false });
      const result = await firstLoad.domain.createEntry(makeEntry());
      assert.strictEqual(result.ok, false);
      assert.strictEqual(firstLoad.domain.getRows().length, 0);
      assert.strictEqual(firstLoad.writes.length, 0);

      const reload = createFutureAbsenceDomain({ localCacheEnabled: false });
      assert.strictEqual(reload.domain.getRows().length, 0);
    }
  },
  {
    name: 'frontend HTTP edge cases remain isolated, escaped at render, idempotent and visible to a second client',
    fn: testHttpEdgeCasesAndTwoClients
  },
  {
    name: 'temporary HTTP connection loss rejects cleanly and recovers on the same origin',
    fn: testTemporaryConnectionLossAndRecovery
  }
];
