CREATE TABLE IF NOT EXISTS suggestions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_by_user_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN (
    'usabilidad', 'guardias', 'sustituciones', 'horarios',
    'sala_profesorado', 'movil', 'rendimiento', 'otro'
  )),
  status TEXT NOT NULL DEFAULT 'new' CHECK(status IN (
    'new', 'reviewing', 'accepted', 'planned',
    'implemented', 'discarded', 'duplicate'
  )),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_by_user_id INTEGER,
  reviewed_at TEXT,
  admin_note TEXT NOT NULL DEFAULT '',
  implemented_version TEXT,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (reviewed_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CHECK(length(trim(title)) BETWEEN 1 AND 120),
  CHECK(length(trim(description)) BETWEEN 1 AND 3000),
  CHECK(length(admin_note) <= 2000),
  CHECK(implemented_version IS NULL OR length(trim(implemented_version)) BETWEEN 1 AND 64)
);

CREATE INDEX IF NOT EXISTS idx_suggestions_author_created
  ON suggestions(created_by_user_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_suggestions_status_created
  ON suggestions(status, created_at DESC, id DESC);
