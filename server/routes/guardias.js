const express = require('express');
const crypto = require('crypto');
const { getDatabase, withImmediateTransaction } = require('../db');
const { ensureArray, ensureObject, ensureOptionalId, ensureRequiredString, normalizeBoolean, normalizeInteger, normalizeText, normalizeString, sanitizeAusencia } = require('./validation');
const { requireRole } = require('../session');
const { esHoraValida, getSesionesCubriblesProfesor } = require('../teacher-schedule');
const { ensureCoverageAssignmentsAllowed } = require('../coverage-assignment');
const { getInactiveGroupSet } = require('../group-state');
const { shouldSkipAbsenceRowByInactiveGroup } = require('../absence-policy');
const { appendOperationalHistory } = require('../operational-history');
const {
  buildMonthlyGuardiaLoadResponse,
  ensureMonthlyGuardiaLoadState,
  rebuildMonthlyGuardiaLoadForCurrentWeek
} = require('./guardias/monthly-load');
const { buildEffectiveGuardiaDayState } = require('../guardia-slot-state');
const {
  materializeCoverageAssignments
} = require('../coverage-materialization');

const router = express.Router();

function safeAbsenceSnapshot(row) {
  if (!row) return null;
  return {
    id: row.id == null ? null : Number(row.id), dia: Number(row.dia), hora: Number(row.hora),
    ausente: String(row.ausente || ''), guardia: String(row.guardia || ''),
    aula: String(row.aula || ''), faena: !!row.faena, obs: String(row.obs || '')
  };
}

async function recordAbsenceChange(db, actorUserId, before, after) {
  const previous = safeAbsenceSnapshot(before);
  const current = safeAbsenceSnapshot(after);
  const targetId = String(current?.id || previous?.id || '');
  const action = !previous ? 'absence.created' : !current ? 'absence.deleted' : 'absence.updated';
  await appendOperationalHistory(db, {
    actorUserId, action,
    title: !previous ? 'Ausencia creada' : !current ? 'Ausencia eliminada' : 'Ausencia modificada',
    type: !previous ? 'create' : !current ? 'delete' : 'edit',
    targetType: 'absence', targetId, before: previous, after: current
  });
  const oldCoverage = previous?.guardia || '';
  const newCoverage = current?.guardia || '';
  if (oldCoverage === newCoverage) return;
  const coverageAction = !oldCoverage ? 'coverage.assigned' : !newCoverage ? 'coverage.removed' : 'coverage.changed';
  await appendOperationalHistory(db, {
    actorUserId, action: coverageAction,
    title: !oldCoverage ? 'Cobertura asignada' : !newCoverage ? 'Cobertura retirada' : 'Cobertura modificada',
    type: 'coverage', targetType: 'absence', targetId,
    before: { guardia: oldCoverage || null }, after: { guardia: newCoverage || null }
  });
}

async function recordMaterializedCoverageChange(
  db,
  actorUserId,
  before,
  after
) {
  const oldCoverage = String(before?.guardia || '');
  const newCoverage = String(after?.guardia || '');

  if (oldCoverage === newCoverage) return;

  const action = !oldCoverage
    ? 'coverage.assigned'
    : !newCoverage
      ? 'coverage.removed'
      : 'coverage.changed';

  await appendOperationalHistory(db, {
    actorUserId,
    action,
    title: !oldCoverage
      ? 'Cobertura asignada'
      : !newCoverage
        ? 'Cobertura retirada'
        : 'Cobertura modificada',
    type: 'coverage',
    targetType: 'absence',
    targetId: String(after?.id || before?.id || ''),
    before: {
      guardia: oldCoverage || null
    },
    after: {
      guardia: newCoverage || null
    }
  });
}

function notFound(message) {
  const error = new Error(message);
  error.status = 404;
  return error;
}

function conflict(message) {
  const error = new Error(message);
  error.status = 409;
  return error;
}

function buildAbsenceLogicKeys(row) {
  return {
    ausente_key: normalizeText(row?.ausente),
    guardia_key: normalizeText(row?.guardia)
  };
}

function logGuardiasSave(event, details = {}) {
  try {
    console.info(`[guardias] ${event} ${JSON.stringify(details)}`);
  } catch (_error) {
    console.info(`[guardias] ${event}`);
  }
}

function logAusenciasDayComplete(message, details = {}) {
  try {
    console.info(`[ausencias] ${message} ${JSON.stringify(details)}`);
  } catch (_error) {
    console.info(`[ausencias] ${message}`);
  }
}

function sanitizeDayCompleteAbsence(input) {
  const body = ensureObject(input, 'Ausencia de día completo');
  return {
    tipo: normalizeString(body.tipo || 'dia_completo') || 'dia_completo',
    profesor: ensureRequiredString(body.profesor ?? body.ausente, 'profesor'),
    dia: normalizeInteger(body.dia, 'dia', 0, 4),
    faena: normalizeBoolean(body.faena),
    obs: normalizeString(body.obs),
    replaceIds: Array.isArray(body.replaceIds)
      ? [...new Set(body.replaceIds.map(value => ensureOptionalId(value, 'replaceIds')).filter(Boolean))]
      : []
  };
}

function buildReplacePayloadHash(rows) {
  const normalized = (Array.isArray(rows) ? rows : [])
    .map(row => ({
      dia: Number(row.dia),
      hora: Number(row.hora),
      ausente: String(row.ausente || '').trim(),
      guardia: String(row.guardia || '').trim(),
      aula: String(row.aula || '').trim(),
      faena: !!row.faena,
      obs: String(row.obs || '').trim()
    }))
    .sort((a, b) =>
      a.dia - b.dia ||
      a.hora - b.hora ||
      normalizeText(a.ausente).localeCompare(normalizeText(b.ausente), 'es') ||
      normalizeText(a.guardia).localeCompare(normalizeText(b.guardia), 'es') ||
      a.aula.localeCompare(b.aula, 'es') ||
      a.obs.localeCompare(b.obs, 'es')
    );
  return crypto.createHash('sha1').update(JSON.stringify(normalized)).digest('hex');
}

async function filterVisibleAbsenceRows(db, rows) {
  const inactiveGroups = await getInactiveGroupSet(db);
  const visibleRows = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    if (await shouldSkipAbsenceRowByInactiveGroup(db, row, inactiveGroups)) continue;
    visibleRows.push(row);
  }
  return visibleRows;
}

async function ensureNoDuplicateAbsence(db, row, excludeId = null) {
  const rows = await db.all(
    'SELECT id, dia, hora, ausente FROM ausencias WHERE dia = ? AND hora = ?',
    [row.dia, row.hora]
  );
  const targetKeys = buildAbsenceLogicKeys(row);
  const duplicate = rows.find(item =>
    String(item.id) !== String(excludeId ?? '') &&
    normalizeText(item.ausente) === targetKeys.ausente_key
  );
  if (duplicate) {
    throw conflict('Ya existe una ausencia registrada para ese profesor en ese tramo.');
  }
  return targetKeys;
}

async function validateCoverageAtSlot(db, row, excludeId = null) {
  const current = await db.all('SELECT * FROM ausencias WHERE dia = ? AND hora = ?', [row.dia, row.hora]);
  await ensureCoverageAssignmentsAllowed(db, [
    ...current.filter(item => String(item.id) !== String(excludeId ?? '')),
    row
  ]);
}

router.get('/', async (_req, res, next) => {
  try {
    const db = await getDatabase();
    const rows = await db.all('SELECT * FROM ausencias ORDER BY dia, hora, id');
    res.json(await filterVisibleAbsenceRows(db, rows));
  } catch (error) {
    next(error);
  }
});

router.get('/effective-slots', async (req, res, next) => {
  try {
    const date = ensureRequiredString(req.query?.date, 'date');
    const db = await getDatabase();

    res.json(await buildEffectiveGuardiaDayState(db, { date }));
  } catch (error) {
    next(error);
  }
});

router.get('/monthly-load', requireRole('admin'), async (_req, res, next) => {
  try {
    const db = await getDatabase();
    const state = await ensureMonthlyGuardiaLoadState(db);
    res.json(buildMonthlyGuardiaLoadResponse(state));
  } catch (error) {
    next(error);
  }
});

router.post('/', requireRole('admin'), async (req, res, next) => {
  try {
    if (normalizeText(req.body?.tipo) === 'dia_completo') {
      const payload = sanitizeDayCompleteAbsence(req.body);
      const db = await getDatabase();
      logAusenciasDayComplete('dia completo solicitado', { profesor: payload.profesor, dia: payload.dia });
      const sesionesCubribles = await getSesionesCubriblesProfesor(db, payload.profesor, payload.dia);
      logAusenciasDayComplete('sesiones cubribles encontradas', { profesor: payload.profesor, dia: payload.dia, total: sesionesCubribles.length });
      if (!sesionesCubribles.length) {
        throw conflict('Ese profesor no tiene sesiones cubribles registradas ese día.');
      }
      const persistedRows = await withImmediateTransaction(db, async () => {
        const currentRows = await db.all('SELECT * FROM ausencias WHERE dia = ? ORDER BY hora, id', [payload.dia]);
        const currentByHour = new Map(
          currentRows
            .filter(row => normalizeText(row?.ausente) === normalizeText(payload.profesor))
            .map(row => [Number(row.hora), row])
        );
        if (payload.replaceIds.length) {
          for (const replaceId of payload.replaceIds) {
            const removed = await db.get('SELECT * FROM ausencias WHERE id = ?', [replaceId]);
            await db.run('DELETE FROM ausencias WHERE id = ?', [replaceId]);
            if (removed) await recordAbsenceChange(db, req.sessionUser.userId, removed, null);
          }
        }
        const saved = [];
        for (const session of sesionesCubribles) {
          if (!esHoraValida(session.hora)) {
            logAusenciasDayComplete('skip hora inválida', { profesor: payload.profesor, dia: payload.dia, hora: session.hora });
            continue;
          }
          const existing = currentByHour.get(Number(session.hora)) || null;
          if (existing && !payload.replaceIds.includes(Number(existing.id))) {
            await db.run(
              `UPDATE ausencias
               SET ausente = ?, guardia = ?, aula = ?, faena = ?, obs = ?, updated_at = CURRENT_TIMESTAMP
               WHERE id = ?`,
              [
                payload.profesor,
                existing.guardia || '',
                session.aula || '',
                payload.faena ? 1 : 0,
                payload.obs || '',
                existing.id
              ]
            );
            const row = await db.get('SELECT * FROM ausencias WHERE id = ?', [existing.id]);
            await recordAbsenceChange(db, req.sessionUser.userId, existing, row);
            logAusenciasDayComplete('reutilizada', { profesor: payload.profesor, dia: payload.dia, hora: session.hora, aula: session.aula || '', grupo: session.grupo || '' });
            saved.push(row);
            continue;
          }
          const result = await db.run(
            `INSERT INTO ausencias (dia, hora, ausente, guardia, aula, faena, obs)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              payload.dia,
              session.hora,
              payload.profesor,
              existing?.guardia || '',
              session.aula || '',
              payload.faena ? 1 : 0,
              payload.obs || ''
            ]
          );
          logAusenciasDayComplete('creada', { profesor: payload.profesor, dia: payload.dia, hora: session.hora, aula: session.aula || '', grupo: session.grupo || '' });
          const row = await db.get('SELECT * FROM ausencias WHERE id = ?', [result.lastID]);
          await recordAbsenceChange(db, req.sessionUser.userId, null, row);
          saved.push(row);
        }
        const materializedChanges =
          await materializeCoverageAssignments(db, {
            dia: payload.dia,
            hours: saved.map(row => Number(row.hora))
          });

        for (const change of materializedChanges) {
          await recordMaterializedCoverageChange(
            db,
            req.sessionUser.userId,
            change.before,
            change.after
          );
        }

        await ensureCoverageAssignmentsAllowed(
          db,
          await db.all(
            'SELECT * FROM ausencias WHERE dia = ?',
            [payload.dia]
          )
        );

        await rebuildMonthlyGuardiaLoadForCurrentWeek(db);

        const refreshedSaved = [];

        for (const savedRow of saved) {
          const refreshed = await db.get(
            'SELECT * FROM ausencias WHERE id = ?',
            [savedRow.id]
          );

          if (refreshed) refreshedSaved.push(refreshed);
        }

        return refreshedSaved.sort(
          (a, b) =>
            Number(a.hora) - Number(b.hora) ||
            Number(a.id) - Number(b.id)
        );
      }, { label: `guardias:full-day:${payload.dia}:${normalizeText(payload.profesor)}` });
      res.status(201).json({
        ok: true,
        tipo: 'dia_completo',
        profesor: payload.profesor,
        dia: payload.dia,
        rows: persistedRows
      });
      return;
    }
    const { dia, hora, ausente, guardia, aula, faena, obs } = sanitizeAusencia(req.body);
    const db = await getDatabase();
    if (await shouldSkipAbsenceRowByInactiveGroup(db, { dia, hora, ausente })) {
      throw conflict('La sesión pertenece a un grupo inactivo y no genera guardia.');
    }
    let ausente_key = '';
    let guardia_key = '';
    logGuardiasSave('save-single:start', { dia, hora, ausente });
    const row = await withImmediateTransaction(db, async () => {
      await validateCoverageAtSlot(db, { dia, hora, ausente, guardia });
      const keys = await ensureNoDuplicateAbsence(db, { dia, hora, ausente, guardia });
      ausente_key = keys.ausente_key;
      guardia_key = keys.guardia_key;
      const result = await db.run(
        `INSERT INTO ausencias (dia, hora, ausente, guardia, aula, faena, obs)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [dia, hora, ausente, guardia, aula, faena ? 1 : 0, obs]
      );
      await materializeCoverageAssignments(db, {
        dia,
        hours: [hora]
      });

      await rebuildMonthlyGuardiaLoadForCurrentWeek(db);

      const persisted = await db.get(
        'SELECT * FROM ausencias WHERE id = ?',
        [result.lastID]
      );

      guardia_key = normalizeText(persisted?.guardia);
      await recordAbsenceChange(db, req.sessionUser.userId, null, persisted);
      return persisted;
    }, { label: `guardias:create:${dia}:${hora}:${ausente_key || normalizeText(ausente)}` });
    logGuardiasSave('save-single:success', { id: row?.id, dia, hora, ausente });
    res.status(201).json({ ...row, ausente_key, guardia_key });
  } catch (error) {
    next(error);
  }
});

router.put('/replace', requireRole('admin'), async (req, res, next) => {
  try {
    const candidateRows = ensureArray(req.body, 'Las ausencias').map(sanitizeAusencia);
    const db = await getDatabase();
    const inactiveGroups = await getInactiveGroupSet(db);
    const rows = [];
    for (const row of candidateRows) {
      if (await shouldSkipAbsenceRowByInactiveGroup(db, row, inactiveGroups)) continue;
      rows.push(row);
    }
    const duplicateKeys = new Set();
    rows.forEach(row => {
      const key = `${row.dia}|${row.hora}|${normalizeText(row.ausente)}`;
      if (duplicateKeys.has(key)) {
        throw conflict('La lista incluye ausencias duplicadas del mismo profesor en el mismo tramo.');
      }
      duplicateKeys.add(key);
    });
    const payloadHash = buildReplacePayloadHash(rows);
    const startedAt = Date.now();
    logGuardiasSave('replace:start', { total: rows.length, hash: payloadHash });
    const persisted = await withImmediateTransaction(db, async () => {
      await ensureCoverageAssignmentsAllowed(db, rows);
      const currentRows = await db.all('SELECT * FROM ausencias ORDER BY dia, hora, id');
      if (payloadHash === buildReplacePayloadHash(currentRows)) return currentRows;
      await db.exec('DELETE FROM ausencias');

      for (const row of rows) {
        await db.run(
          `INSERT INTO ausencias (dia, hora, ausente, guardia, aula, faena, obs, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          [
            row.dia,
            row.hora,
            row.ausente,
            row.guardia || '',
            row.aula || '',
            row.faena ? 1 : 0,
            row.obs || ''
          ]
        );
      }

      const hoursByDay = new Map();

      for (const row of rows) {
        const rowDia = Number(row.dia);
        const rowHora = Number(row.hora);

        if (!hoursByDay.has(rowDia)) {
          hoursByDay.set(rowDia, new Set());
        }

        hoursByDay.get(rowDia).add(rowHora);
      }

      for (const [rowDia, hours] of hoursByDay) {
        await materializeCoverageAssignments(db, {
          dia: rowDia,
          hours: [...hours]
        });
      }

      await rebuildMonthlyGuardiaLoadForCurrentWeek(db);

      const nextRows = await db.all(
        'SELECT * FROM ausencias ORDER BY dia, hora, id'
      );
      const logicKey = row => `${Number(row.dia)}|${Number(row.hora)}|${normalizeText(row.ausente)}`;
      const beforeByKey = new Map(currentRows.map(row => [logicKey(row), row]));
      const afterByKey = new Map(nextRows.map(row => [logicKey(row), row]));
      for (const [key, before] of beforeByKey) {
        const after = afterByKey.get(key) || null;
        if (!after || buildReplacePayloadHash([before]) !== buildReplacePayloadHash([after])) {
          await recordAbsenceChange(db, req.sessionUser.userId, before, after);
        }
      }
      for (const [key, after] of afterByKey) {
        if (!beforeByKey.has(key)) await recordAbsenceChange(db, req.sessionUser.userId, null, after);
      }
      await appendOperationalHistory(db, {
        actorUserId: req.sessionUser.userId, action: 'absence.bulk_replaced',
        title: 'Ausencias sincronizadas', type: 'edit', targetType: 'absence_collection',
        targetId: 'all', before: { count: currentRows.length, hash: buildReplacePayloadHash(currentRows) },
        after: { count: nextRows.length, hash: buildReplacePayloadHash(nextRows) }
      });
      return nextRows;
    }, { label: `guardias:replace:${rows.length}` });
    logGuardiasSave('replace:success', {
      requested: rows.length,
      persisted: persisted.length,
      ms: Date.now() - startedAt
    });
    res.json(await filterVisibleAbsenceRows(db, persisted));
  } catch (error) {
    next(error);
  }
});

router.put('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { dia, hora, ausente, guardia, aula, faena, obs } = sanitizeAusencia(req.body);
    const db = await getDatabase();
    if (await shouldSkipAbsenceRowByInactiveGroup(db, { dia, hora, ausente })) {
      throw conflict('La sesión pertenece a un grupo inactivo y no genera guardia.');
    }
    let ausente_key = '';
    let guardia_key = '';
    logGuardiasSave('save-update:start', { id, dia, hora, ausente });
    const row = await withImmediateTransaction(db, async () => {
      const before = await db.get('SELECT * FROM ausencias WHERE id = ?', [id]);
      await validateCoverageAtSlot(db, { dia, hora, ausente, guardia }, id);
      const keys = await ensureNoDuplicateAbsence(db, { dia, hora, ausente, guardia }, id);
      ausente_key = keys.ausente_key;
      guardia_key = keys.guardia_key;
      const result = await db.run(
        `UPDATE ausencias
         SET dia = ?, hora = ?, ausente = ?, guardia = ?, aula = ?, faena = ?, obs = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [dia, hora, ausente, guardia, aula, faena ? 1 : 0, obs, id]
      );
      if (!result.changes) {
        throw notFound('No existe una ausencia con ese id.');
      }
      await materializeCoverageAssignments(db, {
        dia,
        hours: [hora]
      });

      await rebuildMonthlyGuardiaLoadForCurrentWeek(db);

      const persisted = await db.get(
        'SELECT * FROM ausencias WHERE id = ?',
        [id]
      );

      guardia_key = normalizeText(persisted?.guardia);
      await recordAbsenceChange(db, req.sessionUser.userId, before, persisted);
      return persisted;
    }, { label: `guardias:update:${id}` });
    logGuardiasSave('save-update:success', { id, dia, hora, ausente });
    res.json({ ...row, ausente_key, guardia_key });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const db = await getDatabase();
    logGuardiasSave('delete:start', { id: req.params.id });
    await withImmediateTransaction(db, async () => {
      const before = await db.get('SELECT * FROM ausencias WHERE id = ?', [req.params.id]);
      const result = await db.run('DELETE FROM ausencias WHERE id = ?', [req.params.id]);
      if (!result.changes) {
        throw notFound('No existe una ausencia con ese id.');
      }
      await recordAbsenceChange(db, req.sessionUser.userId, before, null);
      await rebuildMonthlyGuardiaLoadForCurrentWeek(db);
    }, { label: `guardias:delete:${req.params.id}` });
    logGuardiasSave('delete:success', { id: req.params.id });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

module.exports = router;
