const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const { applyMigrations } = require('../db');
const {
  activateScheduleDataset,
  buildLegacySchedulePayload,
  importScheduleDataset,
  importTeacherProfiles,
  loadCanonicalDataset,
  validateCanonicalSchedule
} = require('../schedule-model');

async function withDatabase(callback) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'canonical-schedule-test-'));
  const db = await open({ filename: path.join(root, 'schedule.sqlite'), driver: sqlite3.Database });
  try {
    await db.exec('PRAGMA foreign_keys = ON');
    await db.exec(fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8'));
    await applyMigrations(db);
    return await callback(db);
  } finally {
    await db.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function census() {
  return {
    schema_version: 1,
    academic_year: '2026/27',
    source_system: 'Peñalara Software',
    teacher_count: 2,
    teachers: [
      { source_code: 'RMLL', display_name: 'Docente RMLL', active: true },
      { source_code: 'ABCD', display_name: 'Docente ABCD', active: true }
    ]
  };
}

function schedule(format = 'pdf', teacherCode = 'RMLL', suffix = 'provisional') {
  return {
    schema_version: 1,
    academic_year: '2026/27',
    label: `Horario ${suffix}`,
    source: { system: 'Peñalara Software', format, provisional: format === 'pdf' },
    periods: [
      { key: 'P-A', position: 10, type: 'teaching', label: 'Primera', starts_at: '08:00', ends_at: '08:50' },
      { key: 'BREAK-A', position: 20, type: 'break', label: 'Recreo', starts_at: '08:50', ends_at: '09:05' },
      { key: 'P-B', position: 30, type: 'teaching', label: 'Segunda', starts_at: '09:05', ends_at: '09:55' }
    ],
    sessions: [
      { teacher_source_code: teacherCode, weekday: 0, period_key: 'P-A', type: 'class', subject: 'MAT', group: '1ESO', room: 'A1' },
      { teacher_source_code: teacherCode, weekday: 0, period_key: 'P-B', type: 'guardia' }
    ]
  };
}

module.exports = [
  {
    name: 'canonical schedule supports variable periods and requires explicit breaks',
    fn() {
      const valid = validateCanonicalSchedule(schedule());
      assert.deepEqual(valid.periods.map(period => period.position), [10, 20, 30]);
      assert.equal(valid.report.breaks, 1);
      const withoutBreak = schedule();
      withoutBreak.periods = withoutBreak.periods.filter(period => period.type !== 'break');
      assert.throws(() => validateCanonicalSchedule(withoutBreak), /breaks explicitly/);
    }
  },
  {
    name: 'profile and schedule imports are reproducible and never activate implicitly',
    async fn() {
      await withDatabase(async db => {
        assert.equal((await importTeacherProfiles(db, census(), { expectedCount: 2 })).created, 2);
        assert.equal((await importTeacherProfiles(db, census(), { expectedCount: 2 })).updated, 2);
        const imported = await importScheduleDataset(db, schedule());
        assert.equal(imported.status, 'validated');
        assert.equal((await db.get('SELECT status FROM academic_years')).status, 'preparation');
        await assert.rejects(loadCanonicalDataset(db), /No hay un dataset horario activo/);
        const repeated = await importScheduleDataset(db, schedule());
        assert.equal(repeated.datasetId, imported.datasetId);
        assert.equal((await db.get('SELECT COUNT(*) AS total FROM schedule_datasets')).total, 1);
        assert.equal((await db.get('SELECT COUNT(*) AS total FROM teacher_schedule_sessions')).total, 2);
      });
    }
  },
  {
    name: 'dataset activation is explicit transactional and preserves the exact external identity',
    async fn() {
      await withDatabase(async db => {
        await importTeacherProfiles(db, census(), { expectedCount: 2 });
        const first = await importScheduleDataset(db, schedule());
        await activateScheduleDataset(db, first.datasetId);
        const active = await loadCanonicalDataset(db);
        assert.equal(active.teachers.find(teacher => teacher.sourceCode === 'RMLL').sessions.length, 2);
        const legacy = buildLegacySchedulePayload(active);
        assert.equal(legacy.teachers.find(teacher => teacher.sourceCode === 'RMLL').guardias.length, 1);
        assert.deepEqual(legacy.periods.map(period => period.position), [10, 20, 30]);
        const otherYear = await db.run(
          `INSERT INTO academic_years (code,starts_on,ends_on,status)
           VALUES ('2027/28','2027-09-01','2028-08-31','preparation')`
        );
        await assert.rejects(
          db.run(
            `INSERT INTO schedule_datasets
              (academic_year_id,label,source_system,source_format,source_fingerprint,status,validation_report_json)
             VALUES (?, 'No debe coexistir', 'test', 'test', 'other-year-active', 'active', '{"valid":true}')`,
            [otherYear.lastID]
          ),
          /UNIQUE constraint failed/
        );

        const profile = await db.get("SELECT id, academic_year_id FROM teacher_profiles WHERE display_name = 'Docente RMLL'");
        await db.run(
          `INSERT INTO teacher_external_identities
            (teacher_profile_id,academic_year_id,source_system,source_format,external_key)
           VALUES (?, ?, 'penalara software', 'xml', 'RMLL-XML')`,
          [profile.id, profile.academic_year_id]
        );
        const second = await importScheduleDataset(db, schedule('xml', 'RMLL-XML', 'definitivo'));
        assert.equal((await db.get('SELECT status FROM schedule_datasets WHERE id = ?', [first.datasetId])).status, 'active');
        assert.equal((await db.get('SELECT status FROM schedule_datasets WHERE id = ?', [second.datasetId])).status, 'validated');
        await activateScheduleDataset(db, second.datasetId);
        assert.equal((await db.get('SELECT status FROM schedule_datasets WHERE id = ?', [first.datasetId])).status, 'archived');
        const definitive = await loadCanonicalDataset(db);
        assert.equal(definitive.source.format, 'xml');
        assert.equal(definitive.teachers.find(teacher => teacher.sourceCode === 'RMLL-XML').sessions.length, 2);
        assert.equal((await db.get("SELECT COUNT(*) AS total FROM schedule_datasets WHERE status = 'active'")).total, 1);
      });
    }
  },
  {
    name: 'database triggers reject cross-year external identities and schedule links',
    async fn() {
      await withDatabase(async db => {
        await importTeacherProfiles(db, census(), { expectedCount: 2 });
        const profile = await db.get('SELECT id FROM teacher_profiles LIMIT 1');
        const otherYear = await db.run(
          `INSERT INTO academic_years (code,starts_on,ends_on,status)
           VALUES ('2027/28','2027-09-01','2028-08-31','preparation')`
        );
        await assert.rejects(
          db.run(
            `INSERT INTO teacher_external_identities
              (teacher_profile_id,academic_year_id,source_system,source_format,external_key)
             VALUES (?, ?, 'test', 'test', 'WRONG')`,
            [profile.id, otherYear.lastID]
          ),
          /academic year mismatch/
        );
      });
    }
  }
];
