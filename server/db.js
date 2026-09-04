const fs = require('fs');
const os = require('os');
const path = require('path');
const { AsyncLocalStorage } = require('async_hooks');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const { ADMIN_ROLE, SUPERADMIN_ROLE, hashPassword } = require('./auth');

const SCHEMA_PATH = path.join(__dirname, 'schema.sql');
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');
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
const transactionContext = new AsyncLocalStorage();
const transactionStateByDb = new WeakMap();

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
    }).then(async db => {
      await db.exec('PRAGMA journal_mode = WAL');
      await db.exec('PRAGMA synchronous = NORMAL');
      await db.exec('PRAGMA busy_timeout = 5000');
      await db.exec('PRAGMA foreign_keys = ON');
      return db;
    });
  }

  return databasePromise;
}

function getTransactionState(db) {
  let state = transactionStateByDb.get(db);
  if (!state) {
    state = { tail: Promise.resolve() };
    transactionStateByDb.set(db, state);
  }
  return state;
}

async function withImmediateTransaction(db, callback, options = {}) {
  const activeContext = transactionContext.getStore();
  if (activeContext?.db === db) {
    return callback();
  }

  const state = getTransactionState(db);
  const label = String(options.label || 'sqlite-tx');
  const runTransaction = async () => {
    const startedAt = Date.now();
    console.info(`[sqlite] BEGIN ${label}`);
    await db.exec('BEGIN');
    try {
      const result = await transactionContext.run({ db, label }, callback);
      await db.exec('COMMIT');
      console.info(`[sqlite] COMMIT ${label} (${Date.now() - startedAt}ms)`);
      return result;
    } catch (error) {
      try {
        await db.exec('ROLLBACK');
        console.warn(`[sqlite] ROLLBACK ${label} (${Date.now() - startedAt}ms): ${error.message || error}`);
      } catch (_rollbackError) {
        console.warn(`[sqlite] ROLLBACK FAILED ${label}: ${_rollbackError.message || _rollbackError}`);
      }
      throw error;
    }
  };

  const runPromise = state.tail.then(runTransaction, runTransaction);
  state.tail = runPromise.catch(() => {});
  return runPromise;
}

async function initializeDatabase() {
  const db = await getDatabase();
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
  await db.exec(schema);
  await applyMigrations(db);
  await ensureAlumnosFueraAulaConstraints(db);
  await seedDefaultCredentials(db);
  await ensureWeeklyResetIfNeeded(db);
  return db;
}

async function applyMigrations(db) {
  await db.exec(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`
  );

  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  const migrationNames = fs.readdirSync(MIGRATIONS_DIR)
    .filter(name => /^\d+_[a-z0-9_-]+\.sql$/.test(name))
    .sort((left, right) => left.localeCompare(right, 'en'));
  const appliedRows = await db.all('SELECT name FROM schema_migrations');
  const appliedNames = new Set(appliedRows.map(row => row.name));
  const appliedNow = [];

  for (const name of migrationNames) {
    if (appliedNames.has(name)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, name), 'utf8');
    await withImmediateTransaction(db, async () => {
      await db.exec(sql);
      await db.run('INSERT INTO schema_migrations (name) VALUES (?)', [name]);
    }, { label: `migration:${name}` });
    appliedNow.push(name);
  }

  return appliedNow;
}

async function ensureAlumnosFueraAulaConstraints(db) {
  const table = await db.get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'alumnos_fuera_aula'");
  if (!table) return;

  const duplicateGroups = await db.all(
    `SELECT profesor, dia, hora, COUNT(*) AS total
     FROM alumnos_fuera_aula
     GROUP BY profesor, dia, hora
     HAVING total > 1`
  );

  for (const group of duplicateGroups) {
    const rows = await db.all(
      `SELECT *
       FROM alumnos_fuera_aula
       WHERE profesor = ? AND dia = ? AND hora = ?
       ORDER BY id`,
      [group.profesor, group.dia, group.hora]
    );
    if (!rows.length) continue;
    const keep = rows[0];
    const cantidad = Math.min(10, rows.reduce((sum, row) => sum + Number(row.cantidad || 0), 0));
    const lastExitAt = rows.map(row => row.last_exit_at || '').sort().filter(Boolean).pop() || '';
    const lastReturnAt = rows.map(row => row.last_return_at || '').sort().filter(Boolean).pop() || '';
    const removeIds = rows.slice(1).map(row => row.id);

    await db.run(
      `UPDATE alumnos_fuera_aula
       SET cantidad = ?, last_exit_at = ?, last_return_at = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [cantidad, lastExitAt, lastReturnAt, keep.id]
    );

    for (const id of removeIds) {
      await db.run('DELETE FROM alumnos_fuera_aula WHERE id = ?', [id]);
    }
  }

  await db.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_alumnos_fuera_aula_profesor_dia_hora
     ON alumnos_fuera_aula (profesor, dia, hora)`
  );
}

function getMadridNow() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Madrid' }));
}

function formatDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getCurrentSchoolWeekKey() {
  const now = getMadridNow();
  const day = now.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() + mondayOffset);
  return formatDateKey(monday);
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

  await withImmediateTransaction(db, async () => {
    await db.exec('DELETE FROM ausencias');
    await db.exec('DELETE FROM biblioteca_guardias');
    await db.exec('DELETE FROM historial');
    await db.exec('DELETE FROM tareas_profesorado');
    await db.exec('DELETE FROM alumnos_fuera_aula');
    await db.exec('DELETE FROM session_overrides');
    await db.run(
      `UPDATE app_state
       SET value = ?, updated_at = CURRENT_TIMESTAMP
       WHERE key = ?`,
      [currentWeekKey, WEEK_STATE_KEY]
    );
  });

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
  applyMigrations,
  ensureWeeklyResetIfNeeded,
  formatDateKey,
  getDatabase,
  getMadridNow,
  getCurrentSchoolWeekKey,
  initializeDatabase,
  withImmediateTransaction
};
