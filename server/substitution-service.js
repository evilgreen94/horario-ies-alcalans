const crypto = require('node:crypto');
const { generateTemporaryPassword, hashPassword } = require('./auth');
const { appendAuditEvent } = require('./audit');
const { withImmediateTransaction } = require('./db');
const { appendOperationalHistory } = require('./operational-history');
const { normalizeDateKey } = require('./teacher-identity');

const USERNAME_PATTERN = /^[A-Za-z0-9._-]{3,64}$/;
const LEGACY_STATE_KEY = 'teacher_substitutions';
const SENSITIVE_REJECTION_CODES = new Set([
  'SELF_SUBSTITUTION', 'SUBSTITUTE_INACTIVE', 'TEACHER_ROLE_REQUIRED',
  'SUBSTITUTE_OVERLAP', 'TITULAR_OVERLAP', 'UNKNOWN_IDENTITY'
]);

function domainError(status, message, code, details = null) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  error.details = details;
  return error;
}

function positiveId(value, label = 'Identificador') {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw domainError(400, `${label} no válido.`, 'INVALID_ID');
  return id;
}

function safeText(value, max = 500) {
  return String(value || '').trim().slice(0, max);
}

function madridDateKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function validateInterval(startsOn, endsOn) {
  const start = normalizeDateKey(startsOn);
  const end = normalizeDateKey(endsOn);
  if (start > end) throw domainError(400, 'La fecha de inicio no puede ser posterior a la fecha de fin.', 'INVALID_INTERVAL');
  return { startsOn: start, endsOn: end };
}

function parseRoles(value) {
  return String(value || '').split(',').map(item => item.trim()).filter(Boolean).sort();
}

function serializeRequest(row) {
  return {
    id: row.id,
    status: row.status,
    titular: {
      assignmentId: row.titular_assignment_id,
      userId: row.titular_user_id,
      profileId: row.teacher_profile_id,
      displayName: row.titular_display_name,
      sourceCode: row.source_code || null
    },
    candidate: {
      userId: row.substitute_user_id || null,
      username: row.substitute_username || row.proposed_username || '',
      displayName: row.substitute_display_name || row.proposed_display_name || '',
      active: row.substitute_user_id ? !!row.substitute_is_active : null,
      roles: parseRoles(row.substitute_roles)
    },
    assignmentId: row.teacher_assignment_id || null,
    startsOn: row.starts_on,
    plannedEndsOn: row.planned_ends_on,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
    provisionedByUserId: row.provisioned_by_user_id || null,
    provisionedAt: row.provisioned_at || null,
    activatedByUserId: row.activated_by_user_id || null,
    activatedAt: row.activated_at || null,
    finishedByUserId: row.finished_by_user_id || null,
    finishedAt: row.finished_at || null,
    finishReason: row.finish_reason || '',
    cancelledByUserId: row.cancelled_by_user_id || null,
    cancelledAt: row.cancelled_at || null,
    cancelReason: row.cancel_reason || '',
    rejectedByUserId: row.rejected_by_user_id || null,
    rejectedAt: row.rejected_at || null,
    rejectReason: row.reject_reason || ''
  };
}

async function getRequestRow(db, id) {
  return db.get(
    `SELECT request.*,
            titular.user_id AS titular_user_id,
            titular.teacher_profile_id,
            profile.display_name AS titular_display_name,
            substitute.username AS substitute_username,
            substitute.display_name AS substitute_display_name,
            substitute.is_active AS substitute_is_active,
            GROUP_CONCAT(DISTINCT role.key) AS substitute_roles,
            (
              SELECT identity.external_key
              FROM schedule_datasets dataset
              JOIN schedule_dataset_teachers roster ON roster.dataset_id = dataset.id
              JOIN teacher_external_identities identity ON identity.id = roster.teacher_external_identity_id
              WHERE dataset.status = 'active'
                AND roster.teacher_profile_id = titular.teacher_profile_id
              LIMIT 1
            ) AS source_code
     FROM substitution_requests request
     JOIN teacher_assignments titular ON titular.id = request.titular_assignment_id
     JOIN teacher_profiles profile ON profile.id = titular.teacher_profile_id
     LEFT JOIN users substitute ON substitute.id = request.substitute_user_id
     LEFT JOIN user_roles user_role ON user_role.user_id = substitute.id
     LEFT JOIN roles role ON role.id = user_role.role_id
     WHERE request.id = ?
     GROUP BY request.id`,
    [id]
  );
}

async function ensureLegacyAliasesImported(db) {
  const state = await db.get('SELECT value FROM app_state WHERE key = ?', [LEGACY_STATE_KEY]);
  if (!state?.value) return 0;
  let rows;
  try { rows = JSON.parse(state.value); } catch (_error) { rows = []; }
  if (!Array.isArray(rows)) return 0;
  let imported = 0;
  for (const row of rows) {
    const titular = safeText(row?.profesor, 160);
    const substitute = safeText(row?.sustituto, 160);
    if (!titular || !substitute) continue;
    const legacyKey = crypto.createHash('sha256').update(JSON.stringify([titular, substitute])).digest('hex');
    const result = await db.run(
      `INSERT OR IGNORE INTO legacy_substitution_aliases
        (legacy_key, titular_name, substitute_name, status)
       VALUES (?, ?, ?, 'unresolved')`,
      [legacyKey, titular, substitute]
    );
    imported += Number(result.changes || 0);
  }
  return imported;
}

async function listTitularAssignments(db) {
  return db.all(
    `SELECT assignment.id AS assignmentId, assignment.user_id AS userId,
            profile.id AS profileId, profile.display_name AS displayName,
            identity.external_key AS sourceCode,
            assignment.starts_on AS startsOn, assignment.ends_on AS endsOn,
            year.code AS academicYear
     FROM teacher_assignments assignment
     JOIN teacher_profiles profile ON profile.id = assignment.teacher_profile_id AND profile.is_active = 1
     JOIN academic_years year ON year.id = assignment.academic_year_id
     JOIN schedule_datasets dataset ON dataset.academic_year_id = year.id AND dataset.status = 'active'
     JOIN schedule_dataset_teachers roster
       ON roster.dataset_id = dataset.id AND roster.teacher_profile_id = profile.id
     JOIN teacher_external_identities identity ON identity.id = roster.teacher_external_identity_id
     WHERE assignment.assignment_type = 'titular'
     ORDER BY profile.display_name COLLATE NOCASE, assignment.id`
  );
}

async function listCandidateUsers(db, query = '') {
  const search = safeText(query, 128);
  const like = `%${search.replace(/[\\%_]/g, '\\$&')}%`;
  const rows = await db.all(
    `SELECT u.id, u.username, u.display_name, u.is_active,
            GROUP_CONCAT(DISTINCT r.key) AS role_keys
     FROM users u
     LEFT JOIN user_roles ur ON ur.user_id = u.id
     LEFT JOIN roles r ON r.id = ur.role_id
     WHERE (? = '' OR u.username LIKE ? ESCAPE '\\' OR u.display_name LIKE ? ESCAPE '\\')
     GROUP BY u.id
     ORDER BY u.display_name COLLATE NOCASE, u.username COLLATE NOCASE
     LIMIT 100`,
    [search, like, like]
  );
  return rows.map(row => ({
    id: row.id, username: row.username, displayName: row.display_name,
    active: !!row.is_active, roles: parseRoles(row.role_keys)
  }));
}

async function createRequest(db, input) {
  const titularAssignmentId = positiveId(input.titularAssignmentId, 'Asignación titular');
  const candidateUserId = input.substituteUserId == null || input.substituteUserId === ''
    ? null : positiveId(input.substituteUserId, 'Usuario sustituto');
  const proposedDisplayName = safeText(input.proposedDisplayName, 160);
  const proposedUsername = safeText(input.proposedUsername, 64).toLowerCase();
  const { startsOn, endsOn } = validateInterval(input.startsOn, input.plannedEndsOn);
  if (!candidateUserId && !proposedDisplayName) {
    throw domainError(400, 'Indica una identidad existente o el nombre de la persona propuesta.', 'CANDIDATE_REQUIRED');
  }
  if (proposedUsername && !USERNAME_PATTERN.test(proposedUsername)) {
    throw domainError(400, 'El nombre de usuario propuesto no es válido.', 'INVALID_USERNAME');
  }
  return withImmediateTransaction(db, async () => {
    const titular = await db.get(
      `SELECT assignment.*, profile.display_name
       FROM teacher_assignments assignment
       JOIN teacher_profiles profile ON profile.id = assignment.teacher_profile_id
       WHERE assignment.id = ? AND assignment.assignment_type = 'titular'`,
      [titularAssignmentId]
    );
    if (!titular) throw domainError(404, 'No existe la asignación titular indicada.', 'UNKNOWN_TITULAR');
    if (startsOn < titular.starts_on || endsOn > (titular.ends_on || '9999-12-31')) {
      throw domainError(409, 'El intervalo queda fuera de la titularidad seleccionada.', 'OUTSIDE_TITULAR_INTERVAL');
    }
    if (candidateUserId && !await db.get('SELECT id FROM users WHERE id = ?', [candidateUserId])) {
      throw domainError(404, 'No existe la identidad sustituta indicada.', 'UNKNOWN_IDENTITY');
    }
    const inserted = await db.run(
      `INSERT INTO substitution_requests
        (titular_assignment_id, proposed_display_name, proposed_username,
         substitute_user_id, starts_on, planned_ends_on, status, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [titularAssignmentId, proposedDisplayName, proposedUsername, candidateUserId,
        startsOn, endsOn, candidateUserId ? 'pending' : 'pending_provisioning', positiveId(input.actorUserId, 'Actor')]
    );
    await appendOperationalHistory(db, {
      actorUserId: input.actorUserId,
      action: 'substitution.request_created', title: 'Solicitud de sustitución creada', type: 'substitution',
      targetType: 'substitution_request', targetId: String(inserted.lastID),
      after: { titularAssignmentId, substituteUserId: candidateUserId, startsOn, plannedEndsOn: endsOn,
        status: candidateUserId ? 'pending' : 'pending_provisioning' }
    });
    await appendAuditEvent(db, {
      actorUserId: input.actorUserId, action: 'substitution.request_created',
      targetType: 'substitution_request', targetId: String(inserted.lastID),
      details: { titularAssignmentId, substituteUserId: candidateUserId, startsOn, plannedEndsOn: endsOn }
    });
    return serializeRequest(await getRequestRow(db, inserted.lastID));
  }, { label: `substitution:request:${titularAssignmentId}` });
}

async function linkExistingUser(db, requestId, userId, actorUserId) {
  const id = positiveId(requestId, 'Solicitud');
  const substituteId = positiveId(userId, 'Usuario sustituto');
  return withImmediateTransaction(db, async () => {
    const request = await getRequestRow(db, id);
    if (!request) throw domainError(404, 'Solicitud no encontrada.', 'UNKNOWN_REQUEST');
    if (!['pending', 'pending_provisioning'].includes(request.status)) {
      throw domainError(409, 'La solicitud ya no admite enlazar otra identidad.', 'INVALID_REQUEST_STATE');
    }
    const user = await db.get('SELECT id, username, display_name FROM users WHERE id = ?', [substituteId]);
    if (!user) throw domainError(404, 'No existe la identidad sustituta indicada.', 'UNKNOWN_IDENTITY');
    const granted = await db.run(
      `INSERT OR IGNORE INTO user_roles (user_id, role_id)
       SELECT ?, id FROM roles WHERE key = 'teacher'`, [substituteId]
    );
    if (granted.changes) {
      await db.run('UPDATE users SET session_version = session_version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [substituteId]);
    }
    await db.run(
      `UPDATE substitution_requests
       SET substitute_user_id = ?, status = 'pending', provisioned_by_user_id = ?,
           provisioned_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [substituteId, positiveId(actorUserId, 'Actor'), id]
    );
    await appendOperationalHistory(db, {
      actorUserId, action: 'substitution.identity_linked', title: 'Identidad sustituta enlazada', type: 'substitution',
      targetType: 'substitution_request', targetId: String(id),
      before: { substituteUserId: request.substitute_user_id || null, status: request.status },
      after: { substituteUserId: substituteId, status: 'pending', teacherRoleGranted: !!granted.changes }
    });
    await appendAuditEvent(db, {
      actorUserId, action: 'substitution.identity_linked', targetType: 'substitution_request', targetId: String(id),
      details: { substituteUserId: substituteId, teacherRoleGranted: !!granted.changes }
    });
    return serializeRequest(await getRequestRow(db, id));
  }, { label: `substitution:link:${id}` });
}

async function provisionRequestUser(db, requestId, input) {
  const id = positiveId(requestId, 'Solicitud');
  return withImmediateTransaction(db, async () => {
    const request = await getRequestRow(db, id);
    if (!request) throw domainError(404, 'Solicitud no encontrada.', 'UNKNOWN_REQUEST');
    if (request.status !== 'pending_provisioning' || request.substitute_user_id) {
      throw domainError(409, 'La solicitud no requiere provisionar una identidad.', 'INVALID_REQUEST_STATE');
    }
    const username = safeText(input.username || request.proposed_username, 64).toLowerCase();
    const displayName = safeText(input.displayName || request.proposed_display_name, 160);
    if (!USERNAME_PATTERN.test(username)) throw domainError(400, 'El nombre de usuario no es válido.', 'INVALID_USERNAME');
    if (!displayName) throw domainError(400, 'El nombre visible es obligatorio.', 'INVALID_DISPLAY_NAME');
    const temporaryPassword = generateTemporaryPassword();
    const credential = hashPassword(temporaryPassword);
    let inserted;
    try {
      inserted = await db.run(
        `INSERT INTO users
          (username, display_name, password_hash, password_salt, is_active, must_change_password)
         VALUES (?, ?, ?, ?, 1, 1)`,
        [username, displayName, credential.hash, credential.salt]
      );
    } catch (error) {
      if (String(error.message).includes('UNIQUE constraint failed: users.username')) {
        throw domainError(409, 'Ese usuario ya existe; enlázalo en lugar de provisionarlo.', 'USERNAME_EXISTS');
      }
      throw error;
    }
    await db.run(
      `INSERT INTO user_roles (user_id, role_id) SELECT ?, id FROM roles WHERE key = 'teacher'`,
      [inserted.lastID]
    );
    await db.run(
      `UPDATE substitution_requests
       SET substitute_user_id = ?, status = 'pending', provisioned_by_user_id = ?,
           provisioned_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [inserted.lastID, positiveId(input.actorUserId, 'Actor'), id]
    );
    await appendOperationalHistory(db, {
      actorUserId: input.actorUserId, action: 'substitution.user_provisioned',
      title: 'Cuenta sustituta provisionada', type: 'substitution',
      targetType: 'substitution_request', targetId: String(id),
      after: { substituteUserId: inserted.lastID, username, roles: ['teacher'], status: 'pending' }
    });
    await appendAuditEvent(db, {
      actorUserId: input.actorUserId, action: 'security.substitute_provisioned',
      targetType: 'user', targetId: String(inserted.lastID),
      details: { substitutionRequestId: id, roles: ['teacher'] }
    });
    return {
      request: serializeRequest(await getRequestRow(db, id)),
      user: { id: inserted.lastID, username, displayName, roles: ['teacher'], mustChangePassword: true },
      temporaryPassword,
      shownOnce: true
    };
  }, { label: `substitution:provision:${id}` });
}

async function auditRejectedActivation(db, requestId, actorUserId, error) {
  if (!SENSITIVE_REJECTION_CODES.has(error?.code)) return;
  try {
    await withImmediateTransaction(db, () => appendAuditEvent(db, {
      actorUserId, action: 'substitution.activation_rejected', targetType: 'substitution_request',
      targetId: String(requestId), outcome: 'failure', details: { reasonCode: error.code }
    }), { label: `substitution:activation-rejected:${requestId}` });
  } catch (_auditError) {
    // Preserve the original domain error; HTTP telemetry will record an audit failure separately.
  }
}

async function activateRequest(db, requestId, actorUserId) {
  const id = positiveId(requestId, 'Solicitud');
  try {
    return await withImmediateTransaction(db, async () => {
      const request = await getRequestRow(db, id);
      if (!request) throw domainError(404, 'Solicitud no encontrada.', 'UNKNOWN_REQUEST');
      if (request.status !== 'pending' || !request.substitute_user_id || request.teacher_assignment_id) {
        throw domainError(409, 'La solicitud no está preparada para activarse.', 'INVALID_REQUEST_STATE');
      }
      const interval = validateInterval(request.starts_on, request.planned_ends_on);
      const titular = await db.get(
        `SELECT assignment.*, user.id AS titular_user_id
         FROM teacher_assignments assignment
         JOIN users user ON user.id = assignment.user_id
         WHERE assignment.id = ? AND assignment.assignment_type = 'titular'`,
        [request.titular_assignment_id]
      );
      if (!titular) throw domainError(409, 'La titularidad ya no es válida.', 'UNKNOWN_TITULAR');
      const substitute = await db.get(
        `SELECT u.id, u.username, u.display_name, u.is_active,
                EXISTS(
                  SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
                  WHERE ur.user_id = u.id AND r.key = 'teacher'
                ) AS has_teacher_role
         FROM users u WHERE u.id = ?`, [request.substitute_user_id]
      );
      if (!substitute) throw domainError(409, 'La identidad sustituta no existe.', 'UNKNOWN_IDENTITY');
      if (!substitute.is_active) throw domainError(409, 'La cuenta sustituta está inactiva.', 'SUBSTITUTE_INACTIVE');
      if (!substitute.has_teacher_role) throw domainError(409, 'La cuenta sustituta necesita el rol teacher.', 'TEACHER_ROLE_REQUIRED');
      if (substitute.id === titular.titular_user_id) {
        throw domainError(409, 'Una persona no puede sustituirse a sí misma.', 'SELF_SUBSTITUTION');
      }
      if (interval.startsOn < titular.starts_on || interval.endsOn > (titular.ends_on || '9999-12-31')) {
        throw domainError(409, 'El intervalo queda fuera de la titularidad seleccionada.', 'OUTSIDE_TITULAR_INTERVAL');
      }
      const overlaps = await db.all(
        `SELECT id, user_id, teacher_profile_id
         FROM teacher_assignments
         WHERE assignment_type = 'sustituto'
           AND starts_on <= ? AND ? <= COALESCE(ends_on, '9999-12-31')
           AND (user_id = ? OR teacher_profile_id = ?)`,
        [interval.endsOn, interval.startsOn, substitute.id, titular.teacher_profile_id]
      );
      if (overlaps.some(row => row.user_id === substitute.id)) {
        throw domainError(409, 'El sustituto ya reemplaza a otro titular en ese intervalo.', 'SUBSTITUTE_OVERLAP');
      }
      if (overlaps.some(row => row.teacher_profile_id === titular.teacher_profile_id)) {
        throw domainError(409, 'El titular ya tiene otro sustituto en ese intervalo.', 'TITULAR_OVERLAP');
      }
      const inserted = await db.run(
        `INSERT INTO teacher_assignments
          (user_id, teacher_profile_id, academic_year_id, assignment_type,
           starts_on, ends_on, replaces_assignment_id, created_by_user_id, notes)
         VALUES (?, ?, ?, 'sustituto', ?, ?, ?, ?, ?)`,
        [substitute.id, titular.teacher_profile_id, titular.academic_year_id,
          interval.startsOn, interval.endsOn, titular.id, positiveId(actorUserId, 'Actor'),
          `substitution_request:${id}`]
      );
      await db.run(
        `UPDATE substitution_requests
         SET teacher_assignment_id = ?, status = 'active', activated_by_user_id = ?,
             activated_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [inserted.lastID, actorUserId, id]
      );
      await appendOperationalHistory(db, {
        actorUserId, action: 'substitution.activated', title: 'Sustitución activada', type: 'substitution',
        targetType: 'substitution_request', targetId: String(id),
        before: { status: request.status },
        after: { status: 'active', teacherAssignmentId: inserted.lastID,
          titularAssignmentId: titular.id, substituteUserId: substitute.id,
          startsOn: interval.startsOn, endsOn: interval.endsOn }
      });
      await appendAuditEvent(db, {
        actorUserId, action: 'substitution.assignment_activated', targetType: 'teacher_assignment',
        targetId: String(inserted.lastID), details: { requestId: id, titularAssignmentId: titular.id,
          substituteUserId: substitute.id, startsOn: interval.startsOn, endsOn: interval.endsOn }
      });
      return serializeRequest(await getRequestRow(db, id));
    }, { label: `substitution:activate:${id}` });
  } catch (error) {
    await auditRejectedActivation(db, id, actorUserId, error);
    throw error;
  }
}

async function finishRequest(db, requestId, input) {
  const id = positiveId(requestId, 'Solicitud');
  const lastEffectiveOn = normalizeDateKey(input.lastEffectiveOn);
  const reason = safeText(input.reason, 500);
  return withImmediateTransaction(db, async () => {
    const request = await getRequestRow(db, id);
    if (!request) throw domainError(404, 'Solicitud no encontrada.', 'UNKNOWN_REQUEST');
    if (request.status !== 'active' || !request.teacher_assignment_id) {
      throw domainError(409, 'La sustitución no está activa.', 'INVALID_REQUEST_STATE');
    }
    if (lastEffectiveOn < request.starts_on || lastEffectiveOn > request.planned_ends_on) {
      throw domainError(400, 'El último día efectivo debe pertenecer al intervalo previsto.', 'INVALID_FINISH_DATE');
    }
    await db.run(
      `UPDATE teacher_assignments SET ends_on = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [lastEffectiveOn, request.teacher_assignment_id]
    );
    await db.run(
      `UPDATE substitution_requests
       SET status = 'finished', finished_by_user_id = ?, finished_at = CURRENT_TIMESTAMP,
           finish_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [positiveId(input.actorUserId, 'Actor'), reason, id]
    );
    await appendOperationalHistory(db, {
      actorUserId: input.actorUserId, action: 'substitution.finished', title: 'Sustitución finalizada', type: 'substitution',
      targetType: 'substitution_request', targetId: String(id),
      before: { status: 'active', endsOn: request.planned_ends_on },
      after: { status: 'finished', lastEffectiveOn, reason }
    });
    await appendAuditEvent(db, {
      actorUserId: input.actorUserId, action: 'substitution.assignment_finished',
      targetType: 'teacher_assignment', targetId: String(request.teacher_assignment_id),
      details: { requestId: id, lastEffectiveOn }
    });
    return serializeRequest(await getRequestRow(db, id));
  }, { label: `substitution:finish:${id}` });
}

async function closePendingRequest(db, requestId, input, mode) {
  const id = positiveId(requestId, 'Solicitud');
  const nextStatus = mode === 'reject' ? 'rejected' : 'cancelled';
  const reason = safeText(input.reason, 500);
  return withImmediateTransaction(db, async () => {
    const request = await getRequestRow(db, id);
    if (!request) throw domainError(404, 'Solicitud no encontrada.', 'UNKNOWN_REQUEST');
    if (!['pending', 'pending_provisioning'].includes(request.status)) {
      throw domainError(409, 'Solo pueden cerrarse solicitudes todavía pendientes.', 'INVALID_REQUEST_STATE');
    }
    const actorId = positiveId(input.actorUserId, 'Actor');
    const fields = mode === 'reject'
      ? ['rejected_by_user_id', 'rejected_at', 'reject_reason']
      : ['cancelled_by_user_id', 'cancelled_at', 'cancel_reason'];
    await db.run(
      `UPDATE substitution_requests
       SET status = ?, ${fields[0]} = ?, ${fields[1]} = CURRENT_TIMESTAMP,
           ${fields[2]} = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [nextStatus, actorId, reason, id]
    );
    await appendOperationalHistory(db, {
      actorUserId: actorId, action: `substitution.${nextStatus}`,
      title: nextStatus === 'rejected' ? 'Solicitud de sustitución rechazada' : 'Solicitud de sustitución cancelada',
      type: 'substitution', targetType: 'substitution_request', targetId: String(id),
      before: { status: request.status }, after: { status: nextStatus, reason }
    });
    await appendAuditEvent(db, {
      actorUserId: actorId, action: `substitution.request_${nextStatus}`,
      targetType: 'substitution_request', targetId: String(id), details: { previousStatus: request.status }
    });
    return serializeRequest(await getRequestRow(db, id));
  }, { label: `substitution:${nextStatus}:${id}` });
}

async function finalizeExpiredRequests(db, dateKey = madridDateKey()) {
  const date = normalizeDateKey(dateKey);
  return withImmediateTransaction(db, async () => {
    const expired = await db.all(
      `SELECT id, teacher_assignment_id, planned_ends_on
       FROM substitution_requests
       WHERE status = 'active' AND planned_ends_on < ?`, [date]
    );
    for (const row of expired) {
      await db.run(
        `UPDATE substitution_requests
         SET status = 'finished', finished_at = COALESCE(finished_at, CURRENT_TIMESTAMP),
             finish_reason = CASE WHEN finish_reason = '' THEN 'natural_expiry' ELSE finish_reason END,
             updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [row.id]
      );
      await appendOperationalHistory(db, {
        action: 'substitution.expired', title: 'Sustitución finalizada por fecha', type: 'substitution',
        targetType: 'substitution_request', targetId: String(row.id),
        before: { status: 'active' }, after: { status: 'finished', lastEffectiveOn: row.planned_ends_on }
      });
      await appendAuditEvent(db, {
        action: 'substitution.assignment_expired', targetType: 'teacher_assignment',
        targetId: String(row.teacher_assignment_id), details: { requestId: row.id }
      });
    }
    return expired.length;
  }, { label: 'substitution:expire' });
}

async function listRequests(db) {
  await ensureLegacyAliasesImported(db);
  await finalizeExpiredRequests(db);
  const rows = await db.all('SELECT id FROM substitution_requests ORDER BY created_at DESC, id DESC');
  return Promise.all(rows.map(async row => serializeRequest(await getRequestRow(db, row.id))));
}

async function listLegacyAliases(db) {
  await ensureLegacyAliasesImported(db);
  return db.all(
    `SELECT id, titular_name AS titularName, substitute_name AS substituteName,
            status, substitution_request_id AS substitutionRequestId,
            imported_at AS importedAt, reconciled_at AS reconciledAt, notes
     FROM legacy_substitution_aliases ORDER BY status DESC, id`
  );
}

async function reconcileLegacyAlias(db, aliasId, input) {
  const id = positiveId(aliasId, 'Alias legacy');
  return withImmediateTransaction(db, async () => {
    await ensureLegacyAliasesImported(db);
    const alias = await db.get('SELECT * FROM legacy_substitution_aliases WHERE id = ?', [id]);
    if (!alias) throw domainError(404, 'Alias legacy no encontrado.', 'UNKNOWN_LEGACY_ALIAS');
    if (alias.status !== 'unresolved') throw domainError(409, 'El alias legacy ya fue clasificado.', 'INVALID_LEGACY_STATE');
    const request = await createRequest(db, {
      titularAssignmentId: input.titularAssignmentId,
      substituteUserId: input.substituteUserId,
      proposedDisplayName: input.proposedDisplayName || alias.substitute_name,
      proposedUsername: input.proposedUsername,
      startsOn: input.startsOn,
      plannedEndsOn: input.plannedEndsOn,
      actorUserId: input.actorUserId
    });
    await db.run(
      `UPDATE legacy_substitution_aliases
       SET status = 'resolved', substitution_request_id = ?, reconciled_by_user_id = ?,
           reconciled_at = CURRENT_TIMESTAMP, notes = ? WHERE id = ?`,
      [request.id, positiveId(input.actorUserId, 'Actor'), safeText(input.notes, 500), id]
    );
    await appendOperationalHistory(db, {
      actorUserId: input.actorUserId, action: 'substitution.legacy_reconciled',
      title: 'Alias legacy reconciliado', type: 'substitution',
      targetType: 'legacy_substitution_alias', targetId: String(id),
      before: { status: 'unresolved' }, after: { status: 'resolved', substitutionRequestId: request.id }
    });
    await appendAuditEvent(db, {
      actorUserId: input.actorUserId, action: 'substitution.legacy_reconciled',
      targetType: 'legacy_substitution_alias', targetId: String(id), details: { substitutionRequestId: request.id }
    });
    return { aliasId: id, status: 'resolved', request };
  }, { label: `substitution:legacy-resolve:${id}` });
}

async function markLegacyAliasObsolete(db, aliasId, input) {
  const id = positiveId(aliasId, 'Alias legacy');
  return withImmediateTransaction(db, async () => {
    await ensureLegacyAliasesImported(db);
    const alias = await db.get('SELECT * FROM legacy_substitution_aliases WHERE id = ?', [id]);
    if (!alias) throw domainError(404, 'Alias legacy no encontrado.', 'UNKNOWN_LEGACY_ALIAS');
    if (alias.status !== 'unresolved') throw domainError(409, 'El alias legacy ya fue clasificado.', 'INVALID_LEGACY_STATE');
    await db.run(
      `UPDATE legacy_substitution_aliases SET status = 'obsolete', reconciled_by_user_id = ?,
       reconciled_at = CURRENT_TIMESTAMP, notes = ? WHERE id = ?`,
      [positiveId(input.actorUserId, 'Actor'), safeText(input.notes, 500), id]
    );
    await appendOperationalHistory(db, {
      actorUserId: input.actorUserId, action: 'substitution.legacy_obsolete',
      title: 'Alias legacy marcado como obsoleto', type: 'substitution',
      targetType: 'legacy_substitution_alias', targetId: String(id),
      before: { status: 'unresolved' }, after: { status: 'obsolete' }
    });
    await appendAuditEvent(db, {
      actorUserId: input.actorUserId, action: 'substitution.legacy_obsolete',
      targetType: 'legacy_substitution_alias', targetId: String(id)
    });
    return { aliasId: id, status: 'obsolete' };
  }, { label: `substitution:legacy-obsolete:${id}` });
}

async function listEffectiveSubstitutions(db, dateKey = madridDateKey()) {
  const date = normalizeDateKey(dateKey);
  const rows = await db.all(
    `SELECT substitute_assignment.id AS assignment_id,
            substitute_assignment.starts_on, substitute_assignment.ends_on,
            titular.id AS titular_assignment_id, titular.user_id AS titular_user_id,
            profile.id AS profile_id, profile.display_name AS titular_display_name,
            substitute.id AS substitute_user_id, substitute.username AS substitute_username,
            substitute.display_name AS substitute_display_name,
            identity.external_key AS source_code
     FROM teacher_assignments substitute_assignment
     JOIN teacher_assignments titular ON titular.id = substitute_assignment.replaces_assignment_id
     JOIN teacher_profiles profile ON profile.id = substitute_assignment.teacher_profile_id
     JOIN users substitute ON substitute.id = substitute_assignment.user_id AND substitute.is_active = 1
     LEFT JOIN schedule_datasets dataset
       ON dataset.academic_year_id = substitute_assignment.academic_year_id AND dataset.status = 'active'
     LEFT JOIN schedule_dataset_teachers roster
       ON roster.dataset_id = dataset.id AND roster.teacher_profile_id = profile.id
     LEFT JOIN teacher_external_identities identity ON identity.id = roster.teacher_external_identity_id
     WHERE substitute_assignment.assignment_type = 'sustituto'
       AND EXISTS (
         SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
         WHERE ur.user_id = substitute_assignment.user_id AND r.key = 'teacher'
       )
       AND substitute_assignment.starts_on <= ?
       AND (substitute_assignment.ends_on IS NULL OR substitute_assignment.ends_on >= ?)
     ORDER BY profile.display_name COLLATE NOCASE, substitute_assignment.id`,
    [date, date]
  );
  return rows.map(row => ({
    assignmentId: row.assignment_id,
    status: 'active',
    startsOn: row.starts_on,
    endsOn: row.ends_on || null,
    titular: {
      assignmentId: row.titular_assignment_id, userId: row.titular_user_id,
      profileId: row.profile_id, displayName: row.titular_display_name,
      sourceCode: row.source_code || null
    },
    substitute: {
      userId: row.substitute_user_id, username: row.substitute_username,
      displayName: row.substitute_display_name
    }
  }));
}

async function getScheduleSubstitutionContext(db, identity, dateKey) {
  if (!identity) return null;
  const date = normalizeDateKey(dateKey);
  if (identity.assignment.type === 'sustituto') {
    const row = await db.get(
      `SELECT titular_user.display_name AS titular_display_name,
              substitute.display_name AS substitute_display_name,
              assignment.starts_on, assignment.ends_on
       FROM teacher_assignments assignment
       JOIN teacher_assignments titular ON titular.id = assignment.replaces_assignment_id
       JOIN users titular_user ON titular_user.id = titular.user_id
       JOIN users substitute ON substitute.id = assignment.user_id
       WHERE assignment.id = ?`, [identity.assignment.id]
    );
    return row ? {
      role: 'substitute', status: 'active', startsOn: row.starts_on, endsOn: row.ends_on,
      titular: { displayName: row.titular_display_name },
      substitute: { userId: identity.userId, displayName: row.substitute_display_name }
    } : null;
  }
  const row = await db.get(
    `SELECT substitute_user.id AS substitute_user_id,
            substitute_user.display_name AS substitute_display_name,
            substitute.starts_on, substitute.ends_on
     FROM teacher_assignments substitute
     JOIN users substitute_user ON substitute_user.id = substitute.user_id AND substitute_user.is_active = 1
     WHERE substitute.replaces_assignment_id = ?
       AND substitute.starts_on <= ? AND (substitute.ends_on IS NULL OR substitute.ends_on >= ?)
     ORDER BY substitute.starts_on DESC, substitute.id DESC LIMIT 1`,
    [identity.assignment.id, date, date]
  );
  return row ? {
    role: 'titular', status: 'active', startsOn: row.starts_on, endsOn: row.ends_on,
    titular: { userId: identity.userId, displayName: identity.teacherProfile.displayName },
    substitute: { userId: row.substitute_user_id, displayName: row.substitute_display_name }
  } : null;
}

module.exports = {
  activateRequest,
  closePendingRequest,
  createRequest,
  ensureLegacyAliasesImported,
  finalizeExpiredRequests,
  finishRequest,
  getScheduleSubstitutionContext,
  linkExistingUser,
  listCandidateUsers,
  listEffectiveSubstitutions,
  listLegacyAliases,
  listRequests,
  listTitularAssignments,
  madridDateKey,
  markLegacyAliasObsolete,
  provisionRequestUser,
  reconcileLegacyAlias,
  serializeRequest,
  validateInterval
};
