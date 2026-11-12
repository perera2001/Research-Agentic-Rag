const express = require('express');
const cors = require('cors');
const { checkDatabaseConnection } = require('./config/db');
const authRoutes = require('./modules/auth/auth.routes');
const documentRoutes = require('./modules/documents/documents.routes');

const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', async (_req, res) => {
  try {
    await checkDatabaseConnection();
    res.json({
      status: 'ok',
      service: 'ResearchMind Node.js Backend',
      backend: 'ok',
      database: 'connected',
    });
  } catch (_error) {
    res.status(503).json({
      status: 'error',
      service: 'ResearchMind Node.js Backend',
      backend: 'ok',
      database: 'unavailable',
    });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/documents', documentRoutes);

app.use((_req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

app.use((error, _req, res, _next) => {
  const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 500
    ? error.status
    : 500;

  res.status(status).json({
    error: status === 500 ? 'Internal Server Error' : 'Bad Request',
  });
});

module.exports = app;
