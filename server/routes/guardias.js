const express = require('express');
const { getDatabase } = require('../db');
const { ensureArray, sanitizeAusencia } = require('./validation');
const { requireRole } = require('../session');

const router = express.Router();

router.get('/', async (_req, res, next) => {
  try {
    const db = await getDatabase();
    const rows = await db.all('SELECT * FROM ausencias ORDER BY dia, hora, id');
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.post('/', requireRole('admin'), async (req, res, next) => {
  try {
    const { dia, hora, ausente, guardia, aula, faena, obs } = sanitizeAusencia(req.body);
    const db = await getDatabase();
    const result = await db.run(
      `INSERT INTO ausencias (dia, hora, ausente, guardia, aula, faena, obs)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [dia, hora, ausente, guardia, aula, faena ? 1 : 0, obs]
    );
    const row = await db.get('SELECT * FROM ausencias WHERE id = ?', [result.lastID]);
    res.status(201).json(row);
  } catch (error) {
    next(error);
  }
});

router.put('/replace', requireRole('admin'), async (req, res, next) => {
  try {
    const rows = ensureArray(req.body, 'Las ausencias').map(sanitizeAusencia);
    const db = await getDatabase();
    await db.exec('DELETE FROM ausencias');

    for (const row of rows) {
      await db.run(
        `INSERT INTO ausencias (id, dia, hora, ausente, guardia, aula, faena, obs, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [
          row.id,
          row.dia,
          row.hora,
          row.ausente,
          row.guardia || '',
          row.aula || '',
          row.faena ? 1 : 0,
          row.obs || ''
        ]
      );
    }

    const persisted = await db.all('SELECT * FROM ausencias ORDER BY dia, hora, id');
    res.json(persisted);
  } catch (error) {
    next(error);
  }
});

router.put('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { dia, hora, ausente, guardia, aula, faena, obs } = sanitizeAusencia(req.body);
    const db = await getDatabase();
    await db.run(
      `UPDATE ausencias
       SET dia = ?, hora = ?, ausente = ?, guardia = ?, aula = ?, faena = ?, obs = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [dia, hora, ausente, guardia, aula, faena ? 1 : 0, obs, id]
    );
    const row = await db.get('SELECT * FROM ausencias WHERE id = ?', [id]);
    res.json(row);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const db = await getDatabase();
    await db.run('DELETE FROM ausencias WHERE id = ?', [req.params.id]);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

module.exports = router;
