function normalizeTeacherIdentity(value) {
  return String(value || '')
    .trim()
    .normalize('NFKC')
    .toLocaleLowerCase('es-ES');
}

function slotKey(row) {
  return `${Number(row?.dia)}|${Number(row?.hora)}`;
}

function specialAssignmentError(status, code, message, details) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  if (details) error.details = details;
  return error;
}

function assertUniqueSlotAssignments(rows, label, status = 400) {
  const seen = new Set();

  for (const row of rows) {
    const key = slotKey(row);

    if (seen.has(key)) {
      throw specialAssignmentError(
        status,
        'SPECIAL_ASSIGNMENT_DUPLICATE_SLOT',
        `${label} contiene más de una asignación para la misma franja.`,
        {
          dia: Number(row.dia),
          hora: Number(row.hora)
        }
      );
    }

    seen.add(key);
  }
}

function assertNoSpecialAssignmentConflict(
  bibliotecaRows,
  banosRows,
  status = 409
) {
  const bibliotecaBySlot = new Map(
    bibliotecaRows.map(row => [
      slotKey(row),
      normalizeTeacherIdentity(row.profesor)
    ])
  );

  for (const row of banosRows) {
    const bibliotecaProfesor = bibliotecaBySlot.get(slotKey(row));
    const banosProfesor = normalizeTeacherIdentity(row.profesor);

    if (
      bibliotecaProfesor &&
      banosProfesor &&
      bibliotecaProfesor === banosProfesor
    ) {
      throw specialAssignmentError(
        status,
        'SPECIAL_ASSIGNMENT_CONFLICT',
        'El mismo profesor no puede estar asignado simultáneamente a Biblioteca y Baños.',
        {
          dia: Number(row.dia),
          hora: Number(row.hora),
          profesor: String(row.profesor || '').trim()
        }
      );
    }
  }
}

module.exports = {
  assertNoSpecialAssignmentConflict,
  assertUniqueSlotAssignments,
  normalizeTeacherIdentity,
  specialAssignmentError
};
