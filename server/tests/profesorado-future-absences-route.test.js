const assert = require('node:assert/strict');
const express = require('express');

const { registerStateCollectionRoutes } = require('../routes/profesorado/state-collections');
const { requireSameOriginWrite } = require('../routes/profesorado/shared');
const validation = require('../routes/validation');

function loadSession(secret) {
  process.env.GUARDIAS_SESSION_SECRET = secret;
  const modulePath = require.resolve('../session');
  delete require.cache[modulePath];
  return require('../session');
}

function createRouter({ db, session }) {
  const router = express.Router();
  registerStateCollectionRoutes(router, {
    getDatabase: async () => db,
    ensureArray: validation.ensureArray,
    sanitizeTeacherSubstitution: validation.sanitizeTeacherSubstitution,
    sanitizeTeacherPracticeGuardia: validation.sanitizeTeacherPracticeGuardia,
    sanitizeTeacherPracticeGuardiaSlot: validation.sanitizeTeacherPracticeGuardiaSlot,
    sanitizeTeacherFutureAbsence: validation.sanitizeTeacherFutureAbsence,
    sanitizePatioGuardia: validation.sanitizePatioGuardia,
    sanitizePatioTeacherBlock: validation.sanitizePatioTeacherBlock,
    requireRole: session.requireRole,
    requireSameOriginWrite,
    withImmediateTransaction: async (_db, callback) => callback()
  });
  return router;
}

function findRouteHandlers(router, path, method) {
  const layer = router.stack.find(entry => entry.route && entry.route.path === path && entry.route.methods[method]);
  if (!layer) throw new Error(`Route not found: ${method.toUpperCase()} ${path}`);
  return layer.route.stack.map(entry => entry.handle);
}

function createJsonResponse() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

async function callHandlers(handlers, req, res) {
  let forwardedError = null;

  async function dispatch(index) {
    const handler = handlers[index];
    if (!handler) return;
    let nextPromise = null;
    const result = handler(req, res, error => {
      if (error) {
        forwardedError = error;
        return undefined;
      }
      nextPromise = dispatch(index + 1);
      return nextPromise;
    });
    await result;
    if (nextPromise) await nextPromise;
  }

  await dispatch(0);
  return forwardedError;
}

function createRequest({ body, cookie = '', origin = '' }) {
  const headers = { host: 'guardias.test' };
  if (cookie) headers.cookie = cookie;
  if (origin) headers.origin = origin;
  return {
    body,
    headers,
    protocol: 'http',
    get(name) {
      return this.headers[String(name).toLowerCase()] || '';
    }
  };
}

function createDatabase() {
  let rows = [];
  let writeCount = 0;
  return {
    async get() {
      return rows.length ? { value: JSON.stringify(rows) } : undefined;
    },
    async run(_sql, params) {
      rows = JSON.parse(params[1]);
      writeCount += 1;
    },
    getRows() {
      return rows;
    },
    getWriteCount() {
      return writeCount;
    }
  };
}

function createFutureAbsence() {
  return {
    id: 'future-1',
    profesor: 'Ada Lovelace',
    date: '2026-09-14',
    note: 'Consulta medica',
    hours: [1, 2],
    status: 'pending',
    createdAt: '2026-09-02T10:00:00.000Z'
  };
}

module.exports = [
  {
    name: 'future absences POST rejects anonymous writes before validation or database access',
    async fn() {
      const session = loadSession('future-absences-route-test-secret');
      const db = createDatabase();
      const router = createRouter({ db, session });
      const handlers = findRouteHandlers(router, '/future-absences', 'post');
      const res = createJsonResponse();

      const error = await callHandlers(handlers, createRequest({ body: {} }), res);

      assert.equal(error, null);
      assert.equal(res.statusCode, 401);
      assert.deepEqual(res.body, { error: 'Sesion no valida.' });
      assert.equal(db.getWriteCount(), 0);
    }
  },
  {
    name: 'future absences POST rejects an authenticated cross-origin write',
    async fn() {
      const session = loadSession('future-absences-route-test-secret');
      const db = createDatabase();
      const router = createRouter({ db, session });
      const handlers = findRouteHandlers(router, '/future-absences', 'post');
      const cookie = session.serializeSessionCookie('admin', { secure: false, headers: {} }).split(';')[0];
      const res = createJsonResponse();

      const error = await callHandlers(handlers, createRequest({ body: createFutureAbsence(), cookie }), res);

      assert.ok(error);
      assert.equal(error.status, 403);
      assert.match(error.message, /origen no permitido/i);
      assert.equal(db.getWriteCount(), 0);
    }
  },
  {
    name: 'future absences POST allows an authenticated same-origin admin write',
    async fn() {
      const session = loadSession('future-absences-route-test-secret');
      const db = createDatabase();
      const router = createRouter({ db, session });
      const handlers = findRouteHandlers(router, '/future-absences', 'post');
      const cookie = session.serializeSessionCookie('admin', { secure: false, headers: {} }).split(';')[0];
      const entry = createFutureAbsence();
      const res = createJsonResponse();

      const error = await callHandlers(handlers, createRequest({
        body: entry,
        cookie,
        origin: 'http://guardias.test'
      }), res);
      const normalizedEntry = {
        ...entry,
        reviewedAt: '',
        reviewerNote: '',
        appliedAt: ''
      };

      assert.equal(error, null);
      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.body, { ok: true, entry: normalizedEntry });
      assert.deepEqual(db.getRows(), [normalizedEntry]);
      assert.equal(db.getWriteCount(), 1);
    }
  }
];
