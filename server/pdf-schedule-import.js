const zlib = require('zlib');
const { validateTeacherCensus } = require('./schedule-model');

const WINDOWS_1252 = new TextDecoder('windows-1252');
const DAY_COLUMNS = [
  { weekday: 0, left: 80, right: 175 },
  { weekday: 1, left: 175, right: 270 },
  { weekday: 2, left: 270, right: 365 },
  { weekday: 3, left: 365, right: 460 },
  { weekday: 4, left: 460, right: 555 }
];
const PERIOD_LAYOUT = [
  { key: 'P1', position: 1, type: 'teaching', label: '1ª hora', starts_at: '08:15', ends_at: '09:10', bottom: 636, top: 691 },
  { key: 'P2', position: 2, type: 'teaching', label: '2ª hora', starts_at: '09:10', ends_at: '10:05', bottom: 581, top: 636 },
  { key: 'P3', position: 3, type: 'teaching', label: '3ª hora', starts_at: '10:05', ends_at: '11:00', bottom: 526, top: 581 },
  { key: 'B1', position: 4, type: 'break', label: 'Recreo', starts_at: '11:00', ends_at: '11:25', bottom: 501, top: 526 },
  { key: 'P4', position: 5, type: 'teaching', label: '4ª hora', starts_at: '11:25', ends_at: '12:20', bottom: 446, top: 501 },
  { key: 'P5', position: 6, type: 'teaching', label: '5ª hora', starts_at: '12:20', ends_at: '13:15', bottom: 391, top: 446 },
  { key: 'P6', position: 7, type: 'teaching', label: '6ª hora', starts_at: '13:15', ends_at: '14:10', bottom: 336, top: 391 },
  { key: 'B2', position: 8, type: 'break', label: 'Recreo', starts_at: '14:10', ends_at: '14:25', bottom: 321, top: 336 },
  { key: 'P7', position: 9, type: 'teaching', label: '7ª hora', starts_at: '14:25', ends_at: '15:20', bottom: 266, top: 321 }
];

function decodePdfLiteral(raw) {
  const bytes = [];
  for (let index = 0; index < raw.length; index += 1) {
    const code = raw.charCodeAt(index);
    if (code !== 92) {
      bytes.push(code & 0xff);
      continue;
    }
    const next = raw[index + 1];
    if (next == null) break;
    if (/[0-7]/.test(next)) {
      const match = /^[0-7]{1,3}/.exec(raw.slice(index + 1));
      bytes.push(parseInt(match[0], 8));
      index += match[0].length;
      continue;
    }
    const escaped = { n: 10, r: 13, t: 9, b: 8, f: 12 }[next];
    if (escaped != null) bytes.push(escaped);
    else if (next !== '\r' && next !== '\n') bytes.push(next.charCodeAt(0) & 0xff);
    index += 1;
  }
  return WINDOWS_1252.decode(Uint8Array.from(bytes)).replace(/\s+/g, ' ').trim();
}

function extractPdfStreams(buffer) {
  const streams = [];
  const pattern = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  const binary = buffer.toString('latin1');
  let match;
  while ((match = pattern.exec(binary))) {
    const raw = Buffer.from(match[1], 'latin1');
    try {
      streams.push(zlib.inflateSync(raw).toString('latin1'));
    } catch (_error) {
      streams.push(raw.toString('latin1'));
    }
  }
  return streams;
}

function extractTextItems(stream) {
  const items = [];
  const textBlockPattern = /BT\s*([\s\S]*?)\s+ET(?:\s|$)/g;
  let blockMatch;
  while ((blockMatch = textBlockPattern.exec(stream))) {
    const body = blockMatch[1];
    const position = /(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+Td/.exec(body);
    const literal = /\(((?:\\[\s\S]|[^\\)])*)\)\s*Tj/.exec(body);
    if (!position || !literal) continue;
    const text = decodePdfLiteral(literal[1]);
    if (!text) continue;
    const fontMatches = [...body.matchAll(/\/F(\d+)\s+(\d+(?:\.\d+)?)\s+Tf/g)];
    const font = fontMatches.length ? fontMatches[fontMatches.length - 1] : null;
    items.push({
      x: Number(position[1]),
      y: Number(position[2]),
      text,
      font: font ? `F${font[1]}` : '',
      fontSize: font ? Number(font[2]) : null
    });
  }
  return items;
}

function normalizeToken(value) {
  return String(value || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9]+/g, ' ').trim();
}

function classifyCell(lines) {
  const label = lines.map(line => line.text).join(' | ');
  const normalized = normalizeToken(label);
  if (/\bGUARDIA\b|\bGUARDIES\b/.test(normalized)) {
    return { type: 'guardia', subject: '', group: '', room: '', label };
  }
  const groupPattern = /(?:ESO|BAT|FPB|CF|CICLO|PDC|PR4|DIVER|ESO[A-Z0-9]|[12][A-Z]{2,})/;
  const groupIndex = lines.findIndex(line => groupPattern.test(normalizeToken(line.text)));
  if (groupIndex >= 0) {
    return {
      type: 'class',
      subject: lines.slice(0, groupIndex).map(line => line.text).join(' | '),
      group: lines[groupIndex].text,
      room: lines.slice(groupIndex + 1).map(line => line.text).join(' | '),
      label
    };
  }
  if (/\b(?:REU|REUNIO|REUNION|CCP|COCOPE|DEPARTAMENT|TUTORIA|ATENCIO|ATENCION|FAMILIA|FAMILIAS)\b/.test(normalized)) {
    return { type: 'meeting', subject: '', group: '', room: '', label };
  }
  return { type: 'other', subject: '', group: '', room: '', label };
}

function getPageHeader(items) {
  return items.find(item => item.y >= 715 && item.y <= 725 && /\([A-Z0-9_-]{2,64}\)\s*$/.test(item.text)) || null;
}

function extractCanonicalScheduleFromPdf(buffer, censusPayload, options = {}) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new Error('PDF buffer is required.');
  const census = validateTeacherCensus(censusPayload, { expectedCount: options.expectedTeacherCount || 88 });
  const censusCodes = new Set(census.teachers.map(teacher => teacher.sourceCode));
  const pageStreams = extractPdfStreams(buffer).filter(stream => stream.includes('Horario semanal: Profesores'));
  const anomalies = [];
  const sessions = [];
  const seenCodes = new Set();

  pageStreams.forEach((stream, pageIndex) => {
    const pageNumber = pageIndex + 1;
    const items = extractTextItems(stream);
    const header = getPageHeader(items);
    const codeMatch = header ? /\(([A-Z0-9_-]{2,64})\)\s*$/.exec(header.text) : null;
    if (!codeMatch) {
      anomalies.push(`page ${pageNumber}: missing teacher source code`);
      return;
    }
    const sourceCode = codeMatch[1].toUpperCase();
    if (!censusCodes.has(sourceCode)) anomalies.push(`page ${pageNumber}: unknown teacher code ${sourceCode}`);
    if (seenCodes.has(sourceCode)) anomalies.push(`page ${pageNumber}: duplicate teacher code ${sourceCode}`);
    seenCodes.add(sourceCode);

    for (const day of DAY_COLUMNS) {
      for (const period of PERIOD_LAYOUT.filter(row => row.type === 'teaching')) {
        const lines = items
          .filter(item => item.x >= day.left && item.x < day.right && item.y > period.bottom && item.y < period.top)
          .sort((left, right) => right.y - left.y || left.x - right.x);
        if (!lines.length) continue;
        const uniqueLines = lines.filter((line, index) => index === 0 || line.text !== lines[index - 1].text || line.y !== lines[index - 1].y);
        if (uniqueLines.length > 4) anomalies.push(`page ${pageNumber} ${sourceCode} weekday ${day.weekday} ${period.key}: ${uniqueLines.length} text lines`);
        const classified = classifyCell(uniqueLines);
        sessions.push({
          teacher_source_code: sourceCode,
          weekday: day.weekday,
          period_key: period.key,
          type: classified.type,
          subject: classified.subject,
          group: classified.group,
          room: classified.room,
          label: classified.label,
          source_ref: `page:${pageNumber}`
        });
      }
    }
  });

  const missingCodes = [...censusCodes].filter(code => !seenCodes.has(code));
  missingCodes.forEach(code => anomalies.push(`census teacher without PDF page: ${code}`));
  const countsByType = sessions.reduce((counts, row) => {
    counts[row.type] = (counts[row.type] || 0) + 1;
    return counts;
  }, { class: 0, guardia: 0, meeting: 0, other: 0 });
  const otherLabels = sessions
    .filter(row => row.type === 'other')
    .reduce((counts, row) => counts.set(row.label, (counts.get(row.label) || 0) + 1), new Map());
  const otherLabelSummary = [...otherLabels.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, 'es'));
  return {
    dataset: {
      schema_version: 1,
      academic_year: census.academicYear,
      label: cleanLabel(options.label || `${census.academicYear} PDF provisional`),
      source: { system: census.sourceSystem, format: 'pdf', provisional: true },
      teacher_source_codes: [...seenCodes].sort((left, right) => left.localeCompare(right, 'en')),
      periods: PERIOD_LAYOUT.map(({ bottom, top, ...period }) => period),
      sessions,
      anomalies
    },
    report: {
      pagesDetected: pageStreams.length,
      censusTeachers: census.teachers.length,
      teacherPagesMatched: seenCodes.size,
      teachersMissingFromPdf: missingCodes.length,
      sessions: sessions.length,
      countsByType,
      manualReview: {
        otherSessions: countsByType.other,
        reason: 'Celdas con texto que no se pueden clasificar como clase, guardia o reunión mediante reglas estructurales.',
        labels: otherLabelSummary
      },
      anomalies
    }
  };
}

function cleanLabel(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

module.exports = {
  DAY_COLUMNS,
  PERIOD_LAYOUT,
  classifyCell,
  decodePdfLiteral,
  extractCanonicalScheduleFromPdf,
  extractPdfStreams,
  extractTextItems
};
