const express = require('express');
const { getDatabase, withImmediateTransaction } = require('../db');
const { buildCanonicalSchedule, parseAnnualXml } = require('../annual-source');
const { importScheduleDataset, importTeacherProfiles, validateCanonicalSchedule } = require('../schedule-model');
const { parseGhcXml } = require('../ghc-xml-import');
const {
  ensureArray,
  ensureRequiredString,
  sanitizeSessionOverride,
  sanitizeAlumnosFueraAula,
  sanitizeAusencia,
  sanitizeTeacherFutureAbsence,
  sanitizePatioGuardia,
  sanitizePatioTeacherBlock,
  sanitizeTeacherPracticeGuardia,
  sanitizeTeacherPracticeGuardiaSlot,
  sanitizeTeacherSubstitution,
  sanitizeTareaProfesorado,
  normalizeText
} = require('./validation');
const { requireAuthenticated, requireRole } = require('../session');
const { appendAuditEvent } = require('../audit');
const { appendOperationalHistory } = require('../operational-history');
const { ensureCoverageAssignmentsAllowed } = require('../coverage-assignment');
const { shouldSkipAbsenceRowByInactiveGroup } = require('../absence-policy');
const { rebuildMonthlyGuardiaLoadForCurrentWeek } = require('./guardias/monthly-load');
const { resolveActiveTeacherContext } = require('../teacher-identity');
const {
  badRequest,
  notFound,
  normalizeAnnualImportRequest,
  requireSameOriginWrite
} = require('./profesorado/shared');
const { registerAlumnosFueraAulaRoutes } = require('./profesorado/alumnos-fuera-aula');
const { registerTareasRoutes } = require('./profesorado/tareas');
const { registerSessionOverridesRoutes } = require('./profesorado/session-overrides');
const { registerStateCollectionRoutes } = require('./profesorado/state-collections');
const { registerAnnualImportRoutes } = require('./profesorado/annual-import');

const router = express.Router();
registerTareasRoutes(router, {
  getDatabase,
  sanitizeTareaProfesorado,
  ensureArray,
  ensureRequiredString,
  requireRole,
  withImmediateTransaction
});

registerAlumnosFueraAulaRoutes(router, {
  getDatabase,
  sanitizeAlumnosFueraAula,
  ensureArray,
  appendAuditEvent,
  requireAuthenticated,
  requireRole,
  resolveActiveTeacherContext,
  requireSameOriginWrite,
  badRequest,
  notFound,
  withImmediateTransaction
});

registerSessionOverridesRoutes(router, {
  getDatabase,
  sanitizeSessionOverride,
  ensureArray,
  ensureRequiredString,
  requireRole,
  withImmediateTransaction
});

registerStateCollectionRoutes(router, {
  getDatabase,
  ensureArray,
  sanitizeTeacherSubstitution,
  sanitizeTeacherPracticeGuardia,
  sanitizeTeacherPracticeGuardiaSlot,
  sanitizeTeacherFutureAbsence,
  sanitizeAusencia,
  normalizeText,
  sanitizePatioGuardia,
  sanitizePatioTeacherBlock,
  appendAuditEvent,
  appendOperationalHistory,
  ensureCoverageAssignmentsAllowed,
  shouldSkipAbsenceRowByInactiveGroup,
  rebuildMonthlyGuardiaLoadForCurrentWeek,
  requireAuthenticated,
  requireRole,
  resolveActiveTeacherContext,
  requireSameOriginWrite,
  withImmediateTransaction
});

registerAnnualImportRoutes(router, {
  buildCanonicalSchedule,
  getDatabase,
  importScheduleDataset,
  importTeacherProfiles,
  parseGhcXml,
  parseAnnualXml,
  validateCanonicalSchedule,
  normalizeAnnualImportRequest,
  ensureRequiredString,
  requireRole,
  requireSameOriginWrite,
  withImmediateTransaction
});

module.exports = router;
