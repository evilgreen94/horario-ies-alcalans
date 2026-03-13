const crypto = require('crypto');

const COOKIE_NAME = 'guardias_session';
const SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const SESSION_SECRET = (process.env.GUARDIAS_SESSION_SECRET || '').trim();

function getSessionSecret() {
  if (!SESSION_SECRET) {
    throw new Error('Missing GUARDIAS_SESSION_SECRET. Configure a strong session secret before starting the server.');
  }
  return SESSION_SECRET;
}

function toBase64Url(value) {
  return Buffer.from(value).toString('base64url');
}

function fromBase64Url(value) {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function signPayload(payload) {
  return crypto.createHmac('sha256', getSessionSecret()).update(payload).digest('base64url');
}

function isSecureRequest(req) {
  if (!req) return false;
  if (req.secure) return true;
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
  return forwardedProto === 'https';
}

function serializeSessionCookie(role, req) {
  const payload = toBase64Url(JSON.stringify({
    role,
    exp: Date.now() + SESSION_MAX_AGE_MS
  }));
  const signature = signPayload(payload);
  const secureFlag = isSecureRequest(req) ? '; Secure' : '';
  return `${COOKIE_NAME}=${payload}.${signature}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_MAX_AGE_MS / 1000)}${secureFlag}`;
}

function clearSessionCookieHeader(req) {
  const secureFlag = isSecureRequest(req) ? '; Secure' : '';
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureFlag}`;
}

function parseCookies(headerValue) {
  return String(headerValue || '')
    .split(';')
    .map(part => part.trim())
    .filter(Boolean)
    .reduce((acc, part) => {
      const separatorIndex = part.indexOf('=');
      if (separatorIndex === -1) return acc;
      const key = part.slice(0, separatorIndex);
      const value = part.slice(separatorIndex + 1);
      acc[key] = value;
      return acc;
    }, {});
}

function readSessionFromRequest(req) {
  const cookies = parseCookies(req.headers.cookie);
  const raw = cookies[COOKIE_NAME];
  if (!raw) return null;

  const [payload, signature] = raw.split('.');
  if (!payload || !signature) return null;
  if (signPayload(payload) !== signature) return null;

  try {
    const parsed = JSON.parse(fromBase64Url(payload));
    if (!parsed?.role || !parsed?.exp || parsed.exp < Date.now()) return null;
    return {
      role: parsed.role,
      isAdmin: parsed.role === 'admin' || parsed.role === 'superadmin',
      isSuperAdmin: parsed.role === 'superadmin'
    };
  } catch (_error) {
    return null;
  }
}

function requireRole(role) {
  return (req, res, next) => {
    const session = readSessionFromRequest(req);
    if (!session) {
      return res.status(401).json({ error: 'Sesión no válida.' });
    }
    if (role === 'admin' && !session.isAdmin) {
      return res.status(403).json({ error: 'Permisos insuficientes.' });
    }
    if (role === 'superadmin' && !session.isSuperAdmin) {
      return res.status(403).json({ error: 'Permisos insuficientes.' });
    }
    req.sessionUser = session;
    next();
  };
}

module.exports = {
  clearSessionCookieHeader,
  COOKIE_NAME,
  getSessionSecret,
  readSessionFromRequest,
  requireRole,
  serializeSessionCookie
};
