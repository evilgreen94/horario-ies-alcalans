const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const {
  cleanupTestEnvironment,
  createTestEnvironment,
  request,
  startServer,
  stopServer
} = require('./helpers/integration-harness');

const projectRoot = path.join(__dirname, '..', '..');
const futureAbsencesSource = fs.readFileSync(path.join(projectRoot, 'js', 'app', 'guardias-future-absences.js'), 'utf8');
const teacherSource = fs.readFileSync(path.join(projectRoot, 'js', 'app', 'guardias-teacher.js'), 'utf8');
const appSource = fs.readFileSync(path.join(projectRoot, 'js', 'app', 'guardias.js'), 'utf8');
const storageSource = fs.readFileSync(path.join(projectRoot, 'js', 'app', 'storage.js'), 'utf8');

function makeError(status, message) {
  const error = new Error(message || (status ? `Request failed: ${status}` : 'fetch failed'));
  if(status) error.status = status;
  return error;
}

function makeFutureEntry() {
  return {
    id: 'future-consistency-2i',
    profesor: 'DOCENTE QA',
    date: '2026-09-03',
    note: 'Contenido que debe poder reintentarse',
    hours: [1],
    status: 'pending',
    reviewedAt: '',
    reviewerNote: '',
    appliedAt: '',
    createdAt: '2026-09-02T12:00:00.000Z'
  };
}

function createFutureDomain(createOutcome) {
  const toasts = [];
  const writes = [];
  const elements = {
    teacherFutureAbsenceDate: { value: '2026-09-03', focus() {} },
    teacherFutureAbsenceNote: { value: 'Contenido que debe poder reintentarse' },
    teacherFutureAbsenceOverlay: { classList: { add() {}, remove() {} } }
  };
  const document = {
    getElementById(id) { return elements[id] || null; },
    querySelectorAll() { return [{ value: '1' }]; }
  };
  const window = { document };
  vm.runInNewContext(futureAbsencesSource, { window, console, URL, Date, Math, Set, Map });
  const storage = {
    readJson(_key, fallback) { return fallback; },
    writeJson(key, value) { writes.push({ key, value }); },
    hasBackend() { return true; },
    isBackendOnly() { return true; },
    async createTeacherFutureAbsence(entry) {
      if(createOutcome instanceof Error) throw createOutcome;
      return createOutcome || { ok: true, entry };
    }
  };
  window.GuardiasFutureAbsences.init({
    storage,
    formatHoraLabel: hora => `Hora ${hora}`,
    getHorasLectivasProfesorDia: () => [1],
    getTeacherName: () => 'DOCENTE QA',
    getVisibleTeacherName: value => value,
    ensureTeacherIdentityConfirmed: async () => true,
    showToast(message, type) { toasts.push({ message, type }); },
    isAdmin: () => false,
    clearSuperAdminError() {},
    setSuperAdminError() {},
    pushSuperAdminEvent() {},
    renderSuperAdminMonitor() {}
  }, { loadFromLocalCache: false, renderOnInit: false, bindDom: false });
  return { domain: window.GuardiasFutureAbsences, elements, toasts, writes };
}

function createTeacherController(syncOutcome) {
  const toasts = [];
  const writes = [];
  const elements = {
    'taskText-0-1': { value: 'Tarea que debe poder reintentarse' },
    'taskCheck-0-1': { checked: true },
    'sessionMateria-0-1': { value: 'Matemáticas' },
    'sessionGrupo-0-1': { value: '1ESO-A' },
    'sessionDetalle-0-1': { value: '' },
    'sessionAula-0-1': { value: 'A-01' }
  };
  const document = {
    body: { classList: { toggle() {}, remove() {} } },
    documentElement: { classList: { toggle() {}, remove() {} } },
    getElementById(id) { return elements[id] || null; },
    querySelector() { return null; },
    querySelectorAll() { return []; }
  };
  const window = {
    document,
    location: { protocol: 'http:', search: '' },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval
  };
  vm.runInNewContext(teacherSource, { window, document, console, URL, Date, Math, Set, Map, setTimeout, clearTimeout, setInterval, clearInterval });
  const storage = {
    readJson(_key, fallback) { return fallback; },
    readText(key, fallback) { return key.includes('Profesorado_Actual') ? 'DOCENTE QA' : fallback; },
    writeJson(key, value) { writes.push({ key, value }); },
    writeText() {}
  };
  const controller = window.GuardiasTeacher.createTeacherController({
    storage,
    catalog: {
      teachersByName: {
        'DOCENTE QA': {
          horario: { 0: { 1: { materia: 'Matemáticas', grupo: '1ESO-A', detalle: '', aula: 'A-01' } } }
        }
      },
      allTeachers: ['DOCENTE QA']
    },
    ui: {
      askConfirm: async () => true,
      showToast(message, type) { toasts.push({ message, type }); }
    },
    hooks: {
      getCurrentDay: () => 0,
      getCurrentWeekOffset: () => 0,
      renderTable() {},
      async syncTeacherTaskEntry() {
        if(syncOutcome instanceof Error) throw syncOutcome;
        return syncOutcome || { ok: true };
      }
    },
    horaMap: { 1: { label: '1a', rango: '08:15-09:10' } }
  });
  return { controller, elements, toasts, writes };
}

function assertFailureMessage(toasts) {
  assert.ok(toasts.some(item => item.type === 'error'));
  const visible = toasts.map(item => item.message).join(' ');
  assert.ok(!/guardad[ao] en local/i.test(visible));
  assert.ok(!/pendiente de sincronizar/i.test(visible));
}

function createStorage(fetchImpl) {
  const events = [];
  const window = {
    location: { protocol: 'http:', search: '' },
    localStorage: { getItem() { return null; }, setItem() {} },
    dispatchEvent(event) { events.push(event.type); }
  };
  class CustomEvent {
    constructor(type) { this.type = type; }
  }
  vm.runInNewContext(storageSource, { window, console, URLSearchParams, CustomEvent, fetch: fetchImpl });
  return { storage: window.GuardiasStorage, events };
}

async function assertFutureFailure(error) {
  const { domain, elements, toasts, writes } = createFutureDomain(error);
  const result = await domain.submitTeacherAbsence();
  assert.strictEqual(result.ok, false);
  assert.strictEqual(domain.getRows().length, 0);
  assert.strictEqual(writes.length, 0);
  assert.strictEqual(elements.teacherFutureAbsenceNote.value, 'Contenido que debe poder reintentarse');
  assertFailureMessage(toasts);
}

async function assertTaskFailure(error) {
  const { controller, elements, toasts } = createTeacherController(error);
  const result = await controller.saveTeacherTask(0, 1, false);
  assert.strictEqual(result.ok, false);
  assert.strictEqual(Object.keys(controller.getState().tareasProfesorado).length, 0);
  assert.strictEqual(elements['taskText-0-1'].value, 'Tarea que debe poder reintentarse');
  assertFailureMessage(toasts);
}

module.exports = [
  {
    name: 'backend-only teacher task succeeds only after backend confirmation',
    async fn() {
      const { controller, toasts } = createTeacherController({ ok: true });
      const result = await controller.saveTeacherTask(0, 1, false);
      assert.strictEqual(result.ok, true);
      assert.ok(controller.getState().tareasProfesorado['docente qa|0|1']);
      assert.ok(toasts.some(item => item.type === 'success' && /guardada correctamente/i.test(item.message)));
    }
  },
  {
    name: 'backend-only teacher task rejects 401, 403, 500 and network failures without false persistence',
    async fn() {
      await assertTaskFailure(makeError(401));
      await assertTaskFailure(makeError(403));
      await assertTaskFailure(makeError(500));
      await assertTaskFailure(makeError(null, 'fetch failed'));
    }
  },
  {
    name: 'backend-only future absence succeeds only after backend confirmation',
    async fn() {
      const { domain } = createFutureDomain(null);
      const result = await domain.createEntry(makeFutureEntry());
      assert.strictEqual(result.ok, true);
      assert.strictEqual(domain.getRows().length, 1);
    }
  },
  {
    name: 'backend-only future absence rejects 401, 403, 500 and network failures without false persistence',
    async fn() {
      await assertFutureFailure(makeError(401));
      await assertFutureFailure(makeError(403));
      await assertFutureFailure(makeError(500));
      await assertFutureFailure(makeError(null, 'fetch failed'));
    }
  },
  {
    name: 'storage preserves HTTP status for authorization and server write failures',
    async fn() {
      for(const status of [401, 403, 500]){
        const { storage, events } = createStorage(async () => ({
          ok: false,
          status,
          headers: { get: () => 'application/json' },
          async json() { return { error: 'controlled failure' }; }
        }));
        await assert.rejects(
          storage.saveTeacherTaskEntry({ id: 'task-2i' }),
          error => error.status === status
        );
        assert.strictEqual(events.includes('guardias-auth-invalid'), status === 401);
      }
      const { storage } = createStorage(async () => { throw new Error('fetch failed'); });
      await assert.rejects(storage.saveTeacherTaskEntry({ id: 'task-2i' }), /fetch failed/);
    }
  },
  {
    name: 'task and future absence endpoints reject anonymous writes without persistence',
    async fn() {
      const environment = createTestEnvironment();
      let server = null;
      try{
        server = await startServer({ dbPath: environment.dbPath });
        const task = await request(server.baseUrl, '/api/profesorado/tareas', {
          method: 'POST',
          body: { id: 'task-anonymous-2i', profesor: 'DOCENTE QA', dia: 0, hora: 1, dejada: true, tarea: 'No persistir' }
        });
        const future = await request(server.baseUrl, '/api/profesorado/future-absences', {
          method: 'POST',
          headers: { origin: server.baseUrl },
          body: makeFutureEntry()
        });
        assert.strictEqual(task.response.status, 401);
        assert.strictEqual(future.response.status, 401);
        const tasks = await request(server.baseUrl, '/api/profesorado/tareas');
        const futureRows = await request(server.baseUrl, '/api/profesorado/future-absences');
        assert.ok(!tasks.body.some(row => row.id === 'task-anonymous-2i'));
        assert.ok(!futureRows.body.some(row => row.id === makeFutureEntry().id));
      } finally {
        await stopServer(server).catch(() => {});
        cleanupTestEnvironment(environment);
      }
    }
  },
  {
    name: 'hydrate and poll distinguish total backend failure from partial success',
    fn() {
      const helperSource = appSource.match(/function hasSuccessfulBackendRead\(results\)\{[\s\S]*?\n\}/)?.[0];
      assert.ok(helperSource);
      const hasSuccessfulBackendRead = vm.runInNewContext(`(${helperSource})`);
      const rejected = { status: 'rejected', reason: new Error('offline') };
      const fulfilled = { status: 'fulfilled', value: [] };
      assert.strictEqual(hasSuccessfulBackendRead([fulfilled, fulfilled]), true);
      assert.strictEqual(hasSuccessfulBackendRead([rejected, fulfilled, rejected]), true);
      assert.strictEqual(hasSuccessfulBackendRead([rejected, rejected]), false);
      assert.strictEqual(hasSuccessfulBackendRead([rejected, rejected]), false);
      assert.strictEqual(hasSuccessfulBackendRead([fulfilled, fulfilled]), true);

      const guards = appSource.match(/if\(!hasSuccessfulBackendRead\(backendReadResults\)\) throw /g) || [];
      assert.strictEqual(guards.length, 2);
      const hydrateSource = appSource.slice(appSource.indexOf('async function hydrateFromBackend()'), appSource.indexOf('function isAnyOverlayOpen()'));
      const pollSource = appSource.slice(appSource.indexOf('async function pollBackendState('), appSource.indexOf('function isReportAvailable()'));
      const hydrateGuard = hydrateSource.indexOf('if(!hasSuccessfulBackendRead(backendReadResults)) throw ');
      const pollGuard = pollSource.indexOf('if(!hasSuccessfulBackendRead(backendReadResults)) throw ');
      assert.ok(hydrateGuard >= 0 && hydrateGuard < hydrateSource.indexOf('backendHydrated=true'));
      assert.ok(hydrateGuard < hydrateSource.indexOf('superAdminStatus.lastHydrateAt='));
      assert.ok(hydrateGuard < hydrateSource.indexOf('clearSuperAdminError()'));
      assert.ok(pollGuard >= 0 && pollGuard < pollSource.indexOf('superAdminStatus.lastPollAt='));
      assert.ok(pollGuard < pollSource.indexOf('clearSuperAdminError()'));
      assert.ok(pollGuard < pollSource.indexOf("pushSuperAdminEvent('Consulta','Comprobación remota sin cambios.')"));
    }
  }
];
