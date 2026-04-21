const BASE_URL = process.env.GUARDIAS_BASE_URL || 'http://127.0.0.1:3000';
const ADMIN_PASSWORD = process.env.GUARDIAS_SMOKE_ADMIN_PASSWORD || '';
const SUPERADMIN_PASSWORD = process.env.GUARDIAS_SMOKE_SUPERADMIN_PASSWORD || '';

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
    ['/api/profesorado/session-overrides', 200]
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

async function main() {
  const results = [];
  results.push(await testHealth());
  results.push(await testProtectedWithoutAuth());
  results.push(await testAnonymousWriteProtection());
  results.push(await testAdminFlow());
  results.push(await testSuperadminFlow());

  console.log('Smoke test passed');
  results.forEach(result => console.log(`- ${result}`));
}

main().catch(error => {
  console.error('Smoke test failed');
  console.error(error.message);
  process.exit(1);
});
