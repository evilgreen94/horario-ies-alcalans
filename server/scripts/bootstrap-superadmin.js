const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const { bootstrapSuperadmin } = require('../user-provisioning');
const { resolveDatabaseTarget } = require('./database-target');

const OPERATIONAL_CONFIRMATION = 'BOOTSTRAP_APPROVED_SUPERADMIN';

function valueAfter(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? String(args[index + 1] || '').trim() : '';
}

async function main() {
  const args = process.argv.slice(2);
  const sourceCode = valueAfter(args, '--source-code');
  if (!sourceCode) {
    throw new Error('Uso: node server/scripts/bootstrap-superadmin.js --db <ruta.test.sqlite> --source-code RMLL');
  }
  const databasePath = resolveDatabaseTarget(valueAfter(args, '--db'), {
    confirmation: valueAfter(args, '--allow-operational-db'),
    requiredConfirmation: OPERATIONAL_CONFIRMATION
  });
  const db = await open({ filename: databasePath, driver: sqlite3.Database });
  try {
    await db.exec('PRAGMA foreign_keys = ON');
    const result = await bootstrapSuperadmin(db, { sourceCode });
    if (!result.created) {
      console.log(`Cuenta bootstrap existente: ${result.user.username} (${result.user.sourceCode}). No se ha cambiado la contraseña ni los roles.`);
      return;
    }
    console.log(`Cuenta bootstrap creada: ${result.user.username} (${result.user.sourceCode}).`);
    console.log('Contraseña temporal (se muestra una sola vez):');
    console.log(result.temporaryPassword);
    console.log('Cambio de contraseña obligatorio en el primer acceso.');
  } finally {
    await db.close();
  }
}

main().catch(error => {
  console.error(error.message || error);
  process.exitCode = 1;
});
