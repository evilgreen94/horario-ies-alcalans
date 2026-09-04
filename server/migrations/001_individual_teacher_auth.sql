CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL COLLATE NOCASE UNIQUE,
  display_name TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL COLLATE NOCASE UNIQUE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id INTEGER NOT NULL,
  role_id INTEGER NOT NULL,
  granted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, role_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS teacher_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  schedule_key TEXT COLLATE NOCASE UNIQUE,
  display_name TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS teacher_assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  teacher_profile_id INTEGER NOT NULL,
  assignment_type TEXT NOT NULL CHECK(assignment_type IN ('titular', 'sustituto')),
  starts_on TEXT NOT NULL CHECK(starts_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  ends_on TEXT CHECK(ends_on IS NULL OR ends_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  replaces_assignment_id INTEGER,
  created_by_user_id INTEGER,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(ends_on IS NULL OR ends_on >= starts_on),
  CHECK(
    (assignment_type = 'titular' AND replaces_assignment_id IS NULL) OR
    (assignment_type = 'sustituto' AND replaces_assignment_id IS NOT NULL)
  ),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (teacher_profile_id) REFERENCES teacher_profiles(id) ON DELETE RESTRICT,
  FOREIGN KEY (replaces_assignment_id) REFERENCES teacher_assignments(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_user_id INTEGER,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL DEFAULT '',
  target_id TEXT NOT NULL DEFAULT '',
  outcome TEXT NOT NULL DEFAULT 'success' CHECK(outcome IN ('success', 'failure')),
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_user_roles_role_id
  ON user_roles(role_id, user_id);

CREATE INDEX IF NOT EXISTS idx_teacher_assignments_user_dates
  ON teacher_assignments(user_id, starts_on, ends_on, assignment_type);

CREATE INDEX IF NOT EXISTS idx_teacher_assignments_profile_dates
  ON teacher_assignments(teacher_profile_id, starts_on, ends_on);

CREATE INDEX IF NOT EXISTS idx_audit_log_actor_created
  ON audit_log(actor_user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_audit_log_target
  ON audit_log(target_type, target_id, created_at);

CREATE TRIGGER IF NOT EXISTS trg_teacher_assignments_validate_insert
BEFORE INSERT ON teacher_assignments
BEGIN
  SELECT CASE WHEN NEW.assignment_type = 'sustituto' AND NOT EXISTS (
    SELECT 1
    FROM teacher_assignments titular
    WHERE titular.id = NEW.replaces_assignment_id
      AND titular.assignment_type = 'titular'
      AND titular.teacher_profile_id = NEW.teacher_profile_id
      AND titular.starts_on <= NEW.starts_on
      AND COALESCE(titular.ends_on, '9999-12-31') >= COALESCE(NEW.ends_on, '9999-12-31')
  ) THEN RAISE(ABORT, 'invalid titular assignment for substitute') END;

  SELECT CASE WHEN EXISTS (
    SELECT 1
    FROM teacher_assignments current
    WHERE current.assignment_type = NEW.assignment_type
      AND (current.user_id = NEW.user_id OR current.teacher_profile_id = NEW.teacher_profile_id)
      AND current.starts_on <= COALESCE(NEW.ends_on, '9999-12-31')
      AND NEW.starts_on <= COALESCE(current.ends_on, '9999-12-31')
  ) THEN RAISE(ABORT, 'overlapping teacher assignment') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_teacher_assignments_validate_update
BEFORE UPDATE ON teacher_assignments
BEGIN
  SELECT CASE WHEN NEW.assignment_type = 'sustituto' AND NOT EXISTS (
    SELECT 1
    FROM teacher_assignments titular
    WHERE titular.id = NEW.replaces_assignment_id
      AND titular.id <> NEW.id
      AND titular.assignment_type = 'titular'
      AND titular.teacher_profile_id = NEW.teacher_profile_id
      AND titular.starts_on <= NEW.starts_on
      AND COALESCE(titular.ends_on, '9999-12-31') >= COALESCE(NEW.ends_on, '9999-12-31')
  ) THEN RAISE(ABORT, 'invalid titular assignment for substitute') END;

  SELECT CASE WHEN EXISTS (
    SELECT 1
    FROM teacher_assignments current
    WHERE current.id <> NEW.id
      AND current.assignment_type = NEW.assignment_type
      AND (current.user_id = NEW.user_id OR current.teacher_profile_id = NEW.teacher_profile_id)
      AND current.starts_on <= COALESCE(NEW.ends_on, '9999-12-31')
      AND NEW.starts_on <= COALESCE(current.ends_on, '9999-12-31')
  ) THEN RAISE(ABORT, 'overlapping teacher assignment') END;

  SELECT CASE WHEN EXISTS (
    SELECT 1
    FROM teacher_assignments substitute
    WHERE substitute.replaces_assignment_id = OLD.id
      AND (
        NEW.assignment_type <> 'titular' OR
        substitute.teacher_profile_id <> NEW.teacher_profile_id OR
        substitute.starts_on < NEW.starts_on OR
        COALESCE(substitute.ends_on, '9999-12-31') > COALESCE(NEW.ends_on, '9999-12-31')
      )
  ) THEN RAISE(ABORT, 'titular update would invalidate substitute') END;
END;

INSERT OR IGNORE INTO roles (key, name) VALUES ('teacher', 'Profesorado');
INSERT OR IGNORE INTO roles (key, name) VALUES ('admin', 'Jefatura');
INSERT OR IGNORE INTO roles (key, name) VALUES ('superadmin', 'Superadministración');
