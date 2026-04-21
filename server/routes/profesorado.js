const express = require('express');
const { getDatabase } = require('../db');
const {
  ensureArray,
  ensureRequiredString,
  sanitizeSessionOverride,
  sanitizeTeacherFutureAbsence,
  sanitizeTeacherPracticeGuardia,
  sanitizeTeacherPracticeGuardiaSlot,
  sanitizeTeacherSubstitution,
  sanitizeTareaProfesorado
} = require('./validation');
const { requireRole } = require('../session');

const router = express.Router();
const SUBSTITUTIONS_STATE_KEY = 'teacher_substitutions';
const PRACTICAS_GUARDIAS_STATE_KEY = 'teacher_practicas_guardias';
const PRACTICAS_GUARDIAS_TRAMOS_STATE_KEY = 'teacher_practicas_guardias_tramos';
const FUTURE_ABSENCES_STATE_KEY = 'teacher_future_absences';

router.get('/tareas', async (_req, res, next) => {
  try {
    const db = await getDatabase();
    const rows = await db.all('SELECT * FROM tareas_profesorado ORDER BY profesor, dia, hora');
    res.json(
      rows.map(row => ({
        id: row.id,
        profesor: row.profesor,
        dia: row.dia,
        hora: row.hora,
        dejada: !!row.dejada,
        tarea: row.tarea || ''
      }))
    );
  } catch (error) {
    next(error);
  }
});

router.put('/tareas/replace', requireRole('admin'), async (req, res, next) => {
  try {
    const rows = ensureArray(req.body, 'Las tareas de profesorado').map(sanitizeTareaProfesorado);
    const db = await getDatabase();
    await db.exec('DELETE FROM tareas_profesorado');

    for (const row of rows) {
      await db.run(
        `INSERT INTO tareas_profesorado (id, profesor, dia, hora, dejada, tarea, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [row.id, row.profesor, row.dia, row.hora, row.dejada ? 1 : 0, row.tarea || '']
      );
    }

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.post('/tareas', requireRole('admin'), async (req, res, next) => {
  try {
    const row = sanitizeTareaProfesorado(req.body);
    const db = await getDatabase();
    await db.run(
      `INSERT INTO tareas_profesorado (id, profesor, dia, hora, dejada, tarea, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(id) DO UPDATE SET
         profesor = excluded.profesor,
         dia = excluded.dia,
         hora = excluded.hora,
         dejada = excluded.dejada,
         tarea = excluded.tarea,
         updated_at = CURRENT_TIMESTAMP`,
      [row.id, row.profesor, row.dia, row.hora, row.dejada ? 1 : 0, row.tarea || '']
    );
    res.json({ ok: true, entry: row });
  } catch (error) {
    next(error);
  }
});

router.delete('/tareas/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const id = ensureRequiredString(req.params.id, 'id');
    const db = await getDatabase();
    await db.run('DELETE FROM tareas_profesorado WHERE id = ?', [id]);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.get('/session-overrides', async (_req, res, next) => {
  try {
    const db = await getDatabase();
    const rows = await db.all('SELECT * FROM session_overrides ORDER BY profesor, dia, hora');
    res.json(
      rows.map(row => ({
        id: row.id,
        profesor: row.profesor,
        dia: row.dia,
        hora: row.hora,
        materia: row.materia || '',
        grupo: row.grupo || '',
        detalle: row.detalle || '',
        aula: row.aula || ''
      }))
    );
  } catch (error) {
    next(error);
  }
});

router.put('/session-overrides/replace', requireRole('admin'), async (req, res, next) => {
  try {
    const rows = ensureArray(req.body, 'Los overrides de sesi\u00f3n').map(sanitizeSessionOverride);
    const db = await getDatabase();
    await db.exec('DELETE FROM session_overrides');

    for (const row of rows) {
      await db.run(
        `INSERT INTO session_overrides (id, profesor, dia, hora, materia, grupo, detalle, aula, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [row.id, row.profesor, row.dia, row.hora, row.materia || '', row.grupo || '', row.detalle || '', row.aula || '']
      );
    }

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.post('/session-overrides', requireRole('admin'), async (req, res, next) => {
  try {
    const row = sanitizeSessionOverride(req.body);
    const db = await getDatabase();
    await db.run(
      `INSERT INTO session_overrides (id, profesor, dia, hora, materia, grupo, detalle, aula, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(id) DO UPDATE SET
         profesor = excluded.profesor,
         dia = excluded.dia,
         hora = excluded.hora,
         materia = excluded.materia,
         grupo = excluded.grupo,
         detalle = excluded.detalle,
         aula = excluded.aula,
         updated_at = CURRENT_TIMESTAMP`,
      [row.id, row.profesor, row.dia, row.hora, row.materia || '', row.grupo || '', row.detalle || '', row.aula || '']
    );
    res.json({ ok: true, entry: row });
  } catch (error) {
    next(error);
  }
});

router.delete('/session-overrides/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const id = ensureRequiredString(req.params.id, 'id');
    const db = await getDatabase();
    await db.run('DELETE FROM session_overrides WHERE id = ?', [id]);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.get('/substitutions', async (_req, res, next) => {
  try {
    const db = await getDatabase();
    const row = await db.get('SELECT value FROM app_state WHERE key = ?', [SUBSTITUTIONS_STATE_KEY]);
    const parsed = row?.value ? JSON.parse(row.value) : [];
    res.json(Array.isArray(parsed) ? parsed : []);
  } catch (error) {
    next(error);
  }
});

router.put('/substitutions/replace', requireRole('admin'), async (req, res, next) => {
  try {
    const rows = ensureArray(req.body, 'Las sustituciones de profesorado').map(sanitizeTeacherSubstitution);
    const db = await getDatabase();
    await db.run(
      `INSERT INTO app_state (key, value, updated_at)
       VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
      [SUBSTITUTIONS_STATE_KEY, JSON.stringify(rows)]
    );
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.get('/practicas-guardias', async (_req, res, next) => {
  try {
    const db = await getDatabase();
    const row = await db.get('SELECT value FROM app_state WHERE key = ?', [PRACTICAS_GUARDIAS_STATE_KEY]);
    const parsed = row?.value ? JSON.parse(row.value) : [];
    res.json(Array.isArray(parsed) ? parsed : []);
  } catch (error) {
    next(error);
  }
});

router.put('/practicas-guardias/replace', requireRole('admin'), async (req, res, next) => {
  try {
    const rows = ensureArray(req.body, 'La disponibilidad por practicas para guardias').map(sanitizeTeacherPracticeGuardia);
    const db = await getDatabase();
    await db.run(
      `INSERT INTO app_state (key, value, updated_at)
       VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
      [PRACTICAS_GUARDIAS_STATE_KEY, JSON.stringify(rows)]
    );
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.get('/practicas-guardias-tramos', async (_req, res, next) => {
  try {
    const db = await getDatabase();
    const row = await db.get('SELECT value FROM app_state WHERE key = ?', [PRACTICAS_GUARDIAS_TRAMOS_STATE_KEY]);
    const parsed = row?.value ? JSON.parse(row.value) : [];
    res.json(Array.isArray(parsed) ? parsed : []);
  } catch (error) {
    next(error);
  }
});

router.put('/practicas-guardias-tramos/replace', requireRole('admin'), async (req, res, next) => {
  try {
    const rows = ensureArray(req.body, 'Los tramos manuales por practicas para guardias').map(sanitizeTeacherPracticeGuardiaSlot);
    const db = await getDatabase();
    await db.run(
      `INSERT INTO app_state (key, value, updated_at)
       VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
      [PRACTICAS_GUARDIAS_TRAMOS_STATE_KEY, JSON.stringify(rows)]
    );
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.get('/future-absences', async (_req, res, next) => {
  try {
    const db = await getDatabase();
    const row = await db.get('SELECT value FROM app_state WHERE key = ?', [FUTURE_ABSENCES_STATE_KEY]);
    const parsed = row?.value ? JSON.parse(row.value) : [];
    res.json(Array.isArray(parsed) ? parsed : []);
  } catch (error) {
    next(error);
  }
});

router.post('/future-absences', requireRole('admin'), async (req, res, next) => {
  try {
    const entry = sanitizeTeacherFutureAbsence(req.body);
    const db = await getDatabase();
    const currentRow = await db.get('SELECT value FROM app_state WHERE key = ?', [FUTURE_ABSENCES_STATE_KEY]);
    const current = currentRow?.value ? JSON.parse(currentRow.value) : [];
    const nextRows = [...(Array.isArray(current) ? current : []).filter(row => row?.id !== entry.id), entry];
    await db.run(
      `INSERT INTO app_state (key, value, updated_at)
       VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
      [FUTURE_ABSENCES_STATE_KEY, JSON.stringify(nextRows)]
    );
    res.json({ ok: true, entry });
  } catch (error) {
    next(error);
  }
});

router.put('/future-absences/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const id = String(req.params.id || '').trim();
    const entry = sanitizeTeacherFutureAbsence({ ...req.body, id });
    const db = await getDatabase();
    const currentRow = await db.get('SELECT value FROM app_state WHERE key = ?', [FUTURE_ABSENCES_STATE_KEY]);
    const current = currentRow?.value ? JSON.parse(currentRow.value) : [];
    const nextRows = [...(Array.isArray(current) ? current : []).filter(row => row?.id !== id), entry];
    await db.run(
      `INSERT INTO app_state (key, value, updated_at)
       VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
      [FUTURE_ABSENCES_STATE_KEY, JSON.stringify(nextRows)]
    );
    res.json({ ok: true, entry });
  } catch (error) {
    next(error);
  }
});

router.delete('/future-absences/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const id = String(req.params.id || '').trim();
    const db = await getDatabase();
    const currentRow = await db.get('SELECT value FROM app_state WHERE key = ?', [FUTURE_ABSENCES_STATE_KEY]);
    const current = currentRow?.value ? JSON.parse(currentRow.value) : [];
    const nextRows = (Array.isArray(current) ? current : []).filter(row => String(row?.id || '') !== id);
    await db.run(
      `INSERT INTO app_state (key, value, updated_at)
       VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
      [FUTURE_ABSENCES_STATE_KEY, JSON.stringify(nextRows)]
    );
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
