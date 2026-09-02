const crypto = require('crypto');

const BASE_URL = process.env.GUARDIAS_BASE_URL || 'http://127.0.0.1:3000';
const SAMPLE_COUNT = Math.max(2, Number.parseInt(process.env.GUARDIAS_STABILITY_SAMPLES || '12', 10) || 12);
const SAMPLE_INTERVAL_MS = Math.max(100, Number.parseInt(process.env.GUARDIAS_STABILITY_INTERVAL_MS || '1000', 10) || 1000);

function getFetch() {
  if (typeof fetch === 'function') return fetch;
  throw new Error('Global fetch is not available in this Node version.');
}

function joinUrl(pathname) {
  return new URL(pathname, BASE_URL).toString();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function buildGuardiasSnapshot(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map(row => ({
      dia: Number(row?.dia),
      hora: Number(row?.hora),
      ausente: String(row?.ausente || '').trim(),
      guardia: String(row?.guardia || '').trim(),
      aula: String(row?.aula || '').trim(),
      faena: !!row?.faena,
      obs: String(row?.obs || '').trim()
    }))
    .sort((a, b) =>
      a.dia - b.dia ||
      a.hora - b.hora ||
      normalizeText(a.ausente).localeCompare(normalizeText(b.ausente), 'es') ||
      normalizeText(a.guardia).localeCompare(normalizeText(b.guardia), 'es') ||
      a.aula.localeCompare(b.aula, 'es') ||
      a.obs.localeCompare(b.obs, 'es')
    );
}

function buildGuardiasHash(rows) {
  return crypto
    .createHash('sha1')
    .update(JSON.stringify(buildGuardiasSnapshot(rows)))
    .digest('hex');
}

function detectDuplicateLogicRows(rows) {
  const seen = new Set();
  const duplicates = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const key = `${Number(row?.dia)}|${Number(row?.hora)}|${normalizeText(row?.ausente)}`;
    if (seen.has(key)) {
      duplicates.push(key);
      continue;
    }
    seen.add(key);
  }
  return duplicates;
}

async function requestJson(pathname) {
  const response = await getFetch()(joinUrl(pathname), { redirect: 'manual' }).catch(error => {
    throw new Error(`Request to ${pathname} failed: ${error.message}`);
  });
  const body = await response.json().catch(() => null);
  return { response, body };
}

async function main() {
  const health = await requestJson('/api/health');
  if (health.response.status !== 200 || !health.body?.ok) {
    throw new Error(`Healthcheck failed with status ${health.response.status}`);
  }

  const samples = [];

  for (let index = 0; index < SAMPLE_COUNT; index += 1) {
    const startedAt = Date.now();
    const { response, body } = await requestJson('/api/guardias');
    if (response.status !== 200 || !Array.isArray(body)) {
      throw new Error(`GET /api/guardias expected 200 with array, got ${response.status}`);
    }

    const duplicates = detectDuplicateLogicRows(body);
    const hash = buildGuardiasHash(body);
    samples.push({
      index: index + 1,
      total: body.length,
      hash,
      duplicates,
      elapsedMs: Date.now() - startedAt
    });

    if (index < SAMPLE_COUNT - 1) {
      await sleep(SAMPLE_INTERVAL_MS);
    }
  }

  const distinctHashes = [...new Set(samples.map(sample => sample.hash))];
  const distinctTotals = [...new Set(samples.map(sample => sample.total))];
  const duplicateKeys = [...new Set(samples.flatMap(sample => sample.duplicates))];

  console.log('Guardias stability report');
  samples.forEach(sample => {
    console.log(
      `- sample ${sample.index}: total=${sample.total} hash=${sample.hash} duplicates=${sample.duplicates.length} (${sample.elapsedMs}ms)`
    );
  });

  if (duplicateKeys.length > 0) {
    throw new Error(`Duplicate logical absence rows detected: ${duplicateKeys.join(', ')}`);
  }

  if (distinctHashes.length > 1) {
    throw new Error(`Guardias changed without interaction. Totals seen: ${distinctTotals.join(', ')}`);
  }

  console.log(`Guardias stable across ${SAMPLE_COUNT} samples (${SAMPLE_INTERVAL_MS}ms interval)`);
}

main().catch(error => {
  console.error('Guardias stability check failed');
  console.error(error.message);
  process.exit(1);
});
