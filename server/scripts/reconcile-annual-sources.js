const fs = require('fs');
const path = require('path');
const { parseGhcXml } = require('../ghc-xml-import');
const { extractCanonicalScheduleFromPdf } = require('../pdf-schedule-import');

function valueAfter(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? String(args[index + 1] || '').trim() : '';
}

function requiredFile(args, name) {
  const value = valueAfter(args, `--${name}`);
  if (!value) throw new Error(`Falta --${name}.`);
  const resolved = path.resolve(value);
  if (!fs.statSync(resolved).isFile()) throw new Error(`${name} no es un fichero.`);
  return resolved;
}

function countBy(rows, keyOf) {
  const counts = {};
  for (const row of rows) {
    const key = keyOf(row);
    counts[key] = (counts[key] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

function slotKey(row) {
  return `${row.teacher_source_code}|${row.weekday}|${row.period_key}`;
}

function periodSignature(row) {
  return `${row.key}|${row.position}|${row.type}|${row.starts_at}|${row.ends_at}`;
}

function reconcile(xml, pdf) {
  const xmlSlots = new Map(xml.sessions.map(row => [slotKey(row), row]));
  const pdfSlots = new Map(pdf.sessions.map(row => [slotKey(row), row]));
  const shared = [...xmlSlots.keys()].filter(key => pdfSlots.has(key));
  const xmlOnly = [...xmlSlots.entries()].filter(([key]) => !pdfSlots.has(key)).map(([, row]) => row);
  const pdfOnly = [...pdfSlots.entries()].filter(([key]) => !xmlSlots.has(key)).map(([, row]) => row);
  const xmlTeachers = new Set(xml.teacher_source_codes);
  const pdfTeachers = new Set(pdf.teacher_source_codes);
  return {
    periodsEqual: xml.periods.map(periodSignature).join('\n') === pdf.periods.map(periodSignature).join('\n'),
    teachers: {
      xml: xmlTeachers.size,
      pdf: pdfTeachers.size,
      xmlOnly: [...xmlTeachers].filter(code => !pdfTeachers.has(code)).sort(),
      pdfOnly: [...pdfTeachers].filter(code => !xmlTeachers.has(code)).sort()
    },
    sessions: {
      xml: xml.sessions.length,
      pdf: pdf.sessions.length,
      shared: shared.length,
      xmlOnly: xmlOnly.length,
      pdfOnly: pdfOnly.length,
      xmlOnlyByType: countBy(xmlOnly, row => row.type),
      pdfOnlyByType: countBy(pdfOnly, row => row.type),
      sharedTypeMatrix: countBy(shared, key => `${pdfSlots.get(key).type} -> ${xmlSlots.get(key).type}`)
    }
  };
}

function main() {
  const args = process.argv.slice(2);
  const xmlPath = requiredFile(args, 'xml');
  const pdfPath = requiredFile(args, 'pdf');
  const censusPath = requiredFile(args, 'census');
  const academicYear = valueAfter(args, '--academic-year');
  if (!academicYear) throw new Error('Falta --academic-year.');
  const xml = parseGhcXml(fs.readFileSync(xmlPath), {
    academicYear,
    sourceLabel: path.basename(xmlPath)
  }).canonical;
  const pdf = extractCanonicalScheduleFromPdf(
    fs.readFileSync(pdfPath),
    JSON.parse(fs.readFileSync(censusPath, 'utf8')),
    { expectedTeacherCount: 88 }
  ).dataset;
  console.log(JSON.stringify(reconcile(xml, pdf), null, 2));
}

if (require.main === module) {
  try { main(); } catch (error) {
    console.error(error.message || error);
    process.exitCode = 1;
  }
}

module.exports = { reconcile, slotKey };
