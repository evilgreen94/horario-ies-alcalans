const fs = require('fs');
const path = require('path');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');

const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'guardias.sqlite');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

let databasePromise = null;

async function getDatabase() {
  if (!databasePromise) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
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
  return db;
}

module.exports = {
  getDatabase,
  initializeDatabase
};
