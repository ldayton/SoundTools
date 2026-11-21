// Local integration readiness, not assertion retries. A subscribed websocket
// does not imply that Realtime's separate database broadcast stream is ready.
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitForRealtimeReplication(env, { request = fetch, wait = sleep, now = Date.now, timeout = 20000 } = {}) {
  const base = new URL(env.API_URL);
  if (base.protocol !== 'http:' || base.hostname !== '127.0.0.1') throw Error('Realtime readiness only supports the local test backend');
  const url = new URL('/realtime/v1/api/tenants/realtime-dev/health', base);
  const deadline = now() + timeout;
  let last;
  while (true) {
    const response = await request(url, {
      headers: { apikey: env.PUBLISHABLE_KEY, Authorization: `Bearer ${env.SERVICE_ROLE_KEY}` },
      signal: AbortSignal.timeout(Math.max(1, Math.min(2000, deadline - now()))),
    });
    if (!response.ok) throw Error(`Local Realtime health returned HTTP ${response.status}`);
    const { data } = await response.json();
    last = { healthy: data?.healthy, db_connected: data?.db_connected, replication_connected: data?.replication_connected };
    if (last.healthy === true && last.db_connected === true && last.replication_connected === true) return;
    if (now() >= deadline) throw Error(`Local Realtime replication did not become ready: ${JSON.stringify(last)}`);
    await wait(Math.min(100, deadline - now()));
  }
}
module.exports = { waitForRealtimeReplication };
