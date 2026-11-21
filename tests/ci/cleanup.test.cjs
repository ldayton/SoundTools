const { test } = require('node:test');
const assert = require('node:assert/strict');
const { stopOwnedBackends } = require('../../scripts/ci/cleanup.cjs');

test('owned backend stops overlap, preserve failure ownership, and ignore unstarted stacks', async () => {
  const started = [], releases = [];
  const stopping = stopOwnedBackends({
    created: ['shared', 'accounts-chromium', 'accounts-webkit', 'accounts-unstarted', 'accounts-unallocated'],
    backends: { 'accounts-chromium': { PORT: '56001' }, 'accounts-webkit': { PORT: '56005' }, 'accounts-unstarted': {} },
    starts: new Set(['accounts-chromium:backend', 'accounts-webkit:backend', 'accounts-unallocated:backend']),
    directories: { 'accounts-chromium': '/isolated/chromium', 'accounts-webkit': '/isolated/webkit' },
    execute(task, options) {
      started.push({ task, options });
      return new Promise((resolve, reject) => releases.push({ resolve, reject }));
    },
  });
  // Both starts must be observable before either promise is allowed to finish.
  assert.equal(started.length, 2);
  assert.deepEqual(started.map(({ task }) => task.cwd), ['/isolated/chromium', '/isolated/webkit']);
  assert.deepEqual(started.map(({ task }) => task.env.PORT), ['56001', '56005']);
  assert(started.every(({ options }) => options.directory.endsWith('/work/ci-private')));
  releases[0].reject(Error('stop failed'));
  releases[1].resolve({ exitCode: 0, timedOut: false });
  assert.deepEqual(await stopping, [
    { name: 'accounts-chromium', exitCode: null, timedOut: false, error: 'stop failed' },
    { name: 'accounts-webkit', exitCode: 0, timedOut: false },
  ]);
});
