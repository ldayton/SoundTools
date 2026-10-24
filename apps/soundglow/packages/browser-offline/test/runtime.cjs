const { test } = require('node:test');
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const vm = require('node:vm');
const { createRuntime, workerSource } = require('../index.cjs');
function fixture() {
  const stores = new Map(), handlers = {};
  const env = {
    location: { origin: 'https://example.test' }, registration: {}, crypto: webcrypto,
    clients: { matchAll: async () => [], claim: async () => {} },
    caches: { open: async name => {
      if (!stores.has(name)) stores.set(name, new Map());
      const data = stores.get(name);
      return { match: async key => data.get(typeof key === 'string' ? key : key.url)?.clone(),
        put: async (key, value) => data.set(key, value.clone()),
        addAll: async requests => {
          const responses = await Promise.all(requests.map(r => env.fetch(r)));
          if (!responses.every(r => r.ok)) throw Error('Incomplete atomic batch');
          requests.forEach((r, i) => data.set(r.url, responses[i]));
        } };
    } },
    fetch: async () => new Response('ok'),
    addEventListener: (type, fn) => handlers[type] = fn,
    skipWaiting: async () => {},
  };
  return { env, stores, handlers, runtime: createRuntime(env, '/app/') };
}
test('generated worker runtime executes without module imports or outer dependencies', () => {
  const { env } = fixture();
  const runtime = vm.runInNewContext(workerSource() + 'offline', { self: env, CONFIG: { base: '/app/' }, URL, Request, Response, AbortController, setTimeout, clearTimeout });
  assert.equal(typeof runtime.navigate, 'function');
  assert.equal(runtime.requestURL(new Request('https://example.test/other/')), null);
  assert.equal(runtime.requestURL(new Request('https://other.test/app/')), null);
  assert.equal(runtime.requestURL(new Request('https://example.test/app/', { method: 'POST' })), null);
  assert.equal(runtime.requestURL(new Request('https://example.test/app/a')).pathname, '/app/a');
});
test('concurrent staging deduplicates; failures drain writes and retry safely', async () => {
  const { runtime, env, stores } = fixture();
  let release, calls = 0;
  const gate = new Promise(resolve => release = resolve);
  env.fetch = async request => { calls++; if (request.url.endsWith('bad')) return new Response('', { status: 503 }); await gate; return new Response('ok'); };
  const prepare = () => runtime.stageAssets('assets', [{ url: 'https://example.test/app/good' }, { url: 'https://example.test/app/bad' }]);
  let finished = false;
  const a = runtime.publish('v1', prepare).catch(() => finished = true);
  const b = runtime.publish('v1', prepare).catch(() => {});
  await new Promise(r => setTimeout(r, 5));
  assert.equal(calls, 2); assert.equal(finished, false);
  release(); await Promise.all([a, b]);
  env.fetch = async () => new Response('ok');
  await runtime.publish('v1', prepare);
  assert.equal(stores.get('assets').size, 2);
});
test('bad hashes and incomplete atomic batches never publish release metadata', async () => {
  const { runtime, env, stores } = fixture();
  let committed = false;
  await assert.rejects(runtime.publish('bad', async () => {
    await runtime.stageAssets('assets', [{ url: 'https://example.test/app/a', sha256: '0'.repeat(64) }]); committed = true;
  }), /integrity/);
  assert.equal(committed, false); assert.equal(stores.get('assets').size, 0);
  env.fetch = async r => new Response('', { status: r.url.endsWith('b') ? 503 : 200 });
  await assert.rejects(runtime.stageAssets('shell', ['a', 'b'].map(s => ({ url: 'https://example.test/app/' + s })), { atomic: true }));
  assert.equal(stores.get('shell').size, 0);
});
test('cleanup waits for writes; unknown scoped tabs prevent eviction; grace is bounded', async () => {
  const { runtime, env } = fixture();
  let release, cleaned = false;
  const task = runtime.publish('v1', () => new Promise(resolve => release = resolve));
  const cleanup = runtime.cleanup(async () => cleaned = true);
  await new Promise(r => setTimeout(r, 5)); assert.equal(cleaned, false);
  release(); await task; await cleanup; assert.equal(cleaned, true);
  env.clients.matchAll = async () => [{ id: 'old', url: 'https://example.test/app/' }, { id: 'outside', url: 'https://example.test/other/' }];
  assert.equal(await runtime.protectedClients(['v2'], async () => null), null);
  const state = await runtime.protectedClients(['v2'], async id => id === 'old' ? ['v1'] : null);
  assert.deepEqual([...state.keep], ['v2', 'v1']); assert.equal(state.live.length, 1);
  assert.equal(runtime.recent(0, 600000), false); assert.equal(runtime.recent(1, 600000), true);
});
test('navigation skips partial/corrupt candidates and pins the chosen complete fallback', async () => {
  const { runtime } = fixture(); let remembered;
  const response = await runtime.navigate({ request: new Request('https://example.test/app/'), resultingClientId: 'new' }, {
    latest: async () => { throw Error('offline'); }, candidates: async () => ['corrupt', 'partial', 'valid'],
    load: async id => { if (id === 'corrupt') throw Error('broken JSON'); return { id }; },
    document: async p => p.id === 'valid' ? new Response('v1') : null,
    remember: async (id, pack) => remembered = [id, pack.id]
  });
  assert.equal(await response.text(), 'v1'); assert.deepEqual(remembered, ['new', 'valid']);
});
test('deadline aborts fetches and failed install never activates an incomplete release', async () => {
  const { runtime, handlers, env } = fixture(); let skipped = false;
  await assert.rejects(runtime.withDeadline(5, signal => new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason)))));
  env.skipWaiting = async () => skipped = true;
  runtime.lifecycle(async () => { throw Error('missing file'); });
  let task; handlers.install({ waitUntil: promise => task = promise });
  await assert.rejects(task); assert.equal(skipped, false);
});
