const express = require('express');
const path = require('path');
const { DB_PATH, getDatabase } = require('../db');
const { requireRole } = require('../session');

const router = express.Router();

function ensureArray(value, label) {
  if (!Array.isArray(value)) {
    const error = new Error(`${label} debe ser una lista.`);
    error.status = 400;
    throw error;
  }
  return value;
}

function ensureObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    const error = new Error(`${label} inválido.`);
    error.status = 400;
    throw error;
  }
  return value;
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
    const [guardias, biblioteca, historial, tareasProfesorado, sessionOverrides] = await Promise.all([
      db.all('SELECT * FROM ausencias ORDER BY dia, hora, id'),
      db.all('SELECT dia, hora, profesor FROM biblioteca_guardias ORDER BY dia, hora'),
      db.all('SELECT * FROM historial ORDER BY ts DESC'),
      db.all('SELECT * FROM tareas_profesorado ORDER BY profesor, dia, hora'),
      db.all('SELECT * FROM session_overrides ORDER BY profesor, dia, hora')
    ]);

    const payload = {
      exportedAt: new Date().toISOString(),
      dbPath: DB_PATH,
      guardias: guardias.map(row => ({ ...row, faena: !!row.faena })),
      biblioteca,
      historial: historial.map(row => ({
        ...row,
        undoState: row.undo_state ? JSON.parse(row.undo_state) : null
      })),
      tareasProfesorado: tareasProfesorado.map(row => ({
        ...row,
        dejada: !!row.dejada
      })),
      sessionOverrides
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

router.get('/info', requireRole('superadmin'), (_req, res) => {
  res.json({
    dbPath: DB_PATH,
    dbFileName: path.basename(DB_PATH)
  });
});

router.post('/restore', requireRole('superadmin'), async (req, res, next) => {
  try {
    const payload = ensureObject(req.body, 'Backup');
    const guardias = ensureArray(payload.guardias || [], 'guardias');
    const biblioteca = ensureArray(payload.biblioteca || [], 'biblioteca');
    const historial = ensureArray(payload.historial || [], 'historial');
    const tareasProfesorado = ensureArray(payload.tareasProfesorado || [], 'tareasProfesorado');
    const sessionOverrides = ensureArray(payload.sessionOverrides || [], 'sessionOverrides');

    const db = await getDatabase();
    await db.exec('BEGIN TRANSACTION');
    try {
      await db.exec('DELETE FROM ausencias');
      await db.exec('DELETE FROM biblioteca_guardias');
      await db.exec('DELETE FROM historial');
      await db.exec('DELETE FROM tareas_profesorado');
      await db.exec('DELETE FROM session_overrides');

      for (const row of guardias) {
        await db.run(
          `INSERT INTO ausencias (id, dia, hora, ausente, guardia, aula, faena, obs, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            row.id ?? null,
            row.dia,
            row.hora,
            row.ausente || '',
            row.guardia || '',
            row.aula || '',
            row.faena ? 1 : 0,
            row.obs || '',
            row.created_at || new Date().toISOString(),
            row.updated_at || new Date().toISOString()
          ]
        );
      }

      for (const row of biblioteca) {
        await db.run(
          `INSERT INTO biblioteca_guardias (dia, hora, profesor, updated_at)
           VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
          [row.dia, row.hora, row.profesor || '']
        );
      }

      for (const row of historial) {
        await db.run(
          `INSERT INTO historial (id, title, detail, type, actor, ts, undo_state)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            row.id,
            row.title || 'Cambio',
            row.detail || '',
            row.type || 'other',
            row.actor || 'Jefatura',
            row.ts || new Date().toISOString(),
            row.undoState ? JSON.stringify(row.undoState) : null
          ]
        );
      }

      for (const row of tareasProfesorado) {
        await db.run(
          `INSERT INTO tareas_profesorado (id, profesor, dia, hora, dejada, tarea, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
          [row.id, row.profesor || '', row.dia, row.hora, row.dejada ? 1 : 0, row.tarea || '']
        );
      }

      for (const row of sessionOverrides) {
        await db.run(
          `INSERT INTO session_overrides (id, profesor, dia, hora, materia, grupo, detalle, aula, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
          [row.id, row.profesor || '', row.dia, row.hora, row.materia || '', row.grupo || '', row.detalle || '', row.aula || '']
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
        sessionOverrides: sessionOverrides.length
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
