const { test } = require('node:test');
const assert = require('node:assert/strict');
const { waitForRealtimeReplication } = require('../../scripts/ci/realtime.cjs');
const env = { API_URL: 'http://127.0.0.1:54321', PUBLISHABLE_KEY: 'local-public', SERVICE_ROLE_KEY: 'local-test-secret' };
test('a healthy database and subscribed websocket cannot bypass broadcast replication readiness', async () => {
  let time = 0, probes = 0;
  const states = [false, false, true];
  await waitForRealtimeReplication(env, {
    now: () => time,
    wait: async ms => { time += ms; },
    request: async (url, options) => {
      assert.equal(String(url), env.API_URL + '/realtime/v1/api/tenants/realtime-dev/health');
      assert.equal(options.headers.Authorization, 'Bearer local-test-secret');
      return { ok: true, json: async () => ({ data: { healthy: true, db_connected: true, replication_connected: states[probes++] } }) };
    },
  });
  assert.equal(probes, 3);
});
test('missing replication fails with bounded state evidence and never retries application writes', async () => {
  let time = 0;
  await assert.rejects(waitForRealtimeReplication(env, {
    timeout: 200, now: () => time, wait: async ms => { time += ms; },
    request: async () => ({ ok: true, json: async () => ({ data: { healthy: true, db_connected: true, replication_connected: false } }) }),
  }), /replication did not become ready.*"replication_connected":false/);
  assert.equal(time, 200);
});
test('readiness cannot contact a non-local backend or hide authentication failures', async () => {
  await assert.rejects(waitForRealtimeReplication({ ...env, API_URL: 'https://example.com' }, { request: () => { throw Error('must not request'); } }), /only supports the local/);
  await assert.rejects(waitForRealtimeReplication(env, { request: async () => ({ ok: false, status: 403 }) }), /HTTP 403/);
});
