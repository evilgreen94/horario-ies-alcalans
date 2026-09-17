const assert = require('node:assert/strict');

const {
  cleanupTestEnvironment,
  createTestEnvironment,
  loginIndividual,
  request,
  seedIndividualUser,
  startServer,
  stopServer
} = require('./helpers/integration-harness');

const {
  sanitizeBackupPayload
} = require('../routes/export/backup-payload');

async function fixture() {
  const environment = createTestEnvironment();

  const server = await startServer({
    dbPath: environment.dbPath
  });

  try {
    await seedIndividualUser(environment.dbPath, {
      username: 'banos.admin',
      password: 'Banos-fixture-2026!',
      roles: ['admin']
    });

    const admin = await loginIndividual(
      server.baseUrl,
      'banos.admin',
      'Banos-fixture-2026!'
    );

    assert.equal(admin.response.status, 200);

    return {
      environment,
      server,
      admin
    };
  } catch (error) {
    await stopServer(server);
    cleanupTestEnvironment(environment);
    throw error;
  }
}

module.exports = [
  {
    name: 'banos assignment persists through server restart',
    async fn() {
      const f = await fixture();
      let server = f.server;

      try {
        const assignment = {
          dia: 0,
          hora: 1,
          profesor: 'DOCENTE BANOS'
        };

        const saved = await request(
          server.baseUrl,
          '/api/banos',
          {
            method: 'PUT',
            body: assignment,
            headers: {
              origin: server.baseUrl
            }
          },
          f.admin.jar
        );

        assert.equal(saved.response.status, 200);
        assert.deepEqual(saved.body, assignment);

        let rows = (
          await request(
            server.baseUrl,
            '/api/banos'
          )
        ).body;

        assert.deepEqual(rows, [assignment]);

        await stopServer(server);

        server = await startServer({
          dbPath: f.environment.dbPath
        });

        rows = (
          await request(
            server.baseUrl,
            '/api/banos'
          )
        ).body;

        assert.deepEqual(rows, [assignment]);
      } finally {
        await stopServer(server);
        cleanupTestEnvironment(f.environment);
      }
    }
  },

  {
    name: 'biblioteca and banos reject the same teacher in the same slot in both directions',
    async fn() {
      const f = await fixture();

      try {
        const biblioteca = {
          dia: 1,
          hora: 2,
          profesor: 'DOCENTE A'
        };

        const banos = {
          dia: 1,
          hora: 2,
          profesor: 'DOCENTE B'
        };

        let response = await request(
          f.server.baseUrl,
          '/api/biblioteca',
          {
            method: 'PUT',
            body: biblioteca,
            headers: {
              origin: f.server.baseUrl
            }
          },
          f.admin.jar
        );

        assert.equal(response.response.status, 200);

        response = await request(
          f.server.baseUrl,
          '/api/banos',
          {
            method: 'PUT',
            body: {
              ...banos,
              profesor: biblioteca.profesor
            },
            headers: {
              origin: f.server.baseUrl
            }
          },
          f.admin.jar
        );

        assert.equal(response.response.status, 409);

        response = await request(
          f.server.baseUrl,
          '/api/banos',
          {
            method: 'PUT',
            body: banos,
            headers: {
              origin: f.server.baseUrl
            }
          },
          f.admin.jar
        );

        assert.equal(response.response.status, 200);

        response = await request(
          f.server.baseUrl,
          '/api/biblioteca',
          {
            method: 'PUT',
            body: {
              ...biblioteca,
              profesor: banos.profesor
            },
            headers: {
              origin: f.server.baseUrl
            }
          },
          f.admin.jar
        );

        assert.equal(response.response.status, 409);

        const bibliotecaRows = (
          await request(
            f.server.baseUrl,
            '/api/biblioteca'
          )
        ).body;

        const banosRows = (
          await request(
            f.server.baseUrl,
            '/api/banos'
          )
        ).body;

        assert.deepEqual(
          bibliotecaRows,
          [biblioteca]
        );

        assert.deepEqual(
          banosRows,
          [banos]
        );
      } finally {
        await stopServer(f.server);
        cleanupTestEnvironment(f.environment);
      }
    }
  },

  {
    name: 'special assignment replace endpoints cannot create biblioteca banos conflicts',
    async fn() {
      const f = await fixture();

      try {
        const biblioteca = {
          dia: 2,
          hora: 4,
          profesor: 'DOCENTE BIBLIOTECA'
        };

        const banos = {
          dia: 2,
          hora: 4,
          profesor: 'DOCENTE BANOS'
        };

        let response = await request(
          f.server.baseUrl,
          '/api/biblioteca',
          {
            method: 'PUT',
            body: biblioteca,
            headers: {
              origin: f.server.baseUrl
            }
          },
          f.admin.jar
        );

        assert.equal(response.response.status, 200);

        response = await request(
          f.server.baseUrl,
          '/api/banos',
          {
            method: 'PUT',
            body: banos,
            headers: {
              origin: f.server.baseUrl
            }
          },
          f.admin.jar
        );

        assert.equal(response.response.status, 200);

        response = await request(
          f.server.baseUrl,
          '/api/banos/replace',
          {
            method: 'PUT',
            body: [{
              ...banos,
              profesor: biblioteca.profesor
            }],
            headers: {
              origin: f.server.baseUrl
            }
          },
          f.admin.jar
        );

        assert.equal(response.response.status, 409);

        let rows = (
          await request(
            f.server.baseUrl,
            '/api/banos'
          )
        ).body;

        assert.deepEqual(rows, [banos]);

        response = await request(
          f.server.baseUrl,
          '/api/biblioteca/replace',
          {
            method: 'PUT',
            body: [{
              ...biblioteca,
              profesor: banos.profesor
            }],
            headers: {
              origin: f.server.baseUrl
            }
          },
          f.admin.jar
        );

        assert.equal(response.response.status, 409);

        rows = (
          await request(
            f.server.baseUrl,
            '/api/biblioteca'
          )
        ).body;

        assert.deepEqual(rows, [biblioteca]);
      } finally {
        await stopServer(f.server);
        cleanupTestEnvironment(f.environment);
      }
    }
  },

  {
    name: 'special assignments bootstrap is atomic idempotent and old backups default banos to empty',
    async fn() {
      const f = await fixture();

      try {
        const biblioteca = [
          {
            dia: 0,
            hora: 1,
            profesor: 'DOCENTE BIBLIOTECA UNO'
          },
          {
            dia: 0,
            hora: 2,
            profesor: 'DOCENTE BIBLIOTECA DOS'
          }
        ];

        const banos = [
          {
            dia: 0,
            hora: 1,
            profesor: 'DOCENTE BANOS UNO'
          },
          {
            dia: 0,
            hora: 2,
            profesor: 'DOCENTE BANOS DOS'
          }
        ];

        const initial = {
          biblioteca,
          banos
        };

        let response = await request(
          f.server.baseUrl,
          '/api/special-assignments/bootstrap',
          {
            method: 'POST',
            body: initial,
            headers: {
              origin: f.server.baseUrl
            }
          },
          f.admin.jar
        );

        assert.equal(response.response.status, 201);
        assert.deepEqual(response.body, initial);

        response = await request(
          f.server.baseUrl,
          '/api/special-assignments/bootstrap',
          {
            method: 'POST',
            body: initial,
            headers: {
              origin: f.server.baseUrl
            }
          },
          f.admin.jar
        );

        assert.equal(response.response.status, 200);
        assert.deepEqual(response.body, initial);

        response = await request(
          f.server.baseUrl,
          '/api/special-assignments/bootstrap',
          {
            method: 'POST',
            body: {
              biblioteca,
              banos: [{
                dia: 0,
                hora: 1,
                profesor: 'OTRO DOCENTE'
              }]
            },
            headers: {
              origin: f.server.baseUrl
            }
          },
          f.admin.jar
        );

        assert.equal(response.response.status, 409);

        const persistedBiblioteca = (
          await request(
            f.server.baseUrl,
            '/api/biblioteca'
          )
        ).body;

        const persistedBanos = (
          await request(
            f.server.baseUrl,
            '/api/banos'
          )
        ).body;

        assert.deepEqual(
          persistedBiblioteca,
          biblioteca
        );

        assert.deepEqual(
          persistedBanos,
          banos
        );

        const legacyBackup = sanitizeBackupPayload({
          guardias: [],
          biblioteca: [],
          historial: [],
          tareasProfesorado: [],
          sessionOverrides: [],
          substitutions: [],
          futureAbsences: []
        });

        assert.deepEqual(
          legacyBackup.banos,
          []
        );
      } finally {
        await stopServer(f.server);
        cleanupTestEnvironment(f.environment);
      }
    }
  },

  {
    name: 'special assignments bootstrap completes existing biblioteca without rewriting it',
    async fn() {
      const f = await fixture();

      try {
        const biblioteca = [
          {
            dia: 3,
            hora: 4,
            profesor: 'DOCENTE BIBLIOTECA'
          }
        ];

        const banos = [
          {
            dia: 3,
            hora: 4,
            profesor: 'DOCENTE BANOS'
          }
        ];

        let response = await request(
          f.server.baseUrl,
          '/api/biblioteca',
          {
            method: 'PUT',
            body: biblioteca[0],
            headers: {
              origin: f.server.baseUrl
            }
          },
          f.admin.jar
        );

        assert.equal(response.response.status, 200);
        assert.deepEqual(response.body, biblioteca[0]);

        response = await request(
          f.server.baseUrl,
          '/api/special-assignments/bootstrap',
          {
            method: 'POST',
            body: {
              biblioteca,
              banos
            },
            headers: {
              origin: f.server.baseUrl
            }
          },
          f.admin.jar
        );

        assert.equal(response.response.status, 201);

        assert.deepEqual(
          response.body,
          {
            biblioteca,
            banos
          }
        );

        let persistedBiblioteca = (
          await request(
            f.server.baseUrl,
            '/api/biblioteca'
          )
        ).body;

        let persistedBanos = (
          await request(
            f.server.baseUrl,
            '/api/banos'
          )
        ).body;

        assert.deepEqual(
          persistedBiblioteca,
          biblioteca
        );

        assert.deepEqual(
          persistedBanos,
          banos
        );

        // Exact retry is idempotent.
        response = await request(
          f.server.baseUrl,
          '/api/special-assignments/bootstrap',
          {
            method: 'POST',
            body: {
              biblioteca,
              banos
            },
            headers: {
              origin: f.server.baseUrl
            }
          },
          f.admin.jar
        );

        assert.equal(response.response.status, 200);

        // A later attempt to rewrite Biblioteca must fail atomically.
        response = await request(
          f.server.baseUrl,
          '/api/special-assignments/bootstrap',
          {
            method: 'POST',
            body: {
              biblioteca: [{
                dia: 3,
                hora: 4,
                profesor: 'OTRO DOCENTE'
              }],
              banos
            },
            headers: {
              origin: f.server.baseUrl
            }
          },
          f.admin.jar
        );

        assert.equal(response.response.status, 409);

        persistedBiblioteca = (
          await request(
            f.server.baseUrl,
            '/api/biblioteca'
          )
        ).body;

        persistedBanos = (
          await request(
            f.server.baseUrl,
            '/api/banos'
          )
        ).body;

        assert.deepEqual(
          persistedBiblioteca,
          biblioteca
        );

        assert.deepEqual(
          persistedBanos,
          banos
        );
      } finally {
        await stopServer(f.server);
        cleanupTestEnvironment(f.environment);
      }
    }
  }

];
