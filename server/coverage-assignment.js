const { loadCanonicalDataset } = require('./schedule-model');
const { normalizeText } = require('./teacher-schedule');

function conflict(message) {
  return Object.assign(new Error(message), { status: 409 });
}

// Validate the proposed final state, while the caller holds the write transaction.
// In a batch replacement the old rows must not reserve teachers in the new batch.
async function ensureCoverageAssignmentsAllowed(db, rows) {
  const covered = rows.filter(row => normalizeText(row.guardia));
  if (!covered.length) return;
  const canonical = await loadCanonicalDataset(db);
  function teacherFor(value) {
    const key = normalizeText(value);
    const byCode = canonical.teachers.filter(t => normalizeText(t.sourceCode) === key);
    const matches = byCode.length ? byCode : canonical.teachers.filter(t => normalizeText(t.displayName) === key);
    return matches.length === 1 ? matches[0] : null;
  }
  function identity(value) {
    const teacher = teacherFor(value);
    return teacher ? `profile:${teacher.profileId}` : `name:${normalizeText(value)}`;
  }
  const assigned = new Set();
  for (const row of covered) {
    const period = canonical.periods.find(p => Number(p.position) === Number(row.hora));
    const absent = teacherFor(row.ausente);
    const absentSession = absent?.sessions.find(s => s.weekday === Number(row.dia) && s.periodKey === period?.key);
    if (absentSession && ['guardia_patio', 'biblioteca_patio', 'patio_inclusivo'].includes(absentSession.type)) {
      throw conflict('Esta obligación puede registrar ausencia, pero no admite cobertura automática.');
    }
    const teacher = teacherFor(row.guardia);
    if (!teacher?.active || !period || period.type !== 'teaching') {
      throw conflict('El docente de cobertura no tiene disponibilidad en ese tramo.');
    }
    const session = teacher.sessions.find(s => s.weekday === Number(row.dia) && s.periodKey === period.key);
    if (session?.type !== 'guardia') {
      throw conflict('El docente de cobertura ya tiene otra sesión o no tiene guardia en ese tramo.');
    }
    const isAbsent = rows.some(other => Number(other.dia) === Number(row.dia) && Number(other.hora) === Number(row.hora) && identity(other.ausente) === identity(row.guardia));
    if (isAbsent) throw conflict('El docente de cobertura está ausente en ese tramo.');
    const key = `${row.dia}|${row.hora}|${identity(row.guardia)}`;
    if (assigned.has(key)) throw conflict('El docente ya cubre otra ausencia en ese tramo.');
    assigned.add(key);
  }
}

module.exports = { ensureCoverageAssignmentsAllowed };
