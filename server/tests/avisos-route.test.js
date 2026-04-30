const assert = require('node:assert/strict');

function loadAvisosRouter({ db }) {
  const avisosPath = require.resolve('../routes/avisos');
  const dbPath = require.resolve('../db');
  const sessionPath = require.resolve('../session');

  const previousDb = require.cache[dbPath];
  const previousSession = require.cache[sessionPath];
  delete require.cache[avisosPath];

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

  const router = require('../routes/avisos');

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
    name: 'avisos GET /tv returns the default empty state when no app_state row exists',
    async fn() {
      const db = {
        async get() {
          return null;
        }
      };
      const router = loadAvisosRouter({ db });
      const handlers = findRouteHandlers(router, '/tv', 'get');
      const res = createJsonResponse();

      await callHandlers(handlers, {}, res);

      assert.deepEqual(res.body, {
        items: [],
        updatedAt: '',
        updatedBy: ''
      });
    }
  },
  {
    name: 'avisos PUT /tv normalizes text, priority, active flag and fallback updatedBy',
    async fn() {
      let storedValue = null;
      const db = {
        async run(_sql, params) {
          storedValue = JSON.parse(params[1]);
        },
        async get() {
          return {
            value: JSON.stringify(storedValue),
            updated_at: '2026-04-30T09:30:00.000Z'
          };
        }
      };
      const router = loadAvisosRouter({ db });
      const handlers = findRouteHandlers(router, '/tv', 'put');
      const res = createJsonResponse();

      await callHandlers(handlers, {
        body: {
          items: [
            {
              id: ' item-1 ',
              text: '  Reunion   urgente   en   sala   ',
              priority: 'urgent',
              active: true
            },
            {
              id: 'item-2',
              text: '   ',
              priority: 'important',
              active: true
            },
            {
              id: 'item-3',
              text: 'Mensaje secundario',
              priority: 'desconocida',
              active: false
            }
          ],
          updatedBy: '   '
        }
      }, res);

      assert.deepEqual(storedValue, {
        items: [
          {
            id: 'item-1',
            text: 'Reunion urgente en sala',
            priority: 'urgent',
            active: true
          },
          {
            id: 'item-3',
            text: 'Mensaje secundario',
            priority: 'normal',
            active: false
          }
        ],
        updatedBy: 'Jefatura'
      });

      assert.deepEqual(res.body, {
        items: storedValue.items,
        updatedAt: '2026-04-30T09:30:00.000Z',
        updatedBy: 'Jefatura'
      });
    }
  },
  {
    name: 'avisos GET /tv ignores malformed JSON and falls back to an empty state',
    async fn() {
      const db = {
        async get() {
          return {
            value: '{"items": [',
            updated_at: '2026-04-30T09:30:00.000Z'
          };
        }
      };
      const router = loadAvisosRouter({ db });
      const handlers = findRouteHandlers(router, '/tv', 'get');
      const res = createJsonResponse();

      await callHandlers(handlers, {}, res);

      assert.deepEqual(res.body, {
        items: [],
        updatedAt: '',
        updatedBy: ''
      });
    }
  }
];
