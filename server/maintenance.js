let restoreInProgress = false;

function startRestore() {
  if (restoreInProgress) {
    const error = new Error('Ya hay una restauracion en curso.');
    error.status = 409;
    throw error;
  }
  restoreInProgress = true;
}

function finishRestore() {
  restoreInProgress = false;
}

function isRestoreInProgress() {
  return restoreInProgress;
}

function rejectWritesDuringRestore(req, res, next) {
  const method = String(req.method || '').toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return next();
  }
  if (!restoreInProgress) {
    return next();
  }
  return res.status(503).json({
    error: 'Restauracion en curso. Espera a que termine antes de enviar cambios.'
  });
}

module.exports = {
  finishRestore,
  isRestoreInProgress,
  rejectWritesDuringRestore,
  startRestore
};
