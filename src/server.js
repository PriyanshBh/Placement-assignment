const fs = require('fs/promises');
const config = require('./config');
const { connectDatabase, disconnectDatabase } = require('./db');
const { createApp } = require('./app');
const { startScheduler } = require('./services/scheduler');
const { startCpuMonitor } = require('./services/cpu-monitor');

let server;
let stopScheduler = () => {};
let stopCpuMonitor = () => {};
let shuttingDown = false;

async function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  stopCpuMonitor();
  stopScheduler();
  if (server) await new Promise((resolve) => server.close(resolve));
  await disconnectDatabase().catch(() => {});
  process.exit(code);
}

async function start() {
  await fs.mkdir(config.uploadDir, { recursive: true });
  await connectDatabase(config.mongoUri);
  const app = createApp();
  server = app.listen(config.port, () => {
    console.log(`\n  PolicyPulse is ready at http://localhost:${config.port}`);
    console.log(`  MongoDB connected: ${config.mongoUri.replace(/:\/\/.*@/, '://***@')}\n`);
  });
  stopScheduler = startScheduler();
  stopCpuMonitor = startCpuMonitor({
    threshold: config.cpuThreshold,
    intervalMs: config.cpuSampleIntervalMs,
    consecutiveSamples: config.cpuConsecutiveSamples,
    enabled: config.cpuMonitorEnabled,
    onThreshold: (cpu) => {
      console.warn(`CPU remained at ${cpu}% or above the ${config.cpuThreshold}% threshold. Requesting a supervised restart.`);
      shutdown(75);
    }
  });
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
process.on('uncaughtException', (error) => { console.error(error); shutdown(1); });
process.on('unhandledRejection', (error) => { console.error(error); shutdown(1); });

if (require.main === module) start().catch((error) => { console.error(`Startup failed: ${error.message}`); process.exit(1); });

module.exports = { start, shutdown };
