const path = require('path');

const LOCAL_DATABASE_PATTERN = /\.(?:dev|test|tmp)\.sqlite$/i;

function resolveDatabaseTarget(value, options = {}) {
  if (!value) throw new Error('Falta --db; nunca se selecciona una base operativa por defecto.');

  const resolved = path.resolve(value);
  const projectDatabase = path.resolve(__dirname, '..', '..', 'BD', 'guardias.sqlite');
  if (resolved.toLowerCase() === projectDatabase.toLowerCase()) {
    throw new Error('La base operativa del repositorio está bloqueada.');
  }

  if (LOCAL_DATABASE_PATTERN.test(resolved)) return resolved;

  if (!path.isAbsolute(value) || path.extname(resolved).toLowerCase() !== '.sqlite') {
    throw new Error('La base operativa debe ser una ruta absoluta terminada en .sqlite.');
  }

  if (!options.confirmation || options.confirmation !== options.requiredConfirmation) {
    throw new Error(`Para una base operativa usa --allow-operational-db ${options.requiredConfirmation}.`);
  }

  return resolved;
}

module.exports = { resolveDatabaseTarget };
