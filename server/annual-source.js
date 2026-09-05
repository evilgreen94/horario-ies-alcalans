const crypto = require('crypto');
const DAY_ORDER = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
const DAY_INDEX = Object.fromEntries(DAY_ORDER.map((day, index) => [day, index]));
const DAY_ALIASES = {
  lunes: 'Lunes',
  martes: 'Martes',
  miercoles: 'Miércoles',
  miércoles: 'Miércoles',
  jueves: 'Jueves',
  viernes: 'Viernes'
};
// Provisional input-adapter configuration for the 2026/27 annual XML/PDF
// sources. Canonical schedules receive their period definitions as data and
// must not depend on this template.
const PROVISIONAL_2026_27_ACADEMIC_YEAR = '2026/27';
const PROVISIONAL_2026_27_VALID_FRANJAS = new Set([
  '08:15-09:10',
  '09:10-10:05',
  '10:05-11:00',
  '11:00-11:25',
  '11:25-12:20',
  '12:20-13:15',
  '13:15-14:10',
  '14:10-14:25',
  '14:25-15:20'
]);
const PROVISIONAL_2026_27_PERIOD_DEFINITIONS = [
  { key: 'P1', position: 1, type: 'teaching', label: 'Primera', starts_at: '08:15', ends_at: '09:10' },
  { key: 'P2', position: 2, type: 'teaching', label: 'Segunda', starts_at: '09:10', ends_at: '10:05' },
  { key: 'P3', position: 3, type: 'teaching', label: 'Tercera', starts_at: '10:05', ends_at: '11:00' },
  { key: 'BREAK1', position: 4, type: 'break', label: 'Recreo', starts_at: '11:00', ends_at: '11:25' },
  { key: 'P4', position: 5, type: 'teaching', label: 'Cuarta', starts_at: '11:25', ends_at: '12:20' },
  { key: 'P5', position: 6, type: 'teaching', label: 'Quinta', starts_at: '12:20', ends_at: '13:15' },
  { key: 'P6', position: 7, type: 'teaching', label: 'Sexta', starts_at: '13:15', ends_at: '14:10' },
  { key: 'BREAK2', position: 8, type: 'break', label: 'Recreo vespertino', starts_at: '14:10', ends_at: '14:25' },
  { key: 'P7', position: 9, type: 'teaching', label: 'Séptima', starts_at: '14:25', ends_at: '15:20' }
];
const PROVISIONAL_2026_27_PERIOD_BY_FRANJA = new Map(PROVISIONAL_2026_27_PERIOD_DEFINITIONS.map(period => [
  `${period.starts_at}-${period.ends_at}`,
  period
]));

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

function looksMojibake(value) {
  return /[ÃƒÃ‚ï¿½]|Ã¢â‚¬|Ã¢â‚¬â„¢|Ã¢â‚¬Å“|Ã¢â‚¬ï¿½|Ã¢â‚¬â€œ|Ã¢â‚¬â€|Ã¢â‚¬Â¦/.test(value);
}

function repairMojibake(value) {
  if (typeof value !== 'string' || !value) return value;
  if (!looksMojibake(value)) return value;
  const repaired = Buffer.from(value, 'latin1').toString('utf8');
  if (!repaired || repaired === value || repaired.includes('ï¿½')) return value;
  return repaired;
}

function normalizeInput(value) {
  if (typeof value === 'string') return repairMojibake(value);
  if (Array.isArray(value)) return value.map(normalizeInput);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entryValue]) => [
        repairMojibake(key),
        normalizeInput(entryValue)
      ])
    );
  }
  return value;
}

function normalizeTeacherName(value) {
  return cleanText(value);
}

function normalizeGroupLabel(value) {
  return cleanText(String(value ?? '').replace(/\s*,\s*/g, ', '));
}

function normalizeDayLabel(value) {
  return DAY_ALIASES[normalizeText(value)] || '';
}

function normalizeTime(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(cleanText(value));
  if (!match) return '';
  const hour = String(Number(match[1])).padStart(2, '0');
  const minute = match[2];
  return `${hour}:${minute}`;
}

function buildFranja(inicio, fin) {
  const normalizedInicio = normalizeTime(inicio);
  const normalizedFin = normalizeTime(fin);
  if (!normalizedInicio || !normalizedFin) return '';
  const franja = `${normalizedInicio}-${normalizedFin}`;
  return PROVISIONAL_2026_27_VALID_FRANJAS.has(franja) ? franja : '';
}

function normalizeSessionType(value) {
  return normalizeText(value) === 'guardia' ? 'guardia' : 'clase';
}

function normalizeTeacherSourceCode(value) {
  const code = cleanText(value).toUpperCase();
  if (!code) return '';
  if (!/^[A-Z0-9_-]{2,64}$/.test(code)) {
    throw new Error(`Código externo de profesorado inválido: "${code}".`);
  }
  return code;
}

function validateAndNormalizeAnnualSource(source, options = {}) {
  const normalizedSource = normalizeInput(source);
  const teacherEntries = normalizedSource?.teachers;
  if (!Array.isArray(teacherEntries) || !teacherEntries.length) {
    throw new Error('La fuente anual no contiene profesorado.');
  }

  const teachersBySourceCode = new Map();
  const duplicateSourceCodes = new Set();
  const duplicateRows = [];
  const teachersWithoutSessions = [];

  teacherEntries.forEach((rawTeacher, teacherIndex) => {
    if (!rawTeacher || typeof rawTeacher !== 'object' || Array.isArray(rawTeacher)) {
      throw new Error(`El bloque de profesorado ${teacherIndex + 1} no es válido.`);
    }

    const sourceCode = normalizeTeacherSourceCode(rawTeacher.source_code || rawTeacher.sourceCode);
    if (!sourceCode) {
      throw new Error(`El bloque de profesorado ${teacherIndex + 1} no tiene source_code.`);
    }

    const displayName = normalizeTeacherName(
      rawTeacher.display_name || rawTeacher.displayName || rawTeacher.nombre || rawTeacher.name
    );
    if (!displayName) {
      throw new Error(`El profesor ${sourceCode} no tiene display_name.`);
    }

    const rawSessions = rawTeacher.sessions;
    if (!Array.isArray(rawSessions)) {
      throw new Error(`Las sesiones del profesor ${sourceCode} (${displayName}) deben ser una lista.`);
    }

    const existing = teachersBySourceCode.get(sourceCode);
    if (existing) {
      if (existing.display_name !== displayName) {
        throw new Error(
          `El source_code ${sourceCode} tiene identidades docentes contradictorias: ` +
          `"${existing.display_name}" y "${displayName}".`
        );
      }
      duplicateSourceCodes.add(sourceCode);
      existing.rawSessions.push(...rawSessions);
    } else {
      teachersBySourceCode.set(sourceCode, {
        source_code: sourceCode,
        display_name: displayName,
        rawSessions: rawSessions.slice()
      });
    }
  });

  const teachers = [];
  for (const teacher of teachersBySourceCode.values()) {
    const slots = new Map();
    if (!teacher.rawSessions.length) teachersWithoutSessions.push(teacher.source_code);

    teacher.rawSessions.forEach((rawRow, index) => {
      const dia = normalizeDayLabel(rawRow?.dia);
      const inicio = normalizeTime(rawRow?.inicio);
      const fin = normalizeTime(rawRow?.fin);
      const franja = buildFranja(rawRow?.inicio, rawRow?.fin);
      const teacherRef = `${teacher.source_code} (${teacher.display_name})`;
      if (!dia) {
        throw new Error(`Profesor ${teacherRef}: día no soportado en la sesión ${index + 1} ("${cleanText(rawRow?.dia)}").`);
      }
      if (!inicio || !fin) {
        throw new Error(`Profesor ${teacherRef}: formato de hora inválido en la sesión ${index + 1} (${cleanText(rawRow?.inicio)}-${cleanText(rawRow?.fin)}).`);
      }
      if (!franja) {
        throw new Error(`Profesor ${teacherRef}: franja no soportada en la sesión ${index + 1} (${inicio}-${fin}).`);
      }

      const row = {
        dia,
        inicio,
        fin,
        tipo: normalizeSessionType(rawRow?.tipo),
        asignatura: cleanText(rawRow?.asignatura),
        grupo: normalizeGroupLabel(rawRow?.grupo),
        aula: cleanText(rawRow?.aula)
      };

      if (row.tipo === 'guardia') {
        row.asignatura = 'GUARDIA';
        row.grupo = '';
        row.aula = '';
      }

      const slotKey = `${dia}|${franja}`;
      const signature = JSON.stringify(row);
      const existing = slots.get(slotKey);
      if (!existing) {
        slots.set(slotKey, { row, signature });
        return;
      }

      if (existing.signature === signature) {
        duplicateRows.push(`${teacher.source_code} · ${teacher.display_name} · ${dia} ${franja}`);
        return;
      }

      throw new Error(
        `Conflicto de importación para ${teacher.source_code} (${teacher.display_name}) en ${slotKey}. ` +
        `Hay dos sesiones distintas en el mismo tramo.`
      );
    });

    const sessions = [...slots.values()]
      .map(item => item.row)
      .sort((left, right) =>
        DAY_INDEX[left.dia] - DAY_INDEX[right.dia] ||
        buildFranja(left.inicio, left.fin).localeCompare(buildFranja(right.inicio, right.fin), 'es') ||
        cleanText(left.asignatura).localeCompare(cleanText(right.asignatura), 'es') ||
        cleanText(left.grupo).localeCompare(cleanText(right.grupo), 'es') ||
        cleanText(left.aula).localeCompare(cleanText(right.aula), 'es')
      );
    teachers.push({
      source_code: teacher.source_code,
      display_name: teacher.display_name,
      sessions
    });
  }

  teachers.sort((left, right) => left.source_code.localeCompare(right.source_code, 'en'));

  return {
    academicYear: cleanText(normalizedSource?.academicYear || normalizedSource?.academic_year),
    sourceSystem: cleanText(normalizedSource?.sourceSystem || normalizedSource?.source_system) || 'Peñalara Software',
    fuente: cleanText(normalizedSource?.fuente) || cleanText(options.sourceLabel || 'importado'),
    formato: cleanText(normalizedSource?.formato) || 'fuente_normalizada',
    teachers,
    metadata: {
      teachers: teachers.length,
      duplicateSourceCodes: [...duplicateSourceCodes].sort((left, right) => left.localeCompare(right, 'en')),
      duplicateRows: duplicateRows.slice().sort((left, right) => left.localeCompare(right, 'es')),
      teachersWithoutSessions: teachersWithoutSessions.sort((left, right) => left.localeCompare(right, 'en'))
    }
  };
}

function formatFranja(entry) {
  return `${cleanText(entry.inicio)}-${cleanText(entry.fin)}`;
}

function formatTexto(entry) {
  if (cleanText(entry.tipo).toLowerCase() === 'guardia') {
    return 'GUARDIA';
  }
  const parts = [
    cleanText(entry.asignatura),
    cleanText(entry.grupo),
    cleanText(entry.aula)
  ].filter(Boolean);
  return parts.join(' | ');
}

function toLegacyEntry(entry) {
  return {
    dia: cleanText(entry.dia),
    franja: formatFranja(entry),
    texto: formatTexto(entry),
    aula: cleanText(entry.aula)
  };
}

function buildPayload(source) {
  const preparedSource = validateAndNormalizeAnnualSource(source);
  const teachers = preparedSource.teachers.map((teacher) => {
    const horario = teacher.sessions.map(toLegacyEntry);
    const guardias = horario.filter(row => cleanText(row.texto).toUpperCase() === 'GUARDIA');
    return {
      nombre: teacher.display_name,
      horario,
      guardias
    };
  });

  const datasetId = crypto
    .createHash('sha1')
    .update(JSON.stringify(preparedSource))
    .digest('hex')
    .slice(0, 12);

  return {
    fuente: cleanText(preparedSource.fuente) || '',
    formato: 'js_desde_json_limpio',
    datasetId,
    teachers
  };
}

function buildCanonicalSchedule(source, options = {}) {
  const preparedSource = validateAndNormalizeAnnualSource(source, options);
  const academicYear = cleanText(options.academicYear || preparedSource.academicYear);
  if (!academicYear) {
    throw new Error('El XML debe indicar el curso académico (academic_year).');
  }
  if (academicYear !== PROVISIONAL_2026_27_ACADEMIC_YEAR) {
    throw new Error(
      `El adaptador anual provisional solo define periodos para ${PROVISIONAL_2026_27_ACADEMIC_YEAR}.`
    );
  }

  const teacherSourceCodes = [];
  const sessions = [];
  for (const teacher of preparedSource.teachers) {
    const sourceCode = teacher.source_code;
    teacherSourceCodes.push(sourceCode);

    for (const row of teacher.sessions) {
      const period = PROVISIONAL_2026_27_PERIOD_BY_FRANJA.get(formatFranja(row));
      if (!period) throw new Error(`Franja no canónica para ${sourceCode}: ${formatFranja(row)}.`);
      sessions.push({
        teacher_source_code: sourceCode,
        weekday: DAY_INDEX[row.dia],
        period_key: period.key,
        type: row.tipo === 'guardia' ? 'guardia' : 'class',
        subject: row.tipo === 'guardia' ? '' : row.asignatura,
        group: row.tipo === 'guardia' ? '' : row.grupo,
        room: row.tipo === 'guardia' ? '' : row.aula,
        source_ref: `${sourceCode} · ${teacher.display_name} · ${row.dia} ${formatFranja(row)}`
      });
    }
  }

  return {
    schema_version: 1,
    academic_year: academicYear,
    label: cleanText(preparedSource.fuente) || `Horario ${academicYear}`,
    source: {
      system: cleanText(options.sourceSystem || preparedSource.sourceSystem) || 'Peñalara Software',
      format: cleanText(options.sourceFormat || 'xml').toLowerCase(),
      provisional: !!options.provisional
    },
    teacher_source_codes: [...new Set(teacherSourceCodes)].sort((left, right) => left.localeCompare(right, 'en')),
    periods: PROVISIONAL_2026_27_PERIOD_DEFINITIONS.map(period => ({ ...period })),
    sessions,
    anomalies: [
      ...preparedSource.metadata.duplicateSourceCodes.map(code => `Bloque source_code duplicado y fusionado: ${code}`),
      ...preparedSource.metadata.duplicateRows.map(row => `Sesión duplicada descartada: ${row}`),
      ...preparedSource.metadata.teachersWithoutSessions.map(code => `Docente sin sesiones: ${code}`)
    ]
  };
}

function decodeXmlEntities(value) {
  return String(value ?? '')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&amp;/gi, '&')
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_match, num) => String.fromCodePoint(parseInt(num, 10)));
}

function stripXmlNoise(xmlText) {
  return String(xmlText || '')
    .replace(/^\uFEFF/, '')
    .replace(/<\?xml[\s\S]*?\?>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .trim();
}

function getAttrValue(attrsText, names) {
  for (const name of names) {
    const regex = new RegExp(`(?:^|\\s)${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i');
    const match = regex.exec(attrsText || '');
    if (match) {
      return cleanText(decodeXmlEntities(match[2] ?? match[3] ?? ''));
    }
  }
  return '';
}

function getTagValue(xmlText, names) {
  for (const name of names) {
    const regex = new RegExp(`<(?:(?:\\w+):)?${name}\\b[^>]*>([\\s\\S]*?)<\\/(?:(?:\\w+):)?${name}>`, 'i');
    const match = regex.exec(xmlText || '');
    if (match) {
      return cleanText(decodeXmlEntities(match[1].replace(/<[^>]+>/g, ' ')));
    }
  }
  return '';
}

function getNodeValue(attrsText, innerXml, names) {
  return getAttrValue(attrsText, names) || getTagValue(innerXml, names);
}

function collectNodeMatches(xmlText, names, acceptSelfClosing = true) {
  const joinedNames = names.join('|');
  const results = [];
  const pairedRegex = new RegExp(
    `<(?:(?:\\w+):)?(${joinedNames})\\b([^>]*)>([\\s\\S]*?)<\\/(?:(?:\\w+):)?\\1>`,
    'gi'
  );
  let pairedMatch;
  while ((pairedMatch = pairedRegex.exec(xmlText)) !== null) {
    results.push({
      tag: pairedMatch[1],
      attrs: pairedMatch[2] || '',
      body: pairedMatch[3] || ''
    });
  }

  if (acceptSelfClosing) {
    const selfClosingRegex = new RegExp(
      `<(?:(?:\\w+):)?(${joinedNames})\\b([^>]*)\\/\\s*>`,
      'gi'
    );
    let selfMatch;
    while ((selfMatch = selfClosingRegex.exec(xmlText)) !== null) {
      results.push({
        tag: selfMatch[1],
        attrs: selfMatch[2] || '',
        body: ''
      });
    }
  }

  return results;
}

function parseAnnualXml(xmlText, sourceLabel = 'import.xml') {
  const normalizedXml = stripXmlNoise(decodeXmlEntities(xmlText));
  if (!normalizedXml) {
    throw new Error('El XML está vacío.');
  }

  const rootMatch = /<(?:(?:\w+):)?([a-z0-9_-]+)\b([^>]*)>/i.exec(normalizedXml);
  const rootAttrs = rootMatch?.[2] || '';
  const rootFuente = getAttrValue(rootAttrs, ['fuente', 'source', 'origen']) ||
    getTagValue(normalizedXml, ['fuente', 'source', 'origen']) ||
    cleanText(sourceLabel);
  const academicYear = getAttrValue(rootAttrs, ['academic_year', 'academicYear', 'curso', 'course']) ||
    getTagValue(normalizedXml, ['academic_year', 'academicYear', 'curso', 'course']);
  const sourceSystem = getAttrValue(rootAttrs, ['source_system', 'sourceSystem', 'sistema']) ||
    getTagValue(normalizedXml, ['source_system', 'sourceSystem', 'sistema']) ||
    'Peñalara Software';

  const teacherNodes = collectNodeMatches(normalizedXml, ['teacher', 'profesor', 'docente'], false);
  if (!teacherNodes.length) {
    throw new Error('El XML no contiene nodos de profesorado reconocibles.');
  }

  const teachersBySourceCode = new Map();
  for (const teacherNode of teacherNodes) {
    const displayName = getNodeValue(teacherNode.attrs, teacherNode.body, ['nombre', 'name', 'profesor', 'docente']);
    const teacherSourceCode = getAttrValue(
      teacherNode.attrs,
      ['source_code', 'sourceCode', 'external_key', 'externalKey', 'codigo', 'codi', 'code', 'id']
    ) || getTagValue(
      teacherNode.body,
      ['source_code', 'sourceCode', 'external_key', 'externalKey', 'codigo', 'codi', 'code']
    );
    const sessionNodes = collectNodeMatches(teacherNode.body, ['session', 'sesion', 'entry', 'row', 'tramo'], true);
    if (!displayName) {
      throw new Error('El XML contiene un bloque de profesorado sin display_name.');
    }
    if (!teacherSourceCode) {
      throw new Error(`El profesor ${displayName} no tiene source_code en el XML.`);
    }
    const sourceCode = normalizeTeacherSourceCode(teacherSourceCode);
    const rows = sessionNodes
      .map(sessionNode => ({
        dia: getNodeValue(sessionNode.attrs, sessionNode.body, ['dia', 'day']),
        inicio: getNodeValue(sessionNode.attrs, sessionNode.body, ['inicio', 'start']),
        fin: getNodeValue(sessionNode.attrs, sessionNode.body, ['fin', 'end']),
        tipo: getNodeValue(sessionNode.attrs, sessionNode.body, ['tipo', 'type']) || 'clase',
        asignatura: getNodeValue(sessionNode.attrs, sessionNode.body, ['asignatura', 'materia', 'subject']),
        grupo: getNodeValue(sessionNode.attrs, sessionNode.body, ['grupo', 'group']),
        aula: getNodeValue(sessionNode.attrs, sessionNode.body, ['aula', 'classroom', 'ubicacion', 'location'])
      }))
      .filter(row => row.dia && row.inicio && row.fin)
      .map(row => ({
        ...row,
        tipo: cleanText(row.tipo).toLowerCase() === 'guardia' ? 'guardia' : 'clase'
      }));

    const existing = teachersBySourceCode.get(sourceCode);
    if (existing) {
      if (existing.display_name !== displayName) {
        throw new Error(
          `El source_code ${sourceCode} tiene identidades docentes contradictorias: ` +
          `"${existing.display_name}" y "${displayName}".`
        );
      }
      existing.sessions.push(...rows);
    } else {
      teachersBySourceCode.set(sourceCode, {
        source_code: sourceCode,
        display_name: displayName,
        sessions: rows
      });
    }
  }

  const teachers = [...teachersBySourceCode.values()];
  if (!teachers.some(teacher => teacher.sessions.length)) {
    throw new Error('El XML no contiene sesiones válidas para importar.');
  }

  return normalizeInput({
    academicYear,
    sourceSystem,
    fuente: rootFuente,
    formato: 'xml_importado',
    teachers
  });
}

module.exports = {
  buildCanonicalSchedule,
  buildPayload,
  cleanText,
  normalizeText,
  parseAnnualXml,
  validateAndNormalizeAnnualSource
};
