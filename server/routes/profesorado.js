const express = require('express');
const path = require('path');
const { getDatabase } = require('../db');
const { parseAnnualXml, writeAnnualSourceArtifacts } = require('../annual-source');
const {
  ensureArray,
  ensureRequiredString,
  sanitizeSessionOverride,
  sanitizeAlumnosFueraAula,
  sanitizeTeacherFutureAbsence,
  sanitizeTeacherPracticeGuardia,
  sanitizeTeacherPracticeGuardiaSlot,
  sanitizeTeacherSubstitution,
  sanitizeTareaProfesorado
} = require('./validation');
const { requireRole } = require('../session');

const router = express.Router();
const SUBSTITUTIONS_STATE_KEY = 'teacher_substitutions';
const PRACTICAS_GUARDIAS_STATE_KEY = 'teacher_practicas_guardias';
const PRACTICAS_GUARDIAS_TRAMOS_STATE_KEY = 'teacher_practicas_guardias_tramos';
const FUTURE_ABSENCES_STATE_KEY = 'teacher_future_absences';
const ALUMNOS_FUERA_AULA_LIMIT = 10;

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function notFound(message) {
  const error = new Error(message);
  error.status = 404;
  return error;
}

function forbidden(message) {
  const error = new Error(message);
  error.status = 403;
  return error;
}

function normalizeAnnualImportRequest(body) {
  const input = body && typeof body === 'object' ? body : {};
  const xmlText = ensureRequiredString(input.xmlText, 'xmlText');
  const fileName = String(input.fileName || 'horario-anual.xml').trim() || 'horario-anual.xml';
  return { xmlText, fileName };
}

function getExpectedOrigin(req) {
  return `${req.protocol}://${req.get('host')}`;
}

function hasSameOriginHeader(req) {
  const expectedOrigin = getExpectedOrigin(req);
  const origin = String(req.get('origin') || '').trim();
  if (origin) return origin === expectedOrigin;

  const referer = String(req.get('referer') || '').trim();
  if (!referer) return false;
  try {
    return new URL(referer).origin === expectedOrigin;
  } catch (_error) {
    return false;
  }
}

function requireSameOriginWrite(req, _res, next) {
  if (hasSameOriginHeader(req)) return next();
  next(forbidden('Escritura rechazada: origen no permitido.'));
}

function serializeAlumnosFueraAulaRow(row) {
  return {
    id: row.id,
    profesor: row.profesor,
    dia: row.dia,
    hora: row.hora,
    cantidad: row.cantidad,
    last_exit_at: row.last_exit_at || '',
    last_return_at: row.last_return_at || '',
    updated_at: row.updated_at || ''
  };
}

function getSlotKey(row) {
  return `${row.dia}:${row.hora}`;
}

function timestampValue(value) {
  const parsed = Date.parse(value || '');
  return Number.isNaN(parsed) ? 0 : parsed;
}

function groupAlumnosFueraAulaRows(rows) {
  const grouped = new Map();

  for (const row of rows) {
    const key = getSlotKey(row);
    const current = grouped.get(key) || {
      dia: row.dia,
      hora: row.hora,
      totalCantidad: 0,
      registros: 0,
      profesores: [],
      updated_at: ''
    };

    current.totalCantidad += row.cantidad;
    current.registros += 1;
    current.profesores.push(row.profesor);
    if (timestampValue(row.updated_at) > timestampValue(current.updated_at)) {
      current.updated_at = row.updated_at || '';
    }

    grouped.set(key, current);
  }

  return [...grouped.values()]
    .map(entry => ({
      dia: entry.dia,
      hora: entry.hora,
      totalCantidad: entry.totalCantidad,
      registros: entry.registros,
      limite: ALUMNOS_FUERA_AULA_LIMIT,
      restantes: Math.max(0, ALUMNOS_FUERA_AULA_LIMIT - entry.totalCantidad),
      profesores: [...new Set(entry.profesores)].sort((a, b) => a.localeCompare(b)),
      updated_at: entry.updated_at
    }))
    .sort((a, b) => a.dia - b.dia || a.hora - b.hora);
}

function getNextTimestamp(value, fallback) {
  return value ? value : fallback;
}

function buildNextAlumnosFueraAulaRecord(existingRow, inputRow) {
  const currentQuantity = existingRow ? Number(existingRow.cantidad || 0) : 0;
  const nextQuantity = inputRow.cantidad;
  const now = new Date().toISOString();
  const nextLastExitAt = getNextTimestamp(
    inputRow.lastExitAt,
    nextQuantity > currentQuantity ? now : (existingRow?.last_exit_at || '')
  );
  const nextLastReturnAt = getNextTimestamp(
    inputRow.lastReturnAt,
    nextQuantity < currentQuantity ? now : (existingRow?.last_return_at || '')
  );

  return {
    profesor: inputRow.profesor,
    dia: inputRow.dia,
    hora: inputRow.hora,
    cantidad: nextQuantity,
    last_exit_at: nextLastExitAt,
    last_return_at: nextLastReturnAt
  };
}

async function getAlumnosFueraAulaRows(db) {
  return db.all('SELECT * FROM alumnos_fuera_aula ORDER BY dia, hora, profesor, id');
}

function ensureSlotLimit(rows, candidate, ignoreId = null) {
  const slotTotal = rows
    .filter(row => row.dia === candidate.dia && row.hora === candidate.hora && (ignoreId == null || row.id !== ignoreId))
    .reduce((sum, row) => sum + Number(row.cantidad || 0), 0);

  const nextTotal = slotTotal + candidate.cantidad;
  if (nextTotal > ALUMNOS_FUERA_AULA_LIMIT) {
    throw badRequest(`No se pueden superar ${ALUMNOS_FUERA_AULA_LIMIT} alumnos fuera del aula en el mismo dia y hora.`);
  }
}

function ensureReplacementSlotLimits(rows) {
  const totals = new Map();

  for (const row of rows) {
    const key = getSlotKey(row);
    totals.set(key, (totals.get(key) || 0) + Number(row.cantidad || 0));
  }

  for (const [key, total] of totals.entries()) {
    if (total > ALUMNOS_FUERA_AULA_LIMIT) {
      const [dia, hora] = key.split(':').map(value => Number(value));
      throw badRequest(`No se pueden superar ${ALUMNOS_FUERA_AULA_LIMIT} alumnos fuera del aula en el dia ${dia} y la hora ${hora}.`);
    }
  }
}

function makeSlotResponse(entry, rows) {
  const serializedRows = rows.map(serializeAlumnosFueraAulaRow);
  const total = serializedRows.reduce((sum, row) => sum + Number(row.cantidad || 0), 0);
  return {
    ok: true,
    entry: entry ? serializeAlumnosFueraAulaRow(entry) : null,
    slot: {
      dia: entry?.dia ?? rows[0]?.dia ?? null,
      hora: entry?.hora ?? rows[0]?.hora ?? null,
      total,
      limite: ALUMNOS_FUERA_AULA_LIMIT,
      restantes: Math.max(0, ALUMNOS_FUERA_AULA_LIMIT - total)
    },
    rows: serializedRows
  };
}

async function applyAlumnosFueraAulaMovement(db, inputRow, direction) {
  await db.exec('BEGIN IMMEDIATE TRANSACTION');
  try {
    const existingRow = await db.get(
      'SELECT * FROM alumnos_fuera_aula WHERE profesor = ? AND dia = ? AND hora = ?',
      [inputRow.profesor, inputRow.dia, inputRow.hora]
    );
    const rows = await db.all(
      'SELECT * FROM alumnos_fuera_aula WHERE dia = ? AND hora = ?',
      [inputRow.dia, inputRow.hora]
    );
    const currentAmount = Number(existingRow?.cantidad || 0);
    const currentTotal = rows.reduce((sum, row) => sum + Number(row.cantidad || 0), 0);
    const now = new Date().toISOString();

    if (direction === 'salida') {
      if (currentTotal >= ALUMNOS_FUERA_AULA_LIMIT) {
        throw badRequest(`No se pueden superar ${ALUMNOS_FUERA_AULA_LIMIT} alumnos fuera del aula en el mismo dia y hora.`);
      }
      await db.run(
        `INSERT INTO alumnos_fuera_aula (profesor, dia, hora, cantidad, last_exit_at, last_return_at, updated_at)
         VALUES (?, ?, ?, 1, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(profesor, dia, hora) DO UPDATE SET
           cantidad = cantidad + 1,
           last_exit_at = excluded.last_exit_at,
           updated_at = CURRENT_TIMESTAMP`,
        [inputRow.profesor, inputRow.dia, inputRow.hora, now, existingRow?.last_return_at || '']
      );
    } else {
      const nextAmount = Math.max(0, currentAmount - 1);
      await db.run(
        `INSERT INTO alumnos_fuera_aula (profesor, dia, hora, cantidad, last_exit_at, last_return_at, updated_at)
         VALUES (?, ?, ?, 0, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(profesor, dia, hora) DO UPDATE SET
           cantidad = ?,
           last_return_at = ?,
           updated_at = CURRENT_TIMESTAMP`,
        [inputRow.profesor, inputRow.dia, inputRow.hora, existingRow?.last_exit_at || '', now, nextAmount, now]
      );
    }

    const entry = await db.get(
      'SELECT * FROM alumnos_fuera_aula WHERE profesor = ? AND dia = ? AND hora = ?',
      [inputRow.profesor, inputRow.dia, inputRow.hora]
    );
    const persistedRows = await db.all(
      'SELECT * FROM alumnos_fuera_aula WHERE dia = ? AND hora = ? ORDER BY dia, hora, profesor, id',
      [inputRow.dia, inputRow.hora]
    );
    await db.exec('COMMIT');
    return makeSlotResponse(entry, persistedRows);
  } catch (error) {
    await db.exec('ROLLBACK');
    throw error;
  }
}

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

router.get('/alumnos-fuera-aula', async (_req, res, next) => {
  try {
    const db = await getDatabase();
    const rows = await getAlumnosFueraAulaRows(db);
    res.json(rows.map(serializeAlumnosFueraAulaRow));
  } catch (error) {
    next(error);
  }
});

router.get('/alumnos-fuera-aula/resumen', async (_req, res, next) => {
  try {
    const db = await getDatabase();
    const rows = await getAlumnosFueraAulaRows(db);
    res.json(groupAlumnosFueraAulaRows(rows));
  } catch (error) {
    next(error);
  }
});

router.get('/alumnos-fuera-aula/pendientes', async (_req, res, next) => {
  try {
    const db = await getDatabase();
    const rows = await db.all(
      'SELECT * FROM alumnos_fuera_aula WHERE cantidad > 0 ORDER BY dia, hora, profesor, id'
    );
    res.json(rows.map(serializeAlumnosFueraAulaRow));
  } catch (error) {
    next(error);
  }
});

router.post('/alumnos-fuera-aula/salida', requireSameOriginWrite, async (req, res, next) => {
  try {
    const inputRow = sanitizeAlumnosFueraAula({ ...req.body, cantidad: 0 });
    const db = await getDatabase();
    res.json(await applyAlumnosFueraAulaMovement(db, inputRow, 'salida'));
  } catch (error) {
    next(error);
  }
});

router.post('/alumnos-fuera-aula/retorno', requireSameOriginWrite, async (req, res, next) => {
  try {
    const inputRow = sanitizeAlumnosFueraAula({ ...req.body, cantidad: 0 });
    const db = await getDatabase();
    res.json(await applyAlumnosFueraAulaMovement(db, inputRow, 'retorno'));
  } catch (error) {
    next(error);
  }
});

router.put('/alumnos-fuera-aula/replace', requireRole('admin'), async (req, res, next) => {
  try {
    const rows = ensureArray(req.body, 'Los registros de alumnos fuera del aula').map(sanitizeAlumnosFueraAula);
    const seen = new Set();

    for (const row of rows) {
      const key = `${row.profesor}:${row.dia}:${row.hora}`;
      if (seen.has(key)) {
        throw badRequest('No puede haber dos registros del mismo profesor en el mismo dia y hora.');
      }
      seen.add(key);
    }

    ensureReplacementSlotLimits(rows);

    const db = await getDatabase();
    await db.exec('DELETE FROM alumnos_fuera_aula');

    for (const row of rows) {
      await db.run(
        `INSERT INTO alumnos_fuera_aula (id, profesor, dia, hora, cantidad, last_exit_at, last_return_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [row.id ?? null, row.profesor, row.dia, row.hora, row.cantidad, row.lastExitAt || '', row.lastReturnAt || '']
      );
    }

    const persisted = await getAlumnosFueraAulaRows(db);
    res.json(persisted.map(serializeAlumnosFueraAulaRow));
  } catch (error) {
    next(error);
  }
});

router.post('/alumnos-fuera-aula', requireSameOriginWrite, async (req, res, next) => {
  try {
    const inputRow = sanitizeAlumnosFueraAula(req.body);
    const db = await getDatabase();
    const existingRow = await db.get(
      'SELECT * FROM alumnos_fuera_aula WHERE profesor = ? AND dia = ? AND hora = ?',
      [inputRow.profesor, inputRow.dia, inputRow.hora]
    );
    const rows = await db.all('SELECT * FROM alumnos_fuera_aula WHERE dia = ? AND hora = ?', [inputRow.dia, inputRow.hora]);
    const candidate = buildNextAlumnosFueraAulaRecord(existingRow, inputRow);

    ensureSlotLimit(rows, candidate, existingRow?.id ?? null);

    await db.run(
      `INSERT INTO alumnos_fuera_aula (profesor, dia, hora, cantidad, last_exit_at, last_return_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(profesor, dia, hora) DO UPDATE SET
         cantidad = excluded.cantidad,
         last_exit_at = excluded.last_exit_at,
         last_return_at = excluded.last_return_at,
         updated_at = CURRENT_TIMESTAMP`,
      [
        candidate.profesor,
        candidate.dia,
        candidate.hora,
        candidate.cantidad,
        candidate.last_exit_at || '',
        candidate.last_return_at || ''
      ]
    );

    const row = await db.get(
      'SELECT * FROM alumnos_fuera_aula WHERE profesor = ? AND dia = ? AND hora = ?',
      [inputRow.profesor, inputRow.dia, inputRow.hora]
    );
    res.status(existingRow ? 200 : 201).json({ ok: true, entry: serializeAlumnosFueraAulaRow(row) });
  } catch (error) {
    next(error);
  }
});

router.put('/alumnos-fuera-aula/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      throw badRequest('id invalido.');
    }

    const db = await getDatabase();
    const existingRow = await db.get('SELECT * FROM alumnos_fuera_aula WHERE id = ?', [id]);
    if (!existingRow) {
      throw notFound('No existe un registro con ese id.');
    }

    const inputRow = sanitizeAlumnosFueraAula({ ...req.body, id });
    const rows = await db.all('SELECT * FROM alumnos_fuera_aula WHERE dia = ? AND hora = ?', [inputRow.dia, inputRow.hora]);
    const candidate = buildNextAlumnosFueraAulaRecord(existingRow, inputRow);

    ensureSlotLimit(rows, candidate, id);

    const conflictingRow = await db.get(
      'SELECT id FROM alumnos_fuera_aula WHERE profesor = ? AND dia = ? AND hora = ? AND id <> ?',
      [candidate.profesor, candidate.dia, candidate.hora, id]
    );
    if (conflictingRow) {
      throw badRequest('Ya existe un registro para ese profesor, dia y hora.');
    }

    const result = await db.run(
      `UPDATE alumnos_fuera_aula
       SET profesor = ?, dia = ?, hora = ?, cantidad = ?, last_exit_at = ?, last_return_at = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        candidate.profesor,
        candidate.dia,
        candidate.hora,
        candidate.cantidad,
        candidate.last_exit_at || '',
        candidate.last_return_at || '',
        id
      ]
    );

    if (!result.changes) {
      throw notFound('No existe un registro con ese id.');
    }

    const row = await db.get('SELECT * FROM alumnos_fuera_aula WHERE id = ?', [id]);
    res.json({ ok: true, entry: serializeAlumnosFueraAulaRow(row) });
  } catch (error) {
    next(error);
  }
});

router.delete('/alumnos-fuera-aula/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      throw badRequest('id invalido.');
    }

    const db = await getDatabase();
    const result = await db.run('DELETE FROM alumnos_fuera_aula WHERE id = ?', [id]);
    if (!result.changes) {
      throw notFound('No existe un registro con ese id.');
    }
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

router.put('/tareas/replace', requireRole('admin'), async (req, res, next) => {
  try {
    const rows = ensureArray(req.body, 'Las tareas de profesorado').map(sanitizeTareaProfesorado);
    const db = await getDatabase();
    await db.exec('DELETE FROM tareas_profesorado');

    for (const row of rows) {
      await db.run(
        `INSERT INTO tareas_profesorado (id, profesor, dia, hora, dejada, tarea, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [row.id, row.profesor, row.dia, row.hora, row.dejada ? 1 : 0, row.tarea || '']
      );
    }

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
    const rows = ensureArray(req.body, 'Los overrides de sesi\u00f3n').map(sanitizeSessionOverride);
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

router.get('/substitutions', async (_req, res, next) => {
  try {
    const db = await getDatabase();
    const row = await db.get('SELECT value FROM app_state WHERE key = ?', [SUBSTITUTIONS_STATE_KEY]);
    const parsed = row?.value ? JSON.parse(row.value) : [];
    res.json(Array.isArray(parsed) ? parsed : []);
  } catch (error) {
    next(error);
  }
});

router.put('/substitutions/replace', requireRole('admin'), async (req, res, next) => {
  try {
    const rows = ensureArray(req.body, 'Las sustituciones de profesorado').map(sanitizeTeacherSubstitution);
    const db = await getDatabase();
    await db.run(
      `INSERT INTO app_state (key, value, updated_at)
       VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
      [SUBSTITUTIONS_STATE_KEY, JSON.stringify(rows)]
    );
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.get('/practicas-guardias', async (_req, res, next) => {
  try {
    const db = await getDatabase();
    const row = await db.get('SELECT value FROM app_state WHERE key = ?', [PRACTICAS_GUARDIAS_STATE_KEY]);
    const parsed = row?.value ? JSON.parse(row.value) : [];
    res.json(Array.isArray(parsed) ? parsed : []);
  } catch (error) {
    next(error);
  }
});

router.put('/practicas-guardias/replace', requireRole('admin'), async (req, res, next) => {
  try {
    const rows = ensureArray(req.body, 'La disponibilidad por practicas para guardias').map(sanitizeTeacherPracticeGuardia);
    const db = await getDatabase();
    await db.run(
      `INSERT INTO app_state (key, value, updated_at)
       VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
      [PRACTICAS_GUARDIAS_STATE_KEY, JSON.stringify(rows)]
    );
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.get('/practicas-guardias-tramos', async (_req, res, next) => {
  try {
    const db = await getDatabase();
    const row = await db.get('SELECT value FROM app_state WHERE key = ?', [PRACTICAS_GUARDIAS_TRAMOS_STATE_KEY]);
    const parsed = row?.value ? JSON.parse(row.value) : [];
    res.json(Array.isArray(parsed) ? parsed : []);
  } catch (error) {
    next(error);
  }
});

router.put('/practicas-guardias-tramos/replace', requireRole('admin'), async (req, res, next) => {
  try {
    const rows = ensureArray(req.body, 'Los tramos manuales por practicas para guardias').map(sanitizeTeacherPracticeGuardiaSlot);
    const db = await getDatabase();
    await db.run(
      `INSERT INTO app_state (key, value, updated_at)
       VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
      [PRACTICAS_GUARDIAS_TRAMOS_STATE_KEY, JSON.stringify(rows)]
    );
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.get('/future-absences', async (_req, res, next) => {
  try {
    const db = await getDatabase();
    const row = await db.get('SELECT value FROM app_state WHERE key = ?', [FUTURE_ABSENCES_STATE_KEY]);
    const parsed = row?.value ? JSON.parse(row.value) : [];
    res.json(Array.isArray(parsed) ? parsed : []);
  } catch (error) {
    next(error);
  }
});

router.post('/future-absences', requireRole('admin'), async (req, res, next) => {
  try {
    const entry = sanitizeTeacherFutureAbsence(req.body);
    const db = await getDatabase();
    const currentRow = await db.get('SELECT value FROM app_state WHERE key = ?', [FUTURE_ABSENCES_STATE_KEY]);
    const current = currentRow?.value ? JSON.parse(currentRow.value) : [];
    const nextRows = [...(Array.isArray(current) ? current : []).filter(row => row?.id !== entry.id), entry];
    await db.run(
      `INSERT INTO app_state (key, value, updated_at)
       VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
      [FUTURE_ABSENCES_STATE_KEY, JSON.stringify(nextRows)]
    );
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
    const currentRow = await db.get('SELECT value FROM app_state WHERE key = ?', [FUTURE_ABSENCES_STATE_KEY]);
    const current = currentRow?.value ? JSON.parse(currentRow.value) : [];
    const nextRows = [...(Array.isArray(current) ? current : []).filter(row => row?.id !== id), entry];
    await db.run(
      `INSERT INTO app_state (key, value, updated_at)
       VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
      [FUTURE_ABSENCES_STATE_KEY, JSON.stringify(nextRows)]
    );
    res.json({ ok: true, entry });
  } catch (error) {
    next(error);
  }
});

router.delete('/future-absences/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const id = String(req.params.id || '').trim();
    const db = await getDatabase();
    const currentRow = await db.get('SELECT value FROM app_state WHERE key = ?', [FUTURE_ABSENCES_STATE_KEY]);
    const current = currentRow?.value ? JSON.parse(currentRow.value) : [];
    const nextRows = (Array.isArray(current) ? current : []).filter(row => String(row?.id || '') !== id);
    await db.run(
      `INSERT INTO app_state (key, value, updated_at)
       VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
      [FUTURE_ABSENCES_STATE_KEY, JSON.stringify(nextRows)]
    );
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.post('/annual-import/xml', requireRole('admin'), requireSameOriginWrite, async (req, res, next) => {
  try {
    const { xmlText, fileName } = normalizeAnnualImportRequest(req.body);
    const source = parseAnnualXml(xmlText, fileName);
    const result = writeAnnualSourceArtifacts(source, {
      sourceLabel: fileName,
      xmlText
    });
    res.json({
      ok: true,
      importedAt: new Date().toISOString(),
      sourceFile: path.basename(result.sourcePath),
      outputFile: path.basename(result.outputPath),
      xmlSnapshotFile: result.xmlSnapshotPath ? path.basename(result.xmlSnapshotPath) : null,
      datasetId: result.payload.datasetId,
      teachers: result.payload.teachers.length,
      sourceLabel: result.payload.fuente,
      backups: result.backups
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
