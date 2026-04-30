const express = require('express');
const cors = require('cors');
const path = require('path');

const { ensureWeeklyResetIfNeeded, initializeDatabase } = require('./db');
const { rejectWritesDuringRestore } = require('./maintenance');
const { getSessionSecret } = require('./session');
const { requestTelemetryMiddleware } = require('./telemetry');
const guardiasRouter = require('./routes/guardias');
const bibliotecaRouter = require('./routes/biblioteca');
const historialRouter = require('./routes/historial');
const profesoradoRouter = require('./routes/profesorado');
const reportRouter = require('./routes/report');
const exportRouter = require('./routes/export');
const authRouter = require('./routes/auth');
const avisosRouter = require('./routes/avisos');

const app = express();
const PORT = process.env.PORT || 3000;
const TRUST_PROXY = (process.env.GUARDIAS_TRUST_PROXY || '').trim();
const CORS_ORIGINS = String(process.env.GUARDIAS_CORS_ORIGINS || '')
  .split(',')
  .map(value => value.trim())
  .filter(Boolean);

function configureTrustProxy(value) {
  if (!value) return;
  if (value === 'true') {
    app.set('trust proxy', true);
    return;
  }
  if (value === 'false') {
    app.set('trust proxy', false);
    return;
  }
  const numeric = Number(value);
  app.set('trust proxy', Number.isInteger(numeric) ? numeric : value);
}

function createCorsOptions() {
  if (!CORS_ORIGINS.length) {
    return {
      origin: false
    };
  }

  const allowedOrigins = new Set(CORS_ORIGINS);
  return {
    credentials: true,
    origin(origin, callback) {
      if (!origin) {
        return callback(null, true);
      }
      if (allowedOrigins.has(origin)) {
        return callback(null, true);
      }
      return callback(null, false);
    }
  };
}

function isBlockedStaticRequest(req) {
  if (!['GET', 'HEAD'].includes(req.method)) return false;
  const pathname = decodeURIComponent((req.path || '').replace(/\\/g, '/'));
  const lowerPath = pathname.toLowerCase();
  const firstSegment = lowerPath.split('/').filter(Boolean)[0] || '';
  if (!firstSegment) return false;
  if (firstSegment.startsWith('.')) return true;
  if (['server', 'deploy', 'bd', 'json_profes', 'node_modules'].includes(firstSegment)) return true;
  return [
    '/package.json',
    '/package-lock.json',
    '/readme.md',
    '/start-local.ps1',
    '/start-local.cmd',
    '/.env',
    '/.env.example',
    '/.env.local.ps1',
    '/.env.local.cmd',
    '/.gitignore'
  ].includes(lowerPath);
}

function applySecurityHeaders(req, res, next) {
  const isSecure = req.secure || String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase() === 'https';
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (isSecure) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
}

getSessionSecret();
configureTrustProxy(TRUST_PROXY);

app.disable('x-powered-by');
app.use(cors(createCorsOptions()));
app.use(applySecurityHeaders);
app.use(express.json({ limit: '5mb' }));
app.use(requestTelemetryMiddleware);
app.use('/api', rejectWritesDuringRestore);
app.use('/api', async (_req, _res, next) => {
  try {
    await ensureWeeklyResetIfNeeded();
    next();
  } catch (error) {
    next(error);
  }
});
app.use((req, res, next) => {
  if (isBlockedStaticRequest(req)) {
    return res.status(404).end();
  }
  next();
});
app.use(express.static(path.join(__dirname, '..'), {
  dotfiles: 'deny',
  index: false
}));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/api/guardias', guardiasRouter);
app.use('/api/biblioteca', bibliotecaRouter);
app.use('/api/historial', historialRouter);
app.use('/api/profesorado', profesoradoRouter);
app.use('/api/report', reportRouter);
app.use('/api/export', exportRouter);
app.use('/api/auth', authRouter);
app.use('/api/avisos', avisosRouter);

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'guardias.html'));
});

app.get('/tv', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'guardias.html'));
});

app.get('/print', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'guardias.html'));
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(error.status || 500).json({
    error: error.message || 'Internal server error',
    details: error.details || null
  });
});

initializeDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server listening on http://localhost:${PORT}`);
    });
  })
  .catch(error => {
    console.error('Failed to initialize database', error);
    process.exit(1);
  });
