function registerAnnualImportRoutes(router, deps) {
  const {
    buildCanonicalSchedule,
    getDatabase,
    importScheduleDataset,
    importTeacherProfiles,
    parseAnnualXml,
    parseGhcXml,
    validateCanonicalSchedule,
    normalizeAnnualImportRequest,
    ensureRequiredString,
    requireRole,
    requireSameOriginWrite,
    withImmediateTransaction
  } = deps;

  function parseImport(xmlBytes, academicYear, fileName) {
    if (xmlBytes.subarray(0, Math.min(xmlBytes.length, 4096)).toString('latin1').includes('<datosGHC')) {
      return parseGhcXml(xmlBytes, { academicYear, sourceLabel: fileName });
    }
    const source = parseAnnualXml(xmlBytes.toString('utf8'), fileName);
    source.academicYear = academicYear;
    return {
      canonical: buildCanonicalSchedule(source, { academicYear, sourceLabel: fileName }),
      census: {
        schema_version: 1,
        academic_year: academicYear,
        source_system: source.sourceSystem,
        teacher_count: source.teachers.length,
        teachers: source.teachers.map(row => ({
          source_code: row.source_code,
          display_name: row.display_name,
          active: true
        }))
      },
      audit: { format: 'normalized-xml-compatibility', teachers: source.teachers.length }
    };
  }

  router.post('/annual-import/xml/preview', requireRole('admin'), requireSameOriginWrite, async (req, res, next) => {
    try {
      const { academicYear, xmlBytes, fileName } = normalizeAnnualImportRequest(req.body, ensureRequiredString);
      const parsed = parseImport(xmlBytes, academicYear, fileName);
      const validated = validateCanonicalSchedule(parsed.canonical);
      res.json({
        ok: true,
        previewedAt: new Date().toISOString(),
        academicYear: validated.academicYear,
        teachers: validated.teacherSourceCodes.length,
        sessions: validated.sessions.length,
        sourceLabel: validated.label,
        validationReport: validated.report,
        sourceAudit: parsed.audit
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/annual-import/xml', requireRole('admin'), requireSameOriginWrite, async (req, res, next) => {
    try {
      const { academicYear, xmlBytes, fileName } = normalizeAnnualImportRequest(req.body, ensureRequiredString);
      const parsed = parseImport(xmlBytes, academicYear, fileName);
      const db = await getDatabase();
      const result = await withImmediateTransaction(db, async () => {
        const profiles = await importTeacherProfiles(db, parsed.census, { sourceFormat: 'xml' });
        const dataset = await importScheduleDataset(db, parsed.canonical);
        return { ...dataset, profiles };
      }, { label: `ghc-import:${academicYear}` });
      res.json({
        ok: true,
        importedAt: new Date().toISOString(),
        datasetId: result.datasetId,
        datasetStatus: result.status,
        activated: false,
        teachers: result.report.teachersCovered,
        sessions: result.report.sessions,
        sourceLabel: parsed.canonical.label,
        validationReport: result.report,
        sourceAudit: parsed.audit,
        profiles: result.profiles
      });
    } catch (error) {
      next(error);
    }
  });
}

module.exports = { registerAnnualImportRoutes };
