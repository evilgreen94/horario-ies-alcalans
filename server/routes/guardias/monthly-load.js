const { formatDateKey, getCurrentSchoolWeekKey, getMadridNow } = require('../../db');

const MONTHLY_GUARDIA_LOAD_STATE_KEY = 'guardia_monthly_load';

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

module.exports = {
  buildMonthlyGuardiaLoadResponse,
  ensureMonthlyGuardiaLoadState,
  rebuildMonthlyGuardiaLoadForCurrentWeek
};
