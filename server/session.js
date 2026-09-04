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

function hasValidSignature(payload, signature) {
  const expectedSignature = signPayload(payload);
  const left = Buffer.from(expectedSignature);
  const right = Buffer.from(String(signature || ''));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function isSecureRequest(req) {
  if (!req) return false;
  if (req.secure) return true;
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
  return forwardedProto === 'https';
}

function normalizeRoles(values) {
  const roles = Array.isArray(values) ? values : [values];
  return [...new Set(roles.map(value => String(value || '').trim().toLowerCase()).filter(Boolean))];
}

function getPrimaryRole(roles) {
  if (roles.includes('superadmin')) return 'superadmin';
  if (roles.includes('admin')) return 'admin';
  if (roles.includes('teacher')) return 'teacher';
  return roles[0] || '';
}

function serializeSessionCookie(subject, req) {
  let sessionPayload;
  if (typeof subject === 'string') {
    sessionPayload = { role: subject };
  } else {
    const userId = Number(subject?.userId);
    const username = String(subject?.username || '').trim();
    const roles = normalizeRoles([...normalizeRoles(subject?.roles), subject?.role]);
    if (!Number.isSafeInteger(userId) || userId <= 0 || !username || !roles.length) {
      throw new Error('Invalid individual session identity.');
    }
    sessionPayload = {
      userId,
      username,
      displayName: String(subject?.displayName || '').trim(),
      roles,
      role: getPrimaryRole(roles)
    };
  }

  const payload = toBase64Url(JSON.stringify({
    ...sessionPayload,
    exp: Date.now() + SESSION_MAX_AGE_MS
  }));
  const signature = signPayload(payload);
  const secureFlag = isSecureRequest(req) ? '; Secure' : '';
  return `${COOKIE_NAME}=${payload}.${signature}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_MAX_AGE_MS / 1000)}; Priority=High${secureFlag}`;
}

function clearSessionCookieHeader(req) {
  const secureFlag = isSecureRequest(req) ? '; Secure' : '';
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Priority=High${secureFlag}`;
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
  if (!hasValidSignature(payload, signature)) return null;

  try {
    const parsed = JSON.parse(fromBase64Url(payload));
    if (!parsed?.role || !parsed?.exp || parsed.exp < Date.now()) return null;
    if (parsed.userId != null) {
      const roles = normalizeRoles(parsed.roles);
      if (!Number.isSafeInteger(parsed.userId) || parsed.userId <= 0 || !parsed.username || !roles.length) return null;
      const role = getPrimaryRole(roles);
      return {
        userId: parsed.userId,
        username: String(parsed.username),
        displayName: String(parsed.displayName || ''),
        roles,
        role,
        isAdmin: roles.includes('admin') || roles.includes('superadmin'),
        isSuperAdmin: roles.includes('superadmin')
      };
    }
    return {
      role: parsed.role,
      isAdmin: parsed.role === 'admin' || parsed.role === 'superadmin',
      isSuperAdmin: parsed.role === 'superadmin'
    };
  } catch (_error) {
    return null;
  }
}

function requireAuthenticated(req, res, next) {
  const session = readSessionFromRequest(req);
  if (!session) {
    return res.status(401).json({ error: 'Sesion no valida.' });
  }
  req.sessionUser = session;
  next();
}

function requireRole(role) {
  return (req, res, next) => {
    const session = readSessionFromRequest(req);
    if (!session) {
      return res.status(401).json({ error: 'Sesion no valida.' });
    }
    const allowed = role === 'admin'
      ? session.isAdmin
      : role === 'superadmin'
        ? session.isSuperAdmin
        : Array.isArray(session.roles) && session.roles.includes(role);
    if (!allowed) {
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
  requireAuthenticated,
  requireRole,
  serializeSessionCookie
};
