CREATE TABLE IF NOT EXISTS academic_years (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL COLLATE NOCASE UNIQUE,
  starts_on TEXT NOT NULL,
  ends_on TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'preparation' CHECK(status IN ('preparation', 'active', 'archived')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(starts_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  CHECK(ends_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  CHECK(ends_on >= starts_on)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_academic_years_one_active
  ON academic_years(status) WHERE status = 'active';

ALTER TABLE teacher_profiles
  ADD COLUMN academic_year_id INTEGER REFERENCES academic_years(id) ON DELETE RESTRICT;

ALTER TABLE teacher_assignments
  ADD COLUMN academic_year_id INTEGER REFERENCES academic_years(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_teacher_profiles_academic_year
  ON teacher_profiles(academic_year_id, is_active, display_name);

CREATE INDEX IF NOT EXISTS idx_teacher_assignments_academic_year
  ON teacher_assignments(academic_year_id, user_id, starts_on, ends_on);

CREATE TABLE IF NOT EXISTS teacher_external_identities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  teacher_profile_id INTEGER NOT NULL,
  academic_year_id INTEGER NOT NULL,
  source_system TEXT NOT NULL,
  source_format TEXT NOT NULL,
  external_key TEXT NOT NULL COLLATE NOCASE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(academic_year_id, source_system, source_format, external_key),
  UNIQUE(teacher_profile_id, source_system, source_format, external_key),
  FOREIGN KEY (teacher_profile_id) REFERENCES teacher_profiles(id) ON DELETE CASCADE,
  FOREIGN KEY (academic_year_id) REFERENCES academic_years(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_teacher_external_identities_profile
  ON teacher_external_identities(teacher_profile_id, academic_year_id);

CREATE TABLE IF NOT EXISTS schedule_datasets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  academic_year_id INTEGER NOT NULL,
  label TEXT NOT NULL,
  source_system TEXT NOT NULL,
  source_format TEXT NOT NULL CHECK(source_format IN ('pdf', 'xml', 'json', 'manual', 'test')),
  source_fingerprint TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'validated', 'active', 'archived')),
  validation_report_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  validated_at TEXT,
  activated_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(academic_year_id, source_fingerprint),
  FOREIGN KEY (academic_year_id) REFERENCES academic_years(id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_schedule_datasets_one_active_per_year
  ON schedule_datasets(academic_year_id) WHERE status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS idx_schedule_datasets_one_active
  ON schedule_datasets(status) WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_schedule_datasets_status
  ON schedule_datasets(status, academic_year_id, updated_at);

CREATE TABLE IF NOT EXISTS schedule_dataset_teachers (
  dataset_id INTEGER NOT NULL,
  teacher_profile_id INTEGER NOT NULL,
  teacher_external_identity_id INTEGER NOT NULL,
  PRIMARY KEY (dataset_id, teacher_profile_id),
  UNIQUE(dataset_id, teacher_external_identity_id),
  FOREIGN KEY (dataset_id) REFERENCES schedule_datasets(id) ON DELETE CASCADE,
  FOREIGN KEY (teacher_profile_id) REFERENCES teacher_profiles(id) ON DELETE RESTRICT,
  FOREIGN KEY (teacher_external_identity_id) REFERENCES teacher_external_identities(id) ON DELETE RESTRICT
);

CREATE TRIGGER IF NOT EXISTS trg_schedule_dataset_teacher_consistency_insert
BEFORE INSERT ON schedule_dataset_teachers
WHEN NOT EXISTS (
  SELECT 1
  FROM schedule_datasets dataset
  JOIN teacher_profiles profile ON profile.id = NEW.teacher_profile_id
  JOIN teacher_external_identities identity ON identity.id = NEW.teacher_external_identity_id
  WHERE dataset.id = NEW.dataset_id
    AND profile.academic_year_id = dataset.academic_year_id
    AND identity.teacher_profile_id = profile.id
    AND identity.academic_year_id = dataset.academic_year_id
    AND identity.source_system = dataset.source_system
)
BEGIN
  SELECT RAISE(ABORT, 'schedule dataset teacher mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_schedule_dataset_teacher_consistency_update
BEFORE UPDATE ON schedule_dataset_teachers
WHEN NOT EXISTS (
  SELECT 1
  FROM schedule_datasets dataset
  JOIN teacher_profiles profile ON profile.id = NEW.teacher_profile_id
  JOIN teacher_external_identities identity ON identity.id = NEW.teacher_external_identity_id
  WHERE dataset.id = NEW.dataset_id
    AND profile.academic_year_id = dataset.academic_year_id
    AND identity.teacher_profile_id = profile.id
    AND identity.academic_year_id = dataset.academic_year_id
    AND identity.source_system = dataset.source_system
)
BEGIN
  SELECT RAISE(ABORT, 'schedule dataset teacher mismatch');
END;

CREATE TABLE IF NOT EXISTS schedule_periods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dataset_id INTEGER NOT NULL,
  period_key TEXT NOT NULL,
  position INTEGER NOT NULL CHECK(position >= 0),
  period_type TEXT NOT NULL CHECK(period_type IN ('teaching', 'break')),
  label TEXT NOT NULL DEFAULT '',
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  UNIQUE(dataset_id, period_key),
  UNIQUE(dataset_id, position),
  CHECK(starts_at GLOB '[0-9][0-9]:[0-9][0-9]'),
  CHECK(ends_at GLOB '[0-9][0-9]:[0-9][0-9]'),
  CHECK(ends_at > starts_at),
  FOREIGN KEY (dataset_id) REFERENCES schedule_datasets(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS teacher_schedule_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dataset_id INTEGER NOT NULL,
  teacher_profile_id INTEGER NOT NULL,
  teacher_external_identity_id INTEGER NOT NULL,
  period_id INTEGER NOT NULL,
  weekday INTEGER NOT NULL CHECK(weekday BETWEEN 0 AND 4),
  session_type TEXT NOT NULL CHECK(session_type IN ('class', 'guardia', 'meeting', 'other')),
  subject TEXT NOT NULL DEFAULT '',
  group_code TEXT NOT NULL DEFAULT '',
  room TEXT NOT NULL DEFAULT '',
  label TEXT NOT NULL DEFAULT '',
  source_ref TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(dataset_id, teacher_profile_id, weekday, period_id),
  FOREIGN KEY (dataset_id) REFERENCES schedule_datasets(id) ON DELETE CASCADE,
  FOREIGN KEY (teacher_profile_id) REFERENCES teacher_profiles(id) ON DELETE RESTRICT,
  FOREIGN KEY (teacher_external_identity_id) REFERENCES teacher_external_identities(id) ON DELETE RESTRICT,
  FOREIGN KEY (period_id) REFERENCES schedule_periods(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_teacher_schedule_sessions_teacher_day
  ON teacher_schedule_sessions(dataset_id, teacher_profile_id, weekday, period_id);

CREATE TRIGGER IF NOT EXISTS trg_teacher_profiles_require_academic_year_insert
BEFORE INSERT ON teacher_profiles
WHEN NEW.academic_year_id IS NULL
BEGIN
  SELECT RAISE(ABORT, 'teacher profile requires academic year');
END;

CREATE TRIGGER IF NOT EXISTS trg_teacher_profiles_require_academic_year_update
BEFORE UPDATE OF academic_year_id ON teacher_profiles
WHEN NEW.academic_year_id IS NULL
BEGIN
  SELECT RAISE(ABORT, 'teacher profile requires academic year');
END;

CREATE TRIGGER IF NOT EXISTS trg_teacher_external_identity_year_insert
BEFORE INSERT ON teacher_external_identities
WHEN NOT EXISTS (
  SELECT 1 FROM teacher_profiles profile
  WHERE profile.id = NEW.teacher_profile_id
    AND profile.academic_year_id = NEW.academic_year_id
)
BEGIN
  SELECT RAISE(ABORT, 'external identity academic year mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_teacher_external_identity_year_update
BEFORE UPDATE ON teacher_external_identities
WHEN NOT EXISTS (
  SELECT 1 FROM teacher_profiles profile
  WHERE profile.id = NEW.teacher_profile_id
    AND profile.academic_year_id = NEW.academic_year_id
)
BEGIN
  SELECT RAISE(ABORT, 'external identity academic year mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_teacher_assignment_year_insert
BEFORE INSERT ON teacher_assignments
WHEN NEW.academic_year_id IS NULL OR NOT EXISTS (
  SELECT 1 FROM teacher_profiles profile
  JOIN academic_years year ON year.id = NEW.academic_year_id
  WHERE profile.id = NEW.teacher_profile_id
    AND profile.academic_year_id = NEW.academic_year_id
    AND NEW.starts_on >= year.starts_on
    AND (NEW.ends_on IS NULL OR NEW.ends_on <= year.ends_on)
)
BEGIN
  SELECT RAISE(ABORT, 'teacher assignment academic year mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_teacher_assignment_year_update
BEFORE UPDATE ON teacher_assignments
WHEN NEW.academic_year_id IS NULL OR NOT EXISTS (
  SELECT 1 FROM teacher_profiles profile
  JOIN academic_years year ON year.id = NEW.academic_year_id
  WHERE profile.id = NEW.teacher_profile_id
    AND profile.academic_year_id = NEW.academic_year_id
    AND NEW.starts_on >= year.starts_on
    AND (NEW.ends_on IS NULL OR NEW.ends_on <= year.ends_on)
)
BEGIN
  SELECT RAISE(ABORT, 'teacher assignment academic year mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_teacher_schedule_session_consistency_insert
BEFORE INSERT ON teacher_schedule_sessions
WHEN NOT EXISTS (
  SELECT 1
  FROM schedule_datasets dataset
  JOIN teacher_profiles profile ON profile.id = NEW.teacher_profile_id
  JOIN teacher_external_identities identity ON identity.id = NEW.teacher_external_identity_id
  JOIN schedule_periods period ON period.id = NEW.period_id
  WHERE dataset.id = NEW.dataset_id
    AND profile.academic_year_id = dataset.academic_year_id
    AND identity.teacher_profile_id = profile.id
    AND identity.academic_year_id = dataset.academic_year_id
    AND identity.source_system = dataset.source_system
    AND EXISTS (
      SELECT 1 FROM schedule_dataset_teachers roster
      WHERE roster.dataset_id = dataset.id
        AND roster.teacher_profile_id = profile.id
        AND roster.teacher_external_identity_id = identity.id
    )
    AND period.dataset_id = dataset.id
)
BEGIN
  SELECT RAISE(ABORT, 'schedule session dataset mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_teacher_schedule_session_consistency_update
BEFORE UPDATE ON teacher_schedule_sessions
WHEN NOT EXISTS (
  SELECT 1
  FROM schedule_datasets dataset
  JOIN teacher_profiles profile ON profile.id = NEW.teacher_profile_id
  JOIN teacher_external_identities identity ON identity.id = NEW.teacher_external_identity_id
  JOIN schedule_periods period ON period.id = NEW.period_id
  WHERE dataset.id = NEW.dataset_id
    AND profile.academic_year_id = dataset.academic_year_id
    AND identity.teacher_profile_id = profile.id
    AND identity.academic_year_id = dataset.academic_year_id
    AND identity.source_system = dataset.source_system
    AND EXISTS (
      SELECT 1 FROM schedule_dataset_teachers roster
      WHERE roster.dataset_id = dataset.id
        AND roster.teacher_profile_id = profile.id
        AND roster.teacher_external_identity_id = identity.id
    )
    AND period.dataset_id = dataset.id
)
BEGIN
  SELECT RAISE(ABORT, 'schedule session dataset mismatch');
END;
