const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

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

  assert.ok(start >= 0, `Missing start marker: ${startMarker}`);
  assert.ok(end > start, `Missing end marker after: ${startMarker}`);

  return source.slice(start, end);
}

module.exports = [
  {
    name: 'frontend treats banos as operational state outside generic admin sync',
    fn() {
      const assignmentSource = section(
        appSource,
        'function getBanosAsignado(',
        'function buildGuardiaCoverageCounter('
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

      assert.match(
        assignmentSource,
        /banosGuardias\.find/
      );

      assert.match(
        assignmentSource,
        /if\(persisted\) return persisted\.profesor/
      );

      for (const [label, source] of [
        ['hydrateFromBackend', hydrateSource],
        ['pollBackendState', pollSource]
      ]) {
        assert.match(
          source,
          /storage\.fetchBanos\(\)/,
          `${label} must fetch persisted Baños`
        );

        assert.match(
          source,
          /setBanosGuardias\(banosRows\)/,
          `${label} must hydrate persisted Baños`
        );
      }

      assert.doesNotMatch(
        payloadSource,
        /banos\s*:/
      );

      assert.doesNotMatch(
        adminSyncSource,
        /replaceBanos/
      );

      assert.doesNotMatch(
        appSource,
        /storage\.replaceBanos\(/
      );

      assert.match(
        backendSnapshotSource,
        /banos:serializeBanosAssignments\(\)/
      );

      assert.match(
        uiSnapshotSource,
        /banos:serializeBanosAssignments\(\)/
      );

      assert.match(storageSource, /fetchBanos\(\)/);
      assert.match(storageSource, /saveBanos\(row\)/);
      assert.match(storageSource, /replaceBanos\(rows\)/);
      assert.match(storageSource, /bootstrapSpecialAssignments\(payload\)/);
    }
  }
];
