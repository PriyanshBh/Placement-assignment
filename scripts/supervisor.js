const { spawn } = require('child_process');
const path = require('path');

let child;
let stopping = false;
let restartCount = 0;

function launch() {
  child = spawn(process.execPath, [path.join(__dirname, '..', 'src', 'server.js')], {
    stdio: 'inherit',
    env: { ...process.env, POLICY_PULSE_RESTART_COUNT: String(restartCount) }
  });
  child.on('exit', (code, signal) => {
    if (stopping) process.exit(code || 0);
    restartCount += 1;
    const reason = code === 75 ? 'CPU safety threshold' : `unexpected exit (${code ?? signal})`;
    console.log(`\n  Supervisor: restarting after ${reason}...\n`);
    setTimeout(launch, 1200);
  });
}

function stop(signal) {
  stopping = true;
  if (child) child.kill(signal);
  else process.exit(0);
}

process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));
launch();
