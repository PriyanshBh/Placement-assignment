const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs/promises');
const mongoose = require('mongoose');
const config = require('./config');
const { connectDatabase } = require('./db');
const api = require('./routes/api');

let connectionPromise;

async function ensureDatabase(_req, res, next) {
  if (mongoose.connection.readyState === 1) return next();
  try {
    await fs.mkdir(config.uploadDir, { recursive: true });
    if (!connectionPromise) {
      connectionPromise = connectDatabase(config.mongoUri).catch((error) => {
        connectionPromise = null;
        throw error;
      });
    }
    await connectionPromise;
    return next();
  } catch (error) {
    console.error(`Database connection failed: ${error.message}`);
    return res.status(503).json({
      success: false,
      message: 'The database is temporarily unavailable. Check the deployment MONGODB_URI.'
    });
  }
}

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors());
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(morgan(process.env.NODE_ENV === 'test' ? 'tiny' : 'dev'));
  app.use('/api', ensureDatabase, api);
  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.get('*splat', (_req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));
  app.use((error, _req, res, _next) => {
    console.error(error);
    const status = error.name === 'MulterError' || error.message.includes('Only .xlsx') ? 400 : 500;
    res.status(status).json({ success: false, message: error.message || 'Unexpected server error.', details: error.details || undefined });
  });
  return app;
}

const app = createApp();

// Vercel requires the CommonJS default export itself to be the Express handler.
// Keeping createApp as a property preserves isolated app construction in tests.
module.exports = app;
module.exports.createApp = createApp;
module.exports.ensureDatabase = ensureDatabase;
