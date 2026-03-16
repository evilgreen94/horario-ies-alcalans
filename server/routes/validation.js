function badRequest(message, details) {
  const error = new Error(message);
  error.status = 400;
  if (details) error.details = details;
  return error;
}

function ensureObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw badRequest(`${label} inv\u00e1lido.`);
  }
  return value;
}

function ensureArray(value, label) {
  if (!Array.isArray(value)) {
    throw badRequest(`${label} debe ser una lista.`);
  }
  return value;
}

function normalizeString(value, fallback = '') {
  return String(value ?? fallback).trim();
}

function normalizeBoolean(value) {
  return value === true || value === 1 || value === '1' || value === 'true';
}

function normalizeInteger(value, field, min, max) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < min || numeric > max) {
    throw badRequest(`${field} debe estar entre ${min} y ${max}.`);
  }
  return numeric;
}

function ensureRequiredString(value, field) {
  const normalized = normalizeString(value);
  if (!normalized) throw badRequest(`${field} es obligatorio.`);
  return normalized;
}

function ensureOptionalId(value, field) {
  if (value == null || value === '') return null;
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < 1) {
    throw badRequest(`${field} inv\u00e1lido.`);
  }
  return numeric;
}

function ensureTimestamp(value, field) {
  const normalized = normalizeString(value);
  if (!normalized) throw badRequest(`${field} es obligatorio.`);
  if (Number.isNaN(Date.parse(normalized))) {
    throw badRequest(`${field} no tiene una fecha v\u00e1lida.`);
  }
  return normalized;
}

function sanitizeAusencia(row) {
  const input = ensureObject(row, 'Ausencia');
  return {
    id: ensureOptionalId(input.id, 'id'),
    dia: normalizeInteger(input.dia, 'dia', 0, 4),
    hora: normalizeInteger(input.hora, 'hora', 1, 9),
    ausente: ensureRequiredString(input.ausente, 'ausente'),
    guardia: normalizeString(input.guardia),
    aula: normalizeString(input.aula),
    faena: normalizeBoolean(input.faena),
    obs: normalizeString(input.obs)
  };
}

function sanitizeBiblioteca(row) {
  const input = ensureObject(row, 'Guardia de biblioteca');
  return {
    dia: normalizeInteger(input.dia, 'dia', 0, 4),
    hora: normalizeInteger(input.hora, 'hora', 1, 9),
    profesor: ensureRequiredString(input.profesor, 'profesor')
  };
}

function sanitizeHistorial(row) {
  const input = ensureObject(row, 'Entrada de historial');
  return {
    id: ensureRequiredString(input.id, 'id'),
    title: ensureRequiredString(input.title, 'title'),
    detail: normalizeString(input.detail),
    type: normalizeString(input.type, 'other') || 'other',
    actor: normalizeString(input.actor, 'Jefatura') || 'Jefatura',
    ts: ensureTimestamp(input.ts, 'ts'),
    undoState: input.undoState ?? null
  };
}

function sanitizeTareaProfesorado(row) {
  const input = ensureObject(row, 'Tarea de profesorado');
  return {
    id: ensureRequiredString(input.id, 'id'),
    profesor: ensureRequiredString(input.profesor, 'profesor'),
    dia: normalizeInteger(input.dia, 'dia', 0, 4),
    hora: normalizeInteger(input.hora, 'hora', 1, 9),
    dejada: normalizeBoolean(input.dejada),
    tarea: normalizeString(input.tarea)
  };
}

function sanitizeSessionOverride(row) {
  const input = ensureObject(row, 'Override de sesi\u00f3n');
  return {
    id: ensureRequiredString(input.id, 'id'),
    profesor: ensureRequiredString(input.profesor, 'profesor'),
    dia: normalizeInteger(input.dia, 'dia', 0, 4),
    hora: normalizeInteger(input.hora, 'hora', 1, 9),
    materia: normalizeString(input.materia),
    grupo: normalizeString(input.grupo),
    detalle: normalizeString(input.detalle),
    aula: normalizeString(input.aula)
  };
}

function sanitizeTeacherSubstitution(row) {
  const input = ensureObject(row, 'Sustitucion de profesorado');
  return {
    profesor: ensureRequiredString(input.profesor, 'profesor'),
    sustituto: ensureRequiredString(input.sustituto, 'sustituto')
  };
}

module.exports = {
  ensureArray,
  ensureOptionalId,
  ensureRequiredString,
  ensureTimestamp,
  normalizeBoolean,
  normalizeInteger,
  normalizeString,
  sanitizeAusencia,
  sanitizeBiblioteca,
  sanitizeHistorial,
  sanitizeTeacherSubstitution,
  sanitizeTareaProfesorado,
  sanitizeSessionOverride
};
