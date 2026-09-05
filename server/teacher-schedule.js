const { getInactiveGroupSet, isGroupInactive, logInactiveGroupSkip } = require('./group-state');
const { loadCanonicalDataset } = require('./schedule-model');

function esHoraValida(hora) {
  return Number.isInteger(Number(hora)) && Number(hora) >= 0;
}

function cleanText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeText(value) {
  if (!value) return '';
  return String(value).toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
}

function findTeacher(canonical, identity) {
  const key = normalizeText(identity);
  if (!key) return null;
  return canonical.teachers.find(teacher =>
    normalizeText(teacher.displayName) === key || normalizeText(teacher.sourceCode) === key
  ) || null;
}

function canonicalSessionToLegacy(session) {
  const type = session.type === 'class' ? 'clase' : session.type;
  const detail = cleanText(session.label) || [session.subject, session.group, session.room].filter(Boolean).join(' | ');
  return {
    tipo: type,
    materia: cleanText(session.subject) || (session.type === 'guardia' ? 'Guardia' : cleanText(session.label)),
    grupo: cleanText(session.group),
    detalle: detail || session.type,
    aula: cleanText(session.room)
  };
}

function isSessionCubrible(session, _hora) {
  if (!session) return false;
  return session.tipo === 'guardia' || session.tipo === 'clase';
}

async function getSessionOverridesMap(db, profesor, dia) {
  const normalizedTeacher = normalizeText(profesor);
  const rows = await db.all('SELECT profesor, dia, hora, materia, grupo, detalle, aula FROM session_overrides WHERE dia = ?', [dia]);
  return Object.fromEntries(rows
    .filter(row => normalizeText(row?.profesor) === normalizedTeacher && Number(row?.dia) === Number(dia))
    .filter(row => esHoraValida(row.hora))
    .map(row => [Number(row.hora), row]));
}

async function getResolvedTeacherSessionsByDay(db, profesor, dia) {
  const canonical = await loadCanonicalDataset(db);
  const teacher = findTeacher(canonical, profesor);
  if (!teacher || !teacher.active) return {};
  const periods = new Map(canonical.periods.map(period => [period.key, period]));
  const overridesByHour = await getSessionOverridesMap(db, teacher.displayName, dia);
  const result = {};
  for (const session of teacher.sessions.filter(item => Number(item.weekday) === Number(dia))) {
    const period = periods.get(session.periodKey);
    if (!period || period.type !== 'teaching') continue;
    const base = canonicalSessionToLegacy(session);
    result[period.position] = overridesByHour[period.position]
      ? { ...base, ...overridesByHour[period.position] }
      : base;
  }
  return result;
}

async function getResolvedTeacherSession(db, profesor, dia, hora) {
  const sessionsByDay = await getResolvedTeacherSessionsByDay(db, profesor, dia);
  return sessionsByDay[Number(hora)] || null;
}

async function getSesionesCubriblesProfesor(db, profesor, dia) {
  const canonical = await loadCanonicalDataset(db);
  const teacher = findTeacher(canonical, profesor);
  if (!teacher || !teacher.active) return [];
  const inactiveGroups = await getInactiveGroupSet(db);
  const sessionsByDay = await getResolvedTeacherSessionsByDay(db, teacher.displayName, dia);
  return Object.entries(sessionsByDay)
    .map(([hora, session]) => ({ profesor: teacher.displayName, dia: Number(dia), hora: Number(hora), session }))
    .filter(item => {
      if (!isGroupInactive(item.session.grupo, inactiveGroups)) return true;
      logInactiveGroupSkip({ grupo: item.session.grupo, profesor: item.profesor, dia: item.dia, hora: item.hora });
      return false;
    })
    .filter(item => isSessionCubrible(item.session, item.hora))
    .sort((left, right) => left.hora - right.hora)
    .map(item => ({
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
