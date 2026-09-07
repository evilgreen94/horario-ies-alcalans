const BASE_URL = process.env.GUARDIAS_BASE_URL || 'http://127.0.0.1:3000';
const ADMIN_PASSWORD = process.env.GUARDIAS_SMOKE_ADMIN_PASSWORD || '';
const SUPERADMIN_PASSWORD = process.env.GUARDIAS_SMOKE_SUPERADMIN_PASSWORD || '';
const TEACHER_USERNAME = process.env.GUARDIAS_SMOKE_TEACHER_USERNAME || '';
const TEACHER_PASSWORD = process.env.GUARDIAS_SMOKE_TEACHER_PASSWORD || '';
const EXPECT_DATASET = process.env.GUARDIAS_SMOKE_EXPECT_DATASET || '';

function getFetch() {
  if (typeof fetch === 'function') return fetch;
  throw new Error('Global fetch is not available in this Node version.');
}

function joinUrl(pathname) {
  return new URL(pathname, BASE_URL).toString();
}

function createCookieJar() {
  let cookie = '';
  return {
    get() {
      return cookie;
    },
    setFromResponse(response) {
      const header = response.headers.get('set-cookie');
      if (!header) return;
      cookie = header.split(';')[0] || cookie;
    }
  };
}

async function request(pathname, options = {}, jar = null) {
  const fetchImpl = getFetch();
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (jar?.get()) {
    headers.set('Cookie', jar.get());
  }

  const response = await fetchImpl(joinUrl(pathname), {
    method: options.method || 'GET',
    headers,
    body: options.body,
    redirect: 'manual'
  }).catch(error => {
    throw new Error(`Request to ${pathname} failed: ${error.message}`);
  });

  if (jar) {
    jar.setFromResponse(response);
  }

  let body = null;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    body = await response.json();
  } else {
    body = await response.text();
  }

  return { response, body };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function testHealth() {
  const { response, body } = await request('/api/health');
  assert(response.status === 200, `GET /api/health expected 200, got ${response.status}`);
  assert(body && body.ok === true, 'GET /api/health expected {"ok":true}');
  return 'health ok';
}

async function testProtectedWithoutAuth() {
  const publicReadChecks = [
    ['/api/guardias', 200],
    ['/api/biblioteca', 200],
    ['/api/historial', 200],
    ['/api/profesorado/tareas', 200],
    ['/api/profesorado/session-overrides', 200],
    ['/api/profesorado/alumnos-fuera-aula', 200]
  ];

  for (const [pathname, expected] of publicReadChecks) {
    const { response, body } = await request(pathname);
    assert(response.status === expected, `${pathname} expected ${expected}, got ${response.status}`);
    assert(Array.isArray(body), `${pathname} expected array body`);
  }

  const checks = [
    ['/api/export/snapshot.json', 401],
    ['/api/export/database.sqlite', 401],
    ['/api/report/daily.pdf?day=0', 401]
  ];

  for (const [pathname, expected] of checks) {
    const { response } = await request(pathname);
    assert(response.status === expected, `${pathname} expected ${expected}, got ${response.status}`);
  }

  return 'public reads allowed; protected routes reject anonymous access';
}

async function testPages() {
  const checks = [
    ['/', '<!DOCTYPE html'],
    ['/guardias.html', '<!DOCTYPE html'],
    ['/app/', '<!DOCTYPE html']
  ];
  for (const [pathname, marker] of checks) {
    const { response, body } = await request(pathname);
    assert(response.status === 200, `GET ${pathname} expected 200, got ${response.status}`);
    assert(String(body).toLowerCase().includes(marker.toLowerCase()), `GET ${pathname} did not return the expected HTML`);
  }
  return 'homepage, guardias.html and /app/ ok';
}

async function testScheduleExpectation() {
  if (!EXPECT_DATASET) return 'schedule expectation skipped';
  const { response, body } = await request('/api/schedule/active');
  if (EXPECT_DATASET === 'none') {
    assert(response.status === 503, `schedule without active dataset expected 503, got ${response.status}`);
    assert(String(body?.error || '').includes('No hay un dataset horario activo'), 'missing explicit no-dataset error');
    return 'no active dataset is explicit (no legacy fallback)';
  }
  if (EXPECT_DATASET === 'active') {
    assert(response.status === 200, `active schedule expected 200, got ${response.status}`);
    assert(body && Array.isArray(body.periods) && Array.isArray(body.teachers), 'active schedule payload is incomplete');
    return 'active canonical dataset ok';
  }
  throw new Error('GUARDIAS_SMOKE_EXPECT_DATASET must be empty, none or active');
}

async function testAnonymousAlumnosFueraAulaWriteProtection() {
  const payload = {
    profesor: 'SMOKE_ANON_WRITE',
    dia: 0,
    hora: 1
  };

  const endpoints = [
    '/api/profesorado/alumnos-fuera-aula/salida',
    '/api/profesorado/alumnos-fuera-aula/retorno'
  ];

  for (const pathname of endpoints) {
    const { response } = await request(pathname, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    assert(response.status === 403, `${pathname} without origin expected 403, got ${response.status}`);
  }

  return 'anonymous alumnos-fuera-aula writes blocked without origin';
}

async function testAnonymousWriteProtection() {
  const jsonHeaders = { 'Content-Type': 'application/json' };
  const checks = [
    ['/api/guardias/replace', 'PUT', [], 401],
    ['/api/biblioteca/replace', 'PUT', [], 401],
    ['/api/historial/replace', 'PUT', [], 401],
    ['/api/profesorado/tareas/replace', 'PUT', [], 401],
    ['/api/profesorado/tareas', 'POST', {}, 401],
    ['/api/profesorado/tareas/sample-id', 'DELETE', {}, 401],
    ['/api/profesorado/session-overrides/replace', 'PUT', [], 401],
    ['/api/profesorado/session-overrides', 'POST', {}, 401],
    ['/api/profesorado/session-overrides/sample-id', 'DELETE', {}, 401],
    ['/api/profesorado/future-absences', 'POST', {}, 401],
    ['/api/export/restore', 'POST', {}, 401]
  ];

  for (const [pathname, method, payload, expected] of checks) {
    const { response } = await request(pathname, {
      method,
      headers: jsonHeaders,
      body: JSON.stringify(payload)
    });
    assert(response.status === expected, `${method} ${pathname} expected ${expected}, got ${response.status}`);
  }

  return 'anonymous writes blocked';
}

async function login(role, password) {
  const jar = createCookieJar();
  const { response, body } = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ role, password })
  }, jar);

  assert(response.status === 200, `POST /api/auth/login (${role}) expected 200, got ${response.status}`);
  assert(body && body.ok === true, `POST /api/auth/login (${role}) expected ok=true`);
  assert(jar.get(), `POST /api/auth/login (${role}) did not set session cookie`);
  return jar;
}

async function testAdminFlow() {
  if (!ADMIN_PASSWORD) {
    return 'admin flow skipped (GUARDIAS_SMOKE_ADMIN_PASSWORD not set)';
  }

  const jar = await login('admin', ADMIN_PASSWORD);

  const session = await request('/api/auth/session', {}, jar);
  assert(session.response.status === 200 && session.body?.role === 'admin', 'legacy admin session contract changed');

  const guardias = await request('/api/guardias', {}, jar);
  assert(guardias.response.status === 200, `GET /api/guardias expected 200, got ${guardias.response.status}`);
  assert(Array.isArray(guardias.body), 'GET /api/guardias expected array');

  const report = await request('/api/report/daily.pdf?day=0', {}, jar);
  assert(report.response.status === 200, `GET /api/report/daily.pdf expected 200, got ${report.response.status}`);

  const deniedExport = await request('/api/export/snapshot.json', {}, jar);
  assert(deniedExport.response.status === 403, `admin access to /api/export/snapshot.json expected 403, got ${deniedExport.response.status}`);

  const deniedSqlite = await request('/api/export/database.sqlite', {}, jar);
  assert(deniedSqlite.response.status === 403, `admin access to /api/export/database.sqlite expected 403, got ${deniedSqlite.response.status}`);

  const deniedRestore = await request('/api/export/restore', {
    method: 'POST',
    body: JSON.stringify({})
  }, jar);
  assert(deniedRestore.response.status === 403, `admin access to /api/export/restore expected 403, got ${deniedRestore.response.status}`);

  return 'admin flow ok';
}

async function testSuperadminFlow() {
  if (!SUPERADMIN_PASSWORD) {
    return 'superadmin flow skipped (GUARDIAS_SMOKE_SUPERADMIN_PASSWORD not set)';
  }

  const jar = await login('superadmin', SUPERADMIN_PASSWORD);

  const snapshot = await request('/api/export/snapshot.json', {}, jar);
  assert(snapshot.response.status === 200, `GET /api/export/snapshot.json expected 200, got ${snapshot.response.status}`);
  assert(snapshot.body && Array.isArray(snapshot.body.guardias), 'snapshot JSON expected guardias array');
  assert(Array.isArray(snapshot.body.substitutions), 'snapshot JSON expected substitutions array');
  assert(Array.isArray(snapshot.body.futureAbsences), 'snapshot JSON expected futureAbsences array');

  const sqlite = await request('/api/export/database.sqlite', {}, jar);
  assert(sqlite.response.status === 200, `GET /api/export/database.sqlite expected 200, got ${sqlite.response.status}`);

  const restore = await request('/api/export/restore', {
    method: 'POST',
    body: JSON.stringify(snapshot.body)
  }, jar);
  assert(restore.response.status === 200, `POST /api/export/restore expected 200, got ${restore.response.status}`);
  assert(restore.body && restore.body.ok === true, 'restore expected ok=true');

  return 'superadmin flow ok';
}

async function testIndividualTeacherFlow() {
  if (!TEACHER_USERNAME && !TEACHER_PASSWORD) return 'individual teacher flow skipped';
  assert(TEACHER_USERNAME && TEACHER_PASSWORD, 'both teacher smoke credentials are required');

  const jar = createCookieJar();
  const loginResult = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: TEACHER_USERNAME, password: TEACHER_PASSWORD, role: 'superadmin' })
  }, jar);
  assert(loginResult.response.status === 200, `individual login expected 200, got ${loginResult.response.status}`);
  assert(loginResult.body?.role === 'teacher' && loginResult.body?.isAdmin === false, 'client role field escalated teacher');

  const session = await request('/api/auth/session', {}, jar);
  assert(session.body?.authenticated === true && session.body?.role === 'teacher', 'individual session identity is invalid');

  const schedule = await request('/api/schedule/me?date=2026-09-07', {}, jar);
  assert(schedule.response.status === 200, `teacher schedule expected 200, got ${schedule.response.status}`);

  const deniedExport = await request('/api/export/database.sqlite', {}, jar);
  assert(deniedExport.response.status === 403, `teacher export escalation expected 403, got ${deniedExport.response.status}`);
  const deniedActivation = await request('/api/schedule/datasets/1/activate', {
    method: 'POST',
    body: JSON.stringify({ role: 'superadmin', userId: 1 })
  }, jar);
  assert(deniedActivation.response.status === 403, `teacher activation escalation expected 403, got ${deniedActivation.response.status}`);

  const logout = await request('/api/auth/logout', { method: 'POST' }, jar);
  assert(logout.response.status === 200 && logout.body?.ok === true, 'individual logout failed');
  const afterLogout = await request('/api/auth/session', {}, jar);
  assert(afterLogout.body?.authenticated === false, 'session remained active after logout');
  return 'individual teacher session, schedule, denial and logout ok';
}

async function main() {
  const results = [];
  results.push(await testHealth());
  results.push(await testPages());
  results.push(await testScheduleExpectation());
  results.push(await testProtectedWithoutAuth());
  results.push(await testAnonymousAlumnosFueraAulaWriteProtection());
  results.push(await testAnonymousWriteProtection());
  results.push(await testAdminFlow());
  results.push(await testSuperadminFlow());
  results.push(await testIndividualTeacherFlow());

  console.log('Smoke test passed');
  results.forEach(result => console.log(`- ${result}`));
}

main().catch(error => {
  console.error('Smoke test failed');
  console.error(error.message);
  process.exit(1);
});
