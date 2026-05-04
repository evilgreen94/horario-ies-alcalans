const express = require('express');
const { getDatabase } = require('../db');
const { requireRole } = require('../session');
const {
  TV_ANNOUNCEMENT_STATE_KEY,
  normalizeAnnouncementState,
  readAnnouncementState
} = require('./avisos/state');

const router = express.Router();

router.get('/tv', async (_req, res, next) => {
  try {
    const db = await getDatabase();
    res.json(await readAnnouncementState(db));
  } catch (error) {
    next(error);
  }
});

router.put('/tv', requireRole('admin'), async (req, res, next) => {
  try {
    const db = await getDatabase();
    const announcementState = normalizeAnnouncementState(req.body);
    await db.run(
      `INSERT INTO app_state (key, value, updated_at)
       VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
      [TV_ANNOUNCEMENT_STATE_KEY, JSON.stringify(announcementState)]
    );
    res.json(await readAnnouncementState(db));
  } catch (error) {
    next(error);
  }
});

module.exports = router;
