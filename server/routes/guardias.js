const express = require('express');
const crypto = require('crypto');
const { getDatabase, withImmediateTransaction } = require('../db');
const { ensureArray, ensureObject, ensureOptionalId, ensureRequiredString, normalizeBoolean, normalizeInteger, normalizeText, normalizeString, sanitizeAusencia } = require('./validation');
const { requireRole } = require('../session');
const { esHoraValida, getResolvedTeacherSession, getSesionesCubriblesProfesor } = require('../teacher-schedule');
const { getInactiveGroupSet, isGroupInactive, logInactiveGroupSkip } = require('../group-state');
const {
  buildMonthlyGuardiaLoadResponse,
  ensureMonthlyGuardiaLoadState,
  rebuildMonthlyGuardiaLoadForCurrentWeek
} = require('./guardias/monthly-load');

const router = express.Router();
let lastReplacePayloadHash = '';

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

async function shouldSkipAbsenceRowByInactiveGroup(db, row, inactiveGroups = null) {
  const inactiveGroupSet = inactiveGroups || await getInactiveGroupSet(db);
  const session = await getResolvedTeacherSession(db, row.ausente, row.dia, row.hora);
  if (!isGroupInactive(session?.grupo, inactiveGroupSet)) return false;
  logInactiveGroupSkip({
    grupo: normalizeString(session?.grupo),
    profesor: normalizeString(row?.ausente),
    dia: Number(row?.dia),
    hora: Number(row?.hora)
  });
  return true;
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

router.get('/', async (_req, res, next) => {
  try {
    const db = await getDatabase();
    const rows = await db.all('SELECT * FROM ausencias ORDER BY dia, hora, id');
    res.json(await filterVisibleAbsenceRows(db, rows));
  } catch (error) {
    next(error);
  }
});

router.get('/monthly-load', async (_req, res, next) => {
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
            await db.run('DELETE FROM ausencias WHERE id = ?', [replaceId]);
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
               SET ausente = ?, guardia = '', aula = ?, faena = ?, obs = ?, updated_at = CURRENT_TIMESTAMP
               WHERE id = ?`,
              [payload.profesor, session.aula || '', payload.faena ? 1 : 0, payload.obs || '', existing.id]
            );
            const row = await db.get('SELECT * FROM ausencias WHERE id = ?', [existing.id]);
            logAusenciasDayComplete('reutilizada', { profesor: payload.profesor, dia: payload.dia, hora: session.hora, aula: session.aula || '', grupo: session.grupo || '' });
            saved.push(row);
            continue;
          }
          const result = await db.run(
            `INSERT INTO ausencias (dia, hora, ausente, guardia, aula, faena, obs)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [payload.dia, session.hora, payload.profesor, '', session.aula || '', payload.faena ? 1 : 0, payload.obs || '']
          );
          logAusenciasDayComplete('creada', { profesor: payload.profesor, dia: payload.dia, hora: session.hora, aula: session.aula || '', grupo: session.grupo || '' });
          saved.push(await db.get('SELECT * FROM ausencias WHERE id = ?', [result.lastID]));
        }
        await rebuildMonthlyGuardiaLoadForCurrentWeek(db);
        return saved.sort((a, b) => Number(a.hora) - Number(b.hora) || Number(a.id) - Number(b.id));
      }, { label: `guardias:full-day:${payload.dia}:${normalizeText(payload.profesor)}` });
      lastReplacePayloadHash = '';
      res.status(201).json({
        ok: true,
        tipo: 'dia_completo',
        profesor: payload.profesor,
        dia: payload.dia,
        rows: persistedRows
      });
      return;
    }
    console.warn('[ausencias] payload inválido recibido', req.body);
    const { dia, hora, ausente, guardia, aula, faena, obs } = sanitizeAusencia(req.body);
    const db = await getDatabase();
    if (await shouldSkipAbsenceRowByInactiveGroup(db, { dia, hora, ausente })) {
      throw conflict('La sesión pertenece a un grupo inactivo y no genera guardia.');
    }
    let ausente_key = '';
    let guardia_key = '';
    logGuardiasSave('save-single:start', { dia, hora, ausente });
    const row = await withImmediateTransaction(db, async () => {
      const keys = await ensureNoDuplicateAbsence(db, { dia, hora, ausente, guardia });
      ausente_key = keys.ausente_key;
      guardia_key = keys.guardia_key;
      const result = await db.run(
        `INSERT INTO ausencias (dia, hora, ausente, guardia, aula, faena, obs)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [dia, hora, ausente, guardia, aula, faena ? 1 : 0, obs]
      );
      await rebuildMonthlyGuardiaLoadForCurrentWeek(db);
      return db.get('SELECT * FROM ausencias WHERE id = ?', [result.lastID]);
    }, { label: `guardias:create:${dia}:${hora}:${ausente_key || normalizeText(ausente)}` });
    lastReplacePayloadHash = '';
    logGuardiasSave('save-single:success', { id: row?.id, dia, hora, ausente });
    res.status(201).json({ ...row, ausente_key, guardia_key });
  } catch (error) {
    console.error('[guardias] save-single:error', error);
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
    if (payloadHash === lastReplacePayloadHash) {
      const currentRows = await db.all('SELECT * FROM ausencias ORDER BY dia, hora, id');
      logGuardiasSave('replace:skipped duplicate payload', {
        total: rows.length,
        persisted: currentRows.length,
        ms: Date.now() - startedAt
      });
      res.json(await filterVisibleAbsenceRows(db, currentRows));
      return;
    }
    const persisted = await withImmediateTransaction(db, async () => {
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

      await rebuildMonthlyGuardiaLoadForCurrentWeek(db);
      return db.all('SELECT * FROM ausencias ORDER BY dia, hora, id');
    }, { label: `guardias:replace:${rows.length}` });
    lastReplacePayloadHash = payloadHash;
    logGuardiasSave('replace:success', {
      requested: rows.length,
      persisted: persisted.length,
      ms: Date.now() - startedAt
    });
    res.json(await filterVisibleAbsenceRows(db, persisted));
  } catch (error) {
    console.error('[guardias] replace:error', error);
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
      await rebuildMonthlyGuardiaLoadForCurrentWeek(db);
      return db.get('SELECT * FROM ausencias WHERE id = ?', [id]);
    }, { label: `guardias:update:${id}` });
    lastReplacePayloadHash = '';
    logGuardiasSave('save-update:success', { id, dia, hora, ausente });
    res.json({ ...row, ausente_key, guardia_key });
  } catch (error) {
    console.error('[guardias] save-update:error', error);
    next(error);
  }
});

router.delete('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const db = await getDatabase();
    logGuardiasSave('delete:start', { id: req.params.id });
    await withImmediateTransaction(db, async () => {
      const result = await db.run('DELETE FROM ausencias WHERE id = ?', [req.params.id]);
      if (!result.changes) {
        throw notFound('No existe una ausencia con ese id.');
      }
      await rebuildMonthlyGuardiaLoadForCurrentWeek(db);
    }, { label: `guardias:delete:${req.params.id}` });
    lastReplacePayloadHash = '';
    logGuardiasSave('delete:success', { id: req.params.id });
    res.status(204).end();
  } catch (error) {
    console.error('[guardias] delete:error', error);
    next(error);
  }
});

module.exports = router;
