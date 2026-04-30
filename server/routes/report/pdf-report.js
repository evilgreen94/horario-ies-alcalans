const path = require('path');

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
const HORA_MAP = {
  1: '1a hora (08:15-09:10)',
  2: '2a hora (09:10-10:05)',
  3: '3a hora (10:05-11:00)',
  4: '4a hora (11:00-11:25)',
  5: '5a hora (11:25-12:20)',
  6: '6a hora (12:20-13:15)',
  7: '7a hora (13:15-14:10)',
  8: '8a hora (14:10-14:25)',
  9: '9a hora (14:25-15:20)'
};

const LOGO_IES_PATH = path.join(__dirname, '..', '..', '..', 'imagenes', 'logo-ies-alcalans.jpg');
const LOGO_CONSELLERIA_PATH = path.join(__dirname, '..', '..', '..', 'imagenes', 'gv_conselleria_educacion_cmyk_cast-1024x505-2.png');
const SUBSTITUTIONS_STATE_KEY = 'teacher_substitutions';

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function parseDay(value) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < 0 || numeric > 4) {
    throw badRequest('day debe estar entre 0 y 4.');
  }
  return numeric;
}

function formatReportDate() {
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Europe/Madrid'
  }).format(new Date());
}

async function loadTeacherSubstitutionMap(db) {
  const row = await db.get('SELECT value FROM app_state WHERE key = ?', [SUBSTITUTIONS_STATE_KEY]);
  const parsed = row?.value ? JSON.parse(row.value) : [];
  if (!Array.isArray(parsed)) return {};

  return Object.fromEntries(
    parsed
      .filter(item => item && typeof item === 'object')
      .map(item => [String(item.profesor || '').trim(), String(item.sustituto || '').trim()])
      .filter(([profesor, sustituto]) => profesor && sustituto)
  );
}

function formatTeacherDisplayName(name, substitutionMap) {
  const canonicalName = String(name || '').trim() || 'Profesorado sin identificar';
  const substitutionName = String(substitutionMap?.[canonicalName] || '').trim();
  if (!substitutionName || substitutionName === canonicalName) {
    return canonicalName;
  }
  return `${substitutionName} (titular: ${canonicalName})`;
}

function groupRowsByTeacher(rows, substitutionMap) {
  return Array.from(
    rows.reduce((map, row) => {
      const key = formatTeacherDisplayName(row.ausente, substitutionMap);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(row.hora);
      return map;
    }, new Map()).entries()
  )
    .map(([ausente, horas]) => ({
      ausente,
      horas: [...new Set(horas)].sort((a, b) => a - b)
    }))
    .sort((a, b) => a.ausente.localeCompare(b.ausente, 'es'));
}

function ensurePageSpace(doc, minHeight = 110) {
  if (doc.y + minHeight < doc.page.height - doc.page.margins.bottom) return;
  doc.addPage();
}

function drawHeader(doc, options) {
  const {
    title,
    subtitleLeft = 'IES Alcalans',
    subtitleRight = '',
    dayLabel = ''
  } = options;
  const left = doc.page.margins.left;
  const top = doc.page.margins.top;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const right = left + width;
  const boxHeight = 148;
  const titleTop = top + 76;

  doc.roundedRect(left, top, width, boxHeight, 12).fill('#f8fafc');
  doc.roundedRect(left, top, width, boxHeight, 12).stroke('#dbe3ee');

  try {
    doc.image(LOGO_IES_PATH, left + 18, top + 18, { fit: [118, 54] });
  } catch (_error) {}

  try {
    doc.image(LOGO_CONSELLERIA_PATH, right - 182, top + 18, { fit: [162, 56] });
  } catch (_error) {}

  doc.fillColor('#0f172a');
  doc.font('Helvetica-Bold').fontSize(22).text(title, left + 20, titleTop, {
    width: width - 40,
    align: 'left',
    lineGap: 0
  });

  doc.fillColor('#64748b');
  doc.font('Helvetica').fontSize(10.5).text(subtitleLeft, left + 20, top + 108, {
    width: 180,
    align: 'left'
  });

  doc.fillColor('#334155');
  if (dayLabel) {
    doc.font('Helvetica').fontSize(11).text(dayLabel, left + 20, top + 124, {
      width: 240,
      align: 'left'
    });
  }
  doc.text(subtitleRight, right - 210, top + 124, {
    width: 190,
    align: 'right'
  });

  doc.y = top + boxHeight + 18;
}

function drawSummary(doc, teacherCount, slotCount) {
  const left = doc.page.margins.left;
  const top = doc.y;
  const cardWidth = 248;
  const gap = 16;

  doc.roundedRect(left, top, cardWidth, 42, 10).fillAndStroke('#ffffff', '#dbe3ee');
  doc.roundedRect(left + cardWidth + gap, top, cardWidth, 42, 10).fillAndStroke('#ffffff', '#dbe3ee');

  doc.fillColor('#64748b');
  doc.font('Helvetica').fontSize(9.5);
  doc.text('Profesores ausentes registrados', left + 14, top + 10);
  doc.text('Tramos horarios afectados', left + cardWidth + gap + 14, top + 10);

  doc.fillColor('#0f172a');
  doc.font('Helvetica-Bold').fontSize(16);
  doc.text(String(teacherCount), left + 14, top + 22);
  doc.text(String(slotCount), left + cardWidth + gap + 14, top + 22);

  doc.x = left;
  doc.y = top + 58;
}

function drawWeeklyDayBlock(doc, dayIndex, rows) {
  ensurePageSpace(doc, 96);
  const left = doc.page.margins.left;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  doc.x = left;

  doc.fillColor('#0f172a');
  doc.font('Helvetica-Bold').fontSize(15).text(DIAS[dayIndex], left, doc.y, { width, align: 'left', underline: false });
  doc.moveDown(0.35);

  if (!rows.length) {
    doc.fillColor('#64748b');
    doc.font('Helvetica').fontSize(10.5).text('No hay ausencias registradas para este día.', left, doc.y, { width, align: 'left' });
    doc.moveDown(0.8);
    return;
  }

  rows.forEach(row => {
    ensurePageSpace(doc, 72);
    const top = doc.y;

    doc.roundedRect(left, top, width, 54, 10).fillAndStroke('#ffffff', '#dbe3ee');
    doc.fillColor('#111827');
    doc.font('Helvetica-Bold').fontSize(11.5).text(row.ausente, left + 14, top + 10, { width: width - 28 });
    doc.fillColor('#334155');
    doc.font('Helvetica').fontSize(10);
    doc.text(
      `Horas: ${row.horas.map(hora => HORA_MAP[hora] || `Hora ${hora}`).join(' | ')}`,
      left + 14,
      top + 28,
      { width: width - 28 }
    );
    doc.y = top + 64;
  });
}

module.exports = {
  DIAS,
  HORA_MAP,
  drawHeader,
  drawSummary,
  drawWeeklyDayBlock,
  formatReportDate,
  groupRowsByTeacher,
  loadTeacherSubstitutionMap,
  parseDay
};
