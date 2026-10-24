// Keep this factory self-contained: the build embeds its source in each service worker.
function createRuntime(env, base) {
  let maintenance = Promise.resolve();
  const inflight = new Map();
  const graceMs = 10 * 60 * 1000;
  function serialize(action) {
    const task = maintenance.then(action, action);
    maintenance = task.catch(() => {});
    return task;
  }
  function requestURL(request) {
    const url = new URL(request.url);
    return request.method === 'GET' && url.origin === env.location.origin && url.pathname.startsWith(base) ? url : null;
  }
  function jsonStore(cacheName, keyURL) {
    return {
      async read(key) {
        const response = await (await env.caches.open(cacheName)).match(keyURL(key));
        return response ? response.json() : null;
      },
      async write(key, value) {
        await (await env.caches.open(cacheName)).put(keyURL(key), new Response(JSON.stringify(value)));
      }
    };
  }
  async function withDeadline(ms, action) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    try { return await action(controller.signal); }
    finally { clearTimeout(timer); }
  }
  async function complete(cacheName, files) {
    const cache = await env.caches.open(cacheName);
    return (await Promise.all(files.map(url => cache.match(url)))).every(response => response?.ok);
  }
  async function stageAssets(cacheName, files, { signal, atomic = false } = {}) {
    const cache = await env.caches.open(cacheName);
    if (atomic) {
      if (!await complete(cacheName, files.map(file => file.url)))
        await cache.addAll(files.map(file => new Request(file.url, { cache: 'reload', signal })));
      return;
    }
    // Drain every write before rejecting: cleanup/retry must never race late cache writes.
    const results = await Promise.allSettled(files.map(async file => {
      if ((await cache.match(file.url))?.ok) return;
      const response = await env.fetch(new Request(file.url, { cache: 'reload', signal }));
      if (!response.ok) throw Error('Incomplete release: ' + file.url);
      if (file.sha256) {
        const bytes = await response.clone().arrayBuffer();
        const hash = Array.from(new Uint8Array(await env.crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join('');
        if (hash !== file.sha256) throw Error('Release integrity mismatch');
      }
      await cache.put(file.url, response);
    }));
    const failure = results.find(result => result.status === 'rejected');
    if (failure) throw failure.reason;
  }
  async function publish(id, prepare) {
    if (inflight.has(id)) return inflight.get(id);
    // Adapter commits its manifest only after all assets and document checks succeed.
    const task = serialize(prepare);
    inflight.set(id, task);
    try { return await task; }
    finally { inflight.delete(id); }
  }
  function cleanup(action) {
    return serialize(async () => {
      if (inflight.size || env.registration.installing || env.registration.waiting) return;
      await action();
    });
  }
  async function protectedClients(initial, versionsFor) {
    const live = (await env.clients.matchAll({ type: 'window', includeUncontrolled: true }))
      .filter(client => new URL(client.url).pathname.startsWith(base));
    const keep = new Set(initial);
    for (const client of live) {
      const versions = await versionsFor(client.id);
      // Legacy/unknown tabs could still need any prior release. Do not guess.
      if (!versions) return null;
      for (const version of versions) keep.add(version);
    }
    return { live, keep };
  }
  function recent(savedAt, now = Date.now()) {
    return Number.isFinite(savedAt) && now - savedAt < graceMs;
  }
  async function navigate(event, adapter) {
    async function select(pack) {
      if (!pack) return null;
      const response = await adapter.document(pack);
      if (!response?.ok) return null;
      await adapter.remember(event.resultingClientId, pack);
      return response;
    }
    try {
      const response = await select(await adapter.latest());
      if (response) return response;
    } catch { /* A failed or incomplete deployment must leave complete cached releases usable. */ }
    for (const id of await adapter.candidates()) {
      try {
        const response = await select(await adapter.load(id));
        if (response) return response;
      } catch { /* A corrupt old cache must not hide another valid fallback. */ }
    }
    return env.fetch(event.request);
  }
  function lifecycle(prepare) {
    env.addEventListener('install', event => event.waitUntil((async () => {
      await prepare();
      await env.skipWaiting();
    })()));
    // Claim requests only: never reload a document or touch an audio context.
    env.addEventListener('activate', event => event.waitUntil(env.clients.claim()));
  }
  return { requestURL, jsonStore, withDeadline, complete, stageAssets, publish, cleanup, protectedClients, recent, navigate, lifecycle };
}
module.exports = { createRuntime };
