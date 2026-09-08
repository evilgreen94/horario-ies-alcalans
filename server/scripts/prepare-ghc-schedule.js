const fs = require('fs');
const path = require('path');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const { parseGhcXml } = require('../ghc-xml-import');
const { validateCanonicalSchedule } = require('../schedule-model');
const { resolveDatabaseTarget } = require('./database-target');

const OPERATIONAL_IMPORT_CONFIRMATION = 'IMPORT_VALIDATED_GHC_DATASET_ONLY';

function valueAfter(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : '';
}

async function main() {
  const args = process.argv.slice(2);
  const input = valueAfter(args, '--input');
  const academicYear = valueAfter(args, '--academic-year');
  const importRequested = args.includes('--import');
  if (!input || !academicYear) {
    throw new Error('Uso: node server/scripts/prepare-ghc-schedule.js --input <Horario.xml> --academic-year 2026/27 [--import --db <ruta.test.sqlite>]');
  }
  const absoluteInput = path.resolve(input);
  const parsed = parseGhcXml(fs.readFileSync(absoluteInput), {
    academicYear,
    sourceLabel: path.basename(absoluteInput)
  });
  const validated = validateCanonicalSchedule(parsed.canonical);
  console.log(JSON.stringify({ audit: parsed.audit, validation: validated.report }, null, 2));
  if (!importRequested) return;
  const databasePath = resolveDatabaseTarget(valueAfter(args, '--db'), {
    confirmation: valueAfter(args, '--allow-operational-db'),
    requiredConfirmation: OPERATIONAL_IMPORT_CONFIRMATION
  });
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const db = await open({ filename: databasePath, driver: sqlite3.Database });
  try {
    await db.exec('PRAGMA foreign_keys = ON');
    await db.exec(fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8'));
    const { applyMigrations, withImmediateTransaction } = require('../db');
    const { importScheduleDataset, importTeacherProfiles } = require('../schedule-model');
    await applyMigrations(db);
    const result = await withImmediateTransaction(db, async () => {
      const profiles = await importTeacherProfiles(db, parsed.census, { sourceFormat: 'xml' });
      const dataset = await importScheduleDataset(db, parsed.canonical);
      return { profiles, dataset, activated: false };
    }, { label: `ghc-cli-import:${academicYear}` });
    console.log(JSON.stringify({ database: databasePath, ...result }, null, 2));
  } finally {
    await db.close();
  }
}

main().catch(error => {
  console.error(error.message || error);
  process.exitCode = 1;
});
