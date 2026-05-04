const TV_ANNOUNCEMENT_STATE_KEY = 'tv_announcement';
const ALLOWED_PRIORITIES = new Set(['urgent', 'important', 'normal']);

function normalizeAnnouncementItem(item, index = 0) {
  const input = item && typeof item === 'object' ? item : {};
  const text = String(input.text || '').trim().replace(/\s+/g, ' ').slice(0, 600);
  const priority = ALLOWED_PRIORITIES.has(String(input.priority || '').trim()) ? String(input.priority).trim() : 'normal';
  const active = !!input.active && !!text;
  return {
    id: String(input.id || `aviso-${Date.now()}-${index}`).trim(),
    text,
    priority,
    active
  };
}

function normalizeAnnouncementState(body) {
  const input = body && typeof body === 'object' ? body : {};
  const itemsSource = Array.isArray(input.items)
    ? input.items
    : (input.text || input.active ? [{ text: input.text, active: input.active, priority: input.priority }] : []);
  const items = itemsSource
    .map((item, index) => normalizeAnnouncementItem(item, index))
    .filter(item => item.text);
  return {
    items,
    updatedBy: String(input.updatedBy || 'Jefatura').trim() || 'Jefatura'
  };
}

function defaultAnnouncementState() {
  return {
    items: [],
    updatedAt: '',
    updatedBy: ''
  };
}

async function readAnnouncementState(db) {
  const row = await db.get('SELECT value, updated_at FROM app_state WHERE key = ?', [TV_ANNOUNCEMENT_STATE_KEY]);
  if (!row?.value) return defaultAnnouncementState();
  try {
    const parsed = JSON.parse(row.value);
    const normalized = normalizeAnnouncementState(parsed);
    return {
      items: normalized.items,
      updatedAt: row.updated_at || '',
      updatedBy: normalized.updatedBy
    };
  } catch (_error) {
    return defaultAnnouncementState();
  }
}

module.exports = {
  TV_ANNOUNCEMENT_STATE_KEY,
  normalizeAnnouncementItem,
  normalizeAnnouncementState,
  defaultAnnouncementState,
  readAnnouncementState
};
