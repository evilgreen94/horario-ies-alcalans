const express = require('express');
const { getDatabase } = require('../db');
const { ensureArray, sanitizeHistorial } = require('./validation');
const { requireRole } = require('../session');
const { listHistorial, replaceHistorial, saveHistorialEntry } = require('./historial/store');

const router = express.Router();

router.get('/', async (_req, res, next) => {
  try {
    const db = await getDatabase();
    res.json(await listHistorial(db));
  } catch (error) {
    next(error);
  }
});

router.post('/', requireRole('admin'), async (req, res, next) => {
  try {
    const row = sanitizeHistorial(req.body);
    const db = await getDatabase();
    await saveHistorialEntry(db, row);
    res.status(201).json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.put('/replace', requireRole('admin'), async (req, res, next) => {
  try {
    const rows = ensureArray(req.body, 'El historial').map(sanitizeHistorial);
    const db = await getDatabase();
    res.json(await replaceHistorial(db, rows));
  } catch (error) {
    next(error);
  }
});

module.exports = router;
