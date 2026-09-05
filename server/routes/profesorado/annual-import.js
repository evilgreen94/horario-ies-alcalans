function registerAnnualImportRoutes(router, deps) {
  const {
    buildCanonicalSchedule,
    getDatabase,
    importScheduleDataset,
    parseAnnualXml,
    validateCanonicalSchedule,
    normalizeAnnualImportRequest,
    ensureRequiredString,
    requireRole,
    requireSameOriginWrite
  } = deps;

  router.post('/annual-import/xml/preview', requireRole('admin'), requireSameOriginWrite, async (req, res, next) => {
    try {
      const { xmlText, fileName } = normalizeAnnualImportRequest(req.body, ensureRequiredString);
      const source = parseAnnualXml(xmlText, fileName);
      const canonical = buildCanonicalSchedule(source, {
        sourceLabel: fileName
      });
      const validated = validateCanonicalSchedule(canonical);
      res.json({
        ok: true,
        previewedAt: new Date().toISOString(),
        academicYear: validated.academicYear,
        teachers: validated.teacherSourceCodes.length,
        sessions: validated.sessions.length,
        sourceLabel: validated.label,
        validationReport: validated.report
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/annual-import/xml', requireRole('admin'), requireSameOriginWrite, async (req, res, next) => {
    try {
      const { xmlText, fileName } = normalizeAnnualImportRequest(req.body, ensureRequiredString);
      const source = parseAnnualXml(xmlText, fileName);
      const canonical = buildCanonicalSchedule(source, { sourceLabel: fileName });
      const result = await importScheduleDataset(await getDatabase(), canonical);
      res.json({
        ok: true,
        importedAt: new Date().toISOString(),
        datasetId: result.datasetId,
        datasetStatus: result.status,
        activated: false,
        teachers: result.report.teachersCovered,
        sessions: result.report.sessions,
        sourceLabel: canonical.label,
        validationReport: result.report
      });
    } catch (error) {
      next(error);
    }
  });
}

module.exports = { registerAnnualImportRoutes };
