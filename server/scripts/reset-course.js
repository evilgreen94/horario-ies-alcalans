const fs = require('fs');
const path = require('path');

const { DB_PATH, getDatabase } = require('../db');
const { createSqliteBackup, verifySqliteBackup } = require('../sqlite-backup');

const BACKUP_DIR = process.env.GUARDIAS_BACKUP_DIR
  ? path.resolve(process.env.GUARDIAS_BACKUP_DIR)
  : path.join(path.dirname(DB_PATH), 'backups');
const APP_STATE_KEYS_TO_CLEAR = [
  'school_week_key',
  'guardia_monthly_load',
  'teacher_substitutions',
  'teacher_future_absences',
  'teacher_practicas_guardias',
  'teacher_practicas_guardias_tramos'
];

function formatStamp() {
  return new Intl.DateTimeFormat('sv-SE', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'Europe/Madrid'
  }).format(new Date()).replace(/[\s:]/g, '-');
}

function ensureConfirmed() {
  if (process.argv.includes('--yes')) return;

  console.error('Este script borra los datos operativos del curso actual.');
  console.error('Ejecuta de nuevo con --yes para confirmar.');
  process.exit(1);
}

async function main() {
  ensureConfirmed();

  const db = await getDatabase();
  const stamp = formatStamp();

  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const archivePath = path.join(BACKUP_DIR, `course-archive-${stamp}.sqlite`);
  await createSqliteBackup(DB_PATH, archivePath);
  await verifySqliteBackup(archivePath);

  await db.exec('BEGIN TRANSACTION');
  try {
    await db.exec('DELETE FROM ausencias');
    await db.exec('DELETE FROM biblioteca_guardias');
    await db.exec('DELETE FROM historial');
    await db.exec('DELETE FROM tareas_profesorado');
    await db.exec('DELETE FROM session_overrides');
    await db.exec("UPDATE schedule_datasets SET status = 'archived', updated_at = CURRENT_TIMESTAMP WHERE status = 'active'");
    await db.exec("UPDATE academic_years SET status = 'archived', updated_at = CURRENT_TIMESTAMP WHERE status = 'active'");

    for (const key of APP_STATE_KEYS_TO_CLEAR) {
      await db.run('DELETE FROM app_state WHERE key = ?', [key]);
    }

    await db.exec('COMMIT');
  } catch (error) {
    await db.exec('ROLLBACK');
    throw error;
  }

  console.log('Curso operativo reiniciado correctamente.');
  console.log(`- Backup archivado en: ${archivePath}`);
  console.log(`- Base de datos: ${DB_PATH}`);
  console.log('Siguiente paso: importar y validar un dataset canónico del nuevo curso y activarlo explícitamente.');
}

main().catch(error => {
  console.error('No se pudo reiniciar el curso.');
  console.error(error.message);
  process.exit(1);
});
