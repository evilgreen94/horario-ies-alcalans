const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const DEFAULT_SOURCE_PATH = path.join(ROOT_DIR, 'json_profes', 'profesorado_horarios_guardias_con_guardias_updated.json');
const OUTPUT_PATH = path.join(ROOT_DIR, 'js', 'data', 'profesorado_horarios_guardias.js');
const IMPORT_XML_PATH = path.join(ROOT_DIR, 'json_profes', 'horario_anual_importado.xml');
const JSON_BACKUP_DIR = path.join(ROOT_DIR, 'json_profes', 'backups');
const JS_BACKUP_DIR = path.join(ROOT_DIR, 'js', 'data', 'backups');

function cleanText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
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

function loadJsonSource(inputPath) {
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

  const teacherNodes = collectNodeMatches(normalizedXml, ['teacher', 'profesor', 'docente'], false);
  if (!teacherNodes.length) {
    throw new Error('El XML no contiene nodos de profesorado reconocibles.');
  }

  const teachers = {};
  for (const teacherNode of teacherNodes) {
    const teacherName = getNodeValue(teacherNode.attrs, teacherNode.body, ['nombre', 'name', 'profesor', 'docente']);
    if (!teacherName) continue;
    const sessionNodes = collectNodeMatches(teacherNode.body, ['session', 'sesion', 'entry', 'row', 'tramo'], true);
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

    if (rows.length) {
      teachers[teacherName] = rows;
    }
  }

  if (!Object.keys(teachers).length) {
    throw new Error('El XML no contiene sesiones válidas para importar.');
  }

  return normalizeInput({
    fuente: rootFuente,
    formato: 'xml_importado',
    teachers
  });
}

function formatStamp() {
  return new Intl.DateTimeFormat('sv-SE', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'Europe/Madrid'
  }).format(new Date()).replace(/[\s:]/g, '-');
}

function backupIfExists(filePath, backupDir) {
  if (!fs.existsSync(filePath)) return null;
  fs.mkdirSync(backupDir, { recursive: true });
  const backupPath = path.join(
    backupDir,
    `${path.basename(filePath, path.extname(filePath))}-${formatStamp()}${path.extname(filePath)}`
  );
  fs.copyFileSync(filePath, backupPath);
  return backupPath;
}

function writeAnnualSourceArtifacts(source, options = {}) {
  const normalizedSource = normalizeInput(source);
  const payload = buildPayload(normalizedSource);
  if (!payload.fuente) payload.fuente = cleanText(options.sourceLabel || 'importado');

  fs.mkdirSync(path.dirname(DEFAULT_SOURCE_PATH), { recursive: true });
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });

  const jsonBackupPath = backupIfExists(DEFAULT_SOURCE_PATH, JSON_BACKUP_DIR);
  const jsBackupPath = backupIfExists(OUTPUT_PATH, JS_BACKUP_DIR);

  fs.writeFileSync(DEFAULT_SOURCE_PATH, `${JSON.stringify(normalizedSource, null, 2)}\n`, 'utf8');
  fs.writeFileSync(OUTPUT_PATH, `window.PROFESORADO_SOURCE=${JSON.stringify(payload, null, 2)};\n`, 'utf8');

  let xmlSnapshotPath = null;
  if (options.xmlText) {
    fs.writeFileSync(IMPORT_XML_PATH, String(options.xmlText), 'utf8');
    xmlSnapshotPath = IMPORT_XML_PATH;
  }

  return {
    payload,
    sourcePath: DEFAULT_SOURCE_PATH,
    outputPath: OUTPUT_PATH,
    xmlSnapshotPath,
    backups: {
      json: jsonBackupPath,
      js: jsBackupPath
    }
  };
}

module.exports = {
  DEFAULT_SOURCE_PATH,
  OUTPUT_PATH,
  IMPORT_XML_PATH,
  buildPayload,
  cleanText,
  loadJsonSource,
  parseAnnualXml,
  writeAnnualSourceArtifacts
};
