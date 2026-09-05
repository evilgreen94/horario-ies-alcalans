const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { hashPassword, verifyPassword, SCRYPT_OPTIONS } = require('../auth');
const validation = require('../routes/validation');

function loadSessionModule(secret) {
  const modulePath = require.resolve('../session');
  delete require.cache[modulePath];
  if (secret == null) {
    delete process.env.GUARDIAS_SESSION_SECRET;
  } else {
    process.env.GUARDIAS_SESSION_SECRET = secret;
  }
  return require('../session');
}

function signSessionPayload(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

module.exports = [
  {
    name: 'hashPassword is deterministic with the same salt and verifyPassword only accepts the right password',
    fn() {
      const salt = 'fixed-salt-for-tests';
      const first = hashPassword('secreta', salt);
      const second = hashPassword('secreta', salt);

      assert.equal(first.salt, salt);
      assert.equal(first.hash, second.hash);
      assert.ok(verifyPassword('secreta', salt, first.hash));
      assert.equal(verifyPassword('otra', salt, first.hash), false);
      assert.equal(verifyPassword('secreta', salt, 'abcd'), false);
      assert.deepEqual(SCRYPT_OPTIONS, { N: 16384, r: 8, p: 1, maxmem: 33554432 });
      assert.equal(first.hash.length, 128);
    }
  },
  {
    name: 'session module rejects missing secret at use time',
    fn() {
      const session = loadSessionModule(null);
      assert.throws(() => session.getSessionSecret(), /Missing GUARDIAS_SESSION_SECRET/);
    }
  },
  {
    name: 'serializeSessionCookie and readSessionFromRequest round-trip an admin session',
    fn() {
      const session = loadSessionModule('worker-3-test-secret');
      const req = { secure: true, headers: {} };
      const cookieHeader = session.serializeSessionCookie('admin', req);
      const cookiePair = cookieHeader.split(';')[0];

      assert.match(cookieHeader, /HttpOnly/);
      assert.match(cookieHeader, /SameSite=Lax/);
      assert.match(cookieHeader, /Priority=High/);
      assert.match(cookieHeader, /Secure/);

      const parsed = session.readSessionFromRequest({
        headers: {
          cookie: cookiePair
        }
      });

      assert.deepEqual(parsed, {
        role: 'admin',
        isAdmin: true,
        isSuperAdmin: false
      });
    }
  },
  {
    name: 'readSessionFromRequest rejects tampered or expired cookies',
    fn() {
      const session = loadSessionModule('worker-3-test-secret');
      const cookieHeader = session.serializeSessionCookie('superadmin', { secure: false, headers: {} });
      const cookiePair = cookieHeader.split(';')[0];
      const [cookieName, rawValue] = cookiePair.split('=');
      const [payload, signature] = rawValue.split('.');

      const tampered = session.readSessionFromRequest({
        headers: {
          cookie: `${cookieName}=${payload}.firma-invalida`
        }
      });
      assert.equal(tampered, null);

      const expiredSecret = 'worker-3-test-secret';
      const expiredSession = loadSessionModule(expiredSecret);
      const expiredPayload = Buffer.from(JSON.stringify({
        role: 'admin',
        exp: Date.now() - 1000
      })).toString('base64url');
      const expiredSignature = signSessionPayload(expiredPayload, expiredSecret);
      const expiredCookie = `${cookieName}=${expiredPayload}.${expiredSignature}`;
      const expired = expiredSession.readSessionFromRequest({
        headers: {
          cookie: expiredCookie
        }
      });
      assert.equal(expired, null);
    }
  },
  {
    name: 'requireRole accepts admin for admin routes and blocks superadmin-only access',
    fn() {
      const session = loadSessionModule('worker-3-test-secret');
      const cookieHeader = session.serializeSessionCookie('admin', { secure: false, headers: {} });
      const req = {
        headers: {
          cookie: cookieHeader.split(';')[0]
        }
      };

      let nextCalls = 0;
      const okRes = {
        status() {
          throw new Error('status should not be called for authorized admin access');
        },
        json() {
          throw new Error('json should not be called for authorized admin access');
        }
      };
      session.requireRole('admin')(req, okRes, () => {
        nextCalls += 1;
      });
      assert.equal(nextCalls, 1);
      assert.equal(req.sessionUser.role, 'admin');

      const forbiddenRes = {
        statusCode: null,
        payload: null,
        status(code) {
          this.statusCode = code;
          return this;
        },
        json(body) {
          this.payload = body;
          return this;
        }
      };
      session.requireRole('superadmin')(req, forbiddenRes, () => {
        throw new Error('next should not be called for forbidden access');
      });
      assert.equal(forbiddenRes.statusCode, 403);
      assert.deepEqual(forbiddenRes.payload, { error: 'Permisos insuficientes.' });
    }
  },
  {
    name: 'validation normalizers keep stable business rules for text, booleans and bounded integers',
    fn() {
      assert.equal(validation.normalizeText('  MiÉrcoles   TARDE '), 'miercoles tarde');
      assert.equal(validation.normalizeBoolean('true'), true);
      assert.equal(validation.normalizeBoolean('false'), false);
      assert.equal(validation.normalizeBoolean(1), true);
      assert.equal(validation.normalizeBoolean(0), false);
      assert.equal(validation.normalizeInteger('4', 'hora', 1, 9), 4);
      assert.throws(
        () => validation.normalizeInteger(10, 'hora', 1, 9),
        error => error.status === 400 && /hora debe estar entre 1 y 9/.test(error.message)
      );
    }
  },
  {
    name: 'sanitizeTeacherFutureAbsence normalizes, sorts and deduplicates allowed hours',
    fn() {
      const row = validation.sanitizeTeacherFutureAbsence({
        id: 'future-1',
        profesor: 'Ada',
        date: '2026-05-04',
        note: '  Reunion externa ',
        hours: [3, 2, 2, 9, 4, 1],
        status: 'approved',
        reviewedAt: '2026-04-30T10:15:00.000Z',
        reviewerNote: 'ok',
        appliedAt: '',
        createdAt: '2026-04-29T09:00:00.000Z'
      });

      assert.deepEqual(row, {
        id: 'future-1',
        profesor: 'Ada',
        date: '2026-05-04',
        note: 'Reunion externa',
        hours: [1, 2, 3, 4, 9],
        status: 'approved',
        reviewedAt: '2026-04-30T10:15:00.000Z',
        reviewerNote: 'ok',
        appliedAt: '',
        createdAt: '2026-04-29T09:00:00.000Z'
      });
    }
  }
];
