const express = require('express');
const cors = require('cors');
const path = require('path');

const { DB_PATH, initializeDatabase } = require('./db');
const guardiasRouter = require('./routes/guardias');
const bibliotecaRouter = require('./routes/biblioteca');
const historialRouter = require('./routes/historial');
const profesoradoRouter = require('./routes/profesorado');
const reportRouter = require('./routes/report');
const exportRouter = require('./routes/export');
const authRouter = require('./routes/auth');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..')));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, dbPath: DB_PATH });
});

app.use('/api/guardias', guardiasRouter);
app.use('/api/biblioteca', bibliotecaRouter);
app.use('/api/historial', historialRouter);
app.use('/api/profesorado', profesoradoRouter);
app.use('/api/report', reportRouter);
app.use('/api/export', exportRouter);
app.use('/api/auth', authRouter);

app.get('/', (_req, res) => {
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
