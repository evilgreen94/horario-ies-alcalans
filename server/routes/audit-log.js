const express = require('express');
const { getDatabase } = require('../db');
const { requireRole } = require('../session');

const router = express.Router();
router.use(requireRole('superadmin'));

router.get('/', async (req, res, next) => {
  try {
    const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
    const rows = await (await getDatabase()).all(
      `SELECT id, actor_user_id, actor_username, actor_source_code, actor_roles_json,
              action, target_type, target_id, outcome, details_json, created_at
       FROM audit_log ORDER BY id DESC LIMIT ?`, [limit]
    );
    res.setHeader('Cache-Control', 'no-store');
    res.json({ events: rows.map(row => ({
      id: row.id,
      actor: {
        userId: row.actor_user_id || null,
        username: row.actor_username || '',
        sourceCode: row.actor_source_code || null,
        roles: JSON.parse(row.actor_roles_json || '[]')
      },
      action: row.action,
      target: { type: row.target_type, id: row.target_id },
      result: row.outcome,
      details: JSON.parse(row.details_json || '{}'),
      timestamp: row.created_at
    })) });
  } catch (error) { next(error); }
});

module.exports = router;
