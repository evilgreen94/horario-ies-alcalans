const { withImmediateTransaction = async (_db, callback) => callback() } = require('../../db');

function serializeHistorialRow(row) {
  return {
    ...row,
    undoState: row.undo_state ? JSON.parse(row.undo_state) : null
  };
}

async function listHistorial(db) {
  const rows = await db.all('SELECT * FROM historial ORDER BY ts DESC');
  return rows.map(serializeHistorialRow);
}

async function saveHistorialEntry(db, row) {
  await db.run(
    `INSERT OR REPLACE INTO historial (id, title, detail, type, actor, ts, undo_state)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [row.id, row.title, row.detail, row.type, row.actor, row.ts, row.undoState ? JSON.stringify(row.undoState) : null]
  );
}

async function replaceHistorial(db, rows) {
  return withImmediateTransaction(db, async () => {
    await db.exec('DELETE FROM historial');

    for (const row of rows) {
      await db.run(
        `INSERT INTO historial (id, title, detail, type, actor, ts, undo_state)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          row.id,
          row.title,
          row.detail || '',
          row.type || 'other',
          row.actor || 'Jefatura',
          row.ts,
          row.undoState ? JSON.stringify(row.undoState) : null
        ]
      );
    }

    return listHistorial(db);
  });
}

module.exports = {
  listHistorial,
  replaceHistorial,
  saveHistorialEntry,
  serializeHistorialRow
};
