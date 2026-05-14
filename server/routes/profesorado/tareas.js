const { withImmediateTransaction: defaultWithImmediateTransaction } = require('../../db');

function registerTareasRoutes(router, deps) {
  const {
    getDatabase,
    sanitizeTareaProfesorado,
    ensureArray,
    ensureRequiredString,
    requireRole,
    withImmediateTransaction = defaultWithImmediateTransaction
  } = deps;

  router.get('/tareas', async (_req, res, next) => {
    try {
      const db = await getDatabase();
      const rows = await db.all('SELECT * FROM tareas_profesorado ORDER BY profesor, dia, hora');
      res.json(
        rows.map(row => ({
          id: row.id,
          profesor: row.profesor,
          dia: row.dia,
          hora: row.hora,
          dejada: !!row.dejada,
          tarea: row.tarea || ''
        }))
      );
    } catch (error) {
      next(error);
    }
  });

  router.put('/tareas/replace', requireRole('admin'), async (req, res, next) => {
    try {
      const rows = ensureArray(req.body, 'Las tareas de profesorado').map(sanitizeTareaProfesorado);
      const db = await getDatabase();
      await withImmediateTransaction(db, async () => {
        await db.exec('DELETE FROM tareas_profesorado');

        for (const row of rows) {
          await db.run(
            `INSERT INTO tareas_profesorado (id, profesor, dia, hora, dejada, tarea, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
            [row.id, row.profesor, row.dia, row.hora, row.dejada ? 1 : 0, row.tarea || '']
          );
        }
      });

      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  router.post('/tareas', requireRole('admin'), async (req, res, next) => {
    try {
      const row = sanitizeTareaProfesorado(req.body);
      const db = await getDatabase();
      await db.run(
        `INSERT INTO tareas_profesorado (id, profesor, dia, hora, dejada, tarea, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(id) DO UPDATE SET
           profesor = excluded.profesor,
           dia = excluded.dia,
           hora = excluded.hora,
           dejada = excluded.dejada,
           tarea = excluded.tarea,
           updated_at = CURRENT_TIMESTAMP`,
        [row.id, row.profesor, row.dia, row.hora, row.dejada ? 1 : 0, row.tarea || '']
      );
      res.json({ ok: true, entry: row });
    } catch (error) {
      next(error);
    }
  });

  router.delete('/tareas/:id', requireRole('admin'), async (req, res, next) => {
    try {
      const id = ensureRequiredString(req.params.id, 'id');
      const db = await getDatabase();
      await db.run('DELETE FROM tareas_profesorado WHERE id = ?', [id]);
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });
}

module.exports = { registerTareasRoutes };
