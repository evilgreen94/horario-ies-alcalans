const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const { activateScheduleDataset } = require('../schedule-model');
const { resolveDatabaseTarget } = require('./database-target');

const OPERATIONAL_ACTIVATION_CONFIRMATION = 'ACTIVATE_APPROVED_DATASET';

function valueAfter(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : '';
}

async function main() {
  const dbValue = valueAfter('--db');
  const datasetId = Number(valueAfter('--dataset-id'));
  if (!Number.isSafeInteger(datasetId) || datasetId <= 0) throw new Error('Usa --dataset-id con un identificador válido.');
  const databasePath = resolveDatabaseTarget(dbValue, {
    confirmation: valueAfter('--allow-operational-db'),
    requiredConfirmation: OPERATIONAL_ACTIVATION_CONFIRMATION
  });
  const db = await open({ filename: databasePath, driver: sqlite3.Database });
  try {
    await db.exec('PRAGMA foreign_keys = ON');
    console.log(await activateScheduleDataset(db, datasetId));
  } finally {
    await db.close();
  }
}

if (require.main === module) {
  main().catch(error => { console.error(error.message || error); process.exitCode = 1; });
}

module.exports = { OPERATIONAL_ACTIVATION_CONFIRMATION, main };
