const ALUMNOS_FUERA_AULA_LIMIT = 10;

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

function ensureSlotLimit(rows, candidate, badRequest, ignoreId = null) {
  const slotTotal = rows
    .filter(row => row.dia === candidate.dia && row.hora === candidate.hora && (ignoreId == null || row.id !== ignoreId))
    .reduce((sum, row) => sum + Number(row.cantidad || 0), 0);

  const nextTotal = slotTotal + candidate.cantidad;
  if (nextTotal > ALUMNOS_FUERA_AULA_LIMIT) {
    throw badRequest(`No se pueden superar ${ALUMNOS_FUERA_AULA_LIMIT} alumnos fuera del aula en el mismo dia y hora.`);
  }
}

function ensureReplacementSlotLimits(rows, badRequest) {
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

async function applyAlumnosFueraAulaMovement(db, inputRow, direction, badRequest) {
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

function registerAlumnosFueraAulaRoutes(router, deps) {
  const { getDatabase, sanitizeAlumnosFueraAula, ensureArray, requireRole, requireSameOriginWrite, badRequest, notFound } = deps;

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
      res.json(await applyAlumnosFueraAulaMovement(db, inputRow, 'salida', badRequest));
    } catch (error) {
      next(error);
    }
  });

  router.post('/alumnos-fuera-aula/retorno', requireSameOriginWrite, async (req, res, next) => {
    try {
      const inputRow = sanitizeAlumnosFueraAula({ ...req.body, cantidad: 0 });
      const db = await getDatabase();
      res.json(await applyAlumnosFueraAulaMovement(db, inputRow, 'retorno', badRequest));
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

      ensureReplacementSlotLimits(rows, badRequest);

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

      ensureSlotLimit(rows, candidate, badRequest, existingRow?.id ?? null);

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

      ensureSlotLimit(rows, candidate, badRequest, id);

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
}

module.exports = { registerAlumnosFueraAulaRoutes };
