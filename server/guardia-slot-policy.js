function normalizeText(value) {
  return String(value ?? '')
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function normalizeProfileId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function normalizeCandidate(row, index) {
  const profileId = normalizeProfileId(row?.profileId);
  if (!profileId) return null;

  return {
    profileId,
    displayName: String(row?.displayName || '').trim(),
    scheduleName: String(row?.scheduleName || row?.displayName || '').trim(),
    sourceCode: String(row?.sourceCode || '').trim(),
    order: Number.isFinite(Number(row?.order)) ? Number(row.order) : index
  };
}

function takePreferred(pool, preferredProfileIds) {
  if (!pool.length) return null;

  const preferredIds = (Array.isArray(preferredProfileIds)
    ? preferredProfileIds
    : [preferredProfileIds])
    .map(normalizeProfileId)
    .filter(Boolean);

  for (const preferredId of preferredIds) {
    const index = pool.findIndex(item => item.profileId === preferredId);
    if (index >= 0) {
      return pool.splice(index, 1)[0];
    }
  }

  return pool.shift() || null;
}

function deriveEffectiveGuardiaSlotState(input = {}) {
  const dia = Number(input.dia);
  const hora = Number(input.hora);
  const date = String(input.date || '').trim();

  const seenCandidates = new Set();
  const candidates = (Array.isArray(input.candidates) ? input.candidates : [])
    .map(normalizeCandidate)
    .filter(Boolean)
    .filter(candidate => {
      if (seenCandidates.has(candidate.profileId)) return false;
      seenCandidates.add(candidate.profileId);
      return true;
    })
    .sort((a, b) =>
      a.order - b.order ||
      a.displayName.localeCompare(b.displayName, 'es') ||
      a.profileId - b.profileId
    );

  const candidateById = new Map(
    candidates.map(candidate => [candidate.profileId, candidate])
  );

  const usedProfiles = new Set();

  const coverage = (Array.isArray(input.coverageRows) ? input.coverageRows : [])
    .map((row, index) => {
      const assignedProfileId = normalizeProfileId(row?.assignedProfileId);
      const candidate = assignedProfileId
        ? candidateById.get(assignedProfileId)
        : null;

      let status = 'uncovered';
      let reason = 'sin-asignacion-persistida';

      if (assignedProfileId && !candidate) {
        status = 'invalid';
        reason = 'docente-asignado-no-elegible';
      } else if (candidate && usedProfiles.has(candidate.profileId)) {
        status = 'invalid';
        reason = 'docente-duplicado-en-el-tramo';
      } else if (candidate) {
        status = 'covered';
        reason = 'asignacion-persistida-valida';
        usedProfiles.add(candidate.profileId);
      }

      return {
        id: row?.id ?? index,
        absentProfileId: normalizeProfileId(row?.absentProfileId),
        absentTeacher: String(row?.absentTeacher || '').trim(),
        subject: String(row?.subject || '').trim(),
        group: String(row?.group || '').trim(),
        room: String(row?.room || '').trim(),
        persistedTeacher: String(row?.persistedTeacher || '').trim(),
        assignedProfileId: candidate?.profileId || assignedProfileId || null,
        teacher: candidate?.displayName || '',
        status,
        reason
      };
    });

  const uncovered = coverage.filter(row => row.status !== 'covered');

  const remaining = candidates.filter(
    candidate => !usedProfiles.has(candidate.profileId)
  );

  // PRIORIDAD ABSOLUTA:
  // si existen clases sin cubrir, primero reservamos capacidad para ellas.
  // El read-model NO inventa una asignación de cobertura, pero tampoco
  // permite que esa capacidad aparezca como Biblioteca/Baños.
  const coverageReserveCount = Math.min(uncovered.length, remaining.length);
  const reservedForCoverage = remaining.splice(0, coverageReserveCount);

  const biblioteca = takePreferred(
    remaining,
    [
      input.plannedBibliotecaProfileId,
      input.plannedBanosProfileId
    ]
  );

  if (biblioteca) usedProfiles.add(biblioteca.profileId);

  const banos = takePreferred(
    remaining,
    [input.plannedBanosProfileId]
  );

  if (banos) usedProfiles.add(banos.profileId);

  const unassignedGuards = [
    ...reservedForCoverage.map(candidate => ({
      profileId: candidate.profileId,
      teacher: candidate.displayName,
      sourceCode: candidate.sourceCode,
      reason: 'cobertura-pendiente'
    })),
    ...remaining.map(candidate => ({
      profileId: candidate.profileId,
      teacher: candidate.displayName,
      sourceCode: candidate.sourceCode,
      reason: 'sin-asignacion'
    }))
  ];

  return {
    dia,
    hora,
    date,
    coverage,
    biblioteca: biblioteca
      ? {
          profileId: biblioteca.profileId,
          teacher: biblioteca.displayName,
          sourceCode: biblioteca.sourceCode
        }
      : null,
    banos: banos
      ? {
          profileId: banos.profileId,
          teacher: banos.displayName,
          sourceCode: banos.sourceCode
        }
      : null,
    unassignedGuards,
    diagnostics: {
      eligibleGuards: candidates.length,
      coverageRequired: coverage.length,
      coverageCovered: coverage.filter(row => row.status === 'covered').length,
      coverageUncovered: uncovered.length,
      reservedForCoverage: reservedForCoverage.length,
      coverageShortage: Math.max(0, uncovered.length - reservedForCoverage.length),
      assignmentGap: uncovered.length > 0 && reservedForCoverage.length > 0
    }
  };
}

module.exports = {
  deriveEffectiveGuardiaSlotState,
  normalizeText
};
