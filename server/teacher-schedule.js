const fs = require('fs');
const path = require('path');
const { getInactiveGroupSet, isGroupInactive, logInactiveGroupSkip } = require('./group-state');

const SOURCE_PATH = path.join(__dirname, '..', 'js', 'data', 'profesorado_horarios_guardias.js');
const DIA_INDEX = {
  lunes: 0,
  martes: 1,
  miercoles: 2,
  miércoles: 2,
  jueves: 3,
  viernes: 4
};
const HORA_INDEX = {
  '08:15-09:10': 1,
  '09:10-10:05': 2,
  '10:05-11:00': 3,
  '11:00-11:25': 4,
  '11:25-12:20': 5,
  '12:20-13:15': 6,
  '13:15-14:10': 7,
  '14:10-14:25': 8,
  '14:25-15:20': 9
};
const HORAS_NO_CUBRIBLES = new Set([4, 8, 9]);
const NON_COVERABLE_SESSION_TOKENS = [
  'reunion',
  'reunión',
  'atencion a familias',
  'atención a familias',
  'familias',
  'tutoria individualizada',
  'tutoría individualizada',
  'tutoria individual',
  'tutoría individual',
  'guardia de patio',
  'patio'
];

let cachedPayload = null;
let cachedMtimeMs = -1;

function esHoraValida(hora) {
  return Number.isInteger(Number(hora)) && Number(hora) >= 1 && Number(hora) <= 9;
}

function logInvalidAbsenceHour(details = {}) {
  try {
    console.warn(`[ausencias] skip hora inválida ${JSON.stringify(details)}`);
  } catch (_error) {
    console.warn('[ausencias] skip hora inválida');
  }
}

function cleanText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeText(value) {
  if (!value) return '';
  return String(value)
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function resolveDiaIndex(value) {
  return DIA_INDEX[normalizeText(value)] ?? null;
}

function isGuardiaTexto(texto) {
  return normalizeText(texto).includes('guardia');
}

function parseSession(entry) {
  const texto = cleanText(entry?.texto);
  const aula = cleanText(entry?.aula);
  const parts = texto.split('|').map(part => cleanText(part)).filter(Boolean);
  if (isGuardiaTexto(texto)) {
    return { tipo: 'guardia', materia: 'Guardia', detalle: 'Guardia', grupo: '', aula: aula || '' };
  }
  if (parts.length >= 3) {
    return { tipo: 'clase', materia: parts[0], grupo: parts[1], detalle: texto, aula: aula || parts[2] || '' };
  }
  if (parts.length === 2) {
    return { tipo: 'clase', materia: parts[0], grupo: '', detalle: texto, aula: aula || parts[1] || '' };
  }
  return { tipo: 'clase', materia: parts[0] || texto || 'Sesion', grupo: '', detalle: texto || 'Sesion', aula: aula || '' };
}

function isSessionCubrible(session, hora) {
  if (!session || !esHoraValida(hora) || HORAS_NO_CUBRIBLES.has(hora)) return false;
  if (session.tipo === 'guardia') return true;
  const combined = normalizeText([session.materia, session.grupo, session.detalle, session.aula].filter(Boolean).join(' '));
  if (!combined) return false;
  return !NON_COVERABLE_SESSION_TOKENS.some(token => combined.includes(normalizeText(token)));
}

function loadTeacherSource() {
  const stat = fs.statSync(SOURCE_PATH);
  if (cachedPayload && cachedMtimeMs === stat.mtimeMs) return cachedPayload;
  const raw = fs.readFileSync(SOURCE_PATH, 'utf8').trim();
  const prefix = 'window.PROFESORADO_SOURCE=';
  if (!raw.startsWith(prefix)) {
    throw new Error(`Formato no reconocido en ${SOURCE_PATH}`);
  }
  const payload = JSON.parse(raw.slice(prefix.length).replace(/;$/, ''));
  cachedPayload = payload;
  cachedMtimeMs = stat.mtimeMs;
  return payload;
}

function findTeacherEntry(nombre) {
  const normalized = normalizeText(nombre);
  if (!normalized) return null;
  const source = loadTeacherSource();
  return (source?.teachers || []).find(teacher => normalizeText(teacher?.nombre) === normalized) || null;
}

function buildTeacherScheduleByDay(teacherEntry) {
  const schedule = {};
  (teacherEntry?.horario || []).forEach(entry => {
    const dia = resolveDiaIndex(entry?.dia);
    const hora = HORA_INDEX[cleanText(entry?.franja)] ?? null;
    if (dia == null || hora == null || !esHoraValida(hora)) {
      logInvalidAbsenceHour({ profesor: cleanText(teacherEntry?.nombre), hora, franja: cleanText(entry?.franja), dia: cleanText(entry?.dia), origen: 'annual-source' });
      return;
    }
    if (!schedule[dia]) schedule[dia] = {};
    schedule[dia][hora] = parseSession(entry);
  });
  return schedule;
}

async function getSessionOverridesMap(db, profesor, dia) {
  const normalizedTeacher = normalizeText(profesor);
  const rows = await db.all('SELECT profesor, dia, hora, materia, grupo, detalle, aula FROM session_overrides WHERE dia = ?', [dia]);
  return Object.fromEntries(
    rows
      .filter(row => normalizeText(row?.profesor) === normalizedTeacher && Number(row?.dia) === Number(dia))
      .filter(row => {
        const hora = Number(row.hora);
        if (esHoraValida(hora)) return true;
        logInvalidAbsenceHour({ profesor: cleanText(row?.profesor), hora, dia: Number(row?.dia), origen: 'session-overrides' });
        return false;
      })
      .map(row => [Number(row.hora), row])
  );
}

async function getResolvedTeacherSessionsByDay(db, profesor, dia) {
  const teacherEntry = findTeacherEntry(profesor);
  if (!teacherEntry) return {};
  const schedule = buildTeacherScheduleByDay(teacherEntry);
  const overridesByHour = await getSessionOverridesMap(db, profesor, dia);
  return Object.fromEntries(
    Object.entries(schedule?.[dia] || {}).map(([horaKey, baseSession]) => {
      const hora = Number(horaKey);
      const override = overridesByHour[hora] || null;
      return [hora, override ? { ...baseSession, ...override } : baseSession];
    })
  );
}

async function getResolvedTeacherSession(db, profesor, dia, hora) {
  const sessionsByDay = await getResolvedTeacherSessionsByDay(db, profesor, dia);
  return sessionsByDay[Number(hora)] || null;
}

async function getSesionesCubriblesProfesor(db, profesor, dia) {
  const teacherEntry = findTeacherEntry(profesor);
  if (!teacherEntry) return [];
  const inactiveGroups = await getInactiveGroupSet(db);
  const sessionsByDay = await getResolvedTeacherSessionsByDay(db, profesor, dia);
  const sessions = Object.entries(sessionsByDay)
    .map(([horaKey, baseSession]) => {
      const hora = Number(horaKey);
      return {
        profesor: cleanText(teacherEntry.nombre),
        dia: Number(dia),
        hora,
        session: baseSession
      };
    })
    .filter(item => {
      if (!isGroupInactive(item.session?.grupo, inactiveGroups)) return true;
      logInactiveGroupSkip({
        grupo: cleanText(item.session?.grupo),
        profesor: item.profesor,
        dia: item.dia,
        hora: item.hora
      });
      return false;
    })
    .filter(item => isSessionCubrible(item.session, item.hora))
    .sort((a, b) => a.hora - b.hora);
  return sessions.map(item => ({
    profesor: item.profesor,
    dia: item.dia,
    hora: item.hora,
    tipo: item.session.tipo,
    materia: cleanText(item.session.materia),
    grupo: cleanText(item.session.grupo),
    detalle: cleanText(item.session.detalle),
    aula: cleanText(item.session.aula)
  }));
}

module.exports = {
  esHoraValida,
  getResolvedTeacherSession,
  getResolvedTeacherSessionsByDay,
  getSesionesCubriblesProfesor,
  isSessionCubrible,
  normalizeText
};
