const MONTH_KEY_PATTERN = /^\d{4}-\d{2}$/;

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function addCount(map, profileId, delta = 1) {
  const id = Number(profileId);
  if (!Number.isSafeInteger(id) || id <= 0) return;
  const next = Math.max(0, (map.get(id) || 0) + Number(delta || 0));
  if (next) map.set(id, next);
  else map.delete(id);
}

function buildCandidateResolver(candidates) {
  const aliases = new Map();

  (Array.isArray(candidates) ? candidates : []).forEach(candidate => {
    const profileId = Number(candidate?.profileId);
    if (!Number.isSafeInteger(profileId) || profileId <= 0) return;

    [
      candidate.displayName,
      candidate.scheduleName,
      candidate.sourceCode
    ].forEach(value => {
      const key = normalizeText(value);
      if (key && !aliases.has(key)) aliases.set(key, profileId);
    });
  });

  return value => aliases.get(normalizeText(value)) || null;
}

function rankGuardiaCandidates(candidates, context = {}) {
  const rows = Array.isArray(context.absenceRows) ? context.absenceRows : [];
  const dia = Number(context.dia);
  const hora = Number(context.hora);
  const date = String(context.date || '').trim();
  const monthKey = date.slice(0, 7);

  const ranked = (Array.isArray(candidates) ? candidates : [])
    .map(candidate => ({ ...candidate }));

  const resolveProfileId = buildCandidateResolver(ranked);

  const monthCounts = new Map();
  const weekCounts = new Map();
  const dayCounts = new Map();

  const monthly = context.monthlyLoadState;

  if (
    monthly &&
    MONTH_KEY_PATTERN.test(String(monthly.monthKey || '')) &&
    String(monthly.monthKey) === monthKey
  ) {
    Object.values(monthly.byDate || {}).forEach(dayState => {
      Object.entries(dayState || {}).forEach(([teacher, count]) => {
        const profileId = resolveProfileId(teacher);
        if (!profileId) return;
        addCount(monthCounts, profileId, Number(count) || 0);
      });
    });

    // El estado mensual ya incluye el tramo actual después de una escritura.
    // Lo retiramos para reproducir la semántica histórica:
    // el propio tramo no debe influir en su siguiente decisión.
    rows
      .filter(row =>
        Number(row?.dia) === dia &&
        Number(row?.hora) === hora
      )
      .forEach(row => {
        const profileId = resolveProfileId(row?.guardia);
        if (profileId) addCount(monthCounts, profileId, -1);
      });
  }

  rows.forEach(row => {
    if (
      Number(row?.dia) === dia &&
      Number(row?.hora) === hora
    ) {
      return;
    }

    const profileId = resolveProfileId(row?.guardia);
    if (!profileId) return;

    addCount(weekCounts, profileId, 1);

    if (Number(row?.dia) === dia) {
      addCount(dayCounts, profileId, 1);
    }
  });

  return ranked.sort((left, right) => {
    const leftId = Number(left.profileId);
    const rightId = Number(right.profileId);

    return (
      (monthCounts.get(leftId) || 0) -
        (monthCounts.get(rightId) || 0) ||

      (weekCounts.get(leftId) || 0) -
        (weekCounts.get(rightId) || 0) ||

      (dayCounts.get(leftId) || 0) -
        (dayCounts.get(rightId) || 0) ||

      String(left.displayName || '').localeCompare(
        String(right.displayName || ''),
        'es'
      ) ||

      leftId - rightId
    );
  });
}

module.exports = {
  rankGuardiaCandidates
};
