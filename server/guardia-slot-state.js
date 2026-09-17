const { rankGuardiaCandidates } = require('./guardia-candidate-order');
const { loadMonthlyGuardiaLoadState } = require('./routes/guardias/monthly-load');
const { normalizeDateKey } = require('./teacher-identity');
const { loadCanonicalDataset } = require('./schedule-model');
const { listEffectiveSubstitutions } = require('./substitution-service');
const { getInactiveGroupSet, isGroupInactive } = require('./group-state');
const { absenceRequiresAutomaticCoverage } = require('./session-semantics');
const {
  deriveEffectiveGuardiaSlotState,
  normalizeText
} = require('./guardia-slot-policy');

function cleanText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function dateToSchoolDay(dateValue) {
  const date = normalizeDateKey(dateValue);
  const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();

  if (weekday < 1 || weekday > 5) {
    const error = new Error('La fecha indicada no pertenece a un día lectivo de lunes a viernes.');
    error.status = 400;
    throw error;
  }

  return weekday - 1;
}

function buildIdentityResolver(canonical, effectiveSubstitutions = []) {
  const identities = new Map();
  const substitutionByProfile = new Map();

  function register(value, profileId) {
    const key = normalizeText(value);
    const id = Number(profileId);

    if (!key || !Number.isSafeInteger(id) || id <= 0) return;

    const values = identities.get(key) || new Set();
    values.add(id);
    identities.set(key, values);
  }

  for (const teacher of canonical.teachers || []) {
    register(teacher.displayName, teacher.profileId);
    register(teacher.sourceCode, teacher.profileId);
  }

  for (const substitution of effectiveSubstitutions || []) {
    const profileId = Number(substitution?.titular?.profileId);

    if (!Number.isSafeInteger(profileId) || profileId <= 0) continue;

    substitutionByProfile.set(profileId, substitution);

    register(substitution?.titular?.displayName, profileId);
    register(substitution?.titular?.sourceCode, profileId);

    register(substitution?.substitute?.displayName, profileId);
    register(substitution?.substitute?.username, profileId);
  }

  function resolve(value) {
    const matches = identities.get(normalizeText(value));
    if (!matches || matches.size !== 1) return null;
    return [...matches][0];
  }

  function visibleName(profileId) {
    const id = Number(profileId);

    const substitution = substitutionByProfile.get(id);
    if (cleanText(substitution?.substitute?.displayName)) {
      return cleanText(substitution.substitute.displayName);
    }

    const teacher = (canonical.teachers || []).find(
      item => Number(item.profileId) === id
    );

    return cleanText(teacher?.displayName);
  }

  return {
    resolve,
    visibleName
  };
}

function buildOverrideMap(rows, identity, dia) {
  const map = new Map();

  for (const row of rows || []) {
    if (Number(row?.dia) !== Number(dia)) continue;

    const profileId = identity.resolve(row?.profesor);
    const hora = Number(row?.hora);

    if (!profileId || !Number.isInteger(hora)) continue;

    map.set(`${profileId}|${hora}`, row);
  }

  return map;
}

function resolveSession(teacher, period, dia, overrides) {
  const base = (teacher?.sessions || []).find(session =>
    Number(session.weekday) === Number(dia) &&
    session.periodKey === period?.key
  );

  if (!base) return null;

  const override = overrides.get(
    `${Number(teacher.profileId)}|${Number(period.position)}`
  );

  if (!override) return { ...base };

  return {
    ...base,
    subject: cleanText(override.materia) || cleanText(base.subject),
    group: cleanText(override.grupo) || cleanText(base.group),
    room: cleanText(override.aula) || cleanText(base.room),
    label: cleanText(override.detalle) || cleanText(base.label)
  };
}

function isPracticasSessionEligible(session) {
  if (!session || session.type === 'guardia') return false;

  const text = [
    session.subject,
    session.group,
    session.label,
    session.room
  ]
    .map(cleanText)
    .filter(Boolean)
    .join(' · ');

  return /(\bCFB\b|\bCFM\b|\bGM\b|\bGS\b|\bFPB\b|INTERMODULAR|FCT|PRACTIC)/i.test(text);
}

function buildEffectiveGuardiaDayStateFromSources(input = {}) {
  const date = normalizeDateKey(input.date);
  const dia = dateToSchoolDay(date);

  const canonical = input.canonical;

  if (
    !canonical ||
    !Array.isArray(canonical.periods) ||
    !Array.isArray(canonical.teachers)
  ) {
    throw new Error('Falta el horario canónico para calcular el estado efectivo.');
  }

  const identity = buildIdentityResolver(
    canonical,
    input.effectiveSubstitutions || []
  );

  const teachersByProfile = new Map(
    canonical.teachers.map(teacher => [
      Number(teacher.profileId),
      teacher
    ])
  );

  const overrides = buildOverrideMap(
    input.overrideRows || [],
    identity,
    dia
  );

  const practiceProfiles = new Set(
    (input.practiceRows || [])
      .map(row => identity.resolve(row?.profesor))
      .filter(Boolean)
  );

  const manualPracticeSlots = new Set(
    (input.practiceSlotRows || [])
      .filter(row => Number(row?.dia) === dia)
      .map(row => {
        const profileId = identity.resolve(row?.profesor);
        const hora = Number(row?.hora);

        return profileId && Number.isInteger(hora)
          ? `${profileId}|${hora}`
          : '';
      })
      .filter(Boolean)
  );

  const absencesForDay = (input.absenceRows || [])
    .filter(row => Number(row?.dia) === dia);

  const bibliotecaByHour = new Map(
    (input.bibliotecaRows || [])
      .filter(row => Number(row?.dia) === dia)
      .map(row => [Number(row.hora), row])
  );

  const banosByHour = new Map(
    (input.banosRows || [])
      .filter(row => Number(row?.dia) === dia)
      .map(row => [Number(row.hora), row])
  );

  const periods = canonical.periods
    .filter(period => period.type === 'teaching')
    .slice()
    .sort((left, right) =>
      Number(left.position) - Number(right.position)
    );

  const slots = periods.map(period => {
    const hora = Number(period.position);

    const absenceRows = absencesForDay.filter(
      row => Number(row.hora) === hora
    );

    const absentProfiles = new Set(
      absenceRows
        .map(row => identity.resolve(row?.ausente))
        .filter(Boolean)
    );

    const candidates = [];

    for (const teacher of canonical.teachers) {
      if (teacher.active === false) continue;

      const profileId = Number(teacher.profileId);

      if (!Number.isSafeInteger(profileId) || profileId <= 0) continue;
      if (absentProfiles.has(profileId)) continue;

      const session = resolveSession(
        teacher,
        period,
        dia,
        overrides
      );

      if (!session) continue;

      const baseGuardia = session.type === 'guardia';

      const automaticPracticeGuardia =
        practiceProfiles.has(profileId) &&
        isPracticasSessionEligible(session);

      const manualPracticeGuardia =
        manualPracticeSlots.has(`${profileId}|${hora}`);

      if (
        !baseGuardia &&
        !automaticPracticeGuardia &&
        !manualPracticeGuardia
      ) {
        continue;
      }

      candidates.push({
        profileId,
        displayName:
          identity.visibleName(profileId) ||
          cleanText(teacher.displayName),
        scheduleName: cleanText(teacher.displayName),
        sourceCode: cleanText(teacher.sourceCode)
      });
    }

    const rankedCandidates = rankGuardiaCandidates(candidates, {
      date,
      dia,
      hora,
      absenceRows: input.absenceRows || [],
      monthlyLoadState: input.monthlyLoadState || null
    });

    candidates.splice(
      0,
      candidates.length,
      ...rankedCandidates
    );

    candidates.forEach((candidate, index) => {
      candidate.order = index;
    });

    const coverageRows = [];

    for (const row of absenceRows) {
      const absentProfileId = identity.resolve(row?.ausente);

      if (!absentProfileId) continue;

      const absentTeacher = teachersByProfile.get(absentProfileId);
      if (!absentTeacher) continue;

      const absentSession = resolveSession(
        absentTeacher,
        period,
        dia,
        overrides
      );

      if (!absentSession) continue;
      if (!absenceRequiresAutomaticCoverage(absentSession)) continue;

      const group = cleanText(absentSession.group);
      if (!group) continue;

      if (
        input.inactiveGroups &&
        isGroupInactive(group, input.inactiveGroups)
      ) {
        continue;
      }

      coverageRows.push({
        id: row.id,
        absentProfileId,
        absentTeacher:
          identity.visibleName(absentProfileId) ||
          cleanText(row.ausente),
        subject: cleanText(absentSession.subject),
        group,
        room:
          cleanText(absentSession.room) ||
          cleanText(row.aula),
        persistedTeacher: cleanText(row.guardia),
        assignedProfileId: identity.resolve(row?.guardia)
      });
    }

    const effective = deriveEffectiveGuardiaSlotState({
      dia,
      hora,
      date,
      candidates,
      coverageRows,
      plannedBibliotecaProfileId: identity.resolve(
        bibliotecaByHour.get(hora)?.profesor
      ),
      plannedBanosProfileId: identity.resolve(
        banosByHour.get(hora)?.profesor
      )
    });

    return {
      ...effective,
      period: {
        key: period.key,
        position: hora,
        label: cleanText(period.label),
        startsAt: cleanText(period.startsAt),
        endsAt: cleanText(period.endsAt)
      }
    };
  });

  return {
    schemaVersion: 1,
    date,
    dia,
    slots
  };
}


const PRACTICAS_GUARDIAS_STATE_KEY = 'teacher_practicas_guardias';
const PRACTICAS_GUARDIAS_TRAMOS_STATE_KEY = 'teacher_practicas_guardias_tramos';

function parseStateRows(row) {
  if (!row?.value) return [];

  try {
    const parsed = JSON.parse(row.value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

async function buildEffectiveGuardiaDayState(db, options = {}) {
  const date = normalizeDateKey(options.date);
  const dia = dateToSchoolDay(date);

  const [
    canonical,
    effectiveSubstitutions,
    absenceRows,
    bibliotecaRows,
    banosRows,
    practiceState,
    practiceSlotState,
    overrideRows,
    inactiveGroups,
    monthlyLoadState
  ] = await Promise.all([
    loadCanonicalDataset(db),

    listEffectiveSubstitutions(db, date),

    db.all(
      `SELECT *
       FROM ausencias
       ORDER BY dia, hora, id`
    ),

    db.all(
      `SELECT dia, hora, profesor
       FROM biblioteca_guardias
       WHERE dia = ?
       ORDER BY hora`,
      [dia]
    ),

    db.all(
      `SELECT dia, hora, profesor
       FROM banos_guardias
       WHERE dia = ?
       ORDER BY hora`,
      [dia]
    ),

    db.get(
      `SELECT value
       FROM app_state
       WHERE key = ?`,
      [PRACTICAS_GUARDIAS_STATE_KEY]
    ),

    db.get(
      `SELECT value
       FROM app_state
       WHERE key = ?`,
      [PRACTICAS_GUARDIAS_TRAMOS_STATE_KEY]
    ),

    db.all(
      `SELECT profesor, dia, hora, materia, grupo, detalle, aula
       FROM session_overrides
       WHERE dia = ?`,
      [dia]
    ),

    getInactiveGroupSet(db),

    loadMonthlyGuardiaLoadState(db)
  ]);

  return buildEffectiveGuardiaDayStateFromSources({
    date,
    canonical,
    effectiveSubstitutions,
    absenceRows,
    bibliotecaRows,
    banosRows,
    practiceRows: parseStateRows(practiceState),
    practiceSlotRows: parseStateRows(practiceSlotState),
    overrideRows,
    inactiveGroups,
    monthlyLoadState
  });
}

module.exports = {
  buildEffectiveGuardiaDayState,
  buildEffectiveGuardiaDayStateFromSources,
  buildIdentityResolver,
  dateToSchoolDay,
  isPracticasSessionEligible,
  parseStateRows
};

