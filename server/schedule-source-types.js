const SOURCE_ACTIVITY_TYPES = Object.freeze({
  GUARDIA: 'guardia',
  GUARDIES: 'guardia',
  'GUARDIA PATI': 'guardia_patio',
  'GUARDIES PATI': 'guardia_patio',
  'BIBLIOTECA PATI': 'biblioteca_patio',
  PATISINC: 'patio_inclusivo',
  'PATIS INCLUSIUS': 'patio_inclusivo'
});

function normalizeSourceActivityLabel(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function sourceActivityType(value) {
  return SOURCE_ACTIVITY_TYPES[normalizeSourceActivityLabel(value)] || null;
}

module.exports = { SOURCE_ACTIVITY_TYPES, normalizeSourceActivityLabel, sourceActivityType };
