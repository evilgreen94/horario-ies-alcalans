const assert = require('assert');
const os = require('os');
const path = require('path');

const { resolveDatabaseTarget } = require('../scripts/database-target');
const { OPERATIONAL_IMPORT_CONFIRMATION } = require('../scripts/prepare-canonical-schedule');
const { OPERATIONAL_ACTIVATION_CONFIRMATION } = require('../scripts/activate-canonical-schedule');

function operationalPath() {
  return path.resolve(path.parse(process.cwd()).root, 'var', 'lib', 'guardias', 'guardias.sqlite');
}

module.exports = [
  {
    name: 'deployment CLI requires exact explicit confirmation for operational SQLite targets',
    fn: async () => {
      const local = path.join(os.tmpdir(), 'guardias-cli-safety.test.sqlite');
      assert.strictEqual(resolveDatabaseTarget(local), path.resolve(local));

      const target = operationalPath();
      assert.throws(
        () => resolveDatabaseTarget(target, { requiredConfirmation: OPERATIONAL_IMPORT_CONFIRMATION }),
        /IMPORT_VALIDATED_DATASET_ONLY/
      );
      assert.throws(
        () => resolveDatabaseTarget(target, {
          confirmation: 'wrong',
          requiredConfirmation: OPERATIONAL_ACTIVATION_CONFIRMATION
        }),
        /ACTIVATE_APPROVED_DATASET/
      );
      assert.strictEqual(
        resolveDatabaseTarget(target, {
          confirmation: OPERATIONAL_IMPORT_CONFIRMATION,
          requiredConfirmation: OPERATIONAL_IMPORT_CONFIRMATION
        }),
        target
      );
      assert.strictEqual(
        resolveDatabaseTarget(target, {
          confirmation: OPERATIONAL_ACTIVATION_CONFIRMATION,
          requiredConfirmation: OPERATIONAL_ACTIVATION_CONFIRMATION
        }),
        target
      );

      const repositoryDatabase = path.resolve(__dirname, '..', '..', 'BD', 'guardias.sqlite');
      assert.throws(
        () => resolveDatabaseTarget(repositoryDatabase, {
          confirmation: OPERATIONAL_IMPORT_CONFIRMATION,
          requiredConfirmation: OPERATIONAL_IMPORT_CONFIRMATION
        }),
        /repositorio está bloqueada/
      );
    }
  }
];
