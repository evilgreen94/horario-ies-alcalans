const fs = require('fs');
const path = require('path');

const SOURCE_PATH = path.join(__dirname, '..', 'js', 'data', 'profesorado_horarios_guardias.js');

let cachedSource = null;
let cachedSourceMtimeMs = -1;
let cachedGroups = [];

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

function normalizeGroupKey(value) {
  return normalizeText(value)
    .replace(/[º°ª]/g, '')
    .replace(/\bbachillerato\b/g, 'bach')
    .replace(/\bformacion profesional basica\b/g, 'fpb')
    .replace(/\bformacion profesional\b/g, 'fp')
    .replace(/[^a-z0-9]+/g, '');
}

function loadTeacherSource() {
  const stat = fs.statSync(SOURCE_PATH);
  if (cachedSource && cachedSourceMtimeMs === stat.mtimeMs) return cachedSource;
  const raw = fs.readFileSync(SOURCE_PATH, 'utf8').trim();
  const prefix = 'window.PROFESORADO_SOURCE=';
  if (!raw.startsWith(prefix)) {
    throw new Error(`Formato no reconocido en ${SOURCE_PATH}`);
  }
  const payload = JSON.parse(raw.slice(prefix.length).replace(/;$/, ''));
  cachedSource = payload;
  cachedSourceMtimeMs = stat.mtimeMs;
  cachedGroups = [];
  return payload;
}

function detectGroupsFromSource() {
  if (cachedGroups.length) return cachedGroups.slice();
  const payload = loadTeacherSource();
  const groups = new Map();
  (payload?.teachers || []).forEach(teacher => {
    (teacher?.horario || []).forEach(entry => {
      const texto = cleanText(entry?.texto);
      if (!texto || normalizeText(texto).includes('guardia')) return;
      const parts = texto.split('|').map(part => cleanText(part)).filter(Boolean);
      const grupo = parts.length >= 3 ? parts[1] : '';
      if (!grupo) return;
      const key = normalizeText(grupo);
      if (!key || groups.has(key)) return;
      groups.set(key, grupo);
    });
  });
  cachedGroups = [...groups.values()].sort((a, b) => a.localeCompare(b, 'es'));
  return cachedGroups.slice();
}

async function ensureGroupsSynced(db) {
  const detectedGroups = detectGroupsFromSource();
  const existingRows = await db.all('SELECT grupo, activo, updated_at FROM grupos_estado ORDER BY grupo COLLATE NOCASE');
  const existingByRaw = new Map(existingRows.map(row => [cleanText(row.grupo), row]));
  const existingByKey = new Map(existingRows.map(row => [normalizeGroupKey(row.grupo), row]).filter(([key]) => key));

  for (const grupo of detectedGroups) {
    const rawName = cleanText(grupo);
    if (existingByRaw.has(rawName)) continue;
    const groupKey = normalizeGroupKey(rawName);
    const aliasedRow = existingByKey.get(groupKey);
    if (aliasedRow && cleanText(aliasedRow.grupo) !== rawName) {
      await db.run(
        `UPDATE grupos_estado
         SET grupo = ?, updated_at = CURRENT_TIMESTAMP
         WHERE grupo = ?`,
        [rawName, aliasedRow.grupo]
      );
      existingByRaw.delete(cleanText(aliasedRow.grupo));
      existingByRaw.set(rawName, { ...aliasedRow, grupo: rawName });
      existingByKey.set(groupKey, { ...aliasedRow, grupo: rawName });
      continue;
    }
    await db.run(
      `INSERT INTO grupos_estado (grupo, activo, updated_at)
       VALUES (?, 1, CURRENT_TIMESTAMP)
       ON CONFLICT(grupo) DO NOTHING`,
      [rawName]
    );
    existingByRaw.set(rawName, { grupo: rawName, activo: 1, updated_at: '' });
    if (groupKey) existingByKey.set(groupKey, { grupo: rawName, activo: 1, updated_at: '' });
  }
  return detectedGroups;
}

function logInactiveGroupSkip(details = {}) {
  try {
    console.info(`[grupos] grupo inactivo skip ${JSON.stringify(details)}`);
  } catch (_error) {
    console.info('[grupos] grupo inactivo skip');
  }
}

async function listGroupStates(db) {
  await ensureGroupsSynced(db);
  const rows = await db.all('SELECT grupo, activo, updated_at FROM grupos_estado ORDER BY grupo COLLATE NOCASE');
  return rows.map(row => ({
    grupo: cleanText(row.grupo),
    activo: !!row.activo,
    updated_at: cleanText(row.updated_at)
  }));
}

async function updateGroupState(db, grupo, activo) {
  const groupName = cleanText(grupo);
  if (!groupName) {
    const error = new Error('grupo es obligatorio.');
    error.status = 400;
    throw error;
  }
  await ensureGroupsSynced(db);
  await db.run(
    `INSERT INTO grupos_estado (grupo, activo, updated_at)
     VALUES (?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(grupo) DO UPDATE SET activo = excluded.activo, updated_at = CURRENT_TIMESTAMP`,
    [groupName, activo ? 1 : 0]
  );
  const row = await db.get('SELECT grupo, activo, updated_at FROM grupos_estado WHERE grupo = ?', [groupName]);
  return {
    grupo: cleanText(row?.grupo || groupName),
    activo: !!row?.activo,
    updated_at: cleanText(row?.updated_at)
  };
}

async function getInactiveGroupSet(db) {
  await ensureGroupsSynced(db);
  const rows = await db.all('SELECT grupo FROM grupos_estado WHERE activo = 0 ORDER BY grupo COLLATE NOCASE');
  return new Set(rows.map(row => normalizeText(row.grupo)).filter(Boolean));
}

function isGroupInactive(grupo, inactiveGroupSet) {
  const normalized = normalizeText(grupo);
  if (!normalized) return false;
  return inactiveGroupSet instanceof Set ? inactiveGroupSet.has(normalized) : false;
}

module.exports = {
  cleanText,
  detectGroupsFromSource,
  ensureGroupsSynced,
  getInactiveGroupSet,
  isGroupInactive,
  listGroupStates,
  logInactiveGroupSkip,
  normalizeGroupKey,
  normalizeText,
  updateGroupState
};
