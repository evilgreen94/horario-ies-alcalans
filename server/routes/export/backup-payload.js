const {
  ensureArray,
  ensureOptionalId,
  ensureRequiredString,
  ensureTimestamp,
  normalizeBoolean,
  normalizeInteger,
  normalizeString,
  sanitizeBiblioteca,
  sanitizeSessionOverride,
  sanitizeTeacherFutureAbsence,
  sanitizeTeacherPracticeGuardia,
  sanitizeTeacherPracticeGuardiaSlot,
  sanitizeTeacherSubstitution,
  sanitizeTareaProfesorado
} = require('../validation');

const SUBSTITUTIONS_STATE_KEY = 'teacher_substitutions';
const FUTURE_ABSENCES_STATE_KEY = 'teacher_future_absences';
const WEEK_STATE_KEY = 'school_week_key';
const PRACTICAS_GUARDIAS_STATE_KEY = 'teacher_practicas_guardias';
const PRACTICAS_GUARDIAS_TRAMOS_STATE_KEY = 'teacher_practicas_guardias_tramos';
const MONTHLY_GUARDIA_LOAD_STATE_KEY = 'guardia_monthly_load';

function badRequest(message, details) {
  const error = new Error(message);
  error.status = 400;
  if (details) error.details = details;
  throw error;
}

function ensureObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    badRequest(`${label} invalido.`);
  }
  return value;
}

function ensureBackupSection(payload, key, label) {
  if (!Object.prototype.hasOwnProperty.call(payload, key)) {
    badRequest(`El backup no incluye la seccion obligatoria "${key}".`);
  }
  return ensureArray(payload[key], label);
}

function ensureOptionalBackupSection(payload, key, label, sanitizer) {
  if (!Object.prototype.hasOwnProperty.call(payload, key)) {
    return [];
  }
  return ensureArray(payload[key], label).map(sanitizer);
}

function sanitizeRestoreAusencia(row) {
  const input = ensureObject(row, 'Ausencia');
  return {
    id: ensureOptionalId(input.id, 'id'),
    dia: normalizeInteger(input.dia, 'dia', 0, 4),
    hora: normalizeInteger(input.hora, 'hora', 1, 9),
    ausente: ensureRequiredString(input.ausente, 'ausente'),
    guardia: normalizeString(input.guardia),
    aula: normalizeString(input.aula),
    faena: normalizeBoolean(input.faena),
    obs: normalizeString(input.obs),
    created_at: input.created_at ? ensureTimestamp(input.created_at, 'created_at') : new Date().toISOString(),
    updated_at: input.updated_at ? ensureTimestamp(input.updated_at, 'updated_at') : new Date().toISOString()
  };
}

function sanitizeRestoreHistorial(row) {
  const input = ensureObject(row, 'Entrada de historial');
  const undoState = input.undoState ?? null;
  if (undoState !== null && typeof undoState !== 'object') {
    badRequest('undoState debe ser un objeto o null.');
  }
  return {
    id: ensureRequiredString(input.id, 'id'),
    title: ensureRequiredString(input.title, 'title'),
    detail: normalizeString(input.detail),
    type: normalizeString(input.type, 'other') || 'other',
    actor: normalizeString(input.actor, 'Jefatura') || 'Jefatura',
    ts: ensureTimestamp(input.ts, 'ts'),
    undoState
  };
}

function sanitizeRestoreAlumnosFueraAula(row) {
  const input = ensureObject(row, 'Registro de alumnos fuera del aula');
  const updatedAt = input.updatedAt ?? input.updated_at;
  return {
    id: ensureOptionalId(input.id, 'id'),
    profesor: ensureRequiredString(input.profesor, 'profesor'),
    dia: normalizeInteger(input.dia, 'dia', 0, 4),
    hora: normalizeInteger(input.hora, 'hora', 1, 9),
    cantidad: normalizeInteger(input.cantidad, 'cantidad', 0, 10),
    lastExitAt: normalizeString(input.lastExitAt ?? input.last_exit_at),
    lastReturnAt: normalizeString(input.lastReturnAt ?? input.last_return_at),
    updatedAt: updatedAt ? ensureTimestamp(updatedAt, 'updatedAt') : new Date().toISOString()
  };
}

function sanitizeBackupPayload(payload) {
  const input = ensureObject(payload, 'Backup');
  if (input.exportedAt) {
    ensureTimestamp(input.exportedAt, 'exportedAt');
  }
  return {
    guardias: ensureBackupSection(input, 'guardias', 'guardias').map(sanitizeRestoreAusencia),
    biblioteca: ensureBackupSection(input, 'biblioteca', 'biblioteca').map(sanitizeBiblioteca),
    historial: ensureBackupSection(input, 'historial', 'historial').map(sanitizeRestoreHistorial),
    tareasProfesorado: ensureBackupSection(input, 'tareasProfesorado', 'tareasProfesorado').map(sanitizeTareaProfesorado),
    sessionOverrides: ensureBackupSection(input, 'sessionOverrides', 'sessionOverrides').map(sanitizeSessionOverride),
    substitutions: ensureBackupSection(input, 'substitutions', 'substitutions').map(sanitizeTeacherSubstitution),
    futureAbsences: ensureBackupSection(input, 'futureAbsences', 'futureAbsences').map(sanitizeTeacherFutureAbsence),
    alumnosFueraAula: ensureOptionalBackupSection(input, 'alumnosFueraAula', 'alumnosFueraAula', sanitizeRestoreAlumnosFueraAula),
    schoolWeekKey: normalizeString(input.schoolWeekKey),
    teacherSubstitutions: ensureOptionalBackupSection(input, 'teacherSubstitutions', 'teacherSubstitutions', sanitizeTeacherSubstitution),
    teacherPracticasGuardias: ensureOptionalBackupSection(input, 'teacherPracticasGuardias', 'teacherPracticasGuardias', sanitizeTeacherPracticeGuardia),
    teacherPracticasGuardiasTramos: ensureOptionalBackupSection(input, 'teacherPracticasGuardiasTramos', 'teacherPracticasGuardiasTramos', sanitizeTeacherPracticeGuardiaSlot),
    monthlyGuardiaLoad: input.monthlyGuardiaLoad && typeof input.monthlyGuardiaLoad === 'object' && !Array.isArray(input.monthlyGuardiaLoad)
      ? input.monthlyGuardiaLoad
      : null
  };
}

module.exports = {
  FUTURE_ABSENCES_STATE_KEY,
  MONTHLY_GUARDIA_LOAD_STATE_KEY,
  PRACTICAS_GUARDIAS_STATE_KEY,
  PRACTICAS_GUARDIAS_TRAMOS_STATE_KEY,
  SUBSTITUTIONS_STATE_KEY,
  WEEK_STATE_KEY,
  sanitizeBackupPayload
};
