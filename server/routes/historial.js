const express = require('express');
const { getDatabase } = require('../db');
const { ensureArray, sanitizeHistorial } = require('./validation');

const router = express.Router();

router.get('/', async (_req, res, next) => {
  try {
    const db = await getDatabase();
    const rows = await db.all('SELECT * FROM historial ORDER BY ts DESC');
    res.json(
      rows.map(row => ({
        ...row,
        undoState: row.undo_state ? JSON.parse(row.undo_state) : null
      }))
    );
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { id, title, detail, type, actor, ts, undoState } = sanitizeHistorial(req.body);
    const db = await getDatabase();
    await db.run(
      `INSERT OR REPLACE INTO historial (id, title, detail, type, actor, ts, undo_state)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, title, detail, type, actor, ts, undoState ? JSON.stringify(undoState) : null]
    );
    res.status(201).json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.put('/replace', async (req, res, next) => {
  try {
    const rows = ensureArray(req.body, 'El historial').map(sanitizeHistorial);
    const db = await getDatabase();
    await db.exec('DELETE FROM historial');

    for (const row of rows) {
      await db.run(
        `INSERT INTO historial (id, title, detail, type, actor, ts, undo_state)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          row.id,
          row.title,
          row.detail || '',
          row.type || 'other',
          row.actor || 'Jefatura',
          row.ts,
          row.undoState ? JSON.stringify(row.undoState) : null
        ]
      );
    }

    const persisted = await db.all('SELECT * FROM historial ORDER BY ts DESC');
    res.json(
      persisted.map(row => ({
        ...row,
        undoState: row.undo_state ? JSON.parse(row.undo_state) : null
      }))
    );
  } catch (error) {
    next(error);
  }
});

module.exports = router;
