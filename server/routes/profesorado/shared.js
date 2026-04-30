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
  const xmlText = ensureRequiredString(input.xmlText, 'xmlText');
  const fileName = String(input.fileName || 'horario-anual.xml').trim() || 'horario-anual.xml';
  return { xmlText, fileName };
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
