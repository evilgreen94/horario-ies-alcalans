const crypto = require('crypto');
const { XMLParser } = require('fast-xml-parser');
const { normalizeSourceActivityLabel, sourceActivityType } = require('./schedule-source-types');

const SOURCE_SYSTEM = 'penalara software';

function array(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function text(value) {
  if (value == null) return '';
  if (typeof value === 'object' && '#text' in value) return text(value['#text']);
  return String(value).replace(/\s+/g, ' ').trim();
}

function normalizeLabel(value) {
  return normalizeSourceActivityLabel(text(value));
}

function required(value, label) {
  const result = text(value);
  if (!result) throw new Error(`GHC XML: falta ${label}.`);
  return result;
}

function uniqueMap(rows, keyOf, label) {
  const result = new Map();
  for (const row of rows) {
    const key = required(keyOf(row), `${label} key`);
    if (result.has(key)) throw new Error(`GHC XML: ${label} duplicado "${key}".`);
    result.set(key, row);
  }
  return result;
}

function decodeGhcXmlBytes(bytes) {
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  const declaration = buffer.subarray(0, 256).toString('ascii');
  const encoding = /<\?xml[^>]*encoding=["']([^"']+)["']/i.exec(declaration)?.[1] || '';
  if (!/^iso-8859-1$/i.test(encoding)) {
    throw new Error(`GHC XML: codificación no soportada "${encoding || 'sin declarar'}"; se esperaba ISO-8859-1.`);
  }
  return new TextDecoder('iso-8859-1', { fatal: true }).decode(buffer);
}

function parseDocument(bytes) {
  const xmlText = decodeGhcXmlBytes(bytes);
  if (/<!DOCTYPE\b|<!ENTITY\b/i.test(xmlText)) {
    throw new Error('GHC XML: DTD y entidades personalizadas no permitidas.');
  }
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseTagValue: false,
    trimValues: true,
    processEntities: false
  });
  const document = parser.parse(xmlText);
  if (!document?.datosGHC) throw new Error('GHC XML: raíz datosGHC no encontrada.');
  return { root: document.datosGHC, xmlText };
}

function buildPeriods(root, finalTramos) {
  const frameworkIds = new Set(finalTramos.map(row => required(row['@_marco'], 'horario.tramo@marco')));
  if (frameworkIds.size !== 1) throw new Error('GHC XML: el horario final usa varios marcos horarios.');
  const frameworkId = [...frameworkIds][0];
  const frameworks = array(root.marcosDeHorario?.marcoHorario);
  const framework = frameworks.find(row => text(row['@_id']) === frameworkId);
  if (!framework) throw new Error(`GHC XML: marco horario "${frameworkId}" no resuelto.`);

  const rows = array(framework.tramo).map(row => ({
    day: Number(required(row.dia, 'marcoHorario.tramo.dia')),
    index: Number(required(row.indice, 'marcoHorario.tramo.indice')),
    startsAt: required(row.horaEntrada, 'marcoHorario.tramo.horaEntrada').slice(0, 5),
    endsAt: required(row.horaSalida, 'marcoHorario.tramo.horaSalida').slice(0, 5),
    type: normalizeLabel(row.Tipo) === 'RECREO' ? 'break' : 'teaching'
  }));
  const weekdays = [...new Set(rows.map(row => row.day))].sort((a, b) => a - b);
  if (weekdays.some(day => !Number.isInteger(day) || day < 0 || day > 4)) {
    throw new Error('GHC XML: día fuera del rango operativo lunes-viernes.');
  }
  const byIndex = new Map();
  for (const row of rows) {
    const signature = `${row.startsAt}|${row.endsAt}|${row.type}`;
    const current = byIndex.get(row.index);
    if (current && current.signature !== signature) {
      throw new Error(`GHC XML: el tramo ${row.index} cambia de horario o tipo según el día.`);
    }
    byIndex.set(row.index, { ...row, signature });
  }
  const sorted = [...byIndex.values()].sort((left, right) => left.index - right.index);
  let teaching = 0;
  let breaks = 0;
  const periods = sorted.map((row, position) => {
    const sequence = row.type === 'break' ? ++breaks : ++teaching;
    const key = row.type === 'break' ? `B${sequence}` : `P${sequence}`;
    return {
      key,
      position: position + 1,
      type: row.type,
      label: row.type === 'break' ? `Recreo ${sequence}` : `Periodo lectivo ${sequence}`,
      starts_at: row.startsAt,
      ends_at: row.endsAt,
      source_index: row.index
    };
  });
  return { frameworkId, periods, periodByIndex: new Map(periods.map(row => [row.source_index, row])) };
}

function parseGhcXml(bytes, options = {}) {
  const academicYear = required(options.academicYear, 'academic_year explícito');
  const sourceLabel = text(options.sourceLabel || 'Horario.xml');
  const sourceSha256 = crypto.createHash('sha256').update(Buffer.from(bytes)).digest('hex');
  const { root, xmlText } = parseDocument(bytes);

  const teachers = array(root.profesores?.profesor).map((row, index) => ({
    source_code: required(row.abreviatura || row.nombre, `profesores.profesor[${index}].abreviatura`).toUpperCase(),
    display_name: required(row.nombreCompleto, `profesores.profesor[${index}].nombreCompleto`),
    active: true
  }));
  const teachersByCode = uniqueMap(teachers, row => row.source_code, 'source_code docente');

  const subjects = uniqueMap(array(root.materias?.materia), row => row.nombre, 'materia');
  const groups = uniqueMap(array(root.grupos?.grupo), row => row.nombre, 'grupo');
  const classDefinitions = uniqueMap(array(root.sesionesLectivas?.sesion), row => row['@_id'], 'sesión lectiva');
  const tasks = new Map();
  for (const row of array(root.tareas?.tarea)) {
    const label = text(row.nombreCompleto || row.nombre);
    const keys = [text(row.nombre)];
    const exportKey = text(row.claveDeExportacion).split(/\s+/)[0];
    if (exportKey) keys.push(exportKey);
    for (const key of keys.filter(Boolean)) {
      const existing = tasks.get(key);
      if (existing && existing.label !== label) throw new Error(`GHC XML: metadatos contradictorios para tarea "${key}".`);
      tasks.set(key, { key, label });
    }
  }
  const complementary = uniqueMap(array(root.complementarias?.complementaria), row => row.identificador, 'complementaria');
  const meetings = uniqueMap(array(root.reuniones?.reunion), row => row.nombre, 'reunión');
  const finalTramos = array(root.horario?.tramo);
  if (!finalTramos.length) throw new Error('GHC XML: horario final vacío.');
  const { frameworkId, periods, periodByIndex } = buildPeriods(root, finalTramos);

  const sessions = [];
  const unresolved = [];
  function requireTeacher(code, sourceRef) {
    const normalized = text(code).toUpperCase();
    if (!teachersByCode.has(normalized)) unresolved.push(`${sourceRef}: docente ${normalized || '[vacío]'}`);
    return normalized;
  }
  function addSession(row) {
    sessions.push(row);
  }

  for (const tramo of finalTramos) {
    const weekday = Number(tramo['@_dia']);
    const sourceIndex = Number(tramo['@_indice']);
    const period = periodByIndex.get(sourceIndex);
    if (!period) throw new Error(`GHC XML: tramo final ${sourceIndex} no existe en el marco ${frameworkId}.`);
    const slotRef = `GHC:${frameworkId}:${weekday}:${sourceIndex}`;

    for (const assignment of array(tramo.aula)) {
      const sessionId = required(assignment.sesion, `${slotRef}.aula.sesion`);
      const definition = classDefinitions.get(sessionId);
      if (!definition) {
        unresolved.push(`${slotRef}: sesión lectiva ${sessionId}`);
        continue;
      }
      const teacherCode = requireTeacher(assignment.profesor, `${slotRef}:class:${sessionId}`);
      const definedTeacher = text(definition.profesor).toUpperCase();
      if (definedTeacher && definedTeacher !== teacherCode) {
        throw new Error(`GHC XML: sesión ${sessionId} asignada a ${teacherCode}, pero definida para ${definedTeacher}.`);
      }
      const subjectKey = text(definition.materia);
      const groupKey = text(definition.grupo);
      const subject = subjects.get(subjectKey);
      const group = groups.get(groupKey);
      if (!subject) unresolved.push(`${slotRef}: materia ${subjectKey}`);
      if (!group) unresolved.push(`${slotRef}: grupo ${groupKey}`);
      addSession({
        teacher_source_code: teacherCode,
        weekday,
        period_key: period.key,
        type: 'class',
        subject: text(subject?.nombreCompleto || subject?.abreviatura || subjectKey),
        group: text(group?.abreviatura || groupKey),
        room: text(assignment['@_id']),
        label: text(subject?.nombreCompleto || subjectKey),
        source_ref: `${slotRef}:class:${sessionId}`
      });
    }

    for (const assignment of array(tramo.guardia)) {
      const sourceName = required(assignment.nombre, `${slotRef}.guardia.nombre`);
      const normalized = normalizeLabel(sourceName);
      const type = sourceActivityType(sourceName);
      if (!type) {
        if (normalized === 'BIBLIOTECA LECTIVA') {
          addSession({
            teacher_source_code: requireTeacher(assignment.profesor, `${slotRef}:guard:${sourceName}`),
            weekday,
            period_key: period.key,
            type: 'other',
            subject: '', group: '', room: 'Biblioteca', label: sourceName,
            source_ref: `${slotRef}:guard:${sourceName}`
          });
          continue;
        }
        throw new Error(`GHC XML: tipo de guardia no reconocido "${sourceName}".`);
      }
      addSession({
        teacher_source_code: requireTeacher(assignment.profesor, `${slotRef}:guard:${sourceName}`),
        weekday,
        period_key: period.key,
        type,
        subject: '', group: '',
        room: type === 'biblioteca_patio' ? 'Biblioteca' : '',
        label: sourceName,
        source_ref: `${slotRef}:guard:${sourceName}`
      });
    }

    for (const reference of array(tramo.complementaria)) {
      const id = required(reference, `${slotRef}.complementaria`);
      const definition = complementary.get(id);
      if (!definition) {
        unresolved.push(`${slotRef}: complementaria ${id}`);
        continue;
      }
      const taskKey = text(definition.tarea);
      const task = tasks.get(taskKey);
      if (!task) unresolved.push(`${slotRef}: tarea ${taskKey}`);
      const normalized = normalizeLabel(task?.label || taskKey);
      const type = sourceActivityType(taskKey) || sourceActivityType(normalized) || 'other';
      addSession({
        teacher_source_code: requireTeacher(definition.profesor, `${slotRef}:complementary:${id}`),
        weekday,
        period_key: period.key,
        type,
        subject: '', group: '', room: '',
        label: text(task?.label || taskKey),
        source_ref: `${slotRef}:complementary:${id}`
      });
    }

    for (const reference of array(tramo.reunion)) {
      const name = required(reference, `${slotRef}.reunion`);
      const definition = meetings.get(name);
      if (!definition) {
        unresolved.push(`${slotRef}: reunión ${name}`);
        continue;
      }
      for (const member of array(definition.integrantes?.integrante)) {
        const teacherCode = requireTeacher(member, `${slotRef}:meeting:${name}`);
        addSession({
          teacher_source_code: teacherCode,
          weekday,
          period_key: period.key,
          type: 'meeting',
          subject: '', group: '', room: '', label: name,
          source_ref: `${slotRef}:meeting:${name}`
        });
      }
    }
  }

  if (unresolved.length) {
    throw new Error(`GHC XML: referencias sin resolver (${unresolved.length}): ${unresolved.slice(0, 20).join('; ')}`);
  }
  const slotKeys = new Set();
  for (const row of sessions) {
    const key = `${row.teacher_source_code}|${row.weekday}|${row.period_key}`;
    if (slotKeys.has(key)) throw new Error(`GHC XML: obligaciones ambiguas en ${key}.`);
    slotKeys.add(key);
  }
  sessions.sort((left, right) => left.teacher_source_code.localeCompare(right.teacher_source_code, 'en') ||
    left.weekday - right.weekday || periods.findIndex(row => row.key === left.period_key) - periods.findIndex(row => row.key === right.period_key));
  const countsByType = {};
  for (const row of sessions) countsByType[row.type] = (countsByType[row.type] || 0) + 1;
  const displayNames = new Map();
  for (const teacher of teachers) {
    const normalized = normalizeLabel(teacher.display_name);
    displayNames.set(normalized, [...(displayNames.get(normalized) || []), teacher.source_code]);
  }
  const duplicateDisplayNames = [...displayNames.values()].filter(codes => codes.length > 1);

  return {
    census: {
      schema_version: 1,
      academic_year: academicYear,
      source_system: SOURCE_SYSTEM,
      teacher_count: teachers.length,
      teachers
    },
    canonical: {
      schema_version: 1,
      academic_year: academicYear,
      label: `Horario oficial GHC ${academicYear}`,
      source: {
        system: SOURCE_SYSTEM,
        format: 'xml',
        provisional: false,
        filename: sourceLabel,
        sha256: sourceSha256,
        encoding: 'ISO-8859-1'
      },
      teacher_source_codes: teachers.map(row => row.source_code).sort((a, b) => a.localeCompare(b, 'en')),
      periods: periods.map(({ source_index, ...row }) => row),
      sessions,
      anomalies: []
    },
    audit: {
      encoding: 'ISO-8859-1',
      sourceSha256,
      sourceBytes: Buffer.byteLength(xmlText, 'latin1'),
      teachers: teachers.length,
      uniqueTeacherCodes: teachersByCode.size,
      duplicateDisplayNames,
      unresolvedReferences: 0,
      periods: periods.length,
      breaks: periods.filter(row => row.type === 'break').length,
      classrooms: new Set(sessions.map(row => row.room).filter(Boolean)).size,
      groups: groups.size,
      subjects: subjects.size,
      classDefinitions: classDefinitions.size,
      meetingDefinitions: meetings.size,
      complementaryDefinitions: complementary.size,
      sessions: sessions.length,
      countsByType
    }
  };
}

module.exports = {
  SOURCE_SYSTEM,
  decodeGhcXmlBytes,
  normalizeLabel,
  parseGhcXml
};
