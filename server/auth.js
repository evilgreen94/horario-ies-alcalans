const crypto = require('crypto');

const ADMIN_ROLE = 'admin';
const SUPERADMIN_ROLE = 'superadmin';

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

function verifyPassword(password, salt, expectedHash) {
  const { hash } = hashPassword(password, salt);
  const left = Buffer.from(hash, 'hex');
  const right = Buffer.from(expectedHash, 'hex');
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

module.exports = {
  ADMIN_ROLE,
  SUPERADMIN_ROLE,
  hashPassword,
  verifyPassword
};
