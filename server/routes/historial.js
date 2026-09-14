const express = require('express');
const { getDatabase, withImmediateTransaction } = require('../db');
const { requireRole } = require('../session');
const { listHistorial } = require('./historial/store');
const { appendOperationalHistory } = require('../operational-history');
const { appendAuditEvent } = require('../audit');
const { requireSameOriginWrite } = require('./profesorado/shared');

const router = express.Router();

router.get('/', requireRole('admin'), async (_req, res, next) => {
  try {
    res.json(await listHistorial(await getDatabase()));
  } catch (error) { next(error); }
});

router.post('/', requireRole('admin'), async (_req, _res, next) => {
  const error = new Error('El historial operativo se genera en el servidor.');
  error.status = 410;
  next(error);
});

router.put('/replace', requireRole('admin'), async (_req, _res, next) => {
  const error = new Error('El reemplazo destructivo del historial está retirado.');
  error.status = 410;
  next(error);
});

router.post('/archive', requireRole('admin'), requireSameOriginWrite, async (req, res, next) => {
  try {
    const db = await getDatabase();
    const result = await withImmediateTransaction(db, async () => {
      const archived = await db.run(
        `UPDATE historial SET archived_at = CURRENT_TIMESTAMP, archived_by_user_id = ?
         WHERE archived_at IS NULL`, [req.sessionUser.userId]
      );
      await appendOperationalHistory(db, {
        actorUserId: req.sessionUser.userId,
        action: 'history.archived', title: 'Vista del historial archivada', type: 'history',
        targetType: 'operational_history', targetId: 'visible',
        after: { archivedEntries: Number(archived.changes || 0) }
      });
      await appendAuditEvent(db, {
        actorUserId: req.sessionUser.userId,
        action: 'history.archived', targetType: 'operational_history', targetId: 'visible',
        details: { archivedEntries: Number(archived.changes || 0) }
      });
      return { ok: true, archived: Number(archived.changes || 0) };
    }, { label: 'history:archive' });
    res.json(result);
  } catch (error) { next(error); }
});

module.exports = router;
