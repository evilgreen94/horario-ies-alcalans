const crypto = require('crypto');
const { withImmediateTransaction } = require('./db');

const ACADEMIC_YEAR_STATUSES = new Set(['preparation', 'active', 'archived']);
const DATASET_STATUSES = new Set(['draft', 'validated', 'active', 'archived']);
const PERIOD_TYPES = new Set(['teaching', 'break']);
const SESSION_TYPES = new Set(['class', 'guardia', 'meeting', 'other']);
const WEEKDAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];

function cleanText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function requiredText(value, field) {
  const text = cleanText(value);
  if (!text) throw new Error(`${field} is required.`);
  return text;
}

function normalizeAcademicYearCode(value) {
  const code = requiredText(value, 'academic_year').replace('-', '/');
  const match = /^(\d{4})\/(\d{2}|\d{4})$/.exec(code);
  if (!match) throw new Error('academic_year must use YYYY/YY format.');
  const startYear = Number(match[1]);
  const endYear = match[2].length === 2 ? Number(String(startYear).slice(0, 2) + match[2]) : Number(match[2]);
  if (endYear !== startYear + 1) throw new Error('academic_year must cover consecutive years.');
  return `${startYear}/${String(endYear).slice(-2)}`;
}

function academicYearDates(code) {
  const startYear = Number(normalizeAcademicYearCode(code).slice(0, 4));
  return { startsOn: `${startYear}-09-01`, endsOn: `${startYear + 1}-08-31` };
}

function normalizeTime(value, field) {
  const text = cleanText(value);
  const match = /^(\d{1,2}):(\d{2})$/.exec(text);
  if (!match) throw new Error(`${field} must use HH:MM format.`);
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) throw new Error(`${field} is not a valid time.`);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function normalizeSourceSystem(value) {
  return requiredText(value, 'source_system').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normalizeExternalKey(value) {
  const key = requiredText(value, 'source_code').toUpperCase();
  if (!/^[A-Z0-9_-]{2,64}$/.test(key)) throw new Error(`Invalid source_code "${key}".`);
  return key;
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function fingerprint(value) {
  return crypto.createHash('sha256').update(stableStringify(value)).digest('hex');
}

function validateTeacherCensus(payload, options = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Census must be an object.');
  const academicYear = normalizeAcademicYearCode(payload.academic_year);
  const sourceSystem = normalizeSourceSystem(payload.source_system || 'Penalara');
  const sourceFormat = cleanText(options.sourceFormat || 'json').toLowerCase();
  const rows = payload.teachers;
  if (!Array.isArray(rows) || !rows.length) throw new Error('Census teachers must be a non-empty array.');
  if (Number(payload.teacher_count) !== rows.length) throw new Error('Census teacher_count does not match teachers length.');
  if (options.expectedCount != null && rows.length !== Number(options.expectedCount)) {
    throw new Error(`Expected ${options.expectedCount} teachers, found ${rows.length}.`);
  }

  const codes = new Set();
  const teachers = rows.map((row, index) => {
    const sourceCode = normalizeExternalKey(row?.source_code);
    if (codes.has(sourceCode)) throw new Error(`Duplicate source_code "${sourceCode}".`);
    codes.add(sourceCode);
    const displayName = requiredText(row?.display_name, `teachers[${index}].display_name`);
    if (typeof row?.active !== 'boolean') throw new Error(`teachers[${index}].active must be boolean.`);
    return { sourceCode, displayName, active: row.active };
  }).sort((left, right) => left.sourceCode.localeCompare(right.sourceCode, 'en'));

  return {
    schemaVersion: Number(payload.schema_version || 1),
    academicYear,
    sourceSystem,
    sourceFormat,
    teachers,
    fingerprint: fingerprint({ academicYear, sourceSystem, sourceFormat, teachers })
  };
}

async function ensureAcademicYear(db, code, status = 'preparation') {
  const normalizedCode = normalizeAcademicYearCode(code);
  if (!ACADEMIC_YEAR_STATUSES.has(status)) throw new Error(`Invalid academic year status "${status}".`);
  const dates = academicYearDates(normalizedCode);
  await db.run(
    `INSERT INTO academic_years (code, starts_on, ends_on, status)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(code) DO UPDATE SET
       starts_on = excluded.starts_on,
       ends_on = excluded.ends_on,
       updated_at = CURRENT_TIMESTAMP`,
    [normalizedCode, dates.startsOn, dates.endsOn, status]
  );
  return db.get('SELECT * FROM academic_years WHERE code = ?', [normalizedCode]);
}

async function importTeacherProfiles(db, payload, options = {}) {
  const census = validateTeacherCensus(payload, options);
  return withImmediateTransaction(db, async () => {
    const academicYear = await ensureAcademicYear(db, census.academicYear, 'preparation');
    let created = 0;
    let updated = 0;

    for (const teacher of census.teachers) {
      const existing = await db.get(
        `SELECT profile.id
         FROM teacher_external_identities identity
         JOIN teacher_profiles profile ON profile.id = identity.teacher_profile_id
         WHERE identity.academic_year_id = ?
           AND identity.source_system = ?
           AND identity.source_format = ?
           AND identity.external_key = ? COLLATE NOCASE`,
        [academicYear.id, census.sourceSystem, census.sourceFormat, teacher.sourceCode]
      );
      if (existing) {
        await db.run(
          `UPDATE teacher_profiles
           SET display_name = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [teacher.displayName, teacher.active ? 1 : 0, existing.id]
        );
        updated += 1;
        continue;
      }

      const result = await db.run(
        `INSERT INTO teacher_profiles (academic_year_id, schedule_key, display_name, is_active)
         VALUES (?, NULL, ?, ?)`,
        [academicYear.id, teacher.displayName, teacher.active ? 1 : 0]
      );
      await db.run(
        `INSERT INTO teacher_external_identities
          (teacher_profile_id, academic_year_id, source_system, source_format, external_key)
         VALUES (?, ?, ?, ?, ?)`,
        [result.lastID, academicYear.id, census.sourceSystem, census.sourceFormat, teacher.sourceCode]
      );
      created += 1;
    }

    return {
      academicYearId: academicYear.id,
      academicYear: census.academicYear,
      sourceSystem: census.sourceSystem,
      sourceFormat: census.sourceFormat,
      fingerprint: census.fingerprint,
      total: census.teachers.length,
      created,
      updated
    };
  }, { label: `teacher-census:${census.academicYear}` });
}

function validateCanonicalSchedule(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Schedule dataset must be an object.');
  const academicYear = normalizeAcademicYearCode(payload.academic_year);
  const sourceSystem = normalizeSourceSystem(payload.source?.system || 'Penalara');
  const sourceFormat = requiredText(payload.source?.format, 'source.format').toLowerCase();
  if (!['pdf', 'xml', 'json', 'manual', 'test'].includes(sourceFormat)) throw new Error('Unsupported schedule source format.');
  const periodsInput = payload.periods;
  const sessionsInput = payload.sessions;
  if (!Array.isArray(periodsInput) || !periodsInput.length) throw new Error('Schedule periods must be a non-empty array.');
  if (!Array.isArray(sessionsInput)) throw new Error('Schedule sessions must be an array.');

  const periodKeys = new Set();
  const positions = new Set();
  const periods = periodsInput.map((row, index) => {
    const key = requiredText(row?.key, `periods[${index}].key`);
    const position = Number(row?.position);
    const type = cleanText(row?.type).toLowerCase();
    const startsAt = normalizeTime(row?.starts_at, `periods[${index}].starts_at`);
    const endsAt = normalizeTime(row?.ends_at, `periods[${index}].ends_at`);
    if (!Number.isInteger(position) || position < 0) throw new Error(`periods[${index}].position must be non-negative.`);
    if (!PERIOD_TYPES.has(type)) throw new Error(`Invalid period type "${type}".`);
    if (endsAt <= startsAt) throw new Error(`Period "${key}" must end after it starts.`);
    if (periodKeys.has(key) || positions.has(position)) throw new Error(`Duplicate schedule period "${key}" or position ${position}.`);
    periodKeys.add(key);
    positions.add(position);
    return { key, position, type, label: cleanText(row?.label), startsAt, endsAt };
  }).sort((left, right) => left.position - right.position);
  if (!periods.some(period => period.type === 'break')) throw new Error('Schedule must define breaks explicitly.');

  const sessions = [];
  const slotKeys = new Set();
  const teacherCodes = new Set();
  const countsByType = Object.fromEntries([...SESSION_TYPES].map(type => [type, 0]));
  for (let index = 0; index < sessionsInput.length; index += 1) {
    const row = sessionsInput[index];
    const teacherSourceCode = normalizeExternalKey(row?.teacher_source_code);
    const weekday = Number(row?.weekday);
    const periodKey = requiredText(row?.period_key, `sessions[${index}].period_key`);
    const type = cleanText(row?.type).toLowerCase();
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 4) throw new Error(`Invalid weekday at sessions[${index}].`);
    if (!periodKeys.has(periodKey)) throw new Error(`Unknown period_key "${periodKey}".`);
    if (!SESSION_TYPES.has(type)) throw new Error(`Invalid session type "${type}".`);
    const slotKey = `${teacherSourceCode}|${weekday}|${periodKey}`;
    if (slotKeys.has(slotKey)) throw new Error(`Conflicting session at ${slotKey}.`);
    slotKeys.add(slotKey);
    teacherCodes.add(teacherSourceCode);
    countsByType[type] += 1;
    sessions.push({
      teacherSourceCode,
      weekday,
      periodKey,
      type,
      subject: cleanText(row?.subject),
      group: cleanText(row?.group),
      room: cleanText(row?.room),
      label: cleanText(row?.label),
      sourceRef: cleanText(row?.source_ref)
    });
  }
  sessions.sort((left, right) =>
    left.teacherSourceCode.localeCompare(right.teacherSourceCode, 'en') ||
    left.weekday - right.weekday ||
    periods.find(period => period.key === left.periodKey).position - periods.find(period => period.key === right.periodKey).position
  );
  const rosterCodes = Array.isArray(payload.teacher_source_codes)
    ? payload.teacher_source_codes.map(normalizeExternalKey)
    : [...teacherCodes];
  const teacherSourceCodes = [...new Set(rosterCodes)].sort((left, right) => left.localeCompare(right, 'en'));
  for (const code of teacherCodes) {
    if (!teacherSourceCodes.includes(code)) throw new Error(`Session teacher "${code}" is missing from dataset roster.`);
  }

  const normalized = {
    schemaVersion: Number(payload.schema_version || 1),
    academicYear,
    label: requiredText(payload.label, 'label'),
    source: { system: sourceSystem, format: sourceFormat, provisional: !!payload.source?.provisional },
    teacherSourceCodes,
    periods,
    sessions
  };
  return {
    ...normalized,
    fingerprint: fingerprint(normalized),
    report: {
      valid: true,
      periods: periods.length,
      breaks: periods.filter(period => period.type === 'break').length,
      sessions: sessions.length,
      teachersCovered: teacherSourceCodes.length,
      countsByType,
      anomalies: Array.isArray(payload.anomalies) ? payload.anomalies.map(cleanText).filter(Boolean) : []
    }
  };
}

async function resolveProfileMap(db, academicYearId, sourceSystem) {
  const rows = await db.all(
    `SELECT identity.external_key, identity.id AS identity_id, profile.id AS profile_id
     FROM teacher_external_identities identity
     JOIN teacher_profiles profile ON profile.id = identity.teacher_profile_id
     WHERE identity.academic_year_id = ?
       AND identity.source_system = ?
       AND profile.is_active = 1`,
    [academicYearId, sourceSystem]
  );
  return new Map(rows.map(row => [String(row.external_key).toUpperCase(), {
    profileId: row.profile_id,
    identityId: row.identity_id
  }]));
}

async function importScheduleDataset(db, payload) {
  const dataset = validateCanonicalSchedule(payload);
  return withImmediateTransaction(db, async () => {
    const academicYear = await ensureAcademicYear(db, dataset.academicYear, 'preparation');
    const profileMap = await resolveProfileMap(db, academicYear.id, dataset.source.system);
    const missingCodes = dataset.teacherSourceCodes.filter(code => !profileMap.has(code));
    if (missingCodes.length) throw new Error(`Schedule references unknown teacher codes: ${missingCodes.join(', ')}.`);

    let row = await db.get(
      'SELECT * FROM schedule_datasets WHERE academic_year_id = ? AND source_fingerprint = ?',
      [academicYear.id, dataset.fingerprint]
    );
    if (row?.status === 'active') {
      return { datasetId: row.id, status: row.status, reused: true, report: JSON.parse(row.validation_report_json) };
    }
    if (!row) {
      const inserted = await db.run(
        `INSERT INTO schedule_datasets
          (academic_year_id, label, source_system, source_format, source_fingerprint, status)
         VALUES (?, ?, ?, ?, ?, 'draft')`,
        [academicYear.id, dataset.label, dataset.source.system, dataset.source.format, dataset.fingerprint]
      );
      row = { id: inserted.lastID };
    } else {
      await db.run('DELETE FROM teacher_schedule_sessions WHERE dataset_id = ?', [row.id]);
      await db.run('DELETE FROM schedule_dataset_teachers WHERE dataset_id = ?', [row.id]);
      await db.run('DELETE FROM schedule_periods WHERE dataset_id = ?', [row.id]);
      await db.run(
        `UPDATE schedule_datasets SET label = ?, source_system = ?, source_format = ?, status = 'draft',
          validation_report_json = '{}', validated_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [dataset.label, dataset.source.system, dataset.source.format, row.id]
      );
    }

    const periodIds = new Map();
    for (const period of dataset.periods) {
      const inserted = await db.run(
        `INSERT INTO schedule_periods
          (dataset_id, period_key, position, period_type, label, starts_at, ends_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [row.id, period.key, period.position, period.type, period.label, period.startsAt, period.endsAt]
      );
      periodIds.set(period.key, inserted.lastID);
    }
    for (const sourceCode of dataset.teacherSourceCodes) {
      const teacherIdentity = profileMap.get(sourceCode);
      await db.run(
        `INSERT INTO schedule_dataset_teachers
          (dataset_id, teacher_profile_id, teacher_external_identity_id)
         VALUES (?, ?, ?)`,
        [row.id, teacherIdentity.profileId, teacherIdentity.identityId]
      );
    }
    for (const session of dataset.sessions) {
      const teacherIdentity = profileMap.get(session.teacherSourceCode);
      await db.run(
        `INSERT INTO teacher_schedule_sessions
          (dataset_id, teacher_profile_id, teacher_external_identity_id, period_id, weekday, session_type, subject, group_code, room, label, source_ref)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.id,
          teacherIdentity.profileId,
          teacherIdentity.identityId,
          periodIds.get(session.periodKey),
          session.weekday,
          session.type,
          session.subject,
          session.group,
          session.room,
          session.label,
          session.sourceRef
        ]
      );
    }
    await db.run(
      `UPDATE schedule_datasets
       SET status = 'validated', validation_report_json = ?, validated_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [JSON.stringify(dataset.report), row.id]
    );
    return { datasetId: row.id, status: 'validated', reused: false, report: dataset.report };
  }, { label: `schedule-import:${dataset.academicYear}` });
}

async function activateScheduleDataset(db, datasetId) {
  const id = Number(datasetId);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('datasetId must be a positive integer.');
  return withImmediateTransaction(db, async () => {
    const dataset = await db.get('SELECT * FROM schedule_datasets WHERE id = ?', [id]);
    if (!dataset) throw new Error('Schedule dataset not found.');
    if (!['validated', 'active'].includes(dataset.status)) throw new Error('Only a validated dataset can be activated.');
    let validationReport;
    try {
      validationReport = JSON.parse(dataset.validation_report_json);
    } catch (_error) {
      validationReport = null;
    }
    const structure = await db.get(
      `SELECT
         COUNT(DISTINCT period.id) AS periods,
         COUNT(DISTINCT CASE WHEN period.period_type = 'teaching' THEN period.id END) AS teaching_periods,
         COUNT(DISTINCT CASE WHEN period.period_type = 'break' THEN period.id END) AS breaks,
         COUNT(DISTINCT session.id) AS sessions,
         (SELECT COUNT(*) FROM schedule_dataset_teachers roster WHERE roster.dataset_id = ?) AS teachers
       FROM schedule_periods period
       LEFT JOIN teacher_schedule_sessions session ON session.dataset_id = period.dataset_id
       WHERE period.dataset_id = ?`,
      [id, id]
    );
    if (!validationReport?.valid || !structure?.periods || !structure?.teaching_periods || !structure?.breaks || !structure?.sessions || !structure?.teachers) {
      throw new Error('Schedule dataset is not structurally valid for activation.');
    }
    await db.run("UPDATE schedule_datasets SET status = 'archived', updated_at = CURRENT_TIMESTAMP WHERE status = 'active' AND id <> ?", [id]);
    await db.run("UPDATE academic_years SET status = 'archived', updated_at = CURRENT_TIMESTAMP WHERE status = 'active' AND id <> ?", [dataset.academic_year_id]);
    await db.run("UPDATE academic_years SET status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [dataset.academic_year_id]);
    await db.run("UPDATE schedule_datasets SET status = 'active', activated_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [id]);
    return db.get(
      `SELECT dataset.id, dataset.label, dataset.status, year.code AS academic_year
       FROM schedule_datasets dataset JOIN academic_years year ON year.id = dataset.academic_year_id
       WHERE dataset.id = ?`,
      [id]
    );
  }, { label: `schedule-activate:${id}` });
}

function noActiveDatasetError() {
  const error = new Error('No hay un dataset horario activo y validado.');
  error.status = 503;
  error.code = 'SCHEDULE_DATASET_UNAVAILABLE';
  return error;
}

async function getActiveDatasetRow(db) {
  const row = await db.get(
    `SELECT dataset.*, year.code AS academic_year
     FROM schedule_datasets dataset
     JOIN academic_years year ON year.id = dataset.academic_year_id AND year.status = 'active'
     WHERE dataset.status = 'active'
     ORDER BY dataset.activated_at DESC, dataset.id DESC
     LIMIT 1`
  );
  if (!row) throw noActiveDatasetError();
  return row;
}

async function loadCanonicalDataset(db) {
  const dataset = await getActiveDatasetRow(db);
  const periods = await db.all(
    `SELECT id, period_key, position, period_type, label, starts_at, ends_at
     FROM schedule_periods WHERE dataset_id = ? ORDER BY position`,
    [dataset.id]
  );
  const sessions = await db.all(
    `SELECT
       session.weekday,
       session.session_type,
       session.subject,
       session.group_code,
       session.room,
       session.label,
       session.source_ref,
       period.period_key,
       profile.id AS teacher_profile_id,
       profile.display_name,
       identity.external_key AS source_code
     FROM teacher_schedule_sessions session
     JOIN schedule_periods period ON period.id = session.period_id
     JOIN teacher_profiles profile ON profile.id = session.teacher_profile_id
     JOIN teacher_external_identities identity ON identity.id = session.teacher_external_identity_id
     WHERE session.dataset_id = ?
     ORDER BY profile.display_name COLLATE NOCASE, session.weekday, period.position`,
    [dataset.id]
  );
  const profiles = await db.all(
    `SELECT profile.id, profile.display_name, profile.is_active, identity.external_key AS source_code
     FROM schedule_dataset_teachers roster
     JOIN teacher_profiles profile ON profile.id = roster.teacher_profile_id
     JOIN teacher_external_identities identity ON identity.id = roster.teacher_external_identity_id
     WHERE roster.dataset_id = ?
     ORDER BY profile.display_name COLLATE NOCASE`,
    [dataset.id]
  );
  return {
    schemaVersion: 1,
    datasetId: dataset.source_fingerprint.slice(0, 12),
    databaseId: dataset.id,
    academicYear: dataset.academic_year,
    label: dataset.label,
    source: { system: dataset.source_system, format: dataset.source_format },
    periods: periods.map(row => ({
      key: row.period_key,
      position: row.position,
      type: row.period_type,
      label: row.label,
      startsAt: row.starts_at,
      endsAt: row.ends_at
    })),
    teachers: profiles.map(row => ({
      profileId: row.id,
      sourceCode: row.source_code,
      displayName: row.display_name,
      active: !!row.is_active,
      sessions: sessions.filter(session => session.teacher_profile_id === row.id).map(session => ({
        weekday: session.weekday,
        periodKey: session.period_key,
        type: session.session_type,
        subject: session.subject,
        group: session.group_code,
        room: session.room,
        label: session.label,
        sourceRef: session.source_ref
      }))
    }))
  };
}

function buildLegacySchedulePayload(canonical) {
  const periodsByKey = new Map(canonical.periods.map(period => [period.key, period]));
  const teachers = canonical.teachers.map(teacher => {
    const horario = teacher.sessions.map(session => {
      const period = periodsByKey.get(session.periodKey);
      const text = session.type === 'guardia'
        ? 'GUARDIA'
        : [session.subject, session.group, session.room].filter(Boolean).join(' | ') || session.label || session.type.toUpperCase();
      return {
        dia: WEEKDAYS[session.weekday],
        franja: `${period.startsAt}-${period.endsAt}`,
        slot: period.position,
        texto: text,
        aula: session.room || ''
      };
    });
    return {
      sourceCode: teacher.sourceCode,
      nombre: teacher.displayName,
      horario,
      guardias: horario.filter(row => row.texto === 'GUARDIA')
    };
  });
  return {
    fuente: canonical.label,
    formato: 'canonical_v1_legacy_adapter',
    datasetId: canonical.datasetId,
    academicYear: canonical.academicYear,
    periods: canonical.periods,
    teachers
  };
}

module.exports = {
  ACADEMIC_YEAR_STATUSES,
  DATASET_STATUSES,
  PERIOD_TYPES,
  SESSION_TYPES,
  WEEKDAYS,
  academicYearDates,
  activateScheduleDataset,
  buildLegacySchedulePayload,
  ensureAcademicYear,
  fingerprint,
  getActiveDatasetRow,
  importScheduleDataset,
  importTeacherProfiles,
  loadCanonicalDataset,
  noActiveDatasetError,
  normalizeAcademicYearCode,
  validateCanonicalSchedule,
  validateTeacherCensus
};
