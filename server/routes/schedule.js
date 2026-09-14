const express = require('express');
const { getDatabase, getMadridNow, withImmediateTransaction } = require('../db');
const { requireAuthenticated, requireRole } = require('../session');
const { resolveActiveTeacherProfile, normalizeDateKey } = require('../teacher-identity');
const {
  activateScheduleDataset,
  buildLegacySchedulePayload,
  loadCanonicalDataset
} = require('../schedule-model');
const { resolveScheduleState } = require('../session-semantics');
const { getScheduleSubstitutionContext } = require('../substitution-service');
const { appendAuditEvent } = require('../audit');

const router = express.Router();

function formatDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function currentTimeKey(date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

router.get('/active', async (_req, res, next) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    res.json(await loadCanonicalDataset(await getDatabase()));
  } catch (error) {
    next(error);
  }
});

router.get('/legacy.js', async (_req, res) => {
  res.type('application/javascript').setHeader('Cache-Control', 'no-store');
  try {
    const payload = buildLegacySchedulePayload(await loadCanonicalDataset(await getDatabase()));
    res.send(`window.PROFESORADO_SOURCE=${JSON.stringify(payload)};window.PROFESORADO_SOURCE_ERROR='';`);
  } catch (error) {
    const message = error?.code === 'SCHEDULE_DATASET_UNAVAILABLE'
      ? error.message
      : 'No se pudo cargar el dataset horario activo.';
    res.setHeader('X-Schedule-Status', 'unavailable');
    res.send(`window.PROFESORADO_SOURCE=null;window.PROFESORADO_SOURCE_ERROR=${JSON.stringify(message)};`);
  }
});

router.get('/me', requireAuthenticated, async (req, res, next) => {
  try {
    if (!req.sessionUser.userId) {
      return res.status(403).json({ error: 'La vista docente requiere una cuenta individual.' });
    }
    const now = getMadridNow();
    if (req.query.date !== undefined && typeof req.query.date !== 'string') {
      return res.status(400).json({ error: 'date must be a single YYYY-MM-DD value.' });
    }
    const dateKey = req.query.date !== undefined ? normalizeDateKey(req.query.date) : formatDateKey(now);
    const db = await getDatabase();
    const identity = await resolveActiveTeacherProfile(db, req.sessionUser.userId, dateKey);
    if (!identity) return res.status(404).json({ error: 'No hay un perfil docente activo asignado para esa fecha.' });

    const canonical = await loadCanonicalDataset(db);
    const teacher = canonical.teachers.find(item => item.profileId === identity.teacherProfile.id);
    if (!teacher) return res.status(409).json({ error: 'El perfil asignado no pertenece al dataset horario activo.' });
    const selected = new Date(`${dateKey}T12:00:00`);
    const weekday = selected.getDay() - 1;
    const sessions = new Map(teacher.sessions
      .filter(session => session.weekday === weekday)
      .map(session => [session.periodKey, session]));
    const isToday = dateKey === formatDateKey(now);
    const time = currentTimeKey(now);
    const periods = canonical.periods.map(period => {
      const session = sessions.get(period.key) || null;
      const state = resolveScheduleState(period, session);
      return { ...period, state, session };
    });
    const currentPeriod = isToday
      ? periods.find(period => time >= period.startsAt && time < period.endsAt) || null
      : null;
    res.setHeader('Cache-Control', 'no-store');
    const substitution = await getScheduleSubstitutionContext(db, identity, dateKey);
    return res.json({
      dataset: { id: canonical.datasetId, academicYear: canonical.academicYear, label: canonical.label },
      date: dateKey,
      weekday,
      teacher: {
        user: {
          id: req.sessionUser.userId,
          username: req.sessionUser.username,
          displayName: req.sessionUser.displayName
        },
        profileId: teacher.profileId,
        sourceCode: teacher.sourceCode,
        displayName: teacher.displayName,
        assignment: identity.assignment,
        substitution
      },
      currentPeriod,
      currentState: currentPeriod?.state || 'outside',
      periods
    });
  } catch (error) {
    next(error);
  }
});

router.post('/datasets/:id/activate', requireRole('superadmin'), async (req, res, next) => {
  const db = await getDatabase();
  try {
    const result = await withImmediateTransaction(db, async () => {
      const activated = await activateScheduleDataset(db, req.params.id);
      await appendAuditEvent(db, {
        actorUserId: req.sessionUser.userId,
        action: 'schedule.dataset_activated', targetType: 'schedule_dataset',
        targetId: String(req.params.id), details: { warnings: activated.warnings || [] }
      });
      return activated;
    }, { label: `schedule:http-activate:${req.params.id}` });
    res.json(result);
  } catch (error) {
    try {
      await withImmediateTransaction(db, () => appendAuditEvent(db, {
        actorUserId: req.sessionUser.userId,
        action: 'schedule.dataset_activation_rejected', targetType: 'schedule_dataset',
        targetId: String(req.params.id), outcome: 'failure', details: { reasonCode: error.code || 'VALIDATION_FAILED' }
      }), { label: `schedule:http-rejected:${req.params.id}` });
    } catch (_auditError) {}
    next(error);
  }
});

module.exports = router;
