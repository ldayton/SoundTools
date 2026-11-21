const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { trackServiceWorkers } = require('../../scripts/ci/service-workers.cjs');
test('partial CDP updates retain the active worker and replace changed lifecycle state', async () => {
  const cdp = new EventEmitter(), workers = trackServiceWorkers(cdp);
  const emit = versions => cdp.emit('ServiceWorker.workerVersionUpdated', { versions });
  emit([{ versionId: 'current', scriptURL: 'https://app/sw.js', status: 'activated', runningStatus: 'running' }]);
  emit([{ versionId: 'old', scriptURL: 'https://app/sw.js', status: 'redundant', runningStatus: 'stopped' }]);
  assert.equal((await workers.active('https://app/sw.js')).versionId, 'current');
  emit([{ versionId: 'current', scriptURL: 'https://app/sw.js', status: 'redundant', runningStatus: 'stopped' }]);
  const next = workers.active('https://app/sw.js');
  emit([{ versionId: 'next', scriptURL: 'https://app/sw.js', status: 'activated', runningStatus: 'stopped' }]);
  emit([{ versionId: 'next', scriptURL: 'https://app/sw.js', status: 'activated', runningStatus: 'running' }]);
  assert.equal((await next).versionId, 'next');
  workers.dispose();
  assert.equal(cdp.listenerCount('ServiceWorker.workerVersionUpdated'), 0);
});
