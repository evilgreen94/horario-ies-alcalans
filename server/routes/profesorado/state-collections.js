const SUBSTITUTIONS_STATE_KEY = 'teacher_substitutions';
const PRACTICAS_GUARDIAS_STATE_KEY = 'teacher_practicas_guardias';
const PRACTICAS_GUARDIAS_TRAMOS_STATE_KEY = 'teacher_practicas_guardias_tramos';
const FUTURE_ABSENCES_STATE_KEY = 'teacher_future_absences';
const PATIO_GUARDIAS_STATE_KEY = 'patio_guardias';
const PATIO_TEACHER_BLOCKS_STATE_KEY = 'patio_teacher_blocks';

async function getStateRows(db, key) {
  const row = await db.get('SELECT value FROM app_state WHERE key = ?', [key]);
  const parsed = row?.value ? JSON.parse(row.value) : [];
  return Array.isArray(parsed) ? parsed : [];
}

async function replaceStateRows(db, key, rows) {
  await db.run(
    `INSERT INTO app_state (key, value, updated_at)
     VALUES (?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
    [key, JSON.stringify(rows)]
  );
}

function registerStateCollectionRoutes(router, deps) {
  const {
    getDatabase,
    ensureArray,
    sanitizeTeacherSubstitution,
    sanitizeTeacherPracticeGuardia,
    sanitizeTeacherPracticeGuardiaSlot,
    sanitizeTeacherFutureAbsence,
    sanitizePatioGuardia,
    sanitizePatioTeacherBlock,
    requireRole,
    withImmediateTransaction
  } = deps;

  router.get('/substitutions', async (_req, res, next) => {
    try {
      const db = await getDatabase();
      res.json(await getStateRows(db, SUBSTITUTIONS_STATE_KEY));
    } catch (error) {
      next(error);
    }
  });

  router.put('/substitutions/replace', requireRole('admin'), async (req, res, next) => {
    try {
      const rows = ensureArray(req.body, 'Las sustituciones de profesorado').map(sanitizeTeacherSubstitution);
      const db = await getDatabase();
      await replaceStateRows(db, SUBSTITUTIONS_STATE_KEY, rows);
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  router.get('/practicas-guardias', async (_req, res, next) => {
    try {
      const db = await getDatabase();
      res.json(await getStateRows(db, PRACTICAS_GUARDIAS_STATE_KEY));
    } catch (error) {
      next(error);
    }
  });

  router.put('/practicas-guardias/replace', requireRole('admin'), async (req, res, next) => {
    try {
      const rows = ensureArray(req.body, 'La disponibilidad por practicas para guardias').map(sanitizeTeacherPracticeGuardia);
      const db = await getDatabase();
      await replaceStateRows(db, PRACTICAS_GUARDIAS_STATE_KEY, rows);
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  router.get('/practicas-guardias-tramos', async (_req, res, next) => {
    try {
      const db = await getDatabase();
      res.json(await getStateRows(db, PRACTICAS_GUARDIAS_TRAMOS_STATE_KEY));
    } catch (error) {
      next(error);
    }
  });

  router.put('/practicas-guardias-tramos/replace', requireRole('admin'), async (req, res, next) => {
    try {
      const rows = ensureArray(req.body, 'Los tramos manuales por practicas para guardias').map(sanitizeTeacherPracticeGuardiaSlot);
      const db = await getDatabase();
      await replaceStateRows(db, PRACTICAS_GUARDIAS_TRAMOS_STATE_KEY, rows);
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  router.get('/patio-guardias', async (_req, res, next) => {
    try {
      const db = await getDatabase();
      res.json(await getStateRows(db, PATIO_GUARDIAS_STATE_KEY));
    } catch (error) {
      next(error);
    }
  });

  router.put('/patio-guardias/replace', requireRole('admin'), async (req, res, next) => {
    try {
      const rows = ensureArray(req.body, 'La cobertura de patio').map(sanitizePatioGuardia);
      const db = await getDatabase();
      await replaceStateRows(db, PATIO_GUARDIAS_STATE_KEY, rows);
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  router.get('/patio-teacher-blocks', async (_req, res, next) => {
    try {
      const db = await getDatabase();
      res.json(await getStateRows(db, PATIO_TEACHER_BLOCKS_STATE_KEY));
    } catch (error) {
      next(error);
    }
  });

  router.put('/patio-teacher-blocks/replace', requireRole('admin'), async (req, res, next) => {
    try {
      const rows = ensureArray(req.body, 'Los bloqueos de patio').map(sanitizePatioTeacherBlock);
      const db = await getDatabase();
      await replaceStateRows(db, PATIO_TEACHER_BLOCKS_STATE_KEY, rows);
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  router.get('/future-absences', async (_req, res, next) => {
    try {
      const db = await getDatabase();
      res.json(await getStateRows(db, FUTURE_ABSENCES_STATE_KEY));
    } catch (error) {
      next(error);
    }
  });

  router.post('/future-absences', async (req, res, next) => {
    try {
      const entry = sanitizeTeacherFutureAbsence(req.body);
      const db = await getDatabase();
      await withImmediateTransaction(db, async () => {
        const current = await getStateRows(db, FUTURE_ABSENCES_STATE_KEY);
        const nextRows = [...current.filter(row => row?.id !== entry.id), entry];
        await replaceStateRows(db, FUTURE_ABSENCES_STATE_KEY, nextRows);
      });
      res.json({ ok: true, entry });
    } catch (error) {
      next(error);
    }
  });

  router.put('/future-absences/:id', requireRole('admin'), async (req, res, next) => {
    try {
      const id = String(req.params.id || '').trim();
      const entry = sanitizeTeacherFutureAbsence({ ...req.body, id });
      const db = await getDatabase();
      await withImmediateTransaction(db, async () => {
        const current = await getStateRows(db, FUTURE_ABSENCES_STATE_KEY);
        const nextRows = [...current.filter(row => row?.id !== id), entry];
        await replaceStateRows(db, FUTURE_ABSENCES_STATE_KEY, nextRows);
      });
      res.json({ ok: true, entry });
    } catch (error) {
      next(error);
    }
  });

  router.delete('/future-absences/:id', requireRole('admin'), async (req, res, next) => {
    try {
      const id = String(req.params.id || '').trim();
      const db = await getDatabase();
      await withImmediateTransaction(db, async () => {
        const current = await getStateRows(db, FUTURE_ABSENCES_STATE_KEY);
        const nextRows = current.filter(row => String(row?.id || '') !== id);
        await replaceStateRows(db, FUTURE_ABSENCES_STATE_KEY, nextRows);
      });
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });
}

module.exports = { registerStateCollectionRoutes };
