const express = require('express');
const { getDatabase } = require('../db');
const { ensureArray, normalizeText, sanitizeAusencia } = require('./validation');
const { requireRole } = require('../session');

const router = express.Router();

function notFound(message) {
  const error = new Error(message);
  error.status = 404;
  return error;
}

function conflict(message) {
  const error = new Error(message);
  error.status = 409;
  return error;
}

function buildAbsenceLogicKeys(row) {
  return {
    ausente_key: normalizeText(row?.ausente),
    guardia_key: normalizeText(row?.guardia)
  };
}

async function ensureNoDuplicateAbsence(db, row, excludeId = null) {
  const rows = await db.all(
    'SELECT id, dia, hora, ausente FROM ausencias WHERE dia = ? AND hora = ?',
    [row.dia, row.hora]
  );
  const targetKeys = buildAbsenceLogicKeys(row);
  const duplicate = rows.find(item =>
    String(item.id) !== String(excludeId ?? '') &&
    normalizeText(item.ausente) === targetKeys.ausente_key
  );
  if (duplicate) {
    throw conflict('Ya existe una ausencia registrada para ese profesor en ese tramo.');
  }
  return targetKeys;
}

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
    const { ausente_key, guardia_key } = await ensureNoDuplicateAbsence(db, { dia, hora, ausente, guardia });
    const result = await db.run(
      `INSERT INTO ausencias (dia, hora, ausente, guardia, aula, faena, obs)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [dia, hora, ausente, guardia, aula, faena ? 1 : 0, obs]
    );
    const row = await db.get('SELECT * FROM ausencias WHERE id = ?', [result.lastID]);
    res.status(201).json({ ...row, ausente_key, guardia_key });
  } catch (error) {
    next(error);
  }
});

router.put('/replace', requireRole('admin'), async (req, res, next) => {
  try {
    const rows = ensureArray(req.body, 'Las ausencias').map(sanitizeAusencia);
    const duplicateKeys = new Set();
    rows.forEach(row => {
      const key = `${row.dia}|${row.hora}|${normalizeText(row.ausente)}`;
      if (duplicateKeys.has(key)) {
        throw conflict('La lista incluye ausencias duplicadas del mismo profesor en el mismo tramo.');
      }
      duplicateKeys.add(key);
    });
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
    const { ausente_key, guardia_key } = await ensureNoDuplicateAbsence(db, { dia, hora, ausente, guardia }, id);
    const result = await db.run(
      `UPDATE ausencias
       SET dia = ?, hora = ?, ausente = ?, guardia = ?, aula = ?, faena = ?, obs = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [dia, hora, ausente, guardia, aula, faena ? 1 : 0, obs, id]
    );
    if (!result.changes) {
      throw notFound('No existe una ausencia con ese id.');
    }
    const row = await db.get('SELECT * FROM ausencias WHERE id = ?', [id]);
    res.json({ ...row, ausente_key, guardia_key });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const db = await getDatabase();
    const result = await db.run('DELETE FROM ausencias WHERE id = ?', [req.params.id]);
    if (!result.changes) {
      throw notFound('No existe una ausencia con ese id.');
    }
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

module.exports = router;
