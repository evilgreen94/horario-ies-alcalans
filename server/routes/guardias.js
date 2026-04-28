const express = require('express');
const { formatDateKey, getCurrentSchoolWeekKey, getDatabase, getMadridNow } = require('../db');
const { ensureArray, normalizeText, sanitizeAusencia } = require('./validation');
const { requireRole } = require('../session');

const router = express.Router();
const MONTHLY_GUARDIA_LOAD_STATE_KEY = 'guardia_monthly_load';

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

function getCurrentMonthKey() {
  return formatDateKey(getMadridNow()).slice(0, 7);
}

function getWeekDateKey(weekKey, dayIndex) {
  const monday = new Date(`${weekKey}T00:00:00`);
  if (Number.isNaN(monday.getTime()) || !Number.isInteger(dayIndex)) return '';
  monday.setDate(monday.getDate() + Number(dayIndex));
  return formatDateKey(monday);
}

function normalizeMonthlyGuardiaLoadState(raw) {
  const fallback = { monthKey: getCurrentMonthKey(), byDate: {} };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fallback;
  const monthKey = /^\d{4}-\d{2}$/.test(String(raw.monthKey || '').trim()) ? String(raw.monthKey).trim() : fallback.monthKey;
  const sourceByDate = raw.byDate && typeof raw.byDate === 'object' && !Array.isArray(raw.byDate) ? raw.byDate : {};
  const byDate = {};
  Object.entries(sourceByDate).forEach(([dateKey, value]) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || ''))) return;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return;
    const normalizedDay = {};
    Object.entries(value).forEach(([teacher, count]) => {
      const teacherName = String(teacher || '').trim();
      const numericCount = Number(count);
      if (!teacherName || !Number.isFinite(numericCount) || numericCount <= 0) return;
      normalizedDay[teacherName] = Math.max(0, Math.round(numericCount));
    });
    if (Object.keys(normalizedDay).length) byDate[dateKey] = normalizedDay;
  });
  return { monthKey, byDate };
}

function buildMonthlyGuardiaLoadResponse(state) {
  const counts = {};
  Object.values(state.byDate || {}).forEach(dayCounts => {
    Object.entries(dayCounts || {}).forEach(([teacher, count]) => {
      counts[teacher] = (counts[teacher] || 0) + (Number(count) || 0);
    });
  });
  return {
    monthKey: state.monthKey,
    byDate: state.byDate,
    counts
  };
}

async function loadMonthlyGuardiaLoadState(db) {
  const row = await db.get('SELECT value FROM app_state WHERE key = ?', [MONTHLY_GUARDIA_LOAD_STATE_KEY]);
  if (!row?.value) return normalizeMonthlyGuardiaLoadState(null);
  try {
    return normalizeMonthlyGuardiaLoadState(JSON.parse(row.value));
  } catch (_error) {
    return normalizeMonthlyGuardiaLoadState(null);
  }
}

async function saveMonthlyGuardiaLoadState(db, state) {
  await db.run(
    `INSERT INTO app_state (key, value, updated_at)
     VALUES (?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
    [MONTHLY_GUARDIA_LOAD_STATE_KEY, JSON.stringify(normalizeMonthlyGuardiaLoadState(state))]
  );
}

async function ensureMonthlyGuardiaLoadState(db) {
  const currentMonthKey = getCurrentMonthKey();
  const state = await loadMonthlyGuardiaLoadState(db);
  if (state.monthKey === currentMonthKey) return state;
  const resetState = { monthKey: currentMonthKey, byDate: {} };
  await saveMonthlyGuardiaLoadState(db, resetState);
  return resetState;
}

async function rebuildMonthlyGuardiaLoadForCurrentWeek(db) {
  const state = await ensureMonthlyGuardiaLoadState(db);
  const currentWeekKey = getCurrentSchoolWeekKey();
  const weekDates = new Set([0, 1, 2, 3, 4].map(dayIndex => getWeekDateKey(currentWeekKey, dayIndex)).filter(Boolean));
  const nextByDate = Object.fromEntries(
    Object.entries(state.byDate || {}).filter(([dateKey]) => !weekDates.has(dateKey))
  );
  const rows = await db.all('SELECT dia, guardia FROM ausencias ORDER BY dia, hora, id');
  rows.forEach(row => {
    const teacher = String(row?.guardia || '').trim();
    if (!teacher) return;
    const dateKey = getWeekDateKey(currentWeekKey, Number(row.dia));
    if (!dateKey || !dateKey.startsWith(`${state.monthKey}-`)) return;
    if (!nextByDate[dateKey]) nextByDate[dateKey] = {};
    nextByDate[dateKey][teacher] = (nextByDate[dateKey][teacher] || 0) + 1;
  });
  const nextState = { monthKey: state.monthKey, byDate: nextByDate };
  await saveMonthlyGuardiaLoadState(db, nextState);
  return buildMonthlyGuardiaLoadResponse(nextState);
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

router.get('/monthly-load', async (_req, res, next) => {
  try {
    const db = await getDatabase();
    const state = await ensureMonthlyGuardiaLoadState(db);
    res.json(buildMonthlyGuardiaLoadResponse(state));
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
    await rebuildMonthlyGuardiaLoadForCurrentWeek(db);
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
    await rebuildMonthlyGuardiaLoadForCurrentWeek(db);
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
    await rebuildMonthlyGuardiaLoadForCurrentWeek(db);
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
    await rebuildMonthlyGuardiaLoadForCurrentWeek(db);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

module.exports = router;
