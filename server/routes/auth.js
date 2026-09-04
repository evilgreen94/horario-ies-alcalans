const express = require('express');
const { getDatabase } = require('../db');
const { verifyPassword, hashPassword } = require('../auth');
const { appendAuditEvent } = require('../audit');
const {
  clearSessionCookieHeader,
  readSessionFromRequest,
  requireAuthenticated,
  serializeSessionCookie
} = require('../session');

const router = express.Router();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 10;
const loginAttempts = new Map();
const DUMMY_CREDENTIAL = hashPassword('invalid-login-placeholder');

router.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function normalizeRole(value) {
  const role = String(value || '').trim().toLowerCase();
  if (role !== 'admin' && role !== 'superadmin') {
    throw badRequest('role invalido.');
  }
  return role;
}

function ensurePassword(value, field) {
  const password = String(value || '');
  if (password.length < 6) {
    throw badRequest(`${field} debe tener al menos 6 caracteres.`);
  }
  return password;
}

function normalizeUsername(value) {
  const username = String(value || '').trim();
  if (!username || username.length > 128) {
    throw badRequest('username invalido.');
  }
  return username;
}

function getLoginAttemptKey(req, principal) {
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  return `${ip}:${String(principal).toLowerCase()}`;
}

function getActiveLoginAttempt(req, principal) {
  const key = getLoginAttemptKey(req, principal);
  const now = Date.now();
  const current = loginAttempts.get(key);
  if (!current || current.resetAt <= now) {
    loginAttempts.delete(key);
    return { key, count: 0, resetAt: now + LOGIN_WINDOW_MS };
  }
  return { key, ...current };
}

function recordFailedLogin(req, principal) {
  const current = getActiveLoginAttempt(req, principal);
  loginAttempts.set(current.key, {
    count: current.count + 1,
    resetAt: current.resetAt
  });
}

function clearFailedLogins(req, principal) {
  loginAttempts.delete(getLoginAttemptKey(req, principal));
}

async function findIndividualUser(db, username) {
  const row = await db.get(
    `SELECT
       u.id,
       u.username,
       u.display_name,
       u.password_hash,
       u.password_salt,
       u.is_active,
       GROUP_CONCAT(r.key, ',') AS role_keys
     FROM users u
     LEFT JOIN user_roles ur ON ur.user_id = u.id
     LEFT JOIN roles r ON r.id = ur.role_id
     WHERE u.username = ? COLLATE NOCASE
     GROUP BY u.id`,
    [username]
  );
  if (!row) return null;
  return {
    ...row,
    roles: String(row.role_keys || '').split(',').map(role => role.trim()).filter(Boolean)
  };
}

async function auditAuthentication(db, event) {
  try {
    await appendAuditEvent(db, event);
  } catch (error) {
    console.warn(`Authentication audit failed: ${error.message || error}`);
  }
}

router.get('/session', (req, res) => {
  const session = readSessionFromRequest(req);
  if (!session) {
    return res.json({ authenticated: false, role: null, isAdmin: false, isSuperAdmin: false });
  }
  res.json({ authenticated: true, ...session });
});

router.post('/login', async (req, res, next) => {
  try {
    if (String(req.body?.username || '').trim()) {
      const username = normalizeUsername(req.body.username);
      const attempt = getActiveLoginAttempt(req, username);
      if (attempt.count >= MAX_LOGIN_ATTEMPTS) {
        const error = badRequest('Demasiados intentos de acceso. Espera unos minutos antes de volver a intentarlo.');
        error.status = 429;
        error.details = { retryAfterSeconds: Math.ceil((attempt.resetAt - Date.now()) / 1000) };
        throw error;
      }
      const password = ensurePassword(req.body?.password, 'password');
      const db = await getDatabase();
      const user = await findIndividualUser(db, username);
      const credential = user || DUMMY_CREDENTIAL;
      const passwordMatches = verifyPassword(
        password,
        credential.password_salt || credential.salt,
        credential.password_hash || credential.hash
      );
      if (!user || !user.is_active || !passwordMatches || !user.roles.length) {
        recordFailedLogin(req, username);
        await auditAuthentication(db, {
          actorUserId: user?.id,
          action: 'auth.login',
          targetType: 'user',
          targetId: user ? String(user.id) : '',
          outcome: 'failure'
        });
        return res.status(401).json({ ok: false, error: 'Credenciales incorrectas.' });
      }

      clearFailedLogins(req, username);
      const identity = {
        userId: user.id,
        username: user.username,
        displayName: user.display_name,
        roles: user.roles
      };
      res.setHeader('Set-Cookie', serializeSessionCookie(identity, req));
      const session = readSessionFromRequest({ headers: { cookie: res.getHeader('Set-Cookie').split(';')[0] } });
      await auditAuthentication(db, {
        actorUserId: user.id,
        action: 'auth.login',
        targetType: 'user',
        targetId: String(user.id)
      });
      return res.json({ ok: true, ...session });
    }

    const role = normalizeRole(req.body?.role);
    const attempt = getActiveLoginAttempt(req, role);
    if (attempt.count >= MAX_LOGIN_ATTEMPTS) {
      const error = badRequest('Demasiados intentos de acceso. Espera unos minutos antes de volver a intentarlo.');
      error.status = 429;
      error.details = { retryAfterSeconds: Math.ceil((attempt.resetAt - Date.now()) / 1000) };
      throw error;
    }
    const password = ensurePassword(req.body?.password, 'password');
    const db = await getDatabase();
    const row = await db.get('SELECT password_hash, salt FROM auth_credentials WHERE role = ?', [role]);
    if (!row || !verifyPassword(password, row.salt, row.password_hash)) {
      recordFailedLogin(req, role);
      return res.status(401).json({ ok: false, error: 'Credenciales incorrectas.' });
    }

    clearFailedLogins(req, role);
    res.setHeader('Set-Cookie', serializeSessionCookie(role, req));
    res.json({
      ok: true,
      role,
      isAdmin: role === 'admin' || role === 'superadmin',
      isSuperAdmin: role === 'superadmin'
    });
  } catch (error) {
    next(error);
  }
});

router.post('/logout', (_req, res) => {
  res.setHeader('Set-Cookie', clearSessionCookieHeader(_req));
  res.json({ ok: true });
});

router.post('/change-password', requireAuthenticated, async (req, res, next) => {
  try {
    const currentPassword = ensurePassword(req.body?.currentPassword, 'currentPassword');
    const newPassword = ensurePassword(req.body?.newPassword, 'newPassword');
    const sessionRole = req.sessionUser.role;

    if (req.sessionUser.userId) {
      if (currentPassword === newPassword) {
        throw badRequest('La nueva contrasena debe ser distinta de la actual.');
      }
      const db = await getDatabase();
      const row = await db.get(
        'SELECT password_hash, password_salt FROM users WHERE id = ? AND is_active = 1',
        [req.sessionUser.userId]
      );
      if (!row || !verifyPassword(currentPassword, row.password_salt, row.password_hash)) {
        return res.status(401).json({ ok: false, error: 'La contrasena actual no es correcta.' });
      }
      const { salt, hash } = hashPassword(newPassword);
      await db.run(
        `UPDATE users
         SET password_hash = ?, password_salt = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [hash, salt, req.sessionUser.userId]
      );
      await auditAuthentication(db, {
        actorUserId: req.sessionUser.userId,
        action: 'auth.password_changed',
        targetType: 'user',
        targetId: String(req.sessionUser.userId)
      });
      return res.json({ ok: true });
    }

    const requestedRole = normalizeRole(req.body?.role || sessionRole);

    if (requestedRole !== sessionRole) {
      throw badRequest('No puedes cambiar la contrasena de otro rol.');
    }
    if (currentPassword === newPassword) {
      throw badRequest('La nueva contrasena debe ser distinta de la actual.');
    }

    const db = await getDatabase();
    const row = await db.get('SELECT password_hash, salt FROM auth_credentials WHERE role = ?', [sessionRole]);
    if (!row || !verifyPassword(currentPassword, row.salt, row.password_hash)) {
      return res.status(401).json({ ok: false, error: 'La contrasena actual no es correcta.' });
    }

    const { salt, hash } = hashPassword(newPassword);
    await db.run(
      `UPDATE auth_credentials
       SET password_hash = ?, salt = ?, updated_at = CURRENT_TIMESTAMP
       WHERE role = ?`,
      [hash, salt, sessionRole]
    );

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
