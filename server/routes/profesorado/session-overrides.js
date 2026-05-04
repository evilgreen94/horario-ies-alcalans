function registerSessionOverridesRoutes(router, deps) {
  const { getDatabase, sanitizeSessionOverride, ensureArray, ensureRequiredString, requireRole } = deps;

  router.get('/session-overrides', async (_req, res, next) => {
    try {
      const db = await getDatabase();
      const rows = await db.all('SELECT * FROM session_overrides ORDER BY profesor, dia, hora');
      res.json(
        rows.map(row => ({
          id: row.id,
          profesor: row.profesor,
          dia: row.dia,
          hora: row.hora,
          materia: row.materia || '',
          grupo: row.grupo || '',
          detalle: row.detalle || '',
          aula: row.aula || ''
        }))
      );
    } catch (error) {
      next(error);
    }
  });

  router.put('/session-overrides/replace', requireRole('admin'), async (req, res, next) => {
    try {
      const rows = ensureArray(req.body, 'Los overrides de sesión').map(sanitizeSessionOverride);
      const db = await getDatabase();
      await db.exec('DELETE FROM session_overrides');

      for (const row of rows) {
        await db.run(
          `INSERT INTO session_overrides (id, profesor, dia, hora, materia, grupo, detalle, aula, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
          [row.id, row.profesor, row.dia, row.hora, row.materia || '', row.grupo || '', row.detalle || '', row.aula || '']
        );
      }

      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  router.post('/session-overrides', requireRole('admin'), async (req, res, next) => {
    try {
      const row = sanitizeSessionOverride(req.body);
      const db = await getDatabase();
      await db.run(
        `INSERT INTO session_overrides (id, profesor, dia, hora, materia, grupo, detalle, aula, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(id) DO UPDATE SET
           profesor = excluded.profesor,
           dia = excluded.dia,
           hora = excluded.hora,
           materia = excluded.materia,
           grupo = excluded.grupo,
           detalle = excluded.detalle,
           aula = excluded.aula,
           updated_at = CURRENT_TIMESTAMP`,
        [row.id, row.profesor, row.dia, row.hora, row.materia || '', row.grupo || '', row.detalle || '', row.aula || '']
      );
      res.json({ ok: true, entry: row });
    } catch (error) {
      next(error);
    }
  });

  router.delete('/session-overrides/:id', requireRole('admin'), async (req, res, next) => {
    try {
      const id = ensureRequiredString(req.params.id, 'id');
      const db = await getDatabase();
      await db.run('DELETE FROM session_overrides WHERE id = ?', [id]);
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });
}

module.exports = { registerSessionOverridesRoutes };
