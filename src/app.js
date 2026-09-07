const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const path = require('path');
const api = require('./routes/api');

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors());
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(morgan(process.env.NODE_ENV === 'test' ? 'tiny' : 'dev'));
  app.use('/api', api);
  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.get('*splat', (_req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));
  app.use((error, _req, res, _next) => {
    console.error(error);
    const status = error.name === 'MulterError' || error.message.includes('Only .xlsx') ? 400 : 500;
    res.status(status).json({ success: false, message: error.message || 'Unexpected server error.', details: error.details || undefined });
  });
  return app;
}

module.exports = { createApp };
