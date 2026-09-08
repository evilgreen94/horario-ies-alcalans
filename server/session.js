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
      role: getPrimaryRole(roles),
      sessionVersion: Number(subject?.sessionVersion || 1)
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
        sessionVersion: Number(parsed.sessionVersion || 0),
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

function validateSessionFromRequest(req, options = {}) {
  const session = readSessionFromRequest(req);
  if (!session || !session.userId) return session;
  return (async () => {
    const { getDatabase } = require('./db');
    const db = await getDatabase();
    const row = await db.get(
      `SELECT u.id, u.username, u.display_name, u.is_active, u.session_version,
              u.must_change_password, GROUP_CONCAT(r.key, ',') AS role_keys
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r ON r.id = ur.role_id
       WHERE u.id = ?
       GROUP BY u.id`,
      [session.userId]
    );
    const roles = String(row?.role_keys || '').split(',').map(value => value.trim()).filter(Boolean);
    if (!row || !row.is_active || !roles.length || Number(row.session_version) !== Number(session.sessionVersion)) {
      return null;
    }
    const role = getPrimaryRole(roles);
    return {
      userId: row.id,
      username: row.username,
      displayName: row.display_name,
      roles,
      role,
      sessionVersion: Number(row.session_version),
      mustChangePassword: !!row.must_change_password,
      passwordChangeOnly: !!row.must_change_password && !options.allowPasswordChange,
      isAdmin: roles.includes('admin') || roles.includes('superadmin'),
      isSuperAdmin: roles.includes('superadmin')
    };
  })();
}

function rejectForcedPasswordChange(session, res) {
  if (!session?.passwordChangeOnly) return false;
  res.status(403).json({
    error: 'Debes cambiar la contraseña temporal antes de continuar.',
    code: 'PASSWORD_CHANGE_REQUIRED'
  });
  return true;
}

function finishAuthentication(session, req, res, next) {
  if (!session) return res.status(401).json({ error: 'Sesion no valida.' });
  if (rejectForcedPasswordChange(session, res)) return undefined;
  req.sessionUser = session;
  return next();
}

function requireAuthenticated(req, res, next) {
  const session = validateSessionFromRequest(req);
  return session instanceof Promise
    ? session.then(value => finishAuthentication(value, req, res, next)).catch(next)
    : finishAuthentication(session, req, res, next);
}

async function requireAuthenticatedForPasswordChange(req, res, next) {
  const session = await validateSessionFromRequest(req, { allowPasswordChange: true });
  if (!session) return res.status(401).json({ error: 'Sesion no valida.' });
  req.sessionUser = session;
  next();
}

function requireRole(role) {
  return (req, res, next) => {
    const authorize = session => {
      if (!session) return res.status(401).json({ error: 'Sesion no valida.' });
      if (rejectForcedPasswordChange(session, res)) return undefined;
    const allowed = role === 'admin'
      ? (session.userId ? session.roles.includes('admin') : session.isAdmin)
      : role === 'superadmin'
        ? session.isSuperAdmin
        : Array.isArray(session.roles) && session.roles.includes(role);
    if (!allowed) {
      return res.status(403).json({ error: 'Permisos insuficientes.' });
    }
    req.sessionUser = session;
      return next();
    };
    const session = validateSessionFromRequest(req);
    return session instanceof Promise ? session.then(authorize).catch(next) : authorize(session);
  };
}

module.exports = {
  clearSessionCookieHeader,
  COOKIE_NAME,
  getSessionSecret,
  readSessionFromRequest,
  requireAuthenticated,
  requireAuthenticatedForPasswordChange,
  requireRole,
  serializeSessionCookie,
  validateSessionFromRequest
};
