const fs = require('fs');
const path = require('path');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');

function readArguments(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith('--')) continue;
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      result[key.slice(2)] = next;
      index += 1;
    } else {
      result[key.slice(2)] = true;
    }
  }
  return result;
}

function requireExternalFile(value, label) {
  if (!value) throw new Error(`Falta --${label}.`);
  const resolved = path.resolve(value);
  if (!fs.statSync(resolved).isFile()) throw new Error(`${label} no es un fichero.`);
  return resolved;
}

function validateDevelopmentDatabase(value) {
  if (!value) throw new Error('Falta --db; nunca se selecciona la base operativa por defecto.');
  const resolved = path.resolve(value);
  const operational = path.resolve(__dirname, '..', '..', 'BD', 'guardias.sqlite');
  if (resolved.toLowerCase() === operational.toLowerCase()) {
    throw new Error('La base operativa del repositorio está bloqueada para este importador.');
  }
  if (!/\.(?:dev|test|tmp)\.sqlite$/i.test(resolved)) {
    throw new Error('La base debe terminar en .dev.sqlite, .test.sqlite o .tmp.sqlite.');
  }
  return resolved;
}

async function main() {
  const args = readArguments(process.argv.slice(2));
  const censusPath = requireExternalFile(args.census, 'census');
  const pdfPath = requireExternalFile(args.pdf, 'pdf');
  const censusPayload = JSON.parse(fs.readFileSync(censusPath, 'utf8'));
  const { extractCanonicalScheduleFromPdf } = require('../pdf-schedule-import');
  const extraction = extractCanonicalScheduleFromPdf(fs.readFileSync(pdfPath), censusPayload, { expectedTeacherCount: 88 });
  const sourceFingerprints = {
    censusSha256: require('crypto').createHash('sha256').update(fs.readFileSync(censusPath)).digest('hex'),
    pdfSha256: require('crypto').createHash('sha256').update(fs.readFileSync(pdfPath)).digest('hex')
  };
  if (!process.argv.includes('--import')) {
    process.stdout.write(`${JSON.stringify({ mode: 'report-only', sourceFingerprints, extraction: extraction.report }, null, 2)}\n`);
    return;
  }

  const databasePath = validateDevelopmentDatabase(args.db);
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const db = await open({ filename: databasePath, driver: sqlite3.Database });
  try {
    await db.exec('PRAGMA foreign_keys = ON');
    await db.exec(fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8'));
    const { applyMigrations } = require('../db');
    await applyMigrations(db);
    const { importScheduleDataset, importTeacherProfiles } = require('../schedule-model');
    const censusResult = await importTeacherProfiles(db, censusPayload, { expectedCount: 88 });
    const datasetResult = await importScheduleDataset(db, extraction.dataset);
    process.stdout.write(`${JSON.stringify({
      database: databasePath,
      sourceFingerprints,
      census: censusResult,
      extraction: extraction.report,
      dataset: datasetResult,
      activated: false
    }, null, 2)}\n`);
  } finally {
    await db.close();
  }
}

main().catch(error => {
  console.error(error.message || error);
  process.exitCode = 1;
});
