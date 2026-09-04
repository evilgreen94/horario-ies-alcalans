const assert = require('assert');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const REAL_DB_PATH = path.resolve(PROJECT_ROOT, 'BD', 'guardias.sqlite');
const TEST_PREFIX = 'guardias-integration-';

function assertSafeTestDatabase(dbPath) {
  const resolved = path.resolve(dbPath);
  const tempRoot = path.resolve(os.tmpdir());
  assert.notStrictEqual(resolved.toLowerCase(), REAL_DB_PATH.toLowerCase(), 'Integration tests refuse to use BD/guardias.sqlite');
  assert.ok(resolved.toLowerCase().startsWith(tempRoot.toLowerCase() + path.sep), `Test DB must live below the system temp directory: ${resolved}`);
  assert.ok(path.basename(path.dirname(resolved)).startsWith(TEST_PREFIX), `Unexpected test DB directory: ${resolved}`);
}

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(error => error ? reject(error) : resolve(port));
    });
  });
}

function createTestEnvironment() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), TEST_PREFIX));
  const dbPath = path.join(root, 'guardias-test.sqlite');
  assertSafeTestDatabase(dbPath);
  return { root, dbPath };
}

async function waitForExit(child, timeoutMs = 5000) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Server PID ${child.pid} did not stop within ${timeoutMs}ms`)), timeoutMs);
    child.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

async function startServer(options) {
  assertSafeTestDatabase(options.dbPath);
  const port = options.port || await getFreePort();
  const output = [];
  const child = spawn(process.execPath, ['server/app.js'], {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      GUARDIAS_DB_PATH: options.dbPath,
      GUARDIAS_SESSION_SECRET: options.sessionSecret || 'integration-session-secret-2026',
      GUARDIAS_ADMIN_PASSWORD: options.adminPassword || 'Admin-integration-2026',
      GUARDIAS_SUPERADMIN_PASSWORD: options.superadminPassword || 'Super-integration-2026',
      GUARDIAS_CORS_ORIGINS: ''
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stdout.on('data', chunk => output.push(chunk.toString()));
  child.stderr.on('data', chunk => output.push(chunk.toString()));

  const baseUrl = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Server exited during startup (${child.exitCode}):\n${output.join('')}`);
    }
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.status === 200) {
        return { child, baseUrl, dbPath: options.dbPath, output };
      }
    } catch (_error) {
      // The child has not started listening yet.
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  child.kill();
  await waitForExit(child).catch(() => {});
  throw new Error(`Server startup timed out:\n${output.join('')}`);
}

async function stopServer(server) {
  if (!server?.child || server.child.exitCode !== null) return;
  server.child.kill('SIGTERM');
  await waitForExit(server.child);
}

function createCookieJar() {
  let cookie = '';
  return {
    value: () => cookie,
    update(response) {
      const header = response.headers.get('set-cookie');
      if (header) cookie = header.split(';')[0];
    }
  };
}

async function request(baseUrl, pathname, options = {}, jar = null) {
  const headers = new Headers(options.headers || {});
  if (options.body !== undefined && !headers.has('content-type')) headers.set('content-type', 'application/json');
  if (jar?.value()) headers.set('cookie', jar.value());
  const response = await fetch(new URL(pathname, baseUrl), {
    method: options.method || 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    redirect: 'manual'
  });
  jar?.update(response);
  const contentType = response.headers.get('content-type') || '';
  const body = contentType.includes('application/json') ? await response.json() : Buffer.from(await response.arrayBuffer());
  return { response, body };
}

async function login(baseUrl, role, password) {
  const jar = createCookieJar();
  const result = await request(baseUrl, '/api/auth/login', { method: 'POST', body: { role, password } }, jar);
  return { ...result, jar };
}

async function loginIndividual(baseUrl, username, password, extraBody = {}) {
  const jar = createCookieJar();
  const result = await request(baseUrl, '/api/auth/login', {
    method: 'POST',
    body: { ...extraBody, username, password }
  }, jar);
  return { ...result, jar };
}

async function openDatabase(dbPath) {
  assertSafeTestDatabase(dbPath);
  return open({ filename: dbPath, driver: sqlite3.Database });
}

async function createConsistentBackup(sourcePath, targetPath) {
  assertSafeTestDatabase(sourcePath);
  assert.ok(path.resolve(targetPath).startsWith(path.dirname(path.resolve(sourcePath)) + path.sep), 'Backup must remain in the isolated test directory');
  const source = new sqlite3.Database(sourcePath);
  try {
    const backup = source.backup(targetPath);
    await new Promise((resolve, reject) => backup.step(-1, error => error ? reject(error) : resolve()));
    await new Promise((resolve, reject) => backup.finish(error => error ? reject(error) : resolve()));
  } finally {
    await new Promise(resolve => source.close(() => resolve()));
  }
}

function cleanupTestEnvironment(environment) {
  if (!environment?.root) return;
  const resolved = path.resolve(environment.root);
  const tempRoot = path.resolve(os.tmpdir());
  assert.ok(resolved.startsWith(tempRoot + path.sep), `Refusing to clean outside temp: ${resolved}`);
  assert.ok(path.basename(resolved).startsWith(TEST_PREFIX), `Refusing to clean unexpected directory: ${resolved}`);
  fs.rmSync(resolved, { recursive: true, force: true });
}

module.exports = {
  REAL_DB_PATH,
  assertSafeTestDatabase,
  cleanupTestEnvironment,
  createConsistentBackup,
  createTestEnvironment,
  login,
  loginIndividual,
  openDatabase,
  request,
  startServer,
  stopServer
};
