CREATE TABLE IF NOT EXISTS historial (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  detail TEXT DEFAULT '',
  type TEXT DEFAULT 'other',
  actor TEXT DEFAULT 'Jefatura',
  ts TEXT NOT NULL,
  undo_state TEXT
);

CREATE TABLE IF NOT EXISTS substitution_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  titular_assignment_id INTEGER NOT NULL,
  proposed_display_name TEXT NOT NULL DEFAULT '',
  proposed_username TEXT NOT NULL DEFAULT '',
  substitute_user_id INTEGER,
  teacher_assignment_id INTEGER UNIQUE,
  starts_on TEXT NOT NULL,
  planned_ends_on TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN (
    'pending', 'pending_provisioning', 'active', 'finished', 'cancelled', 'rejected'
  )),
  created_by_user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  provisioned_by_user_id INTEGER,
  provisioned_at TEXT,
  activated_by_user_id INTEGER,
  activated_at TEXT,
  finished_by_user_id INTEGER,
  finished_at TEXT,
  finish_reason TEXT NOT NULL DEFAULT '',
  cancelled_by_user_id INTEGER,
  cancelled_at TEXT,
  cancel_reason TEXT NOT NULL DEFAULT '',
  rejected_by_user_id INTEGER,
  rejected_at TEXT,
  reject_reason TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(length(proposed_display_name) <= 160),
  CHECK(length(proposed_username) <= 64),
  CHECK(length(finish_reason) <= 500),
  CHECK(length(cancel_reason) <= 500),
  CHECK(length(reject_reason) <= 500),
  CHECK(date(starts_on, '+0 days') = starts_on),
  CHECK(date(planned_ends_on, '+0 days') = planned_ends_on),
  CHECK(starts_on <= planned_ends_on),
  CHECK(substitute_user_id IS NOT NULL OR length(trim(proposed_display_name)) > 0),
  CHECK(
    (status IN ('active', 'finished') AND teacher_assignment_id IS NOT NULL) OR
    (status NOT IN ('active', 'finished') AND teacher_assignment_id IS NULL)
  ),
  FOREIGN KEY (titular_assignment_id) REFERENCES teacher_assignments(id) ON DELETE RESTRICT,
  FOREIGN KEY (substitute_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (teacher_assignment_id) REFERENCES teacher_assignments(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (provisioned_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (activated_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (finished_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (cancelled_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (rejected_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_substitution_requests_status_dates
  ON substitution_requests(status, starts_on, planned_ends_on, id);

CREATE INDEX IF NOT EXISTS idx_substitution_requests_titular
  ON substitution_requests(titular_assignment_id, status, starts_on, planned_ends_on);

CREATE INDEX IF NOT EXISTS idx_substitution_requests_substitute
  ON substitution_requests(substitute_user_id, status, starts_on, planned_ends_on);

CREATE TRIGGER trg_substitution_requests_calendar_insert
BEFORE INSERT ON substitution_requests
WHEN date(NEW.starts_on, '+0 days') IS NOT NEW.starts_on
  OR date(NEW.planned_ends_on, '+0 days') IS NOT NEW.planned_ends_on
BEGIN
  SELECT RAISE(ABORT, 'invalid substitution request calendar date');
END;

CREATE TRIGGER trg_substitution_requests_calendar_update
BEFORE UPDATE OF starts_on, planned_ends_on ON substitution_requests
WHEN date(NEW.starts_on, '+0 days') IS NOT NEW.starts_on
  OR date(NEW.planned_ends_on, '+0 days') IS NOT NEW.planned_ends_on
BEGIN
  SELECT RAISE(ABORT, 'invalid substitution request calendar date');
END;

CREATE TABLE IF NOT EXISTS legacy_substitution_aliases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  legacy_key TEXT NOT NULL UNIQUE,
  titular_name TEXT NOT NULL,
  substitute_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unresolved' CHECK(status IN ('resolved', 'unresolved', 'obsolete')),
  substitution_request_id INTEGER,
  imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reconciled_by_user_id INTEGER,
  reconciled_at TEXT,
  notes TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (substitution_request_id) REFERENCES substitution_requests(id) ON DELETE RESTRICT,
  FOREIGN KEY (reconciled_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CHECK(length(titular_name) BETWEEN 1 AND 160),
  CHECK(length(substitute_name) BETWEEN 1 AND 160),
  CHECK(length(notes) <= 500),
  CHECK((status = 'resolved' AND substitution_request_id IS NOT NULL) OR status <> 'resolved')
);

CREATE INDEX IF NOT EXISTS idx_legacy_substitution_aliases_status
  ON legacy_substitution_aliases(status, imported_at, id);

ALTER TABLE historial ADD COLUMN actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE historial ADD COLUMN actor_username TEXT NOT NULL DEFAULT '';
ALTER TABLE historial ADD COLUMN actor_source_code TEXT;
ALTER TABLE historial ADD COLUMN actor_roles_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE historial ADD COLUMN action TEXT NOT NULL DEFAULT '';
ALTER TABLE historial ADD COLUMN target_type TEXT NOT NULL DEFAULT '';
ALTER TABLE historial ADD COLUMN target_id TEXT NOT NULL DEFAULT '';
ALTER TABLE historial ADD COLUMN outcome TEXT NOT NULL DEFAULT 'success' CHECK(outcome IN ('success', 'failure'));
ALTER TABLE historial ADD COLUMN before_json TEXT;
ALTER TABLE historial ADD COLUMN after_json TEXT;
ALTER TABLE historial ADD COLUMN archived_at TEXT;
ALTER TABLE historial ADD COLUMN archived_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_historial_visible_created
  ON historial(archived_at, ts DESC);

ALTER TABLE audit_log ADD COLUMN actor_username TEXT NOT NULL DEFAULT '';
ALTER TABLE audit_log ADD COLUMN actor_source_code TEXT;
ALTER TABLE audit_log ADD COLUMN actor_roles_json TEXT NOT NULL DEFAULT '[]';

DROP TRIGGER IF EXISTS trg_teacher_assignments_validate_insert;
DROP TRIGGER IF EXISTS trg_teacher_assignments_validate_update;

CREATE TRIGGER trg_teacher_assignments_validate_insert
BEFORE INSERT ON teacher_assignments
BEGIN
  SELECT CASE WHEN date(NEW.starts_on, '+0 days') IS NOT NEW.starts_on
    OR (NEW.ends_on IS NOT NULL AND date(NEW.ends_on, '+0 days') IS NOT NEW.ends_on)
    THEN RAISE(ABORT, 'invalid teacher assignment calendar date') END;

  SELECT CASE WHEN NEW.assignment_type = 'sustituto' AND NOT EXISTS (
    SELECT 1
    FROM teacher_assignments titular
    WHERE titular.id = NEW.replaces_assignment_id
      AND titular.assignment_type = 'titular'
      AND titular.teacher_profile_id = NEW.teacher_profile_id
      AND titular.starts_on <= NEW.starts_on
      AND COALESCE(titular.ends_on, '9999-12-31') >= COALESCE(NEW.ends_on, '9999-12-31')
  ) THEN RAISE(ABORT, 'invalid titular assignment for substitute') END;

  SELECT CASE WHEN NEW.assignment_type = 'sustituto' AND EXISTS (
    SELECT 1 FROM teacher_assignments titular
    WHERE titular.id = NEW.replaces_assignment_id AND titular.user_id = NEW.user_id
  ) THEN RAISE(ABORT, 'self substitution is not allowed') END;

  SELECT CASE WHEN NEW.assignment_type = 'sustituto' AND NOT EXISTS (
    SELECT 1 FROM users u
    JOIN user_roles ur ON ur.user_id = u.id
    JOIN roles r ON r.id = ur.role_id AND r.key = 'teacher'
    WHERE u.id = NEW.user_id AND u.is_active = 1
  ) THEN RAISE(ABORT, 'substitute user must be active and have teacher role') END;

  SELECT CASE WHEN EXISTS (
    SELECT 1
    FROM teacher_assignments current
    WHERE current.assignment_type = NEW.assignment_type
      AND (current.user_id = NEW.user_id OR current.teacher_profile_id = NEW.teacher_profile_id)
      AND current.starts_on <= COALESCE(NEW.ends_on, '9999-12-31')
      AND NEW.starts_on <= COALESCE(current.ends_on, '9999-12-31')
  ) THEN RAISE(ABORT, 'overlapping teacher assignment') END;
END;

CREATE TRIGGER trg_teacher_assignments_validate_update
BEFORE UPDATE ON teacher_assignments
BEGIN
  SELECT CASE WHEN date(NEW.starts_on, '+0 days') IS NOT NEW.starts_on
    OR (NEW.ends_on IS NOT NULL AND date(NEW.ends_on, '+0 days') IS NOT NEW.ends_on)
    THEN RAISE(ABORT, 'invalid teacher assignment calendar date') END;

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

  SELECT CASE WHEN NEW.assignment_type = 'sustituto' AND EXISTS (
    SELECT 1 FROM teacher_assignments titular
    WHERE titular.id = NEW.replaces_assignment_id AND titular.user_id = NEW.user_id
  ) THEN RAISE(ABORT, 'self substitution is not allowed') END;

  SELECT CASE WHEN NEW.assignment_type = 'sustituto' AND NEW.user_id <> OLD.user_id AND NOT EXISTS (
    SELECT 1 FROM users u
    JOIN user_roles ur ON ur.user_id = u.id
    JOIN roles r ON r.id = ur.role_id AND r.key = 'teacher'
    WHERE u.id = NEW.user_id AND u.is_active = 1
  ) THEN RAISE(ABORT, 'substitute user must be active and have teacher role') END;

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
