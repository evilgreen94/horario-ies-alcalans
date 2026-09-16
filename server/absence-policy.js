const { getResolvedTeacherSession } = require('./teacher-schedule');
const {
  getInactiveGroupSet,
  isGroupInactive,
  logInactiveGroupSkip
} = require('./group-state');
const { normalizeString } = require('./routes/validation');

async function shouldSkipAbsenceRowByInactiveGroup(
  db,
  row,
  inactiveGroups = null
) {
  const inactiveGroupSet =
    inactiveGroups || await getInactiveGroupSet(db);

  const session = await getResolvedTeacherSession(
    db,
    row.ausente,
    row.dia,
    row.hora
  );

  if (!isGroupInactive(session?.grupo, inactiveGroupSet)) {
    return false;
  }

  logInactiveGroupSkip({
    grupo: normalizeString(session?.grupo),
    profesor: normalizeString(row?.ausente),
    dia: Number(row?.dia),
    hora: Number(row?.hora)
  });

  return true;
}

module.exports = {
  shouldSkipAbsenceRowByInactiveGroup
};
