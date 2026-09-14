const crypto = require('node:crypto');
const { redactAuditDetails } = require('./audit');

function safeJson(value) {
  return value == null ? null : JSON.stringify(redactAuditDetails(value));
}

async function getActorSnapshot(db, actorUserId) {
  const id = Number(actorUserId);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const row = await db.get(
    `SELECT u.id, u.username, u.display_name,
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
    [id]
  );
  if (!row) return null;
  return {
    userId: row.id,
    username: row.username,
    displayName: row.display_name,
    sourceCode: row.source_code || null,
    roles: String(row.role_keys || '').split(',').map(value => value.trim()).filter(Boolean).sort()
  };
}

async function appendOperationalHistory(db, event) {
  const action = String(event?.action || '').trim();
  if (!/^[a-z0-9._-]{1,128}$/i.test(action)) throw new Error('Operational history action is invalid.');
  const actor = await getActorSnapshot(db, event.actorUserId);
  const id = `history-${crypto.randomUUID()}`;
  const title = String(event.title || action).trim().slice(0, 200);
  const detail = String(event.detail || '').trim().slice(0, 1000);
  const targetType = String(event.targetType || '').trim().slice(0, 80);
  const targetId = String(event.targetId || '').trim().slice(0, 160);
  await db.run(
    `INSERT INTO historial (
       id, title, detail, type, actor, ts, undo_state,
       actor_user_id, actor_username, actor_source_code, actor_roles_json,
       action, target_type, target_id, outcome, before_json, after_json
     ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      title,
      detail,
      String(event.type || 'other').slice(0, 40),
      actor?.displayName || actor?.username || 'Sistema',
      actor?.userId || null,
      actor?.username || '',
      actor?.sourceCode || null,
      JSON.stringify(actor?.roles || []),
      action,
      targetType,
      targetId,
      event.outcome === 'failure' ? 'failure' : 'success',
      safeJson(event.before),
      safeJson(event.after)
    ]
  );
  return id;
}

function parseJson(value, fallback = null) {
  if (!value) return fallback;
  try { return JSON.parse(value); } catch (_error) { return fallback; }
}

function serializeHistoryRow(row) {
  return {
    id: row.id,
    title: row.title,
    detail: row.detail || '',
    type: row.type || 'other',
    actor: row.actor || row.actor_username || 'Sistema',
    actorIdentity: {
      userId: row.actor_user_id || null,
      username: row.actor_username || '',
      displayName: row.actor || '',
      sourceCode: row.actor_source_code || null,
      roles: parseJson(row.actor_roles_json, [])
    },
    action: row.action || '',
    target: { type: row.target_type || '', id: row.target_id || '' },
    result: row.outcome || 'success',
    timestamp: row.ts,
    before: parseJson(row.before_json),
    after: parseJson(row.after_json),
    archivedAt: row.archived_at || null,
    undoState: row.undo_state ? parseJson(row.undo_state) : null
  };
}

module.exports = { appendOperationalHistory, getActorSnapshot, serializeHistoryRow };
