const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DEFAULT_SOURCE_PATH = path.join(__dirname, '..', '..', 'json_profes', 'profesorado_horarios_guardias_con_guardias_updated.json');
const OUTPUT_PATH = path.join(__dirname, '..', '..', 'js', 'data', 'profesorado_horarios_guardias.js');

function cleanText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function looksMojibake(value) {
  return /[ÃÂ�]|â€|â€™|â€œ|â€�|â€“|â€”|â€¦/.test(value);
}

function repairMojibake(value) {
  if (typeof value !== 'string' || !value) {
    return value;
  }

  if (!looksMojibake(value)) {
    return value;
  }

  const repaired = Buffer.from(value, 'latin1').toString('utf8');
  if (!repaired || repaired === value || repaired.includes('�')) {
    return value;
  }

  return repaired;
}

function normalizeInput(value) {
  if (typeof value === 'string') {
    return repairMojibake(value);
  }

  if (Array.isArray(value)) {
    return value.map(normalizeInput);
  }

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
    fuente: cleanText(source.fuente) || '',
    formato: 'js_desde_json_limpio',
    datasetId,
    teachers
  };
}

function getRequestedSourcePath() {
  const cliSourceArgIndex = process.argv.findIndex(arg => arg === '--source' || arg === '-s');
  if (cliSourceArgIndex !== -1) {
    const value = process.argv[cliSourceArgIndex + 1];
    if (!value || value.startsWith('-')) {
      throw new Error('Falta el valor de --source.');
    }

    return path.resolve(process.cwd(), value);
  }

  const inlineSourceArg = process.argv.find(arg => arg.startsWith('--source='));
  if (inlineSourceArg) {
    const value = inlineSourceArg.slice('--source='.length);
    if (!value) {
      throw new Error('Falta el valor de --source.');
    }

    return path.resolve(process.cwd(), value);
  }

  return path.resolve(process.cwd(), process.env.ANNUAL_SOURCE_PATH || DEFAULT_SOURCE_PATH);
}

function loadSource(inputPath) {
  if (!fs.existsSync(inputPath)) {
    throw new Error(`No existe la fuente anual indicada: ${inputPath}`);
  }

  const raw = fs.readFileSync(inputPath, 'utf8');
  try {
    return normalizeInput(JSON.parse(raw));
  } catch (error) {
    throw new Error(`La fuente anual indicada no es JSON válido: ${inputPath}\n${error.message}`);
  }
}

function main() {
  const inputPath = getRequestedSourcePath();
  const parsed = loadSource(inputPath);
  const payload = buildPayload(parsed);
  if (!payload.fuente) payload.fuente = path.basename(inputPath);
  const output = `window.PROFESORADO_SOURCE=${JSON.stringify(payload, null, 2)};\n`;

  fs.writeFileSync(OUTPUT_PATH, output, 'utf8');

  console.log('Plantilla anual regenerada correctamente.');
  console.log(`- Fuente anual: ${inputPath}`);
  console.log(`- Destino: ${OUTPUT_PATH}`);
  console.log(`- datasetId: ${payload.datasetId}`);
  console.log(`- Profesores: ${payload.teachers.length}`);
}

main();
