const path = require('path');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const { activateScheduleDataset } = require('../schedule-model');

function valueAfter(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : '';
}

async function main() {
  const dbValue = valueAfter('--db');
  const datasetId = Number(valueAfter('--dataset-id'));
  if (!dbValue || !/\.(?:dev|test|tmp)\.sqlite$/i.test(dbValue)) throw new Error('Usa --db con una base .dev/.test/.tmp.sqlite explícita.');
  if (!Number.isSafeInteger(datasetId) || datasetId <= 0) throw new Error('Usa --dataset-id con un identificador válido.');
  const databasePath = path.resolve(dbValue);
  const operational = path.resolve(__dirname, '..', '..', 'BD', 'guardias.sqlite');
  if (databasePath.toLowerCase() === operational.toLowerCase()) throw new Error('La base operativa está bloqueada.');
  const db = await open({ filename: databasePath, driver: sqlite3.Database });
  try {
    await db.exec('PRAGMA foreign_keys = ON');
    console.log(await activateScheduleDataset(db, datasetId));
  } finally {
    await db.close();
  }
}

main().catch(error => { console.error(error.message || error); process.exitCode = 1; });
