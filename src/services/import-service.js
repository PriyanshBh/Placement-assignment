const { Worker } = require('worker_threads');
const workerPath = require.resolve('../workers/import-worker.js');

function runImport(filePath, extension, mongoUri) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerPath, {
      workerData: { filePath, extension, mongoUri }
    });
    let settled = false;
    worker.on('message', (message) => {
      if (message.type === 'complete') {
        settled = true;
        resolve(message.result);
      }
      if (message.type === 'error') {
        settled = true;
        const error = new Error(message.error);
        error.details = message.details;
        reject(error);
      }
    });
    worker.on('error', reject);
    worker.on('exit', (code) => {
      if (!settled && code !== 0) reject(new Error(`Import worker exited with code ${code}.`));
    });
  });
}

module.exports = { runImport };
