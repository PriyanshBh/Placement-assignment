const path = require('path');
const os = require('os');
require('dotenv').config({
  path: path.join(__dirname, '..', '.env'),
  quiet: process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL || process.env.RENDER)
});

const isServerless = Boolean(process.env.VERCEL);

module.exports = {
  port: Number(process.env.PORT || 4000),
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/policy_pulse',
  cpuThreshold: Number(process.env.CPU_THRESHOLD || 70),
  cpuSampleIntervalMs: Number(process.env.CPU_SAMPLE_INTERVAL_MS || 5000),
  cpuConsecutiveSamples: Number(process.env.CPU_CONSECUTIVE_SAMPLES || 3),
  cpuMonitorEnabled: process.env.CPU_MONITOR_ENABLED !== 'false',
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB || 15),
  timezone: process.env.TZ || 'Asia/Kolkata',
  isServerless,
  uploadDir: isServerless ? path.join(os.tmpdir(), 'policy-pulse-uploads') : path.join(__dirname, '..', 'uploads')
};
