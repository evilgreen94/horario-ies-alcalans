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

  await db.run(
    `INSERT INTO audit_log
      (actor_user_id, action, target_type, target_id, outcome, details_json)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      event.actorUserId || null,
      action,
      redactAuditString(String(event.targetType || '').trim()),
      redactAuditString(String(event.targetId || '').trim()),
      event.outcome === 'failure' ? 'failure' : 'success',
      JSON.stringify(redactAuditDetails(event.details || {}))
    ]
  );
}

module.exports = { appendAuditEvent, redactAuditDetails, redactAuditString };
