const path = require('path');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const { hashPassword } = require('../auth');
const { withImmediateTransaction } = require('../db');

function valueAfter(name) { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : ''; }

async function main() {
  const dbValue = valueAfter('--db');
  const username = valueAfter('--username');
  const sourceCode = valueAfter('--source-code').toUpperCase();
  const password = String(process.env.GUARDIAS_LOCAL_TEACHER_PASSWORD || '');
  if (!dbValue || !/\.(?:dev|test|tmp)\.sqlite$/i.test(dbValue)) throw new Error('Usa --db con una base .dev/.test/.tmp.sqlite explícita.');
  if (!username || !sourceCode) throw new Error('Usa --username y --source-code.');
  if (password.length < 12) throw new Error('Define GUARDIAS_LOCAL_TEACHER_PASSWORD con al menos 12 caracteres.');
  const databasePath = path.resolve(dbValue);
  const operational = path.resolve(__dirname, '..', '..', 'BD', 'guardias.sqlite');
  if (databasePath.toLowerCase() === operational.toLowerCase()) throw new Error('La base operativa está bloqueada.');
  const db = await open({ filename: databasePath, driver: sqlite3.Database });
  try {
    await db.exec('PRAGMA foreign_keys = ON');
    const identity = await db.get(
      `SELECT profile.id AS profile_id, profile.display_name, year.id AS academic_year_id, year.starts_on, year.ends_on
       FROM teacher_external_identities identity
       JOIN teacher_profiles profile ON profile.id = identity.teacher_profile_id
       JOIN academic_years year ON year.id = profile.academic_year_id
       WHERE identity.external_key = ? COLLATE NOCASE
         AND identity.source_system = 'penalara software'
         AND year.status = 'active'`,
      [sourceCode]
    );
    if (!identity) throw new Error('No existe esa identidad en el curso activo.');
    const output = await withImmediateTransaction(db, async () => {
      const { salt, hash } = hashPassword(password);
      await db.run(
        `INSERT INTO users (username, display_name, password_hash, password_salt)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(username) DO UPDATE SET display_name=excluded.display_name,password_hash=excluded.password_hash,password_salt=excluded.password_salt,is_active=1,updated_at=CURRENT_TIMESTAMP`,
        [username, identity.display_name, hash, salt]
      );
      const user = await db.get('SELECT id FROM users WHERE username = ? COLLATE NOCASE', [username]);
      await db.run(`INSERT OR IGNORE INTO user_roles (user_id, role_id) SELECT ?, id FROM roles WHERE key = 'teacher'`, [user.id]);
      await db.run(
        `INSERT INTO teacher_assignments (user_id,teacher_profile_id,academic_year_id,assignment_type,starts_on,ends_on)
         SELECT ?, ?, ?, 'titular', ?, ?
         WHERE NOT EXISTS (
           SELECT 1 FROM teacher_assignments
           WHERE user_id = ? AND teacher_profile_id = ? AND academic_year_id = ?
             AND assignment_type = 'titular' AND starts_on = ? AND ends_on = ?
         )`,
        [user.id, identity.profile_id, identity.academic_year_id, identity.starts_on, identity.ends_on,
          user.id, identity.profile_id, identity.academic_year_id, identity.starts_on, identity.ends_on]
      );
      return { userId: user.id, username, sourceCode, teacher: identity.display_name };
    }, { label: 'local-teacher-fixture' });
    console.log(output);
  } finally { await db.close(); }
}

main().catch(error => { console.error(error.message || error); process.exitCode = 1; });
