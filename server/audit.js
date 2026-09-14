const SENSITIVE_AUDIT_KEY = /(?:password|passphrase|secret|token|cookie|authorization|credential|hash|salt|session)/i;
const SENSITIVE_AUDIT_VALUE = /(?:password|passphrase|secret|token|cookie|authorization|credential|hash|salt|session|bearer\s+)/i;
const OPAQUE_SECRET_VALUE = /^(?:[a-f0-9]{32,}|[A-Za-z0-9_-]{40,}\.?[A-Za-z0-9._-]*)$/;

function redactAuditString(value) {
  const text = String(value);
  return SENSITIVE_AUDIT_VALUE.test(text) || OPAQUE_SECRET_VALUE.test(text) ? '[REDACTED]' : text;
}

function redactAuditDetails(value, seen = new WeakSet()) {
  if (value == null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') return redactAuditString(value);
  if (typeof value !== 'object') return String(value);
  if (seen.has(value)) return '[REDACTED:CIRCULAR]';
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map(item => redactAuditDetails(item, seen));
  }

  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    SENSITIVE_AUDIT_KEY.test(key) ? '[REDACTED]' : redactAuditDetails(item, seen)
  ]));
}

async function appendAuditEvent(db, event) {
  const action = String(event?.action || '').trim();
  if (!action) throw new Error('Audit action is required.');
  if (!/^[a-z0-9._-]{1,128}$/i.test(action)) throw new Error('Audit action is invalid.');

  const actorUserId = Number(event.actorUserId);
  let actor = null;
  if (Number.isSafeInteger(actorUserId) && actorUserId > 0) {
    actor = await db.get(
      `SELECT u.username,
              GROUP_CONCAT(DISTINCT r.key) AS role_keys,
              (
                SELECT external.external_key
                FROM teacher_assignments assignment
                JOIN teacher_external_identities external
                  ON external.teacher_profile_id = assignment.teacher_profile_id
                JOIN schedule_datasets dataset
                  ON dataset.academic_year_id = assignment.academic_year_id
                 AND dataset.status = 'active'
                 AND dataset.source_system = external.source_system
                JOIN schedule_dataset_teachers roster
                  ON roster.dataset_id = dataset.id
                 AND roster.teacher_profile_id = assignment.teacher_profile_id
                 AND roster.teacher_external_identity_id = external.id
                WHERE assignment.user_id = u.id
                  AND assignment.assignment_type = 'titular'
                  AND assignment.starts_on <= date('now')
                  AND (assignment.ends_on IS NULL OR assignment.ends_on >= date('now'))
                ORDER BY assignment.starts_on DESC, assignment.id DESC
                LIMIT 1
              ) AS source_code
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r ON r.id = ur.role_id
       WHERE u.id = ?
       GROUP BY u.id`,
      [actorUserId]
    );
  }
  const roles = String(actor?.role_keys || '').split(',').map(value => value.trim()).filter(Boolean).sort();
  const details = redactAuditDetails({
    ...(event.details || {}),
    actor: actor ? {
      userId: actorUserId,
      username: actor.username,
      sourceCode: actor.source_code || null,
      roles
    } : null
  });
  await db.run(
    `INSERT INTO audit_log
      (actor_user_id, actor_username, actor_source_code, actor_roles_json,
       action, target_type, target_id, outcome, details_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      actor ? actorUserId : null,
      actor?.username || '',
      actor?.source_code || null,
      JSON.stringify(roles),
      action,
      redactAuditString(String(event.targetType || '').trim()),
      redactAuditString(String(event.targetId || '').trim()),
      event.outcome === 'failure' ? 'failure' : 'success',
      JSON.stringify(details)
    ]
  );
}

module.exports = { appendAuditEvent, redactAuditDetails, redactAuditString };
