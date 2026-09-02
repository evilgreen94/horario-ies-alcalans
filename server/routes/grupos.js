const express = require('express');

const { getDatabase } = require('../db');
const { requireRole } = require('../session');
const { ensureObject, normalizeBoolean } = require('./validation');
const { listGroupStates, updateGroupState } = require('../group-state');

const router = express.Router();

router.get('/', async (_req, res, next) => {
  try {
    const db = await getDatabase();
    res.json(await listGroupStates(db));
  } catch (error) {
    next(error);
  }
});

router.put('/:grupo/estado', requireRole('admin'), async (req, res, next) => {
  try {
    const body = ensureObject(req.body, 'Estado de grupo');
    const db = await getDatabase();
    const row = await updateGroupState(db, decodeURIComponent(req.params.grupo || ''), normalizeBoolean(body.activo));
    res.json({ ok: true, ...row });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
