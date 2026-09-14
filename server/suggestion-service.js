const { appendOperationalHistory } = require('./operational-history');
const { withImmediateTransaction } = require('./db');

const CATEGORIES = Object.freeze([
  'usabilidad', 'guardias', 'sustituciones', 'horarios',
  'sala_profesorado', 'movil', 'rendimiento', 'otro'
]);
const STATUSES = Object.freeze([
  'new', 'reviewing', 'accepted', 'planned',
  'implemented', 'discarded', 'duplicate'
]);

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

function parseId(value) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw httpError(404, 'Sugerencia no encontrada.');
  return id;
}

function requiredText(value, field, maximum) {
  if (typeof value !== 'string') throw httpError(400, `${field} es obligatorio.`);
  const text = value.trim();
  if (!text) throw httpError(400, `${field} es obligatorio.`);
  if (text.length > maximum) throw httpError(400, `${field} supera el máximo de ${maximum} caracteres.`);
  return text;
}

function optionalText(value, field, maximum) {
  if (value == null || value === '') return '';
  if (typeof value !== 'string') throw httpError(400, `${field} debe ser texto.`);
  const text = value.trim();
  if (text.length > maximum) throw httpError(400, `${field} supera el máximo de ${maximum} caracteres.`);
  return text;
}

function assertAllowedKeys(input, allowed) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw httpError(400, 'El cuerpo debe ser un objeto JSON.');
  const unexpected = Object.keys(input).filter(key => !allowed.has(key));
  if (unexpected.length) throw httpError(400, `Campos no permitidos: ${unexpected.join(', ')}.`);
}

function normalizeCreateInput(input) {
  assertAllowedKeys(input, new Set(['title', 'description', 'category']));
  const category = requiredText(input.category, 'category', 40).toLowerCase();
  if (!CATEGORIES.includes(category)) throw httpError(400, 'Categoría no válida.');
  return {
    title: requiredText(input.title, 'title', 120),
    description: requiredText(input.description, 'description', 3000),
    category
  };
}

function normalizeReviewInput(input) {
  assertAllowedKeys(input, new Set(['status', 'adminNote', 'implementedVersion']));
  if (!Object.keys(input).length) throw httpError(400, 'No hay cambios que guardar.');
  const result = {};
  if (Object.hasOwn(input, 'status')) {
    const status = requiredText(input.status, 'status', 40).toLowerCase();
    if (!STATUSES.includes(status)) throw httpError(400, 'Estado no válido.');
    result.status = status;
  }
  if (Object.hasOwn(input, 'adminNote')) result.adminNote = optionalText(input.adminNote, 'adminNote', 2000);
  if (Object.hasOwn(input, 'implementedVersion')) {
    result.implementedVersion = optionalText(input.implementedVersion, 'implementedVersion', 64) || null;
  }
  return result;
}

const SELECT_FIELDS = `
  suggestion.id, suggestion.created_by_user_id, suggestion.title,
  suggestion.description, suggestion.category, suggestion.status,
  suggestion.created_at, suggestion.updated_at, suggestion.reviewed_by_user_id,
  suggestion.reviewed_at, suggestion.admin_note, suggestion.implemented_version,
  author.username AS author_username, author.display_name AS author_display_name,
  reviewer.username AS reviewer_username, reviewer.display_name AS reviewer_display_name,
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
    WHERE assignment.user_id = suggestion.created_by_user_id
      AND assignment.starts_on <= date('now')
      AND (assignment.ends_on IS NULL OR assignment.ends_on >= date('now'))
    ORDER BY CASE assignment.assignment_type WHEN 'sustituto' THEN 0 ELSE 1 END,
             assignment.starts_on DESC, assignment.id DESC
    LIMIT 1
  ) AS author_source_code
FROM suggestions suggestion
JOIN users author ON author.id = suggestion.created_by_user_id
LEFT JOIN users reviewer ON reviewer.id = suggestion.reviewed_by_user_id`;

function serialize(row, includePrivate = false) {
  const result = {
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    reviewedAt: row.reviewed_at || null,
    implementedVersion: row.implemented_version || null
  };
  if (!includePrivate) return result;
  return {
    ...result,
    author: {
      userId: row.created_by_user_id,
      username: row.author_username,
      displayName: row.author_display_name,
      sourceCode: row.author_source_code || null
    },
    reviewer: row.reviewed_by_user_id ? {
      userId: row.reviewed_by_user_id,
      username: row.reviewer_username,
      displayName: row.reviewer_display_name
    } : null,
    adminNote: row.admin_note || ''
  };
}

async function loadRow(db, id) {
  return db.get(`SELECT ${SELECT_FIELDS} WHERE suggestion.id = ?`, [parseId(id)]);
}

async function createSuggestion(db, input, actorUserId) {
  const actorId = Number(actorUserId);
  if (!Number.isSafeInteger(actorId) || actorId <= 0) throw httpError(401, 'Sesión no válida.');
  const normalized = normalizeCreateInput(input);
  return withImmediateTransaction(db, async () => {
    const inserted = await db.run(
      `INSERT INTO suggestions (created_by_user_id, title, description, category)
       VALUES (?, ?, ?, ?)`,
      [actorId, normalized.title, normalized.description, normalized.category]
    );
    await appendOperationalHistory(db, {
      actorUserId: actorId,
      action: 'suggestion.created',
      title: 'Sugerencia creada',
      type: 'suggestion',
      targetType: 'suggestion',
      targetId: String(inserted.lastID),
      after: { status: 'new', category: normalized.category }
    });
    return serialize(await loadRow(db, inserted.lastID));
  }, { label: 'suggestion:create' });
}

async function listOwnSuggestions(db, actorUserId) {
  const rows = await db.all(
    `SELECT ${SELECT_FIELDS}
     WHERE suggestion.created_by_user_id = ?
     ORDER BY suggestion.created_at DESC, suggestion.id DESC`,
    [Number(actorUserId)]
  );
  return rows.map(row => serialize(row));
}

async function getSuggestion(db, id, actorUserId, canReview) {
  const row = await loadRow(db, id);
  if (!row) throw httpError(404, 'Sugerencia no encontrada.');
  if (!canReview && Number(row.created_by_user_id) !== Number(actorUserId)) {
    throw httpError(404, 'Sugerencia no encontrada.');
  }
  return serialize(row, !!canReview);
}

async function listSuggestions(db, filters = {}) {
  const where = [];
  const params = [];
  if (filters.status) {
    const status = requiredText(filters.status, 'status', 40).toLowerCase();
    if (!STATUSES.includes(status)) throw httpError(400, 'Estado no válido.');
    where.push('suggestion.status = ?');
    params.push(status);
  }
  if (filters.query) {
    const query = requiredText(filters.query, 'q', 120);
    where.push(`(suggestion.title LIKE ? COLLATE NOCASE
      OR author.username LIKE ? COLLATE NOCASE
      OR author.display_name LIKE ? COLLATE NOCASE)`);
    params.push(`%${query}%`, `%${query}%`, `%${query}%`);
  }
  const rows = await db.all(
    `SELECT ${SELECT_FIELDS} ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY suggestion.created_at DESC, suggestion.id DESC`,
    params
  );
  return rows.map(row => serialize(row, true));
}

async function reviewSuggestion(db, id, input, actorUserId) {
  const suggestionId = parseId(id);
  const actorId = Number(actorUserId);
  const normalized = normalizeReviewInput(input);
  return withImmediateTransaction(db, async () => {
    const before = await loadRow(db, suggestionId);
    if (!before) throw httpError(404, 'Sugerencia no encontrada.');
    const nextStatus = normalized.status ?? before.status;
    const nextNote = Object.hasOwn(normalized, 'adminNote') ? normalized.adminNote : before.admin_note;
    const nextVersion = Object.hasOwn(normalized, 'implementedVersion')
      ? normalized.implementedVersion
      : before.implemented_version;
    await db.run(
      `UPDATE suggestions
       SET status = ?, admin_note = ?, implemented_version = ?,
           reviewed_by_user_id = ?, reviewed_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [nextStatus, nextNote, nextVersion, actorId, suggestionId]
    );
    const statusChanged = before.status !== nextStatus;
    await appendOperationalHistory(db, {
      actorUserId: actorId,
      action: statusChanged ? 'suggestion.status_changed' : 'suggestion.review_updated',
      title: statusChanged ? 'Estado de sugerencia actualizado' : 'Revisión de sugerencia actualizada',
      type: 'suggestion',
      targetType: 'suggestion',
      targetId: String(suggestionId),
      before: {
        status: before.status,
        hasAdminNote: !!before.admin_note,
        implementedVersion: before.implemented_version || null
      },
      after: {
        status: nextStatus,
        hasAdminNote: !!nextNote,
        implementedVersion: nextVersion || null
      }
    });
    return serialize(await loadRow(db, suggestionId), true);
  }, { label: `suggestion:review:${suggestionId}` });
}

module.exports = {
  CATEGORIES,
  STATUSES,
  createSuggestion,
  getSuggestion,
  listOwnSuggestions,
  listSuggestions,
  normalizeCreateInput,
  normalizeReviewInput,
  reviewSuggestion
};
