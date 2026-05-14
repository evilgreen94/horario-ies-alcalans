const express = require('express');
const PDFDocument = require('pdfkit');
const { getDatabase } = require('../db');
const { requireRole } = require('../session');
const {
  DIAS,
  HORA_MAP,
  drawHeader,
  drawSummary,
  drawWeeklyDayBlock,
  formatReportDate,
  groupRowsByTeacher,
  loadTeacherSubstitutionMap,
  parseDay
} = require('./report/pdf-report');

const router = express.Router();

function buildPdfBuffer(configureDoc) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 44
    });
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    try {
      configureDoc(doc);
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

router.get('/daily.pdf', requireRole('admin'), async (req, res, next) => {
  try {
    const day = parseDay(req.query.day);
    const db = await getDatabase();
    const [rows, substitutionMap] = await Promise.all([
      db.all(
        `SELECT dia, hora, ausente
         FROM ausencias
         WHERE dia = ?
         ORDER BY hora, ausente, id`,
        [day]
      ),
      loadTeacherSubstitutionMap(db)
    ]);

    const groupedRows = groupRowsByTeacher(rows, substitutionMap);
    const fecha = formatReportDate();
    const filename = `informe-guardias-${DIAS[day].toLowerCase()}-${fecha.replace(/\//g, '-')}.pdf`;

    const buffer = await buildPdfBuffer(doc => {
      Object.assign(doc.info, {
        Title: `Parte diario de faltas - ${DIAS[day]}`,
        Author: 'IES Alcalans',
        Subject: 'Faltas del profesorado',
        Keywords: 'guardias, ausencias, profesorado, ies alcalans'
      });

      drawHeader(doc, {
        title: 'Parte diario de faltas del profesorado',
        subtitleLeft: 'IES Alcalans',
        subtitleRight: `Fecha de generación: ${fecha}`,
        dayLabel: `Día lectivo: ${DIAS[day]}`
      });
      drawSummary(doc, groupedRows.length, rows.length);

      doc.fillColor('#111827');
      if (!rows.length) {
        doc.font('Helvetica').fontSize(12).text('No hay ausencias registradas para este día.');
        return;
      }

      groupedRows.forEach((row, index) => {
        const left = doc.page.margins.left;
        const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;

        if (doc.y + 76 >= doc.page.height - doc.page.margins.bottom) {
          doc.addPage();
        }
        const top = doc.y;

        doc.roundedRect(left, top, width, 58, 10).fillAndStroke('#ffffff', '#dbe3ee');
        doc.fillColor('#111827');
        doc.font('Helvetica-Bold').fontSize(12);
        doc.text(`${index + 1}. ${row.ausente}`, left + 14, top + 12, { width: width - 28 });

        doc.fillColor('#334155');
        doc.font('Helvetica').fontSize(10.5);
        doc.text(
          `Horas: ${row.horas.map(hora => HORA_MAP[hora] || `Hora ${hora}`).join(' | ')}`,
          left + 14,
          top + 31,
          { width: width - 28 }
        );

        doc.y = top + 70;
      });
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', String(buffer.length));
    res.end(buffer);
  } catch (error) {
    next(error);
  }
});

router.get('/weekly.pdf', requireRole('admin'), async (_req, res, next) => {
  try {
    const db = await getDatabase();
    const [rows, substitutionMap] = await Promise.all([
      db.all(
        `SELECT dia, hora, ausente
         FROM ausencias
         ORDER BY dia, hora, ausente, id`
      ),
      loadTeacherSubstitutionMap(db)
    ]);

    const groupedByDay = Array.from({ length: 5 }, (_, day) => {
      const dayRows = rows.filter(row => row.dia === day);
      return groupRowsByTeacher(dayRows, substitutionMap);
    });

    const fecha = formatReportDate();
    const totalProfesores = groupedByDay.reduce((sum, dayRows) => sum + dayRows.length, 0);
    const totalTramos = rows.length;
    const filename = `informe-guardias-semanal-${fecha.replace(/\//g, '-')}.pdf`;

    const buffer = await buildPdfBuffer(doc => {
      Object.assign(doc.info, {
        Title: 'Parte semanal de faltas del profesorado',
        Author: 'IES Alcalans',
        Subject: 'Resumen semanal de guardias',
        Keywords: 'guardias, ausencias, profesorado, semana, ies alcalans'
      });

      drawHeader(doc, {
        title: 'Resumen semanal de guardias',
        subtitleLeft: 'IES Alcalans',
        subtitleRight: `Fecha de generación: ${fecha}`,
        dayLabel: 'Semana lectiva completa'
      });
      drawSummary(doc, totalProfesores, totalTramos);

      groupedByDay.forEach((dayRows, dayIndex) => {
        drawWeeklyDayBlock(doc, dayIndex, dayRows);
      });
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', String(buffer.length));
    res.end(buffer);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
