const os = require('os');

const health = {
  cpuPercent: 0,
  threshold: 70,
  consecutiveHighSamples: 0,
  restartCount: Number(process.env.POLICY_PULSE_RESTART_COUNT || 0),
  startedAt: new Date().toISOString(),
  monitoring: false
};

function startCpuMonitor({ threshold, intervalMs, consecutiveSamples, enabled, onThreshold }) {
  health.threshold = threshold;
  health.monitoring = enabled;
  if (!enabled) return () => {};

  let previousUsage = process.cpuUsage();
  let previousTime = process.hrtime.bigint();
  const timer = setInterval(() => {
    const now = process.hrtime.bigint();
    const usage = process.cpuUsage(previousUsage);
    const elapsedMicros = Number(now - previousTime) / 1000;
    previousUsage = process.cpuUsage();
    previousTime = now;
    const usedMicros = usage.user + usage.system;
    health.cpuPercent = Number(Math.min(100, (usedMicros / elapsedMicros) * 100).toFixed(1));
    health.consecutiveHighSamples = health.cpuPercent >= threshold ? health.consecutiveHighSamples + 1 : 0;
    if (health.consecutiveHighSamples >= consecutiveSamples) onThreshold(health.cpuPercent);
  }, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}

function systemSnapshot() {
  const memory = process.memoryUsage();
  return {
    ...health,
    pid: process.pid,
    uptimeSeconds: Math.floor(process.uptime()),
    memoryMb: Number((memory.rss / 1024 / 1024).toFixed(1)),
    platform: `${os.platform()} ${os.arch()}`,
    nodeVersion: process.version
  };
}

module.exports = { startCpuMonitor, systemSnapshot };
