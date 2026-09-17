const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  cleanupTestEnvironment,
  createTestEnvironment,
  loginIndividual,
  openDatabase,
  request,
  seedIndividualUser,
  startServer,
  stopServer
} = require('./helpers/integration-harness');

const projectRoot = path.join(__dirname, '..', '..');
const appSource = fs.readFileSync(
  path.join(projectRoot, 'js', 'app', 'guardias.js'),
  'utf8'
);
const storageSource = fs.readFileSync(
  path.join(projectRoot, 'js', 'app', 'storage.js'),
  'utf8'
);

function section(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);

  assert.ok(
    start >= 0,
    `Missing start marker: ${startMarker}`
  );

  assert.ok(
    end > start,
    `Missing end marker after: ${startMarker}`
  );

  return source.slice(start, end);
}

async function fixture() {
  const environment = createTestEnvironment();
  const server = await startServer({
    dbPath: environment.dbPath
  });

  try {
    await seedIndividualUser(environment.dbPath, {
      username: 'biblioteca.admin',
      password: 'Biblioteca-fixture-2026!',
      roles: ['admin']
    });

    const admin = await loginIndividual(
      server.baseUrl,
      'biblioteca.admin',
      'Biblioteca-fixture-2026!'
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
    name: 'biblioteca assignment persists independently from guardia replacement and server restart',
    async fn() {
      const f = await fixture();
      let server = f.server;

      try {
        const assignment = {
          dia: 0,
          hora: 1,
          profesor: 'DOCENTE BIBLIOTECA'
        };

        const saved = await request(
          server.baseUrl,
          '/api/biblioteca',
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
            '/api/biblioteca'
          )
        ).body;

        assert.deepEqual(rows, [assignment]);

        // A generic guardia replacement must not own or mutate Biblioteca.
        const guardiaReplace = await request(
          server.baseUrl,
          '/api/guardias/replace',
          {
            method: 'PUT',
            body: [],
            headers: {
              origin: server.baseUrl
            }
          },
          f.admin.jar
        );

        assert.equal(guardiaReplace.response.status, 200);

        rows = (
          await request(
            server.baseUrl,
            '/api/biblioteca'
          )
        ).body;

        assert.deepEqual(rows, [assignment]);

        const db = await openDatabase(
          f.environment.dbPath
        );

        try {
          const persisted = await db.all(
            `SELECT dia, hora, profesor
             FROM biblioteca_guardias
             ORDER BY dia, hora`
          );

          assert.deepEqual(
            persisted,
            [assignment]
          );
        } finally {
          await db.close();
        }

        // The persisted operational decision must survive process restart.
        await stopServer(server);

        server = await startServer({
          dbPath: f.environment.dbPath
        });

        rows = (
          await request(
            server.baseUrl,
            '/api/biblioteca'
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
    name: 'frontend treats persisted biblioteca as authoritative and generic sync cannot recalculate it',
    fn() {
      const specialAssignmentsSource = section(
        appSource,
        'function getSpecialAssignments(',
        'function buildGuardiaCoverageCounter('
      );

      const serializerSource = section(
        appSource,
        'function serializeBibliotecaAssignments(',
        'function serializeBanosAssignments('
      );

      const payloadSource = section(
        appSource,
        'function buildAdminSyncPayload(',
        'function buildAdminSyncHash('
      );

      const adminSyncSource = section(
        appSource,
        'async function runAdminStateSync(',
        'async function syncAdminState('
      );

      const hydrateSource = section(
        appSource,
        'async function hydrateFromBackend()',
        'function isAnyOverlayOpen()'
      );

      const pollSource = section(
        appSource,
        'async function pollBackendState(',
        'function isReportAvailable()'
      );

      const backendSnapshotSource = section(
        appSource,
        'function makeBackendSnapshot()',
        'function makeGuardiasUiSnapshot()'
      );

      const uiSnapshotSource = section(
        appSource,
        'function makeGuardiasUiSnapshot()',
        'function renderGuardiasUiIfChanged('
      );

      // Persisted Biblioteca is authoritative whenever a backend exists.
      assert.match(
        specialAssignmentsSource,
        /const persisted=bibliotecaGuardias\.find/
      );

      assert.match(
        specialAssignmentsSource,
        /if\(persisted\) return persisted\.profesor/
      );

      assert.match(
        specialAssignmentsSource,
        /if\(!storage\.hasBackend\(\)\) return getSpecialAssignments/
      );

      // Baños is now authoritative persisted state whenever the
      // application is connected to the backend. The motor remains only
      // as a local/offline proposal fallback.
      assert.match(
        specialAssignmentsSource,
        /const persisted=banosGuardias\.find/
      );

      assert.match(
        specialAssignmentsSource,
        /if\(persisted\) return persisted\.profesor/
      );

      assert.match(
        specialAssignmentsSource,
        /if\(!storage\.hasBackend\(\)\)\{/
      );

      assert.match(
        specialAssignmentsSource,
        /const proposal=getSpecialAssignments/
      );

      // Serialization represents persisted state; it must not run the motor.
      assert.match(
        serializerSource,
        /bibliotecaGuardias\.map/
      );

      assert.doesNotMatch(
        serializerSource,
        /getBibliotecaAsignada|getSpecialAssignments/
      );

      // Generic Jefatura sync no longer owns Biblioteca.
      assert.doesNotMatch(
        payloadSource,
        /biblioteca\s*:/
      );

      assert.doesNotMatch(
        adminSyncSource,
        /replaceBiblioteca/
      );

      // Hydration and polling both read the authoritative backend state.
      for (const [label, source] of [
        ['hydrateFromBackend', hydrateSource],
        ['pollBackendState', pollSource]
      ]) {
        assert.match(
          source,
          /storage\.fetchBiblioteca\(\)/,
          `${label} must fetch persisted Biblioteca`
        );

        assert.match(
          source,
          /setBibliotecaGuardias\(bibliotecaRows\)/,
          `${label} must hydrate persisted Biblioteca`
        );
      }

      // Backend drift and visible UI changes include persisted Biblioteca.
      assert.match(
        backendSnapshotSource,
        /biblioteca:serializeBibliotecaAssignments\(\)/
      );

      assert.match(
        uiSnapshotSource,
        /biblioteca:serializeBibliotecaAssignments\(\)/
      );

      // PUT /biblioteca is available for future explicit Jefatura changes.
      assert.match(
        storageSource,
        /saveBiblioteca\(row\)/
      );

      // Whole-table replacement may remain available for exceptional
      // restore/import flows, but guardias.js must never call it.
      assert.doesNotMatch(
        appSource,
        /storage\.replaceBiblioteca\(/
      );
    }
  }
];
