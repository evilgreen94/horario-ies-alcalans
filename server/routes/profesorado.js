const express = require('express');
const { getDatabase } = require('../db');
const {
  ensureArray,
  sanitizeSessionOverride,
  sanitizeTareaProfesorado
} = require('./validation');

const router = express.Router();

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

router.put('/tareas/replace', async (req, res, next) => {
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

router.put('/session-overrides/replace', async (req, res, next) => {
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

module.exports = router;
