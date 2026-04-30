const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { DB_PATH, getDatabase } = require('../db');
const { finishRestore, isRestoreInProgress, startRestore } = require('../maintenance');
const { requireRole } = require('../session');
const { getTelemetrySnapshot } = require('../telemetry');
const {
  ensureArray,
  ensureOptionalId,
  ensureRequiredString,
  ensureTimestamp,
  normalizeBoolean,
  normalizeInteger,
  normalizeString,
  sanitizeBiblioteca,
  sanitizeSessionOverride,
  sanitizeTeacherFutureAbsence,
  sanitizeTeacherPracticeGuardia,
  sanitizeTeacherPracticeGuardiaSlot,
  sanitizeTeacherSubstitution,
  sanitizeTareaProfesorado
} = require('./validation');

const router = express.Router();

const SUBSTITUTIONS_STATE_KEY = 'teacher_substitutions';
const FUTURE_ABSENCES_STATE_KEY = 'teacher_future_absences';
const WEEK_STATE_KEY = 'school_week_key';
const PRACTICAS_GUARDIAS_STATE_KEY = 'teacher_practicas_guardias';
const PRACTICAS_GUARDIAS_TRAMOS_STATE_KEY = 'teacher_practicas_guardias_tramos';
const MONTHLY_GUARDIA_LOAD_STATE_KEY = 'guardia_monthly_load';

router.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  next();
});

function badRequest(message, details) {
  const error = new Error(message);
  error.status = 400;
  if (details) error.details = details;
  throw error;
}

function ensureObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    badRequest(`${label} invalido.`);
  }
  return value;
}

function ensureBackupSection(payload, key, label) {
  if (!Object.prototype.hasOwnProperty.call(payload, key)) {
    badRequest(`El backup no incluye la seccion obligatoria "${key}".`);
  }
  return ensureArray(payload[key], label);
}

function ensureOptionalBackupSection(payload, key, label, sanitizer) {
  if (!Object.prototype.hasOwnProperty.call(payload, key)) {
    return [];
  }
  return ensureArray(payload[key], label).map(sanitizer);
}

function sanitizeRestoreAusencia(row) {
  const input = ensureObject(row, 'Ausencia');
  return {
    id: ensureOptionalId(input.id, 'id'),
    dia: normalizeInteger(input.dia, 'dia', 0, 4),
    hora: normalizeInteger(input.hora, 'hora', 1, 9),
    ausente: ensureRequiredString(input.ausente, 'ausente'),
    guardia: normalizeString(input.guardia),
    aula: normalizeString(input.aula),
    faena: normalizeBoolean(input.faena),
    obs: normalizeString(input.obs),
    created_at: input.created_at ? ensureTimestamp(input.created_at, 'created_at') : new Date().toISOString(),
    updated_at: input.updated_at ? ensureTimestamp(input.updated_at, 'updated_at') : new Date().toISOString()
  };
}

function sanitizeRestoreHistorial(row) {
  const input = ensureObject(row, 'Entrada de historial');
  const undoState = input.undoState ?? null;
  if (undoState !== null && typeof undoState !== 'object') {
    badRequest('undoState debe ser un objeto o null.');
  }
  return {
    id: ensureRequiredString(input.id, 'id'),
    title: ensureRequiredString(input.title, 'title'),
    detail: normalizeString(input.detail),
    type: normalizeString(input.type, 'other') || 'other',
    actor: normalizeString(input.actor, 'Jefatura') || 'Jefatura',
    ts: ensureTimestamp(input.ts, 'ts'),
    undoState
  };
}

function sanitizeRestoreAlumnosFueraAula(row) {
  const input = ensureObject(row, 'Registro de alumnos fuera del aula');
  const updatedAt = input.updatedAt ?? input.updated_at;
  return {
    id: ensureOptionalId(input.id, 'id'),
    profesor: ensureRequiredString(input.profesor, 'profesor'),
    dia: normalizeInteger(input.dia, 'dia', 0, 4),
    hora: normalizeInteger(input.hora, 'hora', 1, 9),
    cantidad: normalizeInteger(input.cantidad, 'cantidad', 0, 10),
    lastExitAt: normalizeString(input.lastExitAt ?? input.last_exit_at),
    lastReturnAt: normalizeString(input.lastReturnAt ?? input.last_return_at),
    updatedAt: updatedAt ? ensureTimestamp(updatedAt, 'updatedAt') : new Date().toISOString()
  };
}

function sanitizeBackupPayload(payload) {
  const input = ensureObject(payload, 'Backup');
  if (input.exportedAt) {
    ensureTimestamp(input.exportedAt, 'exportedAt');
  }
  return {
    guardias: ensureBackupSection(input, 'guardias', 'guardias').map(sanitizeRestoreAusencia),
    biblioteca: ensureBackupSection(input, 'biblioteca', 'biblioteca').map(sanitizeBiblioteca),
    historial: ensureBackupSection(input, 'historial', 'historial').map(sanitizeRestoreHistorial),
    tareasProfesorado: ensureBackupSection(input, 'tareasProfesorado', 'tareasProfesorado').map(sanitizeTareaProfesorado),
    sessionOverrides: ensureBackupSection(input, 'sessionOverrides', 'sessionOverrides').map(sanitizeSessionOverride),
    substitutions: ensureBackupSection(input, 'substitutions', 'substitutions').map(sanitizeTeacherSubstitution),
    futureAbsences: ensureBackupSection(input, 'futureAbsences', 'futureAbsences').map(sanitizeTeacherFutureAbsence),
    alumnosFueraAula: ensureOptionalBackupSection(input, 'alumnosFueraAula', 'alumnosFueraAula', sanitizeRestoreAlumnosFueraAula),
    schoolWeekKey: normalizeString(input.schoolWeekKey),
    teacherSubstitutions: ensureOptionalBackupSection(input, 'teacherSubstitutions', 'teacherSubstitutions', sanitizeTeacherSubstitution),
    teacherPracticasGuardias: ensureOptionalBackupSection(input, 'teacherPracticasGuardias', 'teacherPracticasGuardias', sanitizeTeacherPracticeGuardia),
    teacherPracticasGuardiasTramos: ensureOptionalBackupSection(input, 'teacherPracticasGuardiasTramos', 'teacherPracticasGuardiasTramos', sanitizeTeacherPracticeGuardiaSlot),
    monthlyGuardiaLoad: input.monthlyGuardiaLoad && typeof input.monthlyGuardiaLoad === 'object' && !Array.isArray(input.monthlyGuardiaLoad) ? input.monthlyGuardiaLoad : null
  };
}

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

router.get('/snapshot.json', requireRole('superadmin'), async (_req, res, next) => {
  try {
    const db = await getDatabase();
    const [
      guardias,
      biblioteca,
      historial,
      tareasProfesorado,
      alumnosFueraAula,
      sessionOverrides,
      appStateRows,
      substitutionsState,
      practicasGuardiasState,
      practicasGuardiasTramosState
    ] = await Promise.all([
      db.all('SELECT * FROM ausencias ORDER BY dia, hora, id'),
      db.all('SELECT dia, hora, profesor FROM biblioteca_guardias ORDER BY dia, hora'),
      db.all('SELECT * FROM historial ORDER BY ts DESC'),
      db.all('SELECT * FROM tareas_profesorado ORDER BY profesor, dia, hora'),
      db.all('SELECT * FROM alumnos_fuera_aula ORDER BY dia, hora, profesor, id'),
      db.all('SELECT * FROM session_overrides ORDER BY profesor, dia, hora'),
      db.all(
        'SELECT key, value FROM app_state WHERE key IN (?, ?, ?, ?) ORDER BY key',
        [SUBSTITUTIONS_STATE_KEY, FUTURE_ABSENCES_STATE_KEY, WEEK_STATE_KEY, MONTHLY_GUARDIA_LOAD_STATE_KEY]
      ),
      db.get('SELECT value FROM app_state WHERE key = ?', [SUBSTITUTIONS_STATE_KEY]),
      db.get('SELECT value FROM app_state WHERE key = ?', [PRACTICAS_GUARDIAS_STATE_KEY]),
      db.get('SELECT value FROM app_state WHERE key = ?', [PRACTICAS_GUARDIAS_TRAMOS_STATE_KEY])
    ]);

    const appState = Object.fromEntries(appStateRows.map(row => [row.key, row.value]));
    const substitutions = appState[SUBSTITUTIONS_STATE_KEY] ? JSON.parse(appState[SUBSTITUTIONS_STATE_KEY]) : [];
    const futureAbsences = appState[FUTURE_ABSENCES_STATE_KEY] ? JSON.parse(appState[FUTURE_ABSENCES_STATE_KEY]) : [];
    const schoolWeekKey = appState[WEEK_STATE_KEY] || '';
    const monthlyGuardiaLoad = appState[MONTHLY_GUARDIA_LOAD_STATE_KEY] ? JSON.parse(appState[MONTHLY_GUARDIA_LOAD_STATE_KEY]) : null;

    const payload = {
      exportedAt: new Date().toISOString(),
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
      alumnosFueraAula: alumnosFueraAula.map(row => ({
        id: row.id,
        profesor: row.profesor,
        dia: row.dia,
        hora: row.hora,
        cantidad: row.cantidad,
        lastExitAt: row.last_exit_at || '',
        lastReturnAt: row.last_return_at || '',
        updatedAt: row.updated_at || ''
      })),
      sessionOverrides,
      substitutions: Array.isArray(substitutions) ? substitutions : [],
      futureAbsences: Array.isArray(futureAbsences) ? futureAbsences : [],
      schoolWeekKey,
      monthlyGuardiaLoad,
      teacherSubstitutions: substitutionsState?.value ? JSON.parse(substitutionsState.value) : [],
      teacherPracticasGuardias: practicasGuardiasState?.value ? JSON.parse(practicasGuardiasState.value) : [],
      teacherPracticasGuardiasTramos: practicasGuardiasTramosState?.value ? JSON.parse(practicasGuardiasTramosState.value) : []
    };

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="guardias-backup-${formatStamp()}.json"`);
    res.json(payload);
  } catch (error) {
    next(error);
  }
});

router.get('/database.sqlite', requireRole('superadmin'), (_req, res, next) => {
  try {
    res.download(DB_PATH, `guardias-backup-${formatStamp()}.sqlite`);
  } catch (error) {
    next(error);
  }
});

router.get('/info', requireRole('superadmin'), async (_req, res, next) => {
  try {
    const db = await getDatabase();
    const dbStat = fs.statSync(DB_PATH);
    const [ausenciasRow, historialRow, tareasRow, alumnosFueraAulaRow, overridesRow, appStateRows] = await Promise.all([
      db.get('SELECT COUNT(*) AS total FROM ausencias'),
      db.get('SELECT COUNT(*) AS total FROM historial'),
      db.get('SELECT COUNT(*) AS total FROM tareas_profesorado'),
      db.get('SELECT COUNT(*) AS total FROM alumnos_fuera_aula'),
      db.get('SELECT COUNT(*) AS total FROM session_overrides'),
      db.all(
        'SELECT key, LENGTH(value) AS size, updated_at FROM app_state WHERE key IN (?, ?, ?, ?) ORDER BY key',
        [SUBSTITUTIONS_STATE_KEY, FUTURE_ABSENCES_STATE_KEY, WEEK_STATE_KEY, MONTHLY_GUARDIA_LOAD_STATE_KEY]
      )
    ]);

    res.json({
      dbFileName: path.basename(DB_PATH),
      dbPath: DB_PATH,
      dbSizeBytes: dbStat.size,
      restoreInProgress: isRestoreInProgress(),
      server: {
        nodeVersion: process.version,
        platform: process.platform,
        uptimeSec: Math.round(process.uptime()),
        pid: process.pid,
        memory: process.memoryUsage(),
        loadAverage: os.loadavg().map(value => Number(value.toFixed(2))),
        cpuCount: os.cpus().length,
        hostname: os.hostname(),
        currentTime: new Date().toISOString(),
        telemetry: getTelemetrySnapshot()
      },
      counts: {
        guardias: ausenciasRow?.total || 0,
        historial: historialRow?.total || 0,
        tareasProfesorado: tareasRow?.total || 0,
        alumnosFueraAula: alumnosFueraAulaRow?.total || 0,
        sessionOverrides: overridesRow?.total || 0,
        appState: appStateRows.map(row => ({
          key: row.key,
          size: row.size || 0,
          updatedAt: row.updated_at || ''
        }))
      }
    });
  } catch (error) {
    next(error);
  }
});

router.post('/restore', requireRole('superadmin'), async (req, res, next) => {
  let restoreStarted = false;

  try {
    startRestore();
    restoreStarted = true;

    const payload = sanitizeBackupPayload(req.body);
    const {
      guardias,
      biblioteca,
      historial,
      tareasProfesorado,
      alumnosFueraAula,
      sessionOverrides,
      substitutions,
      futureAbsences,
      schoolWeekKey,
      monthlyGuardiaLoad,
      teacherSubstitutions,
      teacherPracticasGuardias,
      teacherPracticasGuardiasTramos
    } = payload;
    const effectiveSubstitutions = teacherSubstitutions.length ? teacherSubstitutions : substitutions;

    const db = await getDatabase();
    await db.exec('BEGIN TRANSACTION');
    try {
      await db.exec('DELETE FROM ausencias');
      await db.exec('DELETE FROM biblioteca_guardias');
      await db.exec('DELETE FROM historial');
      await db.exec('DELETE FROM tareas_profesorado');
      await db.exec('DELETE FROM alumnos_fuera_aula');
      await db.exec('DELETE FROM session_overrides');
      await db.run(
        'DELETE FROM app_state WHERE key IN (?, ?, ?, ?, ?, ?)',
        [
          SUBSTITUTIONS_STATE_KEY,
          FUTURE_ABSENCES_STATE_KEY,
          WEEK_STATE_KEY,
          MONTHLY_GUARDIA_LOAD_STATE_KEY,
          PRACTICAS_GUARDIAS_STATE_KEY,
          PRACTICAS_GUARDIAS_TRAMOS_STATE_KEY
        ]
      );

      for (const row of guardias) {
        await db.run(
          `INSERT INTO ausencias (id, dia, hora, ausente, guardia, aula, faena, obs, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            row.id,
            row.dia,
            row.hora,
            row.ausente,
            row.guardia,
            row.aula,
            row.faena ? 1 : 0,
            row.obs,
            row.created_at,
            row.updated_at
          ]
        );
      }

      for (const row of biblioteca) {
        await db.run(
          `INSERT INTO biblioteca_guardias (dia, hora, profesor, updated_at)
           VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
          [row.dia, row.hora, row.profesor]
        );
      }

      for (const row of historial) {
        await db.run(
          `INSERT INTO historial (id, title, detail, type, actor, ts, undo_state)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            row.id,
            row.title,
            row.detail,
            row.type,
            row.actor,
            row.ts,
            row.undoState ? JSON.stringify(row.undoState) : null
          ]
        );
      }

      for (const row of tareasProfesorado) {
        await db.run(
          `INSERT INTO tareas_profesorado (id, profesor, dia, hora, dejada, tarea, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
          [row.id, row.profesor, row.dia, row.hora, row.dejada ? 1 : 0, row.tarea]
        );
      }

      for (const row of alumnosFueraAula) {
        await db.run(
          `INSERT INTO alumnos_fuera_aula (id, profesor, dia, hora, cantidad, last_exit_at, last_return_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            row.id,
            row.profesor,
            row.dia,
            row.hora,
            row.cantidad,
            row.lastExitAt,
            row.lastReturnAt,
            row.updatedAt
          ]
        );
      }

      for (const row of sessionOverrides) {
        await db.run(
          `INSERT INTO session_overrides (id, profesor, dia, hora, materia, grupo, detalle, aula, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
          [row.id, row.profesor, row.dia, row.hora, row.materia, row.grupo, row.detalle, row.aula]
        );
      }

      if (effectiveSubstitutions.length) {
        await db.run(
          `INSERT INTO app_state (key, value, updated_at)
           VALUES (?, ?, CURRENT_TIMESTAMP)`,
          [SUBSTITUTIONS_STATE_KEY, JSON.stringify(effectiveSubstitutions)]
        );
      }

      if (futureAbsences.length) {
        await db.run(
          `INSERT INTO app_state (key, value, updated_at)
           VALUES (?, ?, CURRENT_TIMESTAMP)`,
          [FUTURE_ABSENCES_STATE_KEY, JSON.stringify(futureAbsences)]
        );
      }

      if (schoolWeekKey) {
        await db.run(
          `INSERT INTO app_state (key, value, updated_at)
           VALUES (?, ?, CURRENT_TIMESTAMP)`,
          [WEEK_STATE_KEY, schoolWeekKey]
        );
      }

      if (monthlyGuardiaLoad) {
        await db.run(
          `INSERT INTO app_state (key, value, updated_at)
           VALUES (?, ?, CURRENT_TIMESTAMP)`,
          [MONTHLY_GUARDIA_LOAD_STATE_KEY, JSON.stringify(monthlyGuardiaLoad)]
        );
      }

      if (teacherPracticasGuardias.length) {
        await db.run(
          `INSERT INTO app_state (key, value, updated_at)
           VALUES (?, ?, CURRENT_TIMESTAMP)`,
          [PRACTICAS_GUARDIAS_STATE_KEY, JSON.stringify(teacherPracticasGuardias)]
        );
      }

      if (teacherPracticasGuardiasTramos.length) {
        await db.run(
          `INSERT INTO app_state (key, value, updated_at)
           VALUES (?, ?, CURRENT_TIMESTAMP)`,
          [PRACTICAS_GUARDIAS_TRAMOS_STATE_KEY, JSON.stringify(teacherPracticasGuardiasTramos)]
        );
      }

      await db.exec('COMMIT');
    } catch (error) {
      await db.exec('ROLLBACK');
      throw error;
    }

      res.json({
        ok: true,
        restoredAt: new Date().toISOString(),
        counts: {
          guardias: guardias.length,
          biblioteca: biblioteca.length,
          historial: historial.length,
          tareasProfesorado: tareasProfesorado.length,
          alumnosFueraAula: alumnosFueraAula.length,
          sessionOverrides: sessionOverrides.length,
          substitutions: effectiveSubstitutions.length,
          futureAbsences: futureAbsences.length,
          teacherSubstitutions: effectiveSubstitutions.length,
        monthlyGuardiaLoad: monthlyGuardiaLoad ? 1 : 0,
        teacherPracticasGuardias: teacherPracticasGuardias.length,
        teacherPracticasGuardiasTramos: teacherPracticasGuardiasTramos.length
      }
    });
  } catch (error) {
    next(error);
  } finally {
    if (restoreStarted) {
      finishRestore();
    }
  }
});

module.exports = router;
