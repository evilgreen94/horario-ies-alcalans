const { formatDateKey, getCurrentSchoolWeekKey } = require('./db');
const { loadCanonicalDataset } = require('./schedule-model');
const { buildEffectiveGuardiaDayState } = require('./guardia-slot-state');
const { ensureCoverageAssignmentsAllowed } = require('./coverage-assignment');
const { rebuildMonthlyGuardiaLoadForCurrentWeek } = require('./routes/guardias/monthly-load');

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function getCurrentWeekDateKey(dia) {
  const safeDia = Number(dia);

  if (
    !Number.isInteger(safeDia) ||
    safeDia < 0 ||
    safeDia > 4
  ) {
    throw new Error('dia debe estar entre 0 y 4.');
  }

  const weekKey = getCurrentSchoolWeekKey();
  const monday = new Date(`${weekKey}T00:00:00`);

  if (Number.isNaN(monday.getTime())) {
    throw new Error('No se puede resolver la semana escolar actual.');
  }

  monday.setDate(monday.getDate() + safeDia);
  return formatDateKey(monday);
}

function buildCanonicalTeacherResolver(canonical) {
  const bySourceCode = new Map();
  const byDisplayName = new Map();

  for (const teacher of canonical?.teachers || []) {
    if (teacher?.active === false) continue;

    const sourceCode = normalizeText(teacher?.sourceCode);
    const displayName = normalizeText(teacher?.displayName);

    if (sourceCode) {
      if (!bySourceCode.has(sourceCode)) {
        bySourceCode.set(sourceCode, []);
      }
      bySourceCode.get(sourceCode).push(teacher);
    }

    if (displayName) {
      if (!byDisplayName.has(displayName)) {
        byDisplayName.set(displayName, []);
      }
      byDisplayName.get(displayName).push(teacher);
    }
  }

  return candidate => {
    const sourceCode = normalizeText(candidate?.sourceCode);

    if (sourceCode) {
      const matches = bySourceCode.get(sourceCode) || [];
      if (matches.length === 1) {
        return String(matches[0].displayName || '').trim();
      }
    }

    const visibleName = normalizeText(candidate?.teacher);

    if (visibleName) {
      const matches = byDisplayName.get(visibleName) || [];
      if (matches.length === 1) {
        return String(matches[0].displayName || '').trim();
      }
    }

    return '';
  };
}

function planCoverageMaterialization(dayState, canonical, options = {}) {
  const allowedHours = new Set(
    (Array.isArray(options.hours) ? options.hours : [])
      .map(Number)
      .filter(Number.isInteger)
  );

  const resolveScheduleName = buildCanonicalTeacherResolver(canonical);
  const updates = [];

  for (const slot of dayState?.slots || []) {
    const hora = Number(slot?.hora);

    if (
      allowedHours.size &&
      !allowedHours.has(hora)
    ) {
      continue;
    }

    const pendingCoverage = (slot?.coverage || [])
      .filter(row => row?.status !== 'covered');

    const reservedCandidates = (slot?.unassignedGuards || [])
      .filter(row => row?.reason === 'cobertura-pendiente');

    const count = Math.min(
      pendingCoverage.length,
      reservedCandidates.length
    );

    for (let index = 0; index < count; index += 1) {
      const coverage = pendingCoverage[index];
      const candidate = reservedCandidates[index];

      const id = Number(coverage?.id);
      const guardia = resolveScheduleName(candidate);

      if (
        !Number.isSafeInteger(id) ||
        id <= 0 ||
        !guardia
      ) {
        continue;
      }

      updates.push({
        id,
        dia: Number(slot.dia),
        hora,
        guardia,
        sourceCode: String(candidate?.sourceCode || '').trim()
      });
    }
  }

  return updates;
}

async function materializeCoverageAssignments(db, options = {}) {
  const dia = Number(options.dia);

  if (
    !Number.isInteger(dia) ||
    dia < 0 ||
    dia > 4
  ) {
    throw new Error('dia debe estar entre 0 y 4.');
  }

  const targetHours = [...new Set(
    (Array.isArray(options.hours) ? options.hours : [])
      .map(Number)
      .filter(Number.isInteger)
  )].sort((a, b) => a - b);

  if (!targetHours.length) return [];

  const date = getCurrentWeekDateKey(dia);
  const canonical = await loadCanonicalDataset(db);
  const changes = [];

  /*
   * Se procesa tramo a tramo deliberadamente.
   *
   * Después de materializar una cobertura se reconstruye la carga
   * mensual antes de calcular el siguiente tramo. De esta forma,
   * una ausencia de día completo reparte usando la carga actualizada
   * y no el snapshot existente antes de comenzar el comando.
   */
  for (const hora of targetHours) {
    const dayState = await buildEffectiveGuardiaDayState(
      db,
      { date }
    );

    const planned = planCoverageMaterialization(
      dayState,
      canonical,
      { hours: [hora] }
    );

    if (!planned.length) continue;

    for (const update of planned) {
      const before = await db.get(
        'SELECT * FROM ausencias WHERE id = ?',
        [update.id]
      );

      if (!before) continue;

      if (
        normalizeText(before.guardia) ===
        normalizeText(update.guardia)
      ) {
        continue;
      }

      await db.run(
        `UPDATE ausencias
         SET guardia = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [update.guardia, update.id]
      );

      const after = await db.get(
        'SELECT * FROM ausencias WHERE id = ?',
        [update.id]
      );

      changes.push({
        before,
        after
      });
    }

    if (!planned.length) continue;

    const slotRows = await db.all(
      `SELECT *
       FROM ausencias
       WHERE dia = ? AND hora = ?
       ORDER BY id`,
      [dia, hora]
    );

    await ensureCoverageAssignmentsAllowed(
      db,
      slotRows
    );

    await rebuildMonthlyGuardiaLoadForCurrentWeek(db);
  }

  return changes;
}

module.exports = {
  getCurrentWeekDateKey,
  materializeCoverageAssignments,
  planCoverageMaterialization
};
