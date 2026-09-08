ALTER TABLE users
  ADD COLUMN session_version INTEGER NOT NULL DEFAULT 1 CHECK(session_version >= 1);

ALTER TABLE users
  ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0 CHECK(must_change_password IN (0, 1));

DROP TRIGGER IF EXISTS trg_teacher_schedule_session_consistency_insert;
DROP TRIGGER IF EXISTS trg_teacher_schedule_session_consistency_update;

CREATE TABLE teacher_schedule_sessions_v3 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dataset_id INTEGER NOT NULL,
  teacher_profile_id INTEGER NOT NULL,
  teacher_external_identity_id INTEGER NOT NULL,
  period_id INTEGER NOT NULL,
  weekday INTEGER NOT NULL CHECK(weekday BETWEEN 0 AND 4),
  session_type TEXT NOT NULL CHECK(session_type IN (
    'class', 'guardia', 'meeting', 'other',
    'guardia_patio', 'biblioteca_patio', 'patio_inclusivo'
  )),
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

INSERT INTO teacher_schedule_sessions_v3 (
  id, dataset_id, teacher_profile_id, teacher_external_identity_id, period_id,
  weekday, session_type, subject, group_code, room, label, source_ref, created_at
)
SELECT
  id, dataset_id, teacher_profile_id, teacher_external_identity_id, period_id,
  weekday, session_type, subject, group_code, room, label, source_ref, created_at
FROM teacher_schedule_sessions;

DROP TABLE teacher_schedule_sessions;
ALTER TABLE teacher_schedule_sessions_v3 RENAME TO teacher_schedule_sessions;

CREATE INDEX idx_teacher_schedule_sessions_teacher_day
  ON teacher_schedule_sessions(dataset_id, teacher_profile_id, weekday, period_id);

CREATE TRIGGER trg_teacher_schedule_session_consistency_insert
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

CREATE TRIGGER trg_teacher_schedule_session_consistency_update
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
