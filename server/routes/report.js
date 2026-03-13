const express = require('express');
const path = require('path');
const PDFDocument = require('pdfkit');
const { getDatabase } = require('../db');

const router = express.Router();

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
const LOGO_IES_PATH = path.join(__dirname, '..', '..', 'imagenes', 'logo-ies-alcalans.jpg');
const LOGO_CONSELLERIA_PATH = path.join(__dirname, '..', '..', 'imagenes', 'gv_conselleria_educacion_cmyk_cast-1024x505-2.png');

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

function ensurePageSpace(doc, minHeight = 110) {
  if (doc.y + minHeight < doc.page.height - doc.page.margins.bottom) return;
  doc.addPage();
}

function drawHeader(doc, day, fecha) {
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const top = doc.page.margins.top;
  const left = doc.page.margins.left;
  const right = left + pageWidth;
  const cardHeight = 108;

  doc.roundedRect(left, top, pageWidth, cardHeight, 12).fill('#f8fafc');
  doc.roundedRect(left, top, pageWidth, cardHeight, 12).stroke('#dbe3ee');

  try {
    doc.image(LOGO_IES_PATH, left + 18, top + 20, { fit: [96, 44], align: 'left', valign: 'center' });
  } catch (_error) {}
  try {
    doc.image(LOGO_CONSELLERIA_PATH, right - 170, top + 18, { fit: [150, 46], align: 'right', valign: 'center' });
  } catch (_error) {}

  doc.fillColor('#0f172a');
  doc.font('Helvetica-Bold').fontSize(23).text('Parte diario de faltas', left + 142, top + 18, {
    width: pageWidth - 330,
    lineBreak: false
  });
  doc.font('Helvetica-Bold').fontSize(23).text('del profesorado', left + 142, top + 44, {
    width: pageWidth - 330,
    lineBreak: false
  });
  doc.font('Helvetica').fontSize(10.5).fillColor('#64748b');
  doc.text('IES Alcalans', left + 142, top + 76, { lineBreak: false });
  doc.font('Helvetica').fontSize(11).fillColor('#334155');
  doc.text(`Día lectivo: ${DIAS[day]}`, left + 142, top + 91, { lineBreak: false });
  doc.text(`Fecha de generación: ${fecha}`, right - 178, top + 91, {
    width: 160,
    align: 'right',
    lineBreak: false
  });
  doc.fillColor('#111827');
  doc.y = top + cardHeight + 18;
}

router.get('/daily.pdf', async (req, res, next) => {
  try {
    const day = parseDay(req.query.day);
    const db = await getDatabase();
    const rows = await db.all(
      `SELECT dia, hora, ausente, guardia, aula, faena, obs
       FROM ausencias
       WHERE dia = ?
       ORDER BY hora, ausente, id`,
      [day]
    );
    const groupedRows = Array.from(
      rows.reduce((map, row) => {
        const key = row.ausente || 'Profesorado sin identificar';
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(row.hora);
        return map;
      }, new Map()).entries()
    ).map(([ausente, horas]) => ({
      ausente,
      horas: [...new Set(horas)].sort((a, b) => a - b)
    })).sort((a, b) => a.ausente.localeCompare(b.ausente, 'es'));

    const fecha = formatReportDate();
    const filename = `informe-guardias-${DIAS[day].toLowerCase()}-${fecha.replace(/\//g, '-')}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const doc = new PDFDocument({
      size: 'A4',
      margin: 44,
      info: {
        Title: `Informe diario de guardias - ${DIAS[day]}`,
        Author: 'IES Alcalans',
        Subject: 'Faltas del profesorado',
        Keywords: 'guardias, ausencias, profesorado, ies alcalans'
      }
    });

    doc.pipe(res);
    drawHeader(doc, day, fecha);
    doc.fontSize(11).font('Helvetica').fillColor('#475569');
    doc.text(`Profesores ausentes registrados: ${groupedRows.length}`);
    doc.text(`Tramos horarios afectados: ${rows.length}`);
    doc.moveDown(0.85);
    doc.fillColor('#111827');

    if (!rows.length) {
      doc.fontSize(12).font('Helvetica').text('No hay ausencias registradas para este día.');
      doc.end();
      return;
    }

    groupedRows.forEach((row, index) => {
      ensurePageSpace(doc, 78);

      const cardHeight = 58;
      const cardTop = doc.y;
      const left = doc.page.margins.left;
      const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;

      doc.roundedRect(left, cardTop, width, cardHeight, 10).fillAndStroke('#ffffff', '#dbe3ee');
      doc.fillColor('#111827');
      doc.font('Helvetica-Bold').fontSize(12);
      doc.text(`${index + 1}. ${row.ausente}`, left + 14, cardTop + 12, { width: width - 28 });
      doc.font('Helvetica').fontSize(10.5).fillColor('#334155');
      doc.text(
        `Horas: ${row.horas.map(hora => HORA_MAP[hora] || `Hora ${hora}`).join(' · ')}`,
        left + 14,
        cardTop + 31,
        { width: width - 28 }
      );
      doc.y = cardTop + cardHeight + 12;
    });

    doc.end();
  } catch (error) {
    next(error);
  }
});

module.exports = router;
