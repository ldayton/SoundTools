import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isOfflineWorkerFetchError } from './offline-errors';

test('only WebKit transport errors for the exact offline worker are expected', () => {
  const url = 'http://127.0.0.1:4325/DoReGo/sw.js';
  const error = { message: '/127.0.0.1:4325/DoReGo/sw.js due to access control checks.', stack: '' };
  assert.equal(isOfflineWorkerFetchError(error, 'webkit', true, url), true);
  for (const [candidate, browser, offline, worker] of [
    [error, 'webkit', false, url],
    [error, 'chromium', true, url],
    [{ ...error, stack: 'at checkUpdate (offline.ts:392)' }, 'webkit', true, url],
    [{ ...error, message: 'Unhandled rejection' }, 'webkit', true, url],
    [error, 'webkit', true, url.replace('4325', '4326')],
    [error, 'webkit', true, url.replace('sw.js', 'main.js')],
  ] as const)
    assert.equal(isOfflineWorkerFetchError(candidate, browser, offline, worker), false);
});
