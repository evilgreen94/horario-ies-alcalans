const express = require('express');
const { appendAuditEvent } = require('../audit');
const { getDatabase, withImmediateTransaction } = require('../db');
const { requireAuthenticated } = require('../session');
const { requireSameOriginWrite } = require('./profesorado/shared');
const {
  activateRequest,
  closePendingRequest,
  createRequest,
  finishRequest,
  linkExistingUser,
  listCandidateUsers,
  listEffectiveSubstitutions,
  listLegacyAliases,
  listRequests,
  listTitularAssignments,
  madridDateKey,
  markLegacyAliasObsolete,
  provisionRequestUser,
  reconcileLegacyAlias
} = require('../substitution-service');

const router = express.Router();

function requireCapabilities(roles, action) {
  const allowedRoles = new Set(roles);
  return async (req, res, next) => {
    if ((req.sessionUser.roles || []).some(role => allowedRoles.has(role))) return next();
    try {
      const db = await getDatabase();
      await withImmediateTransaction(db, () => appendAuditEvent(db, {
        actorUserId: req.sessionUser.userId,
        action: 'security.administrative_operation_rejected',
        targetType: 'capability', targetId: action, outcome: 'failure',
        details: { requiredRoles: roles }
      }), { label: `security:rejected:${action}` });
    } catch (_error) {
      // The authorization decision does not depend on audit availability.
    }
    return res.status(403).json({ error: 'Permisos insuficientes.' });
  };
}

const requireManagement = [requireAuthenticated, requireCapabilities(['admin', 'superadmin'], 'substitution.read')];
const requireAdmin = [requireAuthenticated, requireCapabilities(['admin'], 'substitution.operations')];
const requireSuperadmin = [requireAuthenticated, requireCapabilities(['superadmin'], 'substitution.identity')];

router.get('/effective', async (req, res, next) => {
  try {
    if (req.query.date !== undefined && typeof req.query.date !== 'string') {
      return res.status(400).json({ error: 'date must be a single YYYY-MM-DD value.' });
    }
    const date = req.query.date || madridDateKey();
    res.setHeader('Cache-Control', 'no-store');
    res.json({ date, substitutions: await listEffectiveSubstitutions(await getDatabase(), date) });
  } catch (error) { next(error); }
});

router.get('/', ...requireManagement, async (_req, res, next) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ requests: await listRequests(await getDatabase()) });
  } catch (error) { next(error); }
});

router.get('/titulars', ...requireManagement, async (_req, res, next) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ titulars: await listTitularAssignments(await getDatabase()) });
  } catch (error) { next(error); }
});

router.get('/candidates', ...requireManagement, async (req, res, next) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ users: await listCandidateUsers(await getDatabase(), req.query.q) });
  } catch (error) { next(error); }
});

router.post('/', ...requireAdmin, requireSameOriginWrite, async (req, res, next) => {
  try {
    const request = await createRequest(await getDatabase(), {
      ...req.body, actorUserId: req.sessionUser.userId
    });
    res.status(201).json({ request });
  } catch (error) { next(error); }
});

router.post('/:id/link', ...requireSuperadmin, requireSameOriginWrite, async (req, res, next) => {
  try {
    const request = await linkExistingUser(
      await getDatabase(), req.params.id, req.body?.userId, req.sessionUser.userId
    );
    res.json({ request });
  } catch (error) { next(error); }
});

router.post('/:id/provision', ...requireSuperadmin, requireSameOriginWrite, async (req, res, next) => {
  try {
    res.status(201).json(await provisionRequestUser(await getDatabase(), req.params.id, {
      ...req.body, actorUserId: req.sessionUser.userId
    }));
  } catch (error) { next(error); }
});

router.post('/:id/activate', ...requireSuperadmin, requireSameOriginWrite, async (req, res, next) => {
  try {
    const request = await activateRequest(await getDatabase(), req.params.id, req.sessionUser.userId);
    res.json({ request });
  } catch (error) { next(error); }
});

router.post('/:id/finish', ...requireAdmin, requireSameOriginWrite, async (req, res, next) => {
  try {
    const request = await finishRequest(await getDatabase(), req.params.id, {
      ...req.body, actorUserId: req.sessionUser.userId
    });
    res.json({ request });
  } catch (error) { next(error); }
});

router.post('/:id/cancel', ...requireAdmin, requireSameOriginWrite, async (req, res, next) => {
  try {
    const request = await closePendingRequest(await getDatabase(), req.params.id, {
      ...req.body, actorUserId: req.sessionUser.userId
    }, 'cancel');
    res.json({ request });
  } catch (error) { next(error); }
});

router.post('/:id/reject', ...requireSuperadmin, requireSameOriginWrite, async (req, res, next) => {
  try {
    const request = await closePendingRequest(await getDatabase(), req.params.id, {
      ...req.body, actorUserId: req.sessionUser.userId
    }, 'reject');
    res.json({ request });
  } catch (error) { next(error); }
});

router.get('/legacy', ...requireSuperadmin, async (_req, res, next) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ aliases: await listLegacyAliases(await getDatabase()) });
  } catch (error) { next(error); }
});

router.post('/legacy/:id/resolve', ...requireSuperadmin, requireSameOriginWrite, async (req, res, next) => {
  try {
    res.status(201).json(await reconcileLegacyAlias(await getDatabase(), req.params.id, {
      ...req.body, actorUserId: req.sessionUser.userId
    }));
  } catch (error) { next(error); }
});

router.post('/legacy/:id/obsolete', ...requireSuperadmin, requireSameOriginWrite, async (req, res, next) => {
  try {
    res.json(await markLegacyAliasObsolete(await getDatabase(), req.params.id, {
      ...req.body, actorUserId: req.sessionUser.userId
    }));
  } catch (error) { next(error); }
});

module.exports = router;
