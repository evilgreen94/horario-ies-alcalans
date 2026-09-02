const sqlite3 = require('sqlite3');

function openDatabase(filename, mode) {
  return new Promise((resolve, reject) => {
    const database = new sqlite3.Database(filename, mode, error => {
      if (error) {
        reject(error);
        return;
      }
      resolve(database);
    });
  });
}

function closeDatabase(database) {
  return new Promise((resolve, reject) => {
    database.close(error => error ? reject(error) : resolve());
  });
}

function finishBackup(backup) {
  return new Promise((resolve, reject) => {
    backup.finish(error => error ? reject(error) : resolve());
  });
}

async function createSqliteBackup(sourcePath, targetPath) {
  const source = await openDatabase(sourcePath, sqlite3.OPEN_READONLY);
  let backup = null;
  let finished = false;
  try {
    backup = source.backup(targetPath);
    await new Promise((resolve, reject) => {
      backup.step(-1, error => error ? reject(error) : resolve());
    });
    await finishBackup(backup);
    finished = true;
  } finally {
    if (backup && !finished) {
      await finishBackup(backup).catch(() => {});
    }
    await closeDatabase(source);
  }
}

async function verifySqliteBackup(filename) {
  const database = await openDatabase(filename, sqlite3.OPEN_READONLY);
  try {
    const result = await new Promise((resolve, reject) => {
      database.get('PRAGMA quick_check', (error, row) => error ? reject(error) : resolve(row));
    });
    const value = result && Object.values(result)[0];
    if (value !== 'ok') {
      throw new Error(`SQLite backup integrity check failed: ${value || 'no result'}`);
    }
  } finally {
    await closeDatabase(database);
  }
}

module.exports = {
  createSqliteBackup,
  verifySqliteBackup
};
