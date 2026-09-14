const assert = require('node:assert/strict');

function loadHistorialRouter({ db }) {
  const routePath = require.resolve('../routes/historial');
  const dbPath = require.resolve('../db');
  const sessionPath = require.resolve('../session');

  const previousDb = require.cache[dbPath];
  const previousSession = require.cache[sessionPath];
  delete require.cache[routePath];

  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: {
      getDatabase: async () => db
    }
  };

  require.cache[sessionPath] = {
    id: sessionPath,
    filename: sessionPath,
    loaded: true,
    exports: {
      requireRole() {
        return (_req, _res, next) => next();
      }
    }
  };

  const router = require('../routes/historial');

  if (previousDb) {
    require.cache[dbPath] = previousDb;
  } else {
    delete require.cache[dbPath];
  }

  if (previousSession) {
    require.cache[sessionPath] = previousSession;
  } else {
    delete require.cache[sessionPath];
  }

  return router;
}

function findRouteHandlers(router, path, method) {
  const layer = router.stack.find(entry => entry.route && entry.route.path === path && entry.route.methods[method]);
  if (!layer) {
    throw new Error(`Route not found: ${method.toUpperCase()} ${path}`);
  }
  return layer.route.stack.map(entry => entry.handle);
}

function createJsonResponse() {
  return {
    body: undefined,
    statusCode: 200,
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
  let index = 0;
  let forwardedError = null;

  async function next(error) {
    if (error) {
      forwardedError = error;
      return;
    }
    const handler = handlers[index];
    index += 1;
    if (!handler) return;
    await handler(req, res, next);
  }

  await next();

  if (forwardedError) {
    throw forwardedError;
  }
}

module.exports = [
  {
    name: 'historial GET / deserializes undo_state to undoState',
    async fn() {
      const db = {
        async all() {
          return [
            {
              id: 'hist-1',
              title: 'Cambio',
              detail: 'Detalle',
              type: 'edit',
              actor: 'Jefatura',
              ts: '2026-04-30T10:00:00.000Z',
              undo_state: '{"day":2}'
            }
          ];
        }
      };
      const router = loadHistorialRouter({ db });
      const handlers = findRouteHandlers(router, '/', 'get');
      const res = createJsonResponse();

      await callHandlers(handlers, {}, res);

      assert.deepEqual(res.body, [
        {
          id: 'hist-1',
          title: 'Cambio',
          detail: 'Detalle',
          type: 'edit',
          actor: 'Jefatura',
          actorIdentity: { userId: null, username: '', displayName: 'Jefatura', sourceCode: null, roles: [] },
          action: '',
          target: { type: '', id: '' },
          result: 'success',
          timestamp: '2026-04-30T10:00:00.000Z',
          before: null,
          after: null,
          archivedAt: null,
          undoState: { day: 2 }
        }
      ]);
    }
  },
  {
    name: 'historial PUT /replace rejects destructive client replacement',
    async fn() {
      const db = {
        async run() { throw new Error('must not write'); },
        async all() { throw new Error('must not read'); }
      };
      const router = loadHistorialRouter({ db });
      const handlers = findRouteHandlers(router, '/replace', 'put');
      const res = createJsonResponse();

      await assert.rejects(
        callHandlers(handlers, { body: [] }, res),
        error => error.status === 410 && /destructivo/.test(error.message)
      );
    }
  }
];
