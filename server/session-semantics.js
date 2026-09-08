const OCCUPIED_TYPES = new Set([
  'class',
  'guardia',
  'meeting',
  'other',
  'guardia_patio',
  'biblioteca_patio',
  'patio_inclusivo'
]);

const NO_AUTOMATIC_COVERAGE_TYPES = new Set([
  'guardia_patio',
  'biblioteca_patio',
  'patio_inclusivo'
]);

function describeSession(session) {
  if (!session) return null;
  const type = String(session.type || '').trim().toLowerCase();
  if (!OCCUPIED_TYPES.has(type)) throw new Error(`Unsupported canonical session type "${type}".`);
  return {
    type,
    occupied: true,
    guardDuty: type === 'guardia',
    recessDuty: type === 'guardia_patio' || type === 'biblioteca_patio',
    rotatable: type === 'guardia_patio',
    fixedPost: type === 'biblioteca_patio' ? 'Biblioteca' : null,
    automaticCoverageRequired: type === 'class' && !NO_AUTOMATIC_COVERAGE_TYPES.has(type)
  };
}

function resolveScheduleState(period, session) {
  if (!period) return 'outside';
  if (session) return session.type;
  return period.type === 'break' ? 'break' : 'free';
}

function absenceRequiresAutomaticCoverage(session) {
  return describeSession(session)?.automaticCoverageRequired === true;
}

module.exports = {
  NO_AUTOMATIC_COVERAGE_TYPES,
  OCCUPIED_TYPES,
  absenceRequiresAutomaticCoverage,
  describeSession,
  resolveScheduleState
};
