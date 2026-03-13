const express = require('express');
const { getDatabase } = require('../db');
const { ensureArray, sanitizeBiblioteca } = require('./validation');

const router = express.Router();

router.get('/', async (_req, res, next) => {
  try {
    const db = await getDatabase();
    const rows = await db.all('SELECT dia, hora, profesor FROM biblioteca_guardias ORDER BY dia, hora');
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.put('/', async (req, res, next) => {
  try {
    const { dia, hora, profesor } = sanitizeBiblioteca(req.body);
    const db = await getDatabase();
    await db.run(
      `INSERT INTO biblioteca_guardias (dia, hora, profesor, updated_at)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(dia, hora) DO UPDATE SET profesor = excluded.profesor, updated_at = CURRENT_TIMESTAMP`,
      [dia, hora, profesor]
    );
    const row = await db.get(
      'SELECT dia, hora, profesor FROM biblioteca_guardias WHERE dia = ? AND hora = ?',
      [dia, hora]
    );
    res.json(row);
  } catch (error) {
    next(error);
  }
});

router.put('/replace', async (req, res, next) => {
  try {
    const rows = ensureArray(req.body, 'Las guardias de biblioteca').map(sanitizeBiblioteca);
    const db = await getDatabase();
    await db.exec('DELETE FROM biblioteca_guardias');

    for (const row of rows) {
      await db.run(
        `INSERT INTO biblioteca_guardias (dia, hora, profesor, updated_at)
         VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
        [row.dia, row.hora, row.profesor]
      );
    }

    const persisted = await db.all('SELECT dia, hora, profesor FROM biblioteca_guardias ORDER BY dia, hora');
    res.json(persisted);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
