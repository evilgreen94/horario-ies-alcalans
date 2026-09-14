const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const { hashPassword } = require('../auth');
const { applyMigrations } = require('../db');
const { activateScheduleDataset } = require('../schedule-model');
const { resolveActiveTeacherProfile } = require('../teacher-identity');
const { loadTeacherSubstitutionMap } = require('../routes/report/pdf-report');
const {
  activateRequest,
  closePendingRequest,
  createRequest,
  ensureLegacyAliasesImported,
  finalizeExpiredRequests,
  finishRequest,
  linkExistingUser,
  listEffectiveSubstitutions,
  listLegacyAliases,
  listRequests,
  markLegacyAliasObsolete,
  provisionRequestUser,
  reconcileLegacyAlias
} = require('../substitution-service');

async function withDatabase(callback) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'guardias-substitution-test-'));
  const db = await open({ filename: path.join(root, 'test.sqlite'), driver: sqlite3.Database });
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

async function addUser(db, username, roles, options = {}) {
  const credential = hashPassword(`Password-${username}-2026!`);
  const inserted = await db.run(
    `INSERT INTO users (username, display_name, password_hash, password_salt, is_active, must_change_password)
     VALUES (?, ?, ?, ?, ?, 0)`,
    [username, options.displayName || username, credential.hash, credential.salt, options.active === false ? 0 : 1]
  );
  for (const role of roles) {
    await db.run(
      `INSERT INTO user_roles (user_id, role_id) SELECT ?, id FROM roles WHERE key = ?`,
      [inserted.lastID, role]
    );
  }
  return inserted.lastID;
}

async function seedDomain(db) {
  const year = await db.run(
    `INSERT INTO academic_years (code, starts_on, ends_on, status)
     VALUES ('2026/27', '2026-09-01', '2027-08-31', 'active')`
  );
  const admin = await addUser(db, 'jefatura.test', ['admin']);
  const superadmin = await addUser(db, 'super.test', ['superadmin']);
  const titular1 = await addUser(db, 'titular.one', ['teacher'], { displayName: 'Titular Uno' });
  const titular2 = await addUser(db, 'titular.two', ['teacher'], { displayName: 'Titular Dos' });
  const profile1 = await db.run(
    `INSERT INTO teacher_profiles (academic_year_id, schedule_key, display_name)
     VALUES (?, 'T001', 'Titular Uno')`, [year.lastID]
  );
  const profile2 = await db.run(
    `INSERT INTO teacher_profiles (academic_year_id, schedule_key, display_name)
     VALUES (?, 'T002', 'Titular Dos')`, [year.lastID]
  );
  const assignment1 = await db.run(
    `INSERT INTO teacher_assignments
      (user_id, teacher_profile_id, academic_year_id, assignment_type, starts_on, ends_on)
     VALUES (?, ?, ?, 'titular', '2026-09-01', '2027-08-31')`,
    [titular1, profile1.lastID, year.lastID]
  );
  const assignment2 = await db.run(
    `INSERT INTO teacher_assignments
      (user_id, teacher_profile_id, academic_year_id, assignment_type, starts_on, ends_on)
     VALUES (?, ?, ?, 'titular', '2026-09-01', '2027-08-31')`,
    [titular2, profile2.lastID, year.lastID]
  );
  return {
    yearId: year.lastID, admin, superadmin, titular1, titular2,
    profile1: profile1.lastID, profile2: profile2.lastID,
    assignment1: assignment1.lastID, assignment2: assignment2.lastID
  };
}

module.exports = [
  {
    name: 'substitution request, provisioning, activation and early finish preserve both identities and history',
    async fn() {
      await withDatabase(async db => {
        const seeded = await seedDomain(db);
        const pending = await createRequest(db, {
          titularAssignmentId: seeded.assignment1,
          proposedDisplayName: 'Sustituta Externa', proposedUsername: 'sustituta.ext',
          startsOn: '2026-09-14', plannedEndsOn: '2026-09-30', actorUserId: seeded.admin
        });
        assert.equal(pending.status, 'pending_provisioning');
        assert.equal((await listEffectiveSubstitutions(db, '2026-09-14')).length, 0);
        assert.equal((await db.get("SELECT COUNT(*) total FROM teacher_assignments WHERE assignment_type = 'sustituto'")).total, 0);

        const provisioned = await provisionRequestUser(db, pending.id, {
          actorUserId: seeded.superadmin, username: 'sustituta.ext', displayName: 'Sustituta Externa'
        });
        assert.deepEqual(provisioned.user.roles, ['teacher']);
        assert.ok(provisioned.temporaryPassword);
        const roleRows = await db.all(
          `SELECT role.key FROM user_roles link JOIN roles role ON role.id = link.role_id
           WHERE link.user_id = ? ORDER BY role.key`, [provisioned.user.id]
        );
        assert.deepEqual(roleRows.map(row => row.key), ['teacher']);

        const active = await activateRequest(db, pending.id, seeded.superadmin);
        assert.equal(active.status, 'active');
        const titularIdentity = await resolveActiveTeacherProfile(db, seeded.titular1, '2026-09-14');
        const substituteIdentity = await resolveActiveTeacherProfile(db, provisioned.user.id, '2026-09-14');
        assert.equal(titularIdentity.assignment.type, 'titular');
        assert.equal(titularIdentity.teacherProfile.id, seeded.profile1);
        assert.equal(substituteIdentity.assignment.type, 'sustituto');
        assert.equal(substituteIdentity.teacherProfile.id, seeded.profile1);
        assert.equal((await resolveActiveTeacherProfile(db, provisioned.user.id, '2026-09-30')).assignment.type, 'sustituto');
        assert.equal(await resolveActiveTeacherProfile(db, provisioned.user.id, '2026-10-01'), null);
        await db.run(
          `INSERT INTO app_state (key, value) VALUES ('teacher_substitutions', ?)`,
          [JSON.stringify([{ profesor: 'Titular Uno', sustituto: 'Alias libre incorrecto' }])]
        );
        assert.deepEqual(await loadTeacherSubstitutionMap(db, '2026-09-14'), {
          'Titular Uno': 'Sustituta Externa'
        });

        const finished = await finishRequest(db, pending.id, {
          actorUserId: seeded.admin, lastEffectiveOn: '2026-09-20', reason: 'Incorporación anticipada'
        });
        assert.equal(finished.status, 'finished');
        assert.equal(await resolveActiveTeacherProfile(db, provisioned.user.id, '2026-09-21'), null);
        assert.ok(await db.get('SELECT id FROM users WHERE id = ?', [provisioned.user.id]));
        assert.ok(await db.get('SELECT id FROM teacher_assignments WHERE id = ?', [active.assignmentId]));
        const events = await db.all("SELECT action, actor_username, ts FROM historial WHERE action LIKE 'substitution.%'");
        assert.ok(events.some(row => row.action === 'substitution.request_created' && row.actor_username === 'jefatura.test'));
        assert.ok(events.some(row => row.action === 'substitution.user_provisioned' && row.actor_username === 'super.test'));
        assert.ok(events.some(row => row.action === 'substitution.activated'));
        assert.ok(events.some(row => row.action === 'substitution.finished'));
        assert.ok(events.every(row => row.ts));
      });
    }
  },
  {
    name: 'activation rejects invalid identities, self substitution and both overlap directions atomically',
    async fn() {
      await withDatabase(async db => {
        const seeded = await seedDomain(db);
        const noRole = await addUser(db, 'candidate.norole', []);
        const inactive = await addUser(db, 'candidate.inactive', ['teacher'], { active: false });
        const substituteA = await addUser(db, 'candidate.a', ['teacher']);
        const substituteB = await addUser(db, 'candidate.b', ['teacher']);

        await assert.rejects(
          createRequest(db, { titularAssignmentId: seeded.assignment1, proposedDisplayName: 'X', startsOn: '2026-09-31', plannedEndsOn: '2026-10-01', actorUserId: seeded.admin }),
          error => error.status === 400
        );
        await assert.rejects(
          createRequest(db, { titularAssignmentId: seeded.assignment1, proposedDisplayName: 'X', startsOn: '2026-09-20', plannedEndsOn: '2026-09-19', actorUserId: seeded.admin }),
          error => error.code === 'INVALID_INTERVAL'
        );
        await assert.rejects(
          createRequest(db, { titularAssignmentId: seeded.assignment1, substituteUserId: 999999, startsOn: '2026-09-14', plannedEndsOn: '2026-09-20', actorUserId: seeded.admin }),
          error => error.code === 'UNKNOWN_IDENTITY'
        );

        for (const [userId, expectedCode] of [
          [seeded.titular1, 'SELF_SUBSTITUTION'], [noRole, 'TEACHER_ROLE_REQUIRED'], [inactive, 'SUBSTITUTE_INACTIVE']
        ]) {
          const request = await createRequest(db, {
            titularAssignmentId: seeded.assignment1, substituteUserId: userId,
            startsOn: '2026-10-01', plannedEndsOn: '2026-10-10', actorUserId: seeded.admin
          });
          await assert.rejects(activateRequest(db, request.id, seeded.superadmin), error => error.code === expectedCode);
        }

        const first = await createRequest(db, {
          titularAssignmentId: seeded.assignment1, substituteUserId: substituteA,
          startsOn: '2026-10-01', plannedEndsOn: '2026-10-10', actorUserId: seeded.admin
        });
        await activateRequest(db, first.id, seeded.superadmin);
        const sameSubstitute = await createRequest(db, {
          titularAssignmentId: seeded.assignment2, substituteUserId: substituteA,
          startsOn: '2026-10-05', plannedEndsOn: '2026-10-08', actorUserId: seeded.admin
        });
        await assert.rejects(activateRequest(db, sameSubstitute.id, seeded.superadmin), error => error.code === 'SUBSTITUTE_OVERLAP');
        const sameTitular = await createRequest(db, {
          titularAssignmentId: seeded.assignment1, substituteUserId: substituteB,
          startsOn: '2026-10-05', plannedEndsOn: '2026-10-08', actorUserId: seeded.admin
        });
        await assert.rejects(activateRequest(db, sameTitular.id, seeded.superadmin), error => error.code === 'TITULAR_OVERLAP');
        assert.equal((await db.get("SELECT COUNT(*) total FROM teacher_assignments WHERE assignment_type = 'sustituto'")).total, 1);
        assert.equal((await db.get("SELECT COUNT(*) total FROM substitution_requests WHERE status = 'active'")).total, 1);
        const failures = await db.all("SELECT details_json FROM audit_log WHERE action = 'substitution.activation_rejected'");
        assert.ok(failures.length >= 5);
        assert.ok(failures.every(row => !/password|token|cookie/i.test(row.details_json)));

        await assert.rejects(
          db.run(
            `INSERT INTO teacher_assignments
              (user_id, teacher_profile_id, academic_year_id, assignment_type, starts_on, ends_on, replaces_assignment_id)
             VALUES (?, ?, ?, 'sustituto', '2026-09-31', '2026-10-02', ?)`,
            [substituteB, seeded.profile2, seeded.yearId, seeded.assignment2]
          ), /invalid teacher assignment calendar date/
        );
      });
    }
  },
  {
    name: 'linking preserves roles and natural expiry keeps account and historical assignment',
    async fn() {
      await withDatabase(async db => {
        const seeded = await seedDomain(db);
        const candidate = await addUser(db, 'candidate.admin', ['admin']);
        const request = await createRequest(db, {
          titularAssignmentId: seeded.assignment1, proposedDisplayName: 'Candidate Admin',
          startsOn: '2026-09-10', plannedEndsOn: '2026-09-12', actorUserId: seeded.admin
        });
        const linked = await linkExistingUser(db, request.id, candidate, seeded.superadmin);
        assert.equal(linked.status, 'pending');
        assert.deepEqual(linked.candidate.roles, ['admin', 'teacher']);
        await activateRequest(db, request.id, seeded.superadmin);
        assert.equal(await finalizeExpiredRequests(db, '2026-09-13'), 1);
        assert.equal((await listRequests(db)).find(item => item.id === request.id).status, 'finished');
        assert.equal((await listEffectiveSubstitutions(db, '2026-09-13')).length, 0);
        assert.ok(await db.get('SELECT id FROM users WHERE id = ?', [candidate]));
        assert.equal((await db.get("SELECT COUNT(*) total FROM teacher_assignments WHERE assignment_type = 'sustituto'")).total, 1);
      });
    }
  },
  {
    name: 'legacy aliases import as inert unresolved records and require explicit reconciliation',
    async fn() {
      await withDatabase(async db => {
        const seeded = await seedDomain(db);
        await db.run(
          `INSERT INTO app_state (key, value) VALUES ('teacher_substitutions', ?)`,
          [JSON.stringify([
            { profesor: 'Titular Uno', sustituto: 'Texto Legacy A' },
            { profesor: 'Titular Dos', sustituto: 'Texto Legacy B' }
          ])]
        );
        const usersBefore = (await db.get('SELECT COUNT(*) total FROM users')).total;
        assert.equal(await ensureLegacyAliasesImported(db), 2);
        assert.equal((await db.get('SELECT COUNT(*) total FROM users')).total, usersBefore);
        assert.equal((await listEffectiveSubstitutions(db, '2026-09-14')).length, 0);
        const aliases = await listLegacyAliases(db);
        assert.deepEqual(aliases.map(item => item.status), ['unresolved', 'unresolved']);
        const resolved = await reconcileLegacyAlias(db, aliases[0].id, {
          titularAssignmentId: seeded.assignment1,
          proposedDisplayName: aliases[0].substituteName,
          startsOn: '2026-09-14', plannedEndsOn: '2026-09-30', actorUserId: seeded.superadmin
        });
        assert.equal(resolved.status, 'resolved');
        assert.equal(resolved.request.status, 'pending_provisioning');
        assert.equal((await listEffectiveSubstitutions(db, '2026-09-14')).length, 0);
        assert.deepEqual(await markLegacyAliasObsolete(db, aliases[1].id, { actorUserId: seeded.superadmin }), {
          aliasId: aliases[1].id, status: 'obsolete'
        });
      });
    }
  },
  {
    name: 'dataset activation blocks missing active substitution profiles and only warns for historical ones',
    async fn() {
      await withDatabase(async db => {
        const seeded = await seedDomain(db);
        const substitute = await addUser(db, 'dataset.substitute', ['teacher']);
        const request = await createRequest(db, {
          titularAssignmentId: seeded.assignment1, substituteUserId: substitute,
          startsOn: '2026-09-14', plannedEndsOn: '2026-09-20', actorUserId: seeded.admin
        });
        await activateRequest(db, request.id, seeded.superadmin);

        const dataset = await db.run(
          `INSERT INTO schedule_datasets
            (academic_year_id, label, source_system, source_format, source_fingerprint,
             status, validation_report_json, validated_at)
           VALUES (?, 'Candidate', 'test', 'test', 'candidate-missing-profile',
             'validated', '{"valid":true}', CURRENT_TIMESTAMP)`, [seeded.yearId]
        );
        const identity = await db.run(
          `INSERT INTO teacher_external_identities
            (teacher_profile_id, academic_year_id, source_system, source_format, external_key)
           VALUES (?, ?, 'test', 'test', 'T002')`, [seeded.profile2, seeded.yearId]
        );
        await db.run(
          `INSERT INTO schedule_dataset_teachers
            (dataset_id, teacher_profile_id, teacher_external_identity_id) VALUES (?, ?, ?)`,
          [dataset.lastID, seeded.profile2, identity.lastID]
        );
        const teaching = await db.run(
          `INSERT INTO schedule_periods
            (dataset_id, period_key, position, period_type, label, starts_at, ends_at)
           VALUES (?, 'P1', 1, 'teaching', '1ª', '08:00', '08:55')`, [dataset.lastID]
        );
        await db.run(
          `INSERT INTO schedule_periods
            (dataset_id, period_key, position, period_type, label, starts_at, ends_at)
           VALUES (?, 'R1', 2, 'break', 'Recreo', '08:55', '09:15')`, [dataset.lastID]
        );
        await db.run(
          `INSERT INTO teacher_schedule_sessions
            (dataset_id, teacher_profile_id, teacher_external_identity_id, period_id, weekday, session_type)
           VALUES (?, ?, ?, ?, 0, 'class')`,
          [dataset.lastID, seeded.profile2, identity.lastID, teaching.lastID]
        );
        await assert.rejects(
          activateScheduleDataset(db, dataset.lastID, { date: '2026-09-14' }),
          error => error.code === 'ACTIVE_SUBSTITUTION_PROFILE_MISSING' && error.status === 409
        );
        const activated = await activateScheduleDataset(db, dataset.lastID, { date: '2026-09-21' });
        assert.equal(activated.status, 'active');
        assert.ok(activated.warnings.some(item => item.code === 'HISTORICAL_SUBSTITUTION_PROFILE_MISSING'));
      });
    }
  }
];
