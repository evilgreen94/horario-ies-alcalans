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
  return db;
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
  getDatabase,
  initializeDatabase
};
