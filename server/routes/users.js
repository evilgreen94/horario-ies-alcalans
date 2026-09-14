const express = require('express');
const { getDatabase, withImmediateTransaction } = require('../db');
const { generateTemporaryPassword, hashPassword } = require('../auth');
const { appendAuditEvent } = require('../audit');
const { requireRole } = require('../session');
const {
  buildProvisioningPreview,
  listProvisioningDatasets,
  provisionTeachers
} = require('../user-provisioning');
const { requireSameOriginWrite } = require('./profesorado/shared');

const router = express.Router();
const ALLOWED_ROLES = new Set(['teacher', 'admin', 'superadmin']);

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function positiveId(value) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw httpError(400, 'Identificador de usuario inválido.');
  return id;
}

function requireConfirmation(body) {
  if (body?.confirm !== true) throw httpError(400, 'La operación requiere confirmación explícita.');
}

function normalizeRoles(input) {
  if (!Array.isArray(input) || !input.length) throw httpError(400, 'Debe indicarse al menos un rol.');
  const roles = [...new Set(input.map(value => String(value || '').trim().toLowerCase()))];
  if (roles.some(role => !ALLOWED_ROLES.has(role))) throw httpError(400, 'La lista de roles no es válida.');
  return roles;
}

async function activeSuperadminCount(db) {
  const row = await db.get(
    `SELECT COUNT(DISTINCT u.id) AS total
     FROM users u
     JOIN user_roles ur ON ur.user_id = u.id
     JOIN roles r ON r.id = ur.role_id
     WHERE u.is_active = 1 AND r.key = 'superadmin'`
  );
  return Number(row?.total || 0);
}

async function getUser(db, id) {
  return db.get(
    `SELECT u.id, u.username, u.display_name, u.is_active, u.must_change_password,
            u.session_version, u.created_at, u.updated_at,
            GROUP_CONCAT(DISTINCT r.key) AS role_keys,
            GROUP_CONCAT(DISTINCT identity.external_key) AS source_codes
     FROM users u
     LEFT JOIN user_roles ur ON ur.user_id = u.id
     LEFT JOIN roles r ON r.id = ur.role_id
     LEFT JOIN teacher_assignments assignment ON assignment.user_id = u.id
     LEFT JOIN teacher_external_identities identity ON identity.teacher_profile_id = assignment.teacher_profile_id
     WHERE u.id = ? GROUP BY u.id`,
    [id]
  );
}

function publicUser(row) {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    active: !!row.is_active,
    mustChangePassword: !!row.must_change_password,
    roles: String(row.role_keys || '').split(',').filter(Boolean).sort(),
    sourceCodes: String(row.source_codes || '').split(',').filter(Boolean).sort(),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

router.use(requireRole('superadmin'));

router.get('/', async (req, res, next) => {
  try {
    const query = String(req.query.q || '').trim().slice(0, 128);
    const like = `%${query.replace(/[\\%_]/g, '\\$&')}%`;
    const db = await getDatabase();
    const rows = await db.all(
      `SELECT u.id, u.username, u.display_name, u.is_active, u.must_change_password,
              u.created_at, u.updated_at,
              GROUP_CONCAT(DISTINCT r.key) AS role_keys,
              GROUP_CONCAT(DISTINCT identity.external_key) AS source_codes
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r ON r.id = ur.role_id
       LEFT JOIN teacher_assignments assignment ON assignment.user_id = u.id
       LEFT JOIN teacher_external_identities identity ON identity.teacher_profile_id = assignment.teacher_profile_id
       WHERE (? = '' OR u.username LIKE ? ESCAPE '\\' OR u.display_name LIKE ? ESCAPE '\\')
       GROUP BY u.id
       ORDER BY u.display_name COLLATE NOCASE, u.username COLLATE NOCASE`,
      [query, like, like]
    );
    res.setHeader('Cache-Control', 'no-store');
    res.json({ users: rows.map(publicUser) });
  } catch (error) {
    next(error);
  }
});

router.get('/provisioning/datasets', async (_req, res, next) => {
  try {
    const datasets = await listProvisioningDatasets(await getDatabase());
    res.setHeader('Cache-Control', 'no-store');
    res.json({ datasets });
  } catch (error) { next(error); }
});

router.get('/provisioning/preview', async (req, res, next) => {
  try {
    const preview = await buildProvisioningPreview(await getDatabase(), req.query.datasetId);
    res.setHeader('Cache-Control', 'no-store');
    res.json(preview);
  } catch (error) { next(error); }
});

router.post('/provisioning', requireSameOriginWrite, async (req, res, next) => {
  try {
    requireConfirmation(req.body);
    const result = await provisionTeachers(await getDatabase(), {
      actorUserId: req.sessionUser.userId,
      datasetId: req.body?.datasetId
    });
    res.setHeader('Cache-Control', 'no-store');
    res.status(201).json(result);
  } catch (error) { next(error); }
});

router.get('/:id/audit', async (req, res, next) => {
  try {
    const id = positiveId(req.params.id);
    const rows = await (await getDatabase()).all(
      `SELECT id, actor_user_id, action, target_type, target_id, outcome, details_json, created_at
       FROM audit_log
       WHERE target_type = 'user' AND target_id = ?
       ORDER BY id DESC LIMIT 100`,
      [String(id)]
    );
    res.setHeader('Cache-Control', 'no-store');
    res.json({ events: rows.map(row => ({ ...row, details: JSON.parse(row.details_json || '{}'), details_json: undefined })) });
  } catch (error) {
    next(error);
  }
});

router.post('/', requireSameOriginWrite, async (req, res, next) => {
  try {
    const username = String(req.body?.username || '').trim();
    const displayName = String(req.body?.displayName || '').trim();
    const roles = normalizeRoles(req.body?.roles || ['teacher']);
    if (!/^[A-Za-z0-9._-]{3,64}$/.test(username)) throw httpError(400, 'Nombre de usuario inválido.');
    if (!displayName || displayName.length > 160) throw httpError(400, 'Nombre visible inválido.');
    const temporaryPassword = generateTemporaryPassword();
    const { salt, hash } = hashPassword(temporaryPassword);
    const db = await getDatabase();
    const user = await withImmediateTransaction(db, async () => {
      const inserted = await db.run(
        `INSERT INTO users
          (username, display_name, password_hash, password_salt, is_active, must_change_password)
         VALUES (?, ?, ?, ?, 1, 1)`,
        [username, displayName, hash, salt]
      );
      for (const role of roles) {
        await db.run(
          `INSERT INTO user_roles (user_id, role_id)
           SELECT ?, id FROM roles WHERE key = ?`,
          [inserted.lastID, role]
        );
      }
      await appendAuditEvent(db, {
        actorUserId: req.sessionUser.userId || null,
        action: 'security.user_created', targetType: 'user', targetId: String(inserted.lastID),
        details: { roles }
      });
      return getUser(db, inserted.lastID);
    }, { label: 'security:user-create' });
    res.status(201).json({ user: publicUser(user), temporaryPassword, shownOnce: true });
  } catch (error) {
    if (String(error.message).includes('UNIQUE constraint failed: users.username')) error = httpError(409, 'Ese usuario ya existe.');
    next(error);
  }
});

router.put('/:id/status', requireSameOriginWrite, async (req, res, next) => {
  try {
    requireConfirmation(req.body);
    const id = positiveId(req.params.id);
    const active = req.body?.active === true;
    if (!active && req.sessionUser.userId === id) throw httpError(409, 'No puedes desactivar tu propia cuenta.');
    const db = await getDatabase();
    const result = await withImmediateTransaction(db, async () => {
      const before = await getUser(db, id);
      if (!before) throw httpError(404, 'Usuario no encontrado.');
      const roles = publicUser(before).roles;
      if (!active && roles.includes('superadmin') && await activeSuperadminCount(db) <= 1) {
        throw httpError(409, 'No se puede desactivar el último Superadmin activo.');
      }
      await db.run(
        `UPDATE users SET is_active = ?, session_version = session_version + 1,
          updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [active ? 1 : 0, id]
      );
      await appendAuditEvent(db, {
        actorUserId: req.sessionUser.userId || null,
        action: active ? 'security.user_enabled' : 'security.user_disabled',
        targetType: 'user', targetId: String(id)
      });
      return getUser(db, id);
    }, { label: 'security:user-status' });
    res.json({ user: publicUser(result) });
  } catch (error) { next(error); }
});

router.put('/:id/roles', requireSameOriginWrite, async (req, res, next) => {
  try {
    requireConfirmation(req.body);
    const id = positiveId(req.params.id);
    const roles = normalizeRoles(req.body?.roles);
    const db = await getDatabase();
    const result = await withImmediateTransaction(db, async () => {
      const before = await getUser(db, id);
      if (!before) throw httpError(404, 'Usuario no encontrado.');
      const oldRoles = publicUser(before).roles;
      if (oldRoles.includes('teacher') && !roles.includes('teacher')) {
        const activeSubstitution = await db.get(
          `SELECT id FROM teacher_assignments
           WHERE user_id = ? AND assignment_type = 'sustituto'
             AND starts_on <= date('now') AND (ends_on IS NULL OR ends_on >= date('now'))
           LIMIT 1`, [id]
        );
        if (activeSubstitution) {
          const error = httpError(409, 'No se puede retirar teacher durante una sustitución activa.');
          error.code = 'ACTIVE_SUBSTITUTION_REQUIRES_TEACHER_ROLE';
          throw error;
        }
      }
      if (req.sessionUser.userId === id && oldRoles.includes('superadmin') && !roles.includes('superadmin')) {
        throw httpError(409, 'No puedes retirar tu propio rol Superadmin.');
      }
      if (oldRoles.includes('superadmin') && !roles.includes('superadmin') && before.is_active && await activeSuperadminCount(db) <= 1) {
        throw httpError(409, 'No se puede retirar el último rol Superadmin activo.');
      }
      await db.run('DELETE FROM user_roles WHERE user_id = ?', [id]);
      for (const role of roles) {
        await db.run(`INSERT INTO user_roles (user_id, role_id) SELECT ?, id FROM roles WHERE key = ?`, [id, role]);
      }
      await db.run('UPDATE users SET session_version = session_version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
      await appendAuditEvent(db, {
        actorUserId: req.sessionUser.userId || null,
        action: 'security.user_roles_changed', targetType: 'user', targetId: String(id),
        details: { previousRoles: oldRoles, roles }
      });
      return getUser(db, id);
    }, { label: 'security:user-roles' });
    res.json({ user: publicUser(result) });
  } catch (error) {
    try {
      const db = await getDatabase();
      await withImmediateTransaction(db, () => appendAuditEvent(db, {
        actorUserId: req.sessionUser.userId,
        action: 'security.user_roles_change_rejected', targetType: 'user',
        targetId: String(req.params.id || ''), outcome: 'failure',
        details: { reasonCode: error.code || 'ROLE_CHANGE_VALIDATION_FAILED' }
      }), { label: `security:user-roles-rejected:${req.params.id}` });
    } catch (_auditError) {}
    next(error);
  }
});

router.post('/:id/reset-password', requireSameOriginWrite, async (req, res, next) => {
  try {
    requireConfirmation(req.body);
    const id = positiveId(req.params.id);
    const temporaryPassword = generateTemporaryPassword();
    const { salt, hash } = hashPassword(temporaryPassword);
    const db = await getDatabase();
    await withImmediateTransaction(db, async () => {
      const user = await getUser(db, id);
      if (!user) throw httpError(404, 'Usuario no encontrado.');
      await db.run(
        `UPDATE users SET password_hash = ?, password_salt = ?, must_change_password = 1,
          session_version = session_version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [hash, salt, id]
      );
      await appendAuditEvent(db, {
        actorUserId: req.sessionUser.userId || null,
        action: 'security.password_reset', targetType: 'user', targetId: String(id)
      });
    }, { label: 'security:password-reset' });
    res.json({ temporaryPassword, shownOnce: true, mustChangePassword: true, sessionsRevoked: true });
  } catch (error) { next(error); }
});

router.post('/:id/revoke-sessions', requireSameOriginWrite, async (req, res, next) => {
  try {
    requireConfirmation(req.body);
    const id = positiveId(req.params.id);
    const db = await getDatabase();
    const changed = await db.run(
      'UPDATE users SET session_version = session_version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id]
    );
    if (!changed.changes) throw httpError(404, 'Usuario no encontrado.');
    await appendAuditEvent(db, {
      actorUserId: req.sessionUser.userId || null,
      action: 'security.sessions_revoked', targetType: 'user', targetId: String(id)
    });
    res.json({ ok: true });
  } catch (error) { next(error); }
});

module.exports = { router };
