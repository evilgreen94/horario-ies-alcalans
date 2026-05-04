const path = require('path');

function registerAnnualImportRoutes(router, deps) {
  const {
    parseAnnualXml,
    writeAnnualSourceArtifacts,
    normalizeAnnualImportRequest,
    ensureRequiredString,
    requireRole,
    requireSameOriginWrite
  } = deps;

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
        backups: result.backups
      });
    } catch (error) {
      next(error);
    }
  });
}

module.exports = { registerAnnualImportRoutes };
