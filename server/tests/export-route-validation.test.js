const assert = require('node:assert/strict');

const validation = require('../routes/validation');

function loadExportRouter() {
  const exportPath = require.resolve('../routes/export');
  const dbPath = require.resolve('../db');
  const maintenancePath = require.resolve('../maintenance');
  const sessionPath = require.resolve('../session');
  const telemetryPath = require.resolve('../telemetry');

  const previousDb = require.cache[dbPath];
  const previousMaintenance = require.cache[maintenancePath];
  const previousSession = require.cache[sessionPath];
  const previousTelemetry = require.cache[telemetryPath];
  delete require.cache[exportPath];

  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: {
      DB_PATH: 'C:\\guardias.sqlite',
      getDatabase: async () => {
        throw new Error('Database should not be touched for validation failures');
      }
    }
  };

  require.cache[maintenancePath] = {
    id: maintenancePath,
    filename: maintenancePath,
    loaded: true,
    exports: {
      startRestore() {},
      finishRestore() {},
      isRestoreInProgress() {
        return false;
      }
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

  require.cache[telemetryPath] = {
    id: telemetryPath,
    filename: telemetryPath,
    loaded: true,
    exports: {
      getTelemetrySnapshot() {
        return {};
      }
    }
  };

  const router = require('../routes/export');

  if (previousDb) {
    require.cache[dbPath] = previousDb;
  } else {
    delete require.cache[dbPath];
  }
  if (previousMaintenance) {
    require.cache[maintenancePath] = previousMaintenance;
  } else {
    delete require.cache[maintenancePath];
  }
  if (previousSession) {
    require.cache[sessionPath] = previousSession;
  } else {
    delete require.cache[sessionPath];
  }
  if (previousTelemetry) {
    require.cache[telemetryPath] = previousTelemetry;
  } else {
    delete require.cache[telemetryPath];
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

async function callHandlersExpectError(handlers, req, res) {
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
  return forwardedError;
}

module.exports = [
  {
    name: 'validation sanitizeHistorial keeps defaults and rejects invalid timestamps',
    fn() {
      const row = validation.sanitizeHistorial({
        id: 'hist-1',
        title: 'Cambio de guardia',
        detail: '  detalle libre ',
        ts: '2026-04-30T08:15:00.000Z'
      });

      assert.deepEqual(row, {
        id: 'hist-1',
        title: 'Cambio de guardia',
        detail: 'detalle libre',
        type: 'other',
        actor: 'Jefatura',
        ts: '2026-04-30T08:15:00.000Z',
        undoState: null
      });

      assert.throws(
        () => validation.sanitizeHistorial({ id: 'hist-2', title: 'X', ts: 'fecha-mala' }),
        error => error.status === 400 && error.message === 'ts no tiene una fecha válida.'
      );
    }
  },
  {
    name: 'validation sanitizeAlumnosFueraAula accepts snake_case timestamps and rejects invalid ids',
    fn() {
      const row = validation.sanitizeAlumnosFueraAula({
        id: '12',
        profesor: 'Ada',
        dia: 2,
        hora: 5,
        cantidad_actual: 3,
        last_exit_at: '2026-04-30T09:05:00.000Z',
        last_return_at: '2026-04-30T09:20:00.000Z'
      });

      assert.deepEqual(row, {
        id: 12,
        profesor: 'Ada',
        dia: 2,
        hora: 5,
        cantidad: 3,
        lastExitAt: '2026-04-30T09:05:00.000Z',
        lastReturnAt: '2026-04-30T09:20:00.000Z'
      });

      assert.throws(
        () => validation.sanitizeAlumnosFueraAula({ id: 0, profesor: 'Ada', dia: 2, hora: 5, cantidad: 1 }),
        error => error.status === 400 && error.message === 'id inválido.'
      );
    }
  },
  {
    name: 'export POST /restore rejects backups missing required sections before touching the database',
    async fn() {
      const router = loadExportRouter();
      const handlers = findRouteHandlers(router, '/restore', 'post');
      const error = await callHandlersExpectError(handlers, {
        body: {
          exportedAt: '2026-04-30T09:00:00.000Z',
          guardias: [],
          historial: [],
          tareasProfesorado: [],
          sessionOverrides: [],
          substitutions: [],
          futureAbsences: []
        }
      }, {});

      assert.ok(error);
      assert.equal(error.status, 400);
      assert.match(error.message, /backup no incluye la seccion obligatoria "biblioteca"/i);
    }
  }
];
