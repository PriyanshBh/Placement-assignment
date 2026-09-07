const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

module.exports = {
  port: Number(process.env.PORT || 4000),
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/policy_pulse',
  cpuThreshold: Number(process.env.CPU_THRESHOLD || 70),
  cpuSampleIntervalMs: Number(process.env.CPU_SAMPLE_INTERVAL_MS || 5000),
  cpuConsecutiveSamples: Number(process.env.CPU_CONSECUTIVE_SAMPLES || 3),
  cpuMonitorEnabled: process.env.CPU_MONITOR_ENABLED !== 'false',
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB || 15),
  timezone: process.env.TZ || 'Asia/Kolkata',
  uploadDir: path.join(__dirname, '..', 'uploads')
};
