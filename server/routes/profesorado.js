const express = require('express');
const { getDatabase, withImmediateTransaction } = require('../db');
const { parseAnnualXml, writeAnnualSourceArtifacts } = require('../annual-source');
const {
  ensureArray,
  ensureRequiredString,
  sanitizeSessionOverride,
  sanitizeAlumnosFueraAula,
  sanitizeTeacherFutureAbsence,
  sanitizePatioGuardia,
  sanitizePatioTeacherBlock,
  sanitizeTeacherPracticeGuardia,
  sanitizeTeacherPracticeGuardiaSlot,
  sanitizeTeacherSubstitution,
  sanitizeTareaProfesorado
} = require('./validation');
const { requireRole } = require('../session');
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
  requireRole,
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
  sanitizePatioGuardia,
  sanitizePatioTeacherBlock,
  requireRole,
  withImmediateTransaction
});

registerAnnualImportRoutes(router, {
  parseAnnualXml,
  writeAnnualSourceArtifacts,
  normalizeAnnualImportRequest,
  ensureRequiredString,
  requireRole,
  requireSameOriginWrite
});

module.exports = router;
