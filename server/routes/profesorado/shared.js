function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function notFound(message) {
  const error = new Error(message);
  error.status = 404;
  return error;
}

function forbidden(message) {
  const error = new Error(message);
  error.status = 403;
  return error;
}

function normalizeAnnualImportRequest(body, ensureRequiredString) {
  const input = body && typeof body === 'object' ? body : {};
  const academicYear = ensureRequiredString(input.academicYear || input.academic_year, 'academicYear');
  const xmlBase64 = ensureRequiredString(input.xmlBase64, 'xmlBase64');
  if (!/^[A-Za-z0-9+/=\r\n]+$/.test(xmlBase64)) throw badRequest('xmlBase64 inválido.');
  const xmlBytes = Buffer.from(xmlBase64, 'base64');
  if (!xmlBytes.length) throw badRequest('El XML está vacío.');
  if (xmlBytes.length > 4 * 1024 * 1024) throw badRequest('El XML supera el límite de 4 MiB.');
  const requestedName = String(input.fileName || 'horario-anual.xml').trim();
  const fileName = requestedName.split(/[\\/]/).pop().slice(0, 255) || 'horario-anual.xml';
  return { academicYear, xmlBytes, fileName };
}

function getExpectedOrigin(req) {
  return `${req.protocol}://${req.get('host')}`;
}

function hasSameOriginHeader(req) {
  const expectedOrigin = getExpectedOrigin(req);
  const origin = String(req.get('origin') || '').trim();
  if (origin) return origin === expectedOrigin;

  const referer = String(req.get('referer') || '').trim();
  if (!referer) return false;
  try {
    return new URL(referer).origin === expectedOrigin;
  } catch (_error) {
    return false;
  }
}

function requireSameOriginWrite(req, _res, next) {
  if (hasSameOriginHeader(req)) return next();
  next(forbidden('Escritura rechazada: origen no permitido.'));
}

module.exports = {
  badRequest,
  notFound,
  forbidden,
  normalizeAnnualImportRequest,
  requireSameOriginWrite
};
