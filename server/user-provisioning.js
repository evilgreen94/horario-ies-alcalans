const { generateTemporaryPassword, hashPassword } = require('./auth');
const { appendAuditEvent } = require('./audit');
const { withImmediateTransaction } = require('./db');

const USERNAME_PATTERN = /^[A-Za-z0-9._-]{3,64}$/;
const BOOTSTRAP_ROLES = Object.freeze(['teacher', 'admin', 'superadmin']);

function provisioningError(status, message, details = null) {
  const error = new Error(message);
  error.status = status;
  error.details = details;
  return error;
}

function normalizeSourceCode(value) {
  return String(value || '').trim().toUpperCase();
}

function usernameForSourceCode(sourceCode) {
  return normalizeSourceCode(sourceCode).toLowerCase();
}

function parseRoles(value) {
  return String(value || '').split(',').map(role => role.trim()).filter(Boolean).sort();
}

function uniqueById(rows) {
  return [...new Map(rows.map(row => [Number(row.user_id), row])).values()];
}

async function listProvisioningDatasets(db) {
  const rows = await db.all(
    `SELECT dataset.id, dataset.label, dataset.status, dataset.source_system,
            dataset.source_format, dataset.validated_at, dataset.activated_at,
            year.code AS academic_year, COUNT(roster.teacher_profile_id) AS teacher_count
     FROM schedule_datasets dataset
     JOIN academic_years year ON year.id = dataset.academic_year_id
     LEFT JOIN schedule_dataset_teachers roster ON roster.dataset_id = dataset.id
     WHERE dataset.status IN ('validated', 'active')
     GROUP BY dataset.id
     ORDER BY CASE dataset.status WHEN 'active' THEN 0 ELSE 1 END,
              COALESCE(dataset.activated_at, dataset.validated_at, dataset.created_at) DESC,
              dataset.id DESC`
  );
  return rows.map(row => ({
    id: Number(row.id),
    label: row.label,
    status: row.status,
    sourceSystem: row.source_system,
    sourceFormat: row.source_format,
    academicYear: row.academic_year,
    teacherCount: Number(row.teacher_count || 0),
    validatedAt: row.validated_at || null,
    activatedAt: row.activated_at || null
  }));
}

async function requireProvisioningDataset(db, datasetId) {
  const id = Number(datasetId);
  if (!Number.isSafeInteger(id) || id <= 0) throw provisioningError(400, 'Selecciona un dataset válido.');
  const row = await db.get(
    `SELECT dataset.id, dataset.label, dataset.status, dataset.source_system,
            dataset.source_format, dataset.academic_year_id,
            year.code AS academic_year, year.starts_on, year.ends_on
     FROM schedule_datasets dataset
     JOIN academic_years year ON year.id = dataset.academic_year_id
     WHERE dataset.id = ? AND dataset.status IN ('validated', 'active')`,
    [id]
  );
  if (!row) throw provisioningError(404, 'El dataset no existe o no está validado.');
  return row;
}

async function requireActiveSuperadmin(db, userId) {
  const row = await db.get(
    `SELECT user.id
     FROM users user
     JOIN user_roles user_role ON user_role.user_id = user.id
     JOIN roles role ON role.id = user_role.role_id
     WHERE user.id = ? AND user.is_active = 1 AND role.key = 'superadmin'`,
    [userId]
  );
  if (!row) throw provisioningError(403, 'Solo Superadmin puede provisionar cuentas.');
}

async function loadProvisioningState(db, datasetId) {
  const dataset = await requireProvisioningDataset(db, datasetId);
  const roster = await db.all(
    `SELECT profile.id AS profile_id, profile.display_name,
            identity.external_key AS source_code
     FROM schedule_dataset_teachers roster
     JOIN teacher_profiles profile ON profile.id = roster.teacher_profile_id
     JOIN teacher_external_identities identity ON identity.id = roster.teacher_external_identity_id
     WHERE roster.dataset_id = ?
     ORDER BY identity.external_key COLLATE NOCASE, profile.id`,
    [dataset.id]
  );
  const users = await db.all(
    `SELECT user.id AS user_id, user.username, user.display_name, user.is_active,
            user.must_change_password, user.session_version,
            GROUP_CONCAT(DISTINCT role.key) AS role_keys
     FROM users user
     LEFT JOIN user_roles user_role ON user_role.user_id = user.id
     LEFT JOIN roles role ON role.id = user_role.role_id
     GROUP BY user.id`
  );
  const assignments = await db.all(
    `SELECT assignment.user_id, assignment.teacher_profile_id,
            assignment.academic_year_id, assignment.assignment_type,
            identity.external_key AS source_code
     FROM teacher_assignments assignment
     JOIN teacher_external_identities identity
       ON identity.teacher_profile_id = assignment.teacher_profile_id
      AND identity.academic_year_id = assignment.academic_year_id
     WHERE assignment.assignment_type = 'titular'`
  );
  return {
    dataset,
    roster,
    users: users.map(row => ({ ...row, roles: parseRoles(row.role_keys) })),
    assignments
  };
}

async function buildProvisioningPreview(db, datasetId) {
  const state = await loadProvisioningState(db, datasetId);
  const usersById = new Map(state.users.map(user => [Number(user.user_id), user]));
  const usersByUsername = new Map(state.users.map(user => [String(user.username).toLowerCase(), user]));
  const currentByProfile = new Map();
  const historicalByCode = new Map();
  for (const assignment of state.assignments) {
    const profileId = Number(assignment.teacher_profile_id);
    const profileRows = currentByProfile.get(profileId) || [];
    profileRows.push(assignment);
    currentByProfile.set(profileId, profileRows);
    const code = normalizeSourceCode(assignment.source_code);
    const codeRows = historicalByCode.get(code) || [];
    codeRows.push(assignment);
    historicalByCode.set(code, codeRows);
  }

  const generatedUsernameCounts = new Map();
  for (const teacher of state.roster) {
    const username = usernameForSourceCode(teacher.source_code);
    generatedUsernameCounts.set(username, (generatedUsernameCounts.get(username) || 0) + 1);
  }

  const rows = state.roster.map(teacher => {
    const sourceCode = normalizeSourceCode(teacher.source_code);
    const username = usernameForSourceCode(sourceCode);
    const base = {
      profileId: Number(teacher.profile_id),
      displayName: teacher.display_name,
      sourceCode,
      username
    };
    if (!sourceCode || !USERNAME_PATTERN.test(username)) {
      return { ...base, classification: 'INVALID', reason: 'source_code no genera un usuario válido.' };
    }
    if ((generatedUsernameCounts.get(username) || 0) > 1) {
      return { ...base, classification: 'CONFLICT', reason: 'El dataset genera un nombre de usuario duplicado.' };
    }

    const currentLinks = uniqueById(currentByProfile.get(base.profileId) || []);
    if (currentLinks.length > 1) {
      return { ...base, classification: 'CONFLICT', reason: 'El perfil ya está vinculado a varias cuentas.' };
    }
    if (currentLinks.length === 1) {
      const user = usersById.get(Number(currentLinks[0].user_id));
      if (!user || !user.is_active || !user.roles.includes('teacher')) {
        return { ...base, classification: 'CONFLICT', reason: 'La cuenta vinculada no está activa con rol teacher.' };
      }
      return {
        ...base,
        username: user.username,
        userId: Number(user.user_id),
        classification: 'ALREADY_LINKED',
        reason: 'La identidad ya está vinculada.'
      };
    }

    const historicalLinks = uniqueById((historicalByCode.get(sourceCode) || [])
      .filter(assignment => Number(assignment.teacher_profile_id) !== base.profileId));
    if (historicalLinks.length > 1) {
      return { ...base, classification: 'CONFLICT', reason: 'El source_code histórico corresponde a varias cuentas.' };
    }
    const usernameOwner = usersByUsername.get(username);
    if (historicalLinks.length === 1) {
      const user = usersById.get(Number(historicalLinks[0].user_id));
      if (!user || !user.is_active || !user.roles.includes('teacher')) {
        return { ...base, classification: 'CONFLICT', reason: 'La cuenta histórica no está activa con rol teacher.' };
      }
      if (usernameOwner && Number(usernameOwner.user_id) !== Number(user.user_id)) {
        return { ...base, classification: 'CONFLICT', reason: 'El usuario determinista pertenece a otra identidad.' };
      }
      return {
        ...base,
        username: user.username,
        userId: Number(user.user_id),
        classification: 'READY',
        action: 'LINK_EXISTING',
        reason: 'Cuenta histórica preparada para enlazar al perfil actual.'
      };
    }
    if (usernameOwner) {
      return { ...base, userId: Number(usernameOwner.user_id), classification: 'CONFLICT', reason: 'El usuario ya existe sin vínculo verificable.' };
    }
    return { ...base, classification: 'READY', action: 'CREATE', reason: 'Preparada para crear.' };
  });

  const currentProfileIds = new Set(state.roster.map(row => Number(row.profile_id)));
  const linkedCurrentUserIds = new Set(state.assignments
    .filter(row => currentProfileIds.has(Number(row.teacher_profile_id)))
    .map(row => Number(row.user_id)));
  const orphanedAccounts = state.users
    .filter(user => user.roles.includes('teacher') && !linkedCurrentUserIds.has(Number(user.user_id)))
    .map(user => ({
      classification: 'ORPHANED_ACCOUNT',
      userId: Number(user.user_id),
      username: user.username,
      displayName: user.display_name,
      active: !!user.is_active,
      reason: 'Cuenta teacher sin perfil del dataset seleccionado.'
    }));

  const count = classification => rows.filter(row => row.classification === classification).length;
  return {
    dataset: {
      id: Number(state.dataset.id),
      label: state.dataset.label,
      status: state.dataset.status,
      sourceSystem: state.dataset.source_system,
      sourceFormat: state.dataset.source_format,
      academicYear: state.dataset.academic_year
    },
    totals: {
      teacherIdentities: rows.length,
      alreadyLinked: count('ALREADY_LINKED'),
      ready: count('READY'),
      conflicts: count('CONFLICT'),
      invalid: count('INVALID'),
      orphanedAccounts: orphanedAccounts.length
    },
    rows,
    orphanedAccounts
  };
}

async function provisionTeachers(db, options) {
  const actorUserId = Number(options?.actorUserId);
  if (!Number.isSafeInteger(actorUserId) || actorUserId <= 0) throw provisioningError(400, 'Falta el actor Superadmin.');
  return withImmediateTransaction(db, async () => {
    await requireActiveSuperadmin(db, actorUserId);
    const preview = await buildProvisioningPreview(db, options?.datasetId);
    if (preview.totals.conflicts || preview.totals.invalid) {
      throw provisioningError(409, 'La provisión está bloqueada por conflictos o identidades inválidas.', preview);
    }
    const dataset = await requireProvisioningDataset(db, preview.dataset.id);
    const credentials = [];
    let linked = 0;
    for (const row of preview.rows.filter(item => item.classification === 'READY')) {
      if (row.action === 'LINK_EXISTING') {
        await db.run(
          `INSERT INTO teacher_assignments
            (user_id, teacher_profile_id, academic_year_id, assignment_type,
             starts_on, ends_on, created_by_user_id, notes)
           VALUES (?, ?, ?, 'titular', ?, ?, ?, 'Provisionamiento ARGOS')`,
          [row.userId, row.profileId, dataset.academic_year_id, dataset.starts_on, dataset.ends_on, actorUserId]
        );
        linked += 1;
        await appendAuditEvent(db, {
          actorUserId,
          action: 'security.teacher_account_linked',
          targetType: 'user',
          targetId: String(row.userId),
          details: { sourceCode: row.sourceCode, datasetId: preview.dataset.id, academicYear: preview.dataset.academicYear }
        });
        continue;
      }

      const temporaryPassword = generateTemporaryPassword();
      const credential = hashPassword(temporaryPassword);
      const inserted = await db.run(
        `INSERT INTO users
          (username, display_name, password_hash, password_salt, is_active,
           must_change_password, session_version)
         VALUES (?, ?, ?, ?, 1, 1, 1)`,
        [row.username, row.displayName, credential.hash, credential.salt]
      );
      await db.run(
        `INSERT INTO user_roles (user_id, role_id)
         SELECT ?, id FROM roles WHERE key = 'teacher'`,
        [inserted.lastID]
      );
      await db.run(
        `INSERT INTO teacher_assignments
          (user_id, teacher_profile_id, academic_year_id, assignment_type,
           starts_on, ends_on, created_by_user_id, notes)
         VALUES (?, ?, ?, 'titular', ?, ?, ?, 'Provisionamiento ARGOS')`,
        [inserted.lastID, row.profileId, dataset.academic_year_id, dataset.starts_on, dataset.ends_on, actorUserId]
      );
      await appendAuditEvent(db, {
        actorUserId,
        action: 'security.teacher_account_created',
        targetType: 'user',
        targetId: String(inserted.lastID),
        details: { sourceCode: row.sourceCode, datasetId: preview.dataset.id, academicYear: preview.dataset.academicYear, roles: ['teacher'] }
      });
      credentials.push({
        display_name: row.displayName,
        source_code: row.sourceCode,
        username: row.username,
        temporary_password: temporaryPassword
      });
    }
    await appendAuditEvent(db, {
      actorUserId,
      action: 'security.teacher_bulk_provisioned',
      targetType: 'schedule_dataset',
      targetId: String(preview.dataset.id),
      details: {
        academicYear: preview.dataset.academicYear,
        createdCount: credentials.length,
        linkedCount: linked,
        alreadyLinkedCount: preview.totals.alreadyLinked,
        skippedCount: preview.totals.alreadyLinked
      }
    });
    return {
      dataset: preview.dataset,
      summary: {
        created: credentials.length,
        linked,
        skipped: preview.totals.alreadyLinked,
        conflicts: 0,
        failed: 0
      },
      credentials,
      shownOnce: true
    };
  }, { label: 'security:teacher-bulk-provisioning' });
}

async function bootstrapSuperadmin(db, options = {}) {
  const sourceCode = normalizeSourceCode(options.sourceCode);
  if (!sourceCode) throw provisioningError(400, 'Indica un source_code.');
  const profiles = await db.all(
    `SELECT DISTINCT profile.id AS profile_id, profile.display_name,
            year.id AS academic_year_id, year.code AS academic_year,
            year.starts_on, year.ends_on
     FROM teacher_external_identities identity
     JOIN teacher_profiles profile ON profile.id = identity.teacher_profile_id
     JOIN academic_years year ON year.id = profile.academic_year_id
     JOIN schedule_dataset_teachers roster ON roster.teacher_profile_id = profile.id
     JOIN schedule_datasets dataset ON dataset.id = roster.dataset_id
     WHERE identity.external_key = ? COLLATE NOCASE
       AND dataset.status IN ('validated', 'active')`,
    [sourceCode]
  );
  if (profiles.length !== 1) {
    throw provisioningError(409, profiles.length ? 'El source_code no resuelve un perfil único.' : 'No existe el source_code en un dataset validado.');
  }
  const profile = profiles[0];
  const username = usernameForSourceCode(sourceCode);
  if (!USERNAME_PATTERN.test(username)) throw provisioningError(409, 'El source_code no genera un usuario válido.');

  const links = await db.all(
    `SELECT DISTINCT user.id, user.username, user.display_name, user.is_active,
            user.must_change_password, user.session_version,
            GROUP_CONCAT(DISTINCT role.key) AS role_keys
     FROM teacher_assignments assignment
     JOIN users user ON user.id = assignment.user_id
     LEFT JOIN user_roles user_role ON user_role.user_id = user.id
     LEFT JOIN roles role ON role.id = user_role.role_id
     WHERE assignment.teacher_profile_id = ? AND assignment.assignment_type = 'titular'
     GROUP BY user.id`,
    [profile.profile_id]
  );
  if (links.length > 1) throw provisioningError(409, 'El perfil bootstrap está vinculado a varias cuentas.');
  if (links.length === 1) {
    const roles = parseRoles(links[0].role_keys);
    if (!links[0].is_active || BOOTSTRAP_ROLES.some(role => !roles.includes(role)) || roles.length !== BOOTSTRAP_ROLES.length) {
      throw provisioningError(409, 'La cuenta bootstrap existente requiere revisión explícita de estado o roles.');
    }
    return {
      created: false,
      shownOnce: false,
      user: { id: Number(links[0].id), username: links[0].username, displayName: links[0].display_name, sourceCode, roles }
    };
  }
  if (await db.get('SELECT id FROM users WHERE username = ? COLLATE NOCASE', [username])) {
    throw provisioningError(409, 'El nombre de usuario bootstrap pertenece a una cuenta no vinculada.');
  }

  const temporaryPassword = generateTemporaryPassword();
  const credential = hashPassword(temporaryPassword);
  return withImmediateTransaction(db, async () => {
    const inserted = await db.run(
      `INSERT INTO users
        (username, display_name, password_hash, password_salt, is_active,
         must_change_password, session_version)
       VALUES (?, ?, ?, ?, 1, 1, 1)`,
      [username, profile.display_name, credential.hash, credential.salt]
    );
    for (const role of BOOTSTRAP_ROLES) {
      await db.run(`INSERT INTO user_roles (user_id, role_id) SELECT ?, id FROM roles WHERE key = ?`, [inserted.lastID, role]);
    }
    await db.run(
      `INSERT INTO teacher_assignments
        (user_id, teacher_profile_id, academic_year_id, assignment_type,
         starts_on, ends_on, notes)
       VALUES (?, ?, ?, 'titular', ?, ?, 'Bootstrap ARGOS')`,
      [inserted.lastID, profile.profile_id, profile.academic_year_id, profile.starts_on, profile.ends_on]
    );
    await appendAuditEvent(db, {
      action: 'security.bootstrap_superadmin_created',
      targetType: 'user',
      targetId: String(inserted.lastID),
      details: { sourceCode, academicYear: profile.academic_year, roles: BOOTSTRAP_ROLES, mechanism: 'explicit-cli' }
    });
    return {
      created: true,
      shownOnce: true,
      temporaryPassword,
      user: { id: Number(inserted.lastID), username, displayName: profile.display_name, sourceCode, roles: [...BOOTSTRAP_ROLES] }
    };
  }, { label: 'security:bootstrap-superadmin' });
}

module.exports = {
  BOOTSTRAP_ROLES,
  buildProvisioningPreview,
  bootstrapSuperadmin,
  listProvisioningDatasets,
  normalizeSourceCode,
  provisionTeachers,
  usernameForSourceCode
};
