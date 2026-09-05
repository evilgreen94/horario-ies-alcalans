const express = require('express');
const { getDatabase, getMadridNow } = require('../db');
const { requireAuthenticated, requireRole } = require('../session');
const { resolveActiveTeacherProfile, normalizeDateKey } = require('../teacher-identity');
const {
  activateScheduleDataset,
  buildLegacySchedulePayload,
  loadCanonicalDataset
} = require('../schedule-model');

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
    const dateKey = req.query.date ? normalizeDateKey(req.query.date) : formatDateKey(now);
    const identity = await resolveActiveTeacherProfile(await getDatabase(), req.sessionUser.userId, dateKey);
    if (!identity) return res.status(404).json({ error: 'No hay un perfil docente activo asignado para esa fecha.' });

    const canonical = await loadCanonicalDataset(await getDatabase());
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
      const state = period.type === 'break' ? 'break' : session ? session.type : 'free';
      return { ...period, state, session };
    });
    const currentPeriod = isToday
      ? periods.find(period => time >= period.startsAt && time < period.endsAt) || null
      : null;
    res.setHeader('Cache-Control', 'no-store');
    return res.json({
      dataset: { id: canonical.datasetId, academicYear: canonical.academicYear, label: canonical.label },
      date: dateKey,
      weekday,
      teacher: {
        profileId: teacher.profileId,
        sourceCode: teacher.sourceCode,
        displayName: teacher.displayName,
        assignment: identity.assignment
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
  try {
    res.json(await activateScheduleDataset(await getDatabase(), req.params.id));
  } catch (error) {
    next(error);
  }
});

module.exports = router;
