const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const INPUT_PATH = path.join(__dirname, '..', '..', 'json_profes', 'profesorado_horarios_guardias_limpio.json');
const OUTPUT_PATH = path.join(__dirname, '..', '..', 'js', 'data', 'profesorado_horarios_guardias.js');

function cleanText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
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
  const teacherEntries = Object.entries(source.teachers || {});
  const teachers = teacherEntries.map(([nombre, rows]) => {
    const horario = (Array.isArray(rows) ? rows : []).map(toLegacyEntry);
    const guardias = horario.filter(row => cleanText(row.texto).toUpperCase() === 'GUARDIA');

    return {
      nombre: cleanText(nombre),
      horario,
      guardias
    };
  });

  const datasetId = crypto
    .createHash('sha1')
    .update(JSON.stringify(source))
    .digest('hex')
    .slice(0, 12);

  return {
    fuente: cleanText(source.fuente) || path.basename(INPUT_PATH),
    formato: 'js_desde_json_limpio',
    datasetId,
    teachers
  };
}

function main() {
  const raw = fs.readFileSync(INPUT_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  const payload = buildPayload(parsed);
  const output = `window.PROFESORADO_SOURCE=${JSON.stringify(payload, null, 2)};\n`;

  fs.writeFileSync(OUTPUT_PATH, output, 'utf8');

  console.log('Plantilla anual regenerada correctamente.');
  console.log(`- Origen: ${INPUT_PATH}`);
  console.log(`- Destino: ${OUTPUT_PATH}`);
  console.log(`- datasetId: ${payload.datasetId}`);
  console.log(`- Profesores: ${payload.teachers.length}`);
}

main();
