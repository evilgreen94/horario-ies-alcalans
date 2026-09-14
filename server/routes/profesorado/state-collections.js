const crypto = require('node:crypto');
const { listEffectiveSubstitutions, madridDateKey } = require('../../substitution-service');

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
    appendAuditEvent,
    requireAuthenticated,
    requireRole,
    resolveActiveTeacherContext,
    requireSameOriginWrite,
    withImmediateTransaction
  } = deps;

  async function buildOwnedFutureAbsence(req, db) {
    const roles = Array.isArray(req.sessionUser?.roles) ? req.sessionUser.roles : [];
    if (roles.includes('teacher')) {
      const requested = sanitizeTeacherFutureAbsence(req.body);
      const context = await resolveActiveTeacherContext(db, req.sessionUser.userId, requested.date);
      if (!context) {
        const error = new Error('No hay un perfil docente activo asignado para esa fecha.');
        error.status = 404;
        throw error;
      }
      if (!context.externalIdentity?.sourceCode) {
        const error = new Error('El perfil docente no pertenece al dataset horario activo.');
        error.status = 409;
        throw error;
      }
      return sanitizeTeacherFutureAbsence({
        ...req.body,
        id: `future-${crypto.randomUUID()}`,
        profesor: context.teacherProfile.displayName,
        sourceCode: context.externalIdentity.sourceCode,
        status: 'pending',
        reviewedAt: '',
        reviewerNote: '',
        appliedAt: ''
      });
    }
    if (roles.includes('admin')) return sanitizeTeacherFutureAbsence(req.body);
    const error = new Error('Permisos insuficientes.');
    error.status = 403;
    throw error;
  }

  router.get('/substitutions', async (req, res, next) => {
    try {
      const db = await getDatabase();
      const date = typeof req.query.date === 'string' ? req.query.date : madridDateKey();
      const rows = await listEffectiveSubstitutions(db, date);
      res.setHeader('Cache-Control', 'no-store');
      res.json(rows.map(row => ({
        profesor: row.titular.displayName,
        sustituto: row.substitute.displayName,
        assignmentId: row.assignmentId,
        status: row.status,
        startsOn: row.startsOn,
        endsOn: row.endsOn,
        titular: row.titular,
        substitute: row.substitute
      })));
    } catch (error) {
      next(error);
    }
  });

  router.put('/substitutions/replace', requireRole('admin'), async (req, res, next) => {
    try {
      const error = new Error('La escritura legacy de sustituciones está retirada. Usa solicitudes estructuradas.');
      error.status = 410;
      error.code = 'LEGACY_SUBSTITUTION_WRITE_RETIRED';
      throw error;
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

  router.put('/patio-teacher-blocks/own', requireAuthenticated, requireSameOriginWrite, async (req, res, next) => {
    try {
      const roles = Array.isArray(req.sessionUser?.roles) ? req.sessionUser.roles : [];
      if (!roles.includes('teacher')) {
        const error = new Error('La operación requiere una identidad docente individual.');
        error.status = 403;
        throw error;
      }
      const db = await getDatabase();
      const context = await resolveActiveTeacherContext(db, req.sessionUser.userId, new Date());
      if (!context?.externalIdentity?.sourceCode) {
        const error = new Error('No hay un perfil docente activo en el dataset operativo.');
        error.status = context ? 409 : 404;
        throw error;
      }
      const entry = sanitizePatioTeacherBlock({
        ...req.body,
        profesor: context.teacherProfile.displayName,
        sourceCode: context.externalIdentity.sourceCode
      });
      const active = req.body?.active !== false;
      await withImmediateTransaction(db, async () => {
        const current = await getStateRows(db, PATIO_TEACHER_BLOCKS_STATE_KEY);
        const sameEntry = row => (
          row?.weekKey === entry.weekKey && Number(row?.dia) === entry.dia && Number(row?.hora) === entry.hora &&
          (String(row?.sourceCode || '').toUpperCase() === entry.sourceCode.toUpperCase() ||
            (!row?.sourceCode && row?.profesor === entry.profesor))
        );
        const nextRows = current.filter(row => !sameEntry(row));
        if (active) nextRows.push(entry);
        await replaceStateRows(db, PATIO_TEACHER_BLOCKS_STATE_KEY, nextRows);
      });
      await appendAuditEvent(db, {
        actorUserId: req.sessionUser.userId,
        action: active ? 'teacher.patio_unavailability.set' : 'teacher.patio_unavailability.cleared',
        targetType: 'teacher_profile',
        targetId: entry.sourceCode,
        details: { weekKey: entry.weekKey, dia: entry.dia, hora: entry.hora }
      });
      res.json({ ok: true, active, entry });
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

  router.post('/future-absences', requireAuthenticated, requireSameOriginWrite, async (req, res, next) => {
    try {
      const db = await getDatabase();
      const entry = await buildOwnedFutureAbsence(req, db);
      await withImmediateTransaction(db, async () => {
        const current = await getStateRows(db, FUTURE_ABSENCES_STATE_KEY);
        const nextRows = [...current.filter(row => row?.id !== entry.id), entry];
        await replaceStateRows(db, FUTURE_ABSENCES_STATE_KEY, nextRows);
      });
      await appendAuditEvent(db, {
        actorUserId: req.sessionUser.userId,
        action: 'teacher.future_absence.created',
        targetType: 'teacher_profile',
        targetId: entry.sourceCode || entry.profesor,
        details: { absenceId: entry.id, date: entry.date, hours: entry.hours }
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
      await appendAuditEvent(db, {
        actorUserId: req.sessionUser.userId,
        action: 'admin.future_absence.updated',
        targetType: 'teacher_profile',
        targetId: entry.sourceCode || entry.profesor,
        details: { absenceId: id, status: entry.status }
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
      await appendAuditEvent(db, {
        actorUserId: req.sessionUser.userId,
        action: 'admin.future_absence.deleted',
        targetType: 'future_absence',
        targetId: id
      });
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });
}

module.exports = { registerStateCollectionRoutes };
