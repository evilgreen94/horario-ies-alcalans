const SENSITIVE_AUDIT_KEY = /(?:password|passphrase|secret|token|cookie|authorization|credential|hash|salt|session)/i;

function redactAuditDetails(value, seen = new WeakSet()) {
  if (value == null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') return value;
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

  await db.run(
    `INSERT INTO audit_log
      (actor_user_id, action, target_type, target_id, outcome, details_json)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      event.actorUserId || null,
      action,
      String(event.targetType || '').trim(),
      String(event.targetId || '').trim(),
      event.outcome === 'failure' ? 'failure' : 'success',
      JSON.stringify(redactAuditDetails(event.details || {}))
    ]
  );
}

module.exports = { appendAuditEvent, redactAuditDetails };
