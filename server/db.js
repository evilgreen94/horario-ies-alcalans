const fs = require('fs');
const os = require('os');
const path = require('path');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const { ADMIN_ROLE, SUPERADMIN_ROLE, hashPassword } = require('./auth');

const SCHEMA_PATH = path.join(__dirname, 'schema.sql');
const LEGACY_DATA_DIR = path.join(__dirname, 'data');
const LEGACY_DB_PATH = path.join(LEGACY_DATA_DIR, 'guardias.sqlite');
const PROJECT_DB_PATH = path.join(__dirname, '..', 'BD', 'guardias.sqlite');
const REQUIRED_PASSWORD_ENV_BY_ROLE = {
  [ADMIN_ROLE]: 'GUARDIAS_ADMIN_PASSWORD',
  [SUPERADMIN_ROLE]: 'GUARDIAS_SUPERADMIN_PASSWORD'
};
const WEEK_STATE_KEY = 'school_week_key';

let lastWeekCheckKey = '';

function resolveDefaultDataDir() {
  if (process.platform === 'win32') {
    return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'horario-ies-alcalans');
  }
  return path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'), 'horario-ies-alcalans');
}

function resolveDatabasePath() {
  const configuredPath = (process.env.GUARDIAS_DB_PATH || '').trim();
  if (configuredPath) {
    return path.resolve(configuredPath);
  }
  if (fs.existsSync(PROJECT_DB_PATH)) {
    return PROJECT_DB_PATH;
  }
  return path.join(resolveDefaultDataDir(), 'guardias.sqlite');
}

const DB_PATH = resolveDatabasePath();
const DATA_DIR = path.dirname(DB_PATH);

let databasePromise = null;

function copyIfExists(sourcePath, targetPath) {
  if (!fs.existsSync(sourcePath) || fs.existsSync(targetPath)) return;
  fs.copyFileSync(sourcePath, targetPath);
}

function migrateLegacyDatabaseIfNeeded() {
  if (DB_PATH === LEGACY_DB_PATH) return;
  if (fs.existsSync(DB_PATH) || !fs.existsSync(LEGACY_DB_PATH)) return;

  copyIfExists(LEGACY_DB_PATH, DB_PATH);
  copyIfExists(`${LEGACY_DB_PATH}-wal`, `${DB_PATH}-wal`);
  copyIfExists(`${LEGACY_DB_PATH}-shm`, `${DB_PATH}-shm`);
}

async function getDatabase() {
  if (!databasePromise) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    migrateLegacyDatabaseIfNeeded();
    databasePromise = open({
      filename: DB_PATH,
      driver: sqlite3.Database
    });
  }

  return databasePromise;
}

async function initializeDatabase() {
  const db = await getDatabase();
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
  await db.exec(schema);
  await seedDefaultCredentials(db);
  await ensureWeeklyResetIfNeeded(db);
  return db;
}

function getMadridNow() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Madrid' }));
}

function getCurrentSchoolWeekKey() {
  const now = getMadridNow();
  const day = now.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() + mondayOffset);
  return monday.toISOString().slice(0, 10);
}

async function ensureWeeklyResetIfNeeded(dbInstance) {
  const db = dbInstance || await getDatabase();
  const currentWeekKey = getCurrentSchoolWeekKey();
  if (lastWeekCheckKey === currentWeekKey) return false;

  const storedState = await db.get('SELECT value FROM app_state WHERE key = ?', [WEEK_STATE_KEY]);
  if (!storedState) {
    await db.run(
      `INSERT INTO app_state (key, value, updated_at)
       VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
      [WEEK_STATE_KEY, currentWeekKey]
    );
    lastWeekCheckKey = currentWeekKey;
    return false;
  }

  if (storedState.value === currentWeekKey) {
    lastWeekCheckKey = currentWeekKey;
    return false;
  }

  await db.exec('BEGIN TRANSACTION');
  try {
    await db.exec('DELETE FROM ausencias');
    await db.exec('DELETE FROM biblioteca_guardias');
    await db.exec('DELETE FROM historial');
    await db.exec('DELETE FROM tareas_profesorado');
    await db.run(
      `UPDATE app_state
       SET value = ?, updated_at = CURRENT_TIMESTAMP
       WHERE key = ?`,
      [currentWeekKey, WEEK_STATE_KEY]
    );
    await db.exec('COMMIT');
  } catch (error) {
    await db.exec('ROLLBACK');
    throw error;
  }

  lastWeekCheckKey = currentWeekKey;
  return true;
}

async function seedDefaultCredentials(db) {
  const roles = [ADMIN_ROLE, SUPERADMIN_ROLE];

  for (const role of roles) {
    const existing = await db.get('SELECT role FROM auth_credentials WHERE role = ?', [role]);
    if (existing) continue;
    const envName = REQUIRED_PASSWORD_ENV_BY_ROLE[role];
    const password = String(process.env[envName] || '').trim();
    if (password.length < 8) {
      throw new Error(`Missing or weak ${envName}. Set an initial password of at least 8 characters for role "${role}".`);
    }
    const { salt, hash } = hashPassword(password);
    await db.run(
      `INSERT INTO auth_credentials (role, password_hash, salt, updated_at)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
      [role, hash, salt]
    );
  }
}

module.exports = {
  DB_PATH,
  ensureWeeklyResetIfNeeded,
  getDatabase,
  getCurrentSchoolWeekKey,
  initializeDatabase
};
