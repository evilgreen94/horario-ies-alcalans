const fs = require('fs');
const path = require('path');

const { DB_PATH, getDatabase } = require('../db');

const BACKUP_DIR = path.join(__dirname, '..', '..', 'BD', 'backups');
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

async function buildArchive(db) {
  const [guardias, biblioteca, historial, tareasProfesorado, sessionOverrides, appState] = await Promise.all([
    db.all('SELECT * FROM ausencias ORDER BY dia, hora, id'),
    db.all('SELECT dia, hora, profesor FROM biblioteca_guardias ORDER BY dia, hora'),
    db.all('SELECT * FROM historial ORDER BY ts DESC'),
    db.all('SELECT * FROM tareas_profesorado ORDER BY profesor, dia, hora'),
    db.all('SELECT * FROM session_overrides ORDER BY profesor, dia, hora'),
    db.all('SELECT key, value, updated_at FROM app_state ORDER BY key')
  ]);

  const appStateMap = Object.fromEntries(appState.map(row => [row.key, row.value]));

  return {
    exportedAt: new Date().toISOString(),
    kind: 'course-archive',
    dbPath: DB_PATH,
    guardias: guardias.map(row => ({ ...row, faena: !!row.faena })),
    biblioteca,
    historial: historial.map(row => ({
      id: row.id,
      title: row.title,
      detail: row.detail,
      type: row.type,
      actor: row.actor,
      ts: row.ts,
      undoState: row.undo_state ? JSON.parse(row.undo_state) : null
    })),
    tareasProfesorado: tareasProfesorado.map(row => ({
      id: row.id,
      profesor: row.profesor,
      dia: row.dia,
      hora: row.hora,
      dejada: !!row.dejada,
      tarea: row.tarea || ''
    })),
    sessionOverrides,
    substitutions: JSON.parse(appStateMap.teacher_substitutions || '[]'),
    futureAbsences: JSON.parse(appStateMap.teacher_future_absences || '[]'),
    schoolWeekKey: appStateMap.school_week_key || ''
  };
}

async function main() {
  ensureConfirmed();

  const db = await getDatabase();
  const stamp = formatStamp();
  const archive = await buildArchive(db);

  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const archivePath = path.join(BACKUP_DIR, `course-archive-${stamp}.json`);
  fs.writeFileSync(archivePath, JSON.stringify(archive, null, 2), 'utf8');

  await db.exec('BEGIN TRANSACTION');
  try {
    await db.exec('DELETE FROM ausencias');
    await db.exec('DELETE FROM biblioteca_guardias');
    await db.exec('DELETE FROM historial');
    await db.exec('DELETE FROM tareas_profesorado');
    await db.exec('DELETE FROM session_overrides');

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
  console.log('Siguiente paso recomendado: regenerar la fuente anual con npm run annual:build (usa por defecto json_profes/profesorado_horarios_guardias_con_guardias_updated.json; para otras fuentes, pasa --source <ruta>)');
}

main().catch(error => {
  console.error('No se pudo reiniciar el curso.');
  console.error(error.message);
  process.exit(1);
});
