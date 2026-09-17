const express = require('express');

const {
  getDatabase,
  withImmediateTransaction
} = require('../db');

const {
  ensureArray,
  sanitizeBanos
} = require('./validation');

const { requireRole } = require('../session');

const {
  assertNoSpecialAssignmentConflict,
  assertUniqueSlotAssignments
} = require('../special-assignment-policy');

const router = express.Router();

router.get('/', async (_req, res, next) => {
  try {
    const db = await getDatabase();

    const rows = await db.all(
      'SELECT dia, hora, profesor FROM banos_guardias ORDER BY dia, hora'
    );

    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.put('/', requireRole('admin'), async (req, res, next) => {
  try {
    const assignment = sanitizeBanos(req.body);
    const db = await getDatabase();

    const persisted = await withImmediateTransaction(db, async () => {
      const bibliotecaRows = await db.all(
        `SELECT dia, hora, profesor
         FROM biblioteca_guardias
         WHERE dia = ? AND hora = ?`,
        [assignment.dia, assignment.hora]
      );

      assertNoSpecialAssignmentConflict(
        bibliotecaRows,
        [assignment]
      );

      await db.run(
        `INSERT INTO banos_guardias (dia, hora, profesor, updated_at)
         VALUES (?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(dia, hora)
         DO UPDATE SET
           profesor = excluded.profesor,
           updated_at = CURRENT_TIMESTAMP`,
        [
          assignment.dia,
          assignment.hora,
          assignment.profesor
        ]
      );

      return db.get(
        `SELECT dia, hora, profesor
         FROM banos_guardias
         WHERE dia = ? AND hora = ?`,
        [assignment.dia, assignment.hora]
      );
    });

    res.json(persisted);
  } catch (error) {
    next(error);
  }
});

router.put('/replace', requireRole('admin'), async (req, res, next) => {
  try {
    const rows = ensureArray(
      req.body,
      'Las guardias de baños'
    ).map(sanitizeBanos);

    assertUniqueSlotAssignments(
      rows,
      'Las guardias de baños'
    );

    const db = await getDatabase();

    const persisted = await withImmediateTransaction(db, async () => {
      const bibliotecaRows = await db.all(
        `SELECT dia, hora, profesor
         FROM biblioteca_guardias
         ORDER BY dia, hora`
      );

      assertNoSpecialAssignmentConflict(
        bibliotecaRows,
        rows
      );

      await db.exec('DELETE FROM banos_guardias');

      for (const row of rows) {
        await db.run(
          `INSERT INTO banos_guardias
             (dia, hora, profesor, updated_at)
           VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
          [row.dia, row.hora, row.profesor]
        );
      }

      return db.all(
        'SELECT dia, hora, profesor FROM banos_guardias ORDER BY dia, hora'
      );
    });

    res.json(persisted);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
