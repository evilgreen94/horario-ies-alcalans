const express = require('express');

const {
  getDatabase,
  withImmediateTransaction
} = require('../db');

const {
  ensureArray,
  sanitizeBiblioteca,
  sanitizeBanos
} = require('./validation');

const { requireRole } = require('../session');

const {
  assertNoSpecialAssignmentConflict,
  assertUniqueSlotAssignments,
  normalizeTeacherIdentity,
  specialAssignmentError
} = require('../special-assignment-policy');

const router = express.Router();

function normalizeForComparison(rows) {
  return rows
    .map(row => ({
      dia: Number(row.dia),
      hora: Number(row.hora),
      profesor: normalizeTeacherIdentity(row.profesor)
    }))
    .sort((a, b) =>
      a.dia - b.dia ||
      a.hora - b.hora ||
      a.profesor.localeCompare(b.profesor, 'es')
    );
}

function sameAssignments(left, right) {
  return JSON.stringify(normalizeForComparison(left)) ===
    JSON.stringify(normalizeForComparison(right));
}

router.post('/bootstrap', requireRole('admin'), async (req, res, next) => {
  try {
    const input =
      req.body &&
      typeof req.body === 'object' &&
      !Array.isArray(req.body)
        ? req.body
        : null;

    if (!input) {
      throw specialAssignmentError(
        400,
        'SPECIAL_ASSIGNMENTS_INVALID_PAYLOAD',
        'El bootstrap de puestos especiales necesita un objeto válido.'
      );
    }

    const biblioteca = ensureArray(
      input.biblioteca,
      'Las guardias iniciales de biblioteca'
    ).map(sanitizeBiblioteca);

    const banos = ensureArray(
      input.banos,
      'Las guardias iniciales de baños'
    ).map(sanitizeBanos);

    assertUniqueSlotAssignments(
      biblioteca,
      'Las guardias iniciales de biblioteca'
    );

    assertUniqueSlotAssignments(
      banos,
      'Las guardias iniciales de baños'
    );

    assertNoSpecialAssignmentConflict(
      biblioteca,
      banos
    );

    const db = await getDatabase();

    const result = await withImmediateTransaction(db, async () => {
      const existingBiblioteca = await db.all(
        `SELECT dia, hora, profesor
         FROM biblioteca_guardias
         ORDER BY dia, hora`
      );

      const existingBanos = await db.all(
        `SELECT dia, hora, profesor
         FROM banos_guardias
         ORDER BY dia, hora`
      );

      if (
        existingBiblioteca.length &&
        !sameAssignments(existingBiblioteca, biblioteca)
      ) {
        throw specialAssignmentError(
          409,
          'BIBLIOTECA_ALREADY_INITIALIZED',
          'Biblioteca ya contiene un reparto operativo distinto.'
        );
      }

      if (
        existingBanos.length &&
        !sameAssignments(existingBanos, banos)
      ) {
        throw specialAssignmentError(
          409,
          'BANOS_ALREADY_INITIALIZED',
          'Baños ya contiene un reparto operativo distinto.'
        );
      }

      const insertedBiblioteca = !existingBiblioteca.length;
      const insertedBanos = !existingBanos.length;

      if (insertedBiblioteca) {
        for (const row of biblioteca) {
          await db.run(
            `INSERT INTO biblioteca_guardias
               (dia, hora, profesor, updated_at)
             VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
            [row.dia, row.hora, row.profesor]
          );
        }
      }

      if (insertedBanos) {
        for (const row of banos) {
          await db.run(
            `INSERT INTO banos_guardias
               (dia, hora, profesor, updated_at)
             VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
            [row.dia, row.hora, row.profesor]
          );
        }
      }

      return {
        changed: insertedBiblioteca || insertedBanos,
        biblioteca: await db.all(
          `SELECT dia, hora, profesor
           FROM biblioteca_guardias
           ORDER BY dia, hora`
        ),
        banos: await db.all(
          `SELECT dia, hora, profesor
           FROM banos_guardias
           ORDER BY dia, hora`
        )
      };
    });

    res.status(result.changed ? 201 : 200).json({
      biblioteca: result.biblioteca,
      banos: result.banos
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
