const express = require('express');
const { getDatabase } = require('../db');
const { verifyPassword, hashPassword } = require('../auth');
const {
  clearSessionCookieHeader,
  readSessionFromRequest,
  requireRole,
  serializeSessionCookie
} = require('../session');

const router = express.Router();

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function normalizeRole(value) {
  const role = String(value || '').trim().toLowerCase();
  if (role !== 'admin' && role !== 'superadmin') {
    throw badRequest('role inválido.');
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

router.get('/session', (req, res) => {
  const session = readSessionFromRequest(req);
  if (!session) {
    return res.json({ authenticated: false, role: null, isAdmin: false, isSuperAdmin: false });
  }
  res.json({ authenticated: true, ...session });
});

router.post('/login', async (req, res, next) => {
  try {
    const role = normalizeRole(req.body?.role);
    const password = ensurePassword(req.body?.password, 'password');
    const db = await getDatabase();
    const row = await db.get('SELECT password_hash, salt FROM auth_credentials WHERE role = ?', [role]);
    if (!row || !verifyPassword(password, row.salt, row.password_hash)) {
      return res.status(401).json({ ok: false, error: 'Credenciales incorrectas.' });
    }

    res.setHeader('Set-Cookie', serializeSessionCookie(role));
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
  res.setHeader('Set-Cookie', clearSessionCookieHeader());
  res.json({ ok: true });
});

router.post('/change-password', requireRole('admin'), async (req, res, next) => {
  try {
    const currentPassword = ensurePassword(req.body?.currentPassword, 'currentPassword');
    const newPassword = ensurePassword(req.body?.newPassword, 'newPassword');
    const sessionRole = req.sessionUser.role;
    const requestedRole = normalizeRole(req.body?.role || sessionRole);

    if (requestedRole !== sessionRole) {
      throw badRequest('No puedes cambiar la contraseña de otro rol.');
    }
    if (currentPassword === newPassword) {
      throw badRequest('La nueva contraseña debe ser distinta de la actual.');
    }

    const db = await getDatabase();
    const row = await db.get('SELECT password_hash, salt FROM auth_credentials WHERE role = ?', [sessionRole]);
    if (!row || !verifyPassword(currentPassword, row.salt, row.password_hash)) {
      return res.status(401).json({ ok: false, error: 'La contraseña actual no es correcta.' });
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
