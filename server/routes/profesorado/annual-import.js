const path = require('path');

function registerAnnualImportRoutes(router, deps) {
  const {
    parseAnnualXml,
    validateAndNormalizeAnnualSource,
    writeAnnualSourceArtifacts,
    normalizeAnnualImportRequest,
    ensureRequiredString,
    requireRole,
    requireSameOriginWrite
  } = deps;

  router.post('/annual-import/xml/preview', requireRole('admin'), requireSameOriginWrite, async (req, res, next) => {
    try {
      const { xmlText, fileName } = normalizeAnnualImportRequest(req.body, ensureRequiredString);
      const source = parseAnnualXml(xmlText, fileName);
      const normalized = validateAndNormalizeAnnualSource(source, {
        sourceLabel: fileName
      });
      res.json({
        ok: true,
        previewedAt: new Date().toISOString(),
        teachers: Object.keys(normalized.teachers || {}).length,
        sourceLabel: normalized.fuente,
        importMetadata: normalized.metadata || null
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/annual-import/xml', requireRole('admin'), requireSameOriginWrite, async (req, res, next) => {
    try {
      const { xmlText, fileName } = normalizeAnnualImportRequest(req.body, ensureRequiredString);
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
        backups: result.backups,
        importMetadata: result.normalizedSource?.metadata || null
      });
    } catch (error) {
      next(error);
    }
  });
}

module.exports = { registerAnnualImportRoutes };
