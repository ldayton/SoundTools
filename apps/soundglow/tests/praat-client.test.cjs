const test = require('node:test');
const assert = require('node:assert/strict');
const { PraatClient } = require('../dist/vendor/praat/client.js');

test('worker errors reject their request once and stale load failures cannot interrupt a new worker', async () => {
  const workers = [];
  class Worker {
    constructor() { workers.push(this); }
    postMessage() {}
    terminate() { this.terminated = true; }
  }
  const client = new PraatClient({ WorkerType: Worker });
  let prevented = 0;
  const error = { message: 'Processor failed to load', preventDefault() { prevented++; } };
  try {
    const first = client.init();
    workers[0].onerror(error);
    await assert.rejects(first, e => e.code === 'WORKER_ERROR' && e.message === error.message);
    assert.equal(workers[0].terminated, true);
    assert.equal(prevented, 1, 'the handled failure must not also become a global uncaught error');

    const second = client.init();
    workers[0].onerror(error);
    assert.equal(prevented, 2, 'late errors from the terminated worker are also handled');
    assert.equal(client.worker, workers[1]);
    assert.equal(workers[1].terminated, undefined);
    workers[1].onmessage({ data: { id: client.sequence, ready: true } });
    assert.equal((await second).ready, true);
  } finally {
    client.dispose();
  }
});
