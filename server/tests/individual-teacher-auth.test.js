const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');

const { hashPassword, verifyPassword } = require('../auth');
const { appendAuditEvent } = require('../audit');
const { applyMigrations } = require('../db');
const { resolveActiveTeacherProfile } = require('../teacher-identity');

function loadSessionModule(secret) {
  const modulePath = require.resolve('../session');
  delete require.cache[modulePath];
  process.env.GUARDIAS_SESSION_SECRET = secret;
  return require('../session');
}

async function withTestDatabase(callback) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'guardias-identity-test-'));
  const dbPath = path.join(root, 'identity.sqlite');
  const db = await open({ filename: dbPath, driver: sqlite3.Database });
  try {
    await db.exec('PRAGMA foreign_keys = ON');
    return await callback(db);
  } finally {
    await db.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function createResponse() {
  return {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    }
  };
}

async function seedIdentity(db) {
  const titularCredential = hashPassword('shared-password');
  const substituteCredential = hashPassword('shared-password');
  const titular = await db.run(
    `INSERT INTO users (username, display_name, password_hash, password_salt)
     VALUES ('titular.test', 'Titular Test', ?, ?)`,
    [titularCredential.hash, titularCredential.salt]
  );
  const substitute = await db.run(
    `INSERT INTO users (username, display_name, password_hash, password_salt)
     VALUES ('sustituto.test', 'Sustituto Test', ?, ?)`,
    [substituteCredential.hash, substituteCredential.salt]
  );
  const titularProfile = await db.run(
    "INSERT INTO teacher_profiles (schedule_key, display_name) VALUES ('TEST_TITULAR', 'Perfil Titular')"
  );
  const substituteProfile = await db.run(
    "INSERT INTO teacher_profiles (schedule_key, display_name) VALUES ('TEST_SUSTITUTO', 'Perfil Sustituto')"
  );
  const titularAssignment = await db.run(
    `INSERT INTO teacher_assignments
      (user_id, teacher_profile_id, assignment_type, starts_on)
     VALUES (?, ?, 'titular', '2026-09-01')`,
    [titular.lastID, titularProfile.lastID]
  );
  await db.run(
    `INSERT INTO teacher_assignments
      (user_id, teacher_profile_id, assignment_type, starts_on)
     VALUES (?, ?, 'titular', '2026-09-01')`,
    [substitute.lastID, substituteProfile.lastID]
  );
  await db.run(
    `INSERT INTO teacher_assignments
      (user_id, teacher_profile_id, assignment_type, starts_on, ends_on, replaces_assignment_id)
     VALUES (?, ?, 'sustituto', '2026-09-10', '2026-09-20', ?)`,
    [substitute.lastID, titularProfile.lastID, titularAssignment.lastID]
  );
  return {
    titularCredential,
    substituteCredential,
    titular,
    substitute,
    titularProfile,
    substituteProfile,
    titularAssignment
  };
}

module.exports = [
  {
    name: 'identity migration is additive and idempotent on the legacy schema',
    async fn() {
      await withTestDatabase(async db => {
        const legacySchema = fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8');
        await db.exec(legacySchema);
        await db.run(
          `INSERT INTO auth_credentials (role, password_hash, salt)
           VALUES ('legacy-test', 'preserved-hash', 'preserved-salt')`
        );

        assert.deepEqual(await applyMigrations(db), ['001_individual_teacher_auth.sql']);
        assert.deepEqual(await applyMigrations(db), []);

        const tables = new Set((await db.all("SELECT name FROM sqlite_master WHERE type = 'table'")).map(row => row.name));
        for (const table of ['users', 'roles', 'user_roles', 'teacher_profiles', 'teacher_assignments', 'audit_log', 'schema_migrations']) {
          assert.ok(tables.has(table), `missing migrated table ${table}`);
        }
        assert.deepEqual(
          await db.get("SELECT password_hash, salt FROM auth_credentials WHERE role = 'legacy-test'"),
          { password_hash: 'preserved-hash', salt: 'preserved-salt' }
        );
        assert.equal((await db.get('SELECT COUNT(*) AS total FROM schema_migrations')).total, 1);
        assert.equal(
          (await db.get("SELECT COUNT(*) AS total FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'trg_teacher_assignments_%'")).total,
          2
        );
        assert.deepEqual(
          (await db.all('SELECT key FROM roles ORDER BY key')).map(row => row.key),
          ['admin', 'superadmin', 'teacher']
        );
      });
    }
  },
  {
    name: 'individual passwords use unique salts and are never stored as plaintext',
    async fn() {
      await withTestDatabase(async db => {
        await applyMigrations(db);
        const seeded = await seedIdentity(db);
        const rows = await db.all('SELECT username, password_hash, password_salt FROM users ORDER BY username');

        assert.equal(rows.length, 2);
        assert.notEqual(rows[0].password_salt, rows[1].password_salt);
        assert.notEqual(rows[0].password_hash, rows[1].password_hash);
        for (const row of rows) {
          assert.notEqual(row.password_hash, 'shared-password');
          assert.ok(verifyPassword('shared-password', row.password_salt, row.password_hash));
          assert.equal(verifyPassword('wrong-password', row.password_salt, row.password_hash), false);
        }
        assert.notEqual(seeded.titularCredential.salt, seeded.substituteCredential.salt);
      });
    }
  },
  {
    name: 'active teacher profile resolver prioritizes substitutions and expires them inclusively',
    async fn() {
      await withTestDatabase(async db => {
        await applyMigrations(db);
        const { substitute } = await seedIdentity(db);

        const before = await resolveActiveTeacherProfile(db, substitute.lastID, '2026-09-09');
        const firstDay = await resolveActiveTeacherProfile(db, substitute.lastID, '2026-09-10');
        const lastDay = await resolveActiveTeacherProfile(db, substitute.lastID, '2026-09-20');
        const expired = await resolveActiveTeacherProfile(db, substitute.lastID, '2026-09-21');

        assert.equal(before.assignment.type, 'titular');
        assert.equal(before.teacherProfile.scheduleKey, 'TEST_SUSTITUTO');
        assert.equal(firstDay.assignment.type, 'sustituto');
        assert.equal(firstDay.teacherProfile.scheduleKey, 'TEST_TITULAR');
        assert.equal(lastDay.assignment.type, 'sustituto');
        assert.equal(expired.assignment.type, 'titular');
        assert.equal(expired.teacherProfile.scheduleKey, 'TEST_SUSTITUTO');
      });
    }
  },
  {
    name: 'teacher assignment constraints reject overlapping and invalid substitutions',
    async fn() {
      await withTestDatabase(async db => {
        await applyMigrations(db);
        const seeded = await seedIdentity(db);

        await assert.rejects(
          db.run(
            `INSERT INTO teacher_assignments
              (user_id, teacher_profile_id, assignment_type, starts_on, ends_on, replaces_assignment_id)
             VALUES (?, ?, 'sustituto', '2026-09-15', '2026-09-25', ?)`,
            [seeded.substitute.lastID, seeded.titularProfile.lastID, seeded.titularAssignment.lastID]
          ),
          /overlapping teacher assignment/
        );
        const thirdCredential = hashPassword('third-substitute-password');
        const thirdUser = await db.run(
          `INSERT INTO users (username, display_name, password_hash, password_salt)
           VALUES ('third.test', 'Third Substitute', ?, ?)`,
          [thirdCredential.hash, thirdCredential.salt]
        );
        await assert.rejects(
          db.run(
            `INSERT INTO teacher_assignments
              (user_id, teacher_profile_id, assignment_type, starts_on, ends_on, replaces_assignment_id)
             VALUES (?, ?, 'sustituto', '2026-09-12', '2026-09-18', ?)`,
            [thirdUser.lastID, seeded.titularProfile.lastID, seeded.titularAssignment.lastID]
          ),
          /overlapping teacher assignment/
        );
        await assert.rejects(
          db.run(
            `INSERT INTO teacher_assignments
              (user_id, teacher_profile_id, assignment_type, starts_on, ends_on, replaces_assignment_id)
             VALUES (?, ?, 'sustituto', '2026-08-01', '2026-08-31', ?)`,
            [seeded.substitute.lastID, seeded.titularProfile.lastID, seeded.titularAssignment.lastID]
          ),
          /invalid titular assignment for substitute/
        );

        const nonOverlapping = await db.run(
          `INSERT INTO teacher_assignments
            (user_id, teacher_profile_id, assignment_type, starts_on, ends_on, replaces_assignment_id)
           VALUES (?, ?, 'sustituto', '2026-09-21', '2026-09-30', ?)`,
          [seeded.substitute.lastID, seeded.titularProfile.lastID, seeded.titularAssignment.lastID]
        );
        assert.ok(nonOverlapping.lastID > 0);
      });
    }
  },
  {
    name: 'teacher profile resolver remains deterministic with legacy overlapping substitutions',
    async fn() {
      await withTestDatabase(async db => {
        await applyMigrations(db);
        const seeded = await seedIdentity(db);
        await db.exec('DROP TRIGGER trg_teacher_assignments_validate_insert');
        await db.exec('DROP TRIGGER trg_teacher_assignments_validate_update');

        await db.run(
          `INSERT INTO teacher_assignments
            (user_id, teacher_profile_id, assignment_type, starts_on, ends_on, replaces_assignment_id)
           VALUES (?, ?, 'sustituto', '2026-09-15', '2026-09-18', ?)`,
          [seeded.substitute.lastID, seeded.titularProfile.lastID, seeded.titularAssignment.lastID]
        );
        const latest = await db.run(
          `INSERT INTO teacher_assignments
            (user_id, teacher_profile_id, assignment_type, starts_on, ends_on, replaces_assignment_id)
           VALUES (?, ?, 'sustituto', '2026-09-15', '2026-09-18', ?)`,
          [seeded.substitute.lastID, seeded.titularProfile.lastID, seeded.titularAssignment.lastID]
        );

        const resolved = await resolveActiveTeacherProfile(db, seeded.substitute.lastID, '2026-09-16');
        assert.equal(resolved.assignment.id, latest.lastID);
        assert.equal(resolved.assignment.type, 'sustituto');
      });
    }
  },
  {
    name: 'teacher profile resolver returns null without an assignment or with an inactive profile',
    async fn() {
      await withTestDatabase(async db => {
        await applyMigrations(db);
        const seeded = await seedIdentity(db);
        const credential = hashPassword('unassigned-password');
        const unassigned = await db.run(
          `INSERT INTO users (username, display_name, password_hash, password_salt)
           VALUES ('unassigned.test', 'Unassigned Test', ?, ?)`,
          [credential.hash, credential.salt]
        );

        assert.equal(await resolveActiveTeacherProfile(db, unassigned.lastID, '2026-09-15'), null);
        await db.run('UPDATE teacher_profiles SET is_active = 0 WHERE id = ?', [seeded.titularProfile.lastID]);
        assert.equal(await resolveActiveTeacherProfile(db, seeded.titular.lastID, '2026-09-15'), null);
      });
    }
  },
  {
    name: 'audit details redact password and credential material recursively',
    async fn() {
      await withTestDatabase(async db => {
        await applyMigrations(db);
        await appendAuditEvent(db, {
          action: 'auth.redaction_test',
          targetType: 'user',
          targetId: '1',
          details: {
            safeField: 'visible',
            password: 'plain-secret',
            nested: {
              passwordHash: 'hash-secret',
              salt: 'salt-secret',
              cookie: 'cookie-secret',
              authorizationToken: 'token-secret',
              sessionSecret: 'session-secret'
            }
          }
        });
        const row = await db.get("SELECT details_json FROM audit_log WHERE action = 'auth.redaction_test'");
        const serialized = row.details_json;
        const details = JSON.parse(serialized);

        assert.equal(details.safeField, 'visible');
        assert.equal(details.password, '[REDACTED]');
        for (const secret of ['plain-secret', 'hash-secret', 'salt-secret', 'cookie-secret', 'token-secret', 'session-secret']) {
          assert.equal(serialized.includes(secret), false);
        }
      });
    }
  },
  {
    name: 'individual session permissions allow teacher access without granting admin access',
    fn() {
      const session = loadSessionModule('individual-permissions-test-secret');
      const cookie = session.serializeSessionCookie({
        userId: 42,
        username: 'profesor.test',
        displayName: 'Profesor Test',
        roles: ['teacher']
      }, { secure: false, headers: {} }).split(';')[0];
      const parsed = session.readSessionFromRequest({ headers: { cookie } });

      assert.equal(parsed.userId, 42);
      assert.deepEqual(parsed.roles, ['teacher']);
      assert.equal(parsed.isAdmin, false);

      let teacherNextCalls = 0;
      session.requireRole('teacher')({ headers: { cookie } }, createResponse(), () => {
        teacherNextCalls += 1;
      });
      assert.equal(teacherNextCalls, 1);

      const forbidden = createResponse();
      session.requireRole('admin')({ headers: { cookie } }, forbidden, () => {
        throw new Error('teacher must not gain admin access');
      });
      assert.equal(forbidden.statusCode, 403);
      assert.deepEqual(forbidden.payload, { error: 'Permisos insuficientes.' });

      const [cookieName, signedValue] = cookie.split('=');
      const [payload, signature] = signedValue.split('.');
      const forgedPayload = Buffer.from(JSON.stringify({
        ...JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')),
        roles: ['teacher', 'superadmin'],
        role: 'superadmin'
      })).toString('base64url');
      const forged = session.readSessionFromRequest({
        headers: { cookie: `${cookieName}=${forgedPayload}.${signature}` }
      });
      assert.equal(forged, null);
    }
  }
];
