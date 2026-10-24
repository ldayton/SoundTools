// Built into sw.js with the deployment's base path and complete asset inventory.
export function offlineWorker(config: {
  shell: string;
  sounds: string;
  files: string[];
  base: string;
}) {
  return (
    `const CONFIG = ${JSON.stringify(config)};\n` +
    String.raw`
const ROOT = CONFIG.base;
const inventories = new Map();
const META = 'dorego-clients-v1';
const manifestURL = ROOT + 'offline-pack.json';
const metadataURL = id => new URL(ROOT + '__offline_client__/' + id, self.location.origin).href;
const shellName = name => typeof name === 'string' && name.startsWith('dorego-shell-');
const soundName = name => typeof name === 'string' && name.startsWith('dorego-sounds-');
async function clientVersion(id) {
  if (!id) return null;
  try {
    const entry = await (await caches.open(META)).match(metadataURL(id));
    return entry ? entry.json() : null;
  } catch { return null; }
}
async function remember(id, version) {
  if (!id || !shellName(version.shellCache) || !soundName(version.cache)) return;
  try {
    await (await caches.open(META)).put(metadataURL(id), new Response(JSON.stringify({ shellCache: version.shellCache, cache: version.cache, savedAt: Date.now() })));
  } catch { /* Storage pressure must not prevent online navigation or playback. */ }
}
async function inventory(name) {
  if (inventories.has(name)) return inventories.get(name);
  const response = await (await caches.open(name)).match(manifestURL);
  if (!response?.ok) return null;
  const pack = await response.json();
  inventories.set(name, pack);
  return pack;
}
async function cachedVersion(id) {
  const known = await clientVersion(id);
  if (known) {
    const pack = await inventory(known.shellCache);
    if (pack) return pack;
  }
  // A manifest is only committed after the whole interface has been cached.
  const names = (await caches.keys()).filter(shellName).reverse();
  for (const name of names) {
    const pack = await inventory(name);
    if (pack) return pack;
  }
  return null;
}
async function cleanup() {
  const live = (await self.clients.matchAll({ type: 'window', includeUncontrolled: true }))
    .filter(client => new URL(client.url).pathname.startsWith(ROOT));
  if (self.registration.installing || self.registration.waiting) return;
  const keep = new Set([CONFIG.shell, CONFIG.sounds]);
  const meta = await caches.open(META);
  const entries = await meta.keys();
  // Protect navigations still preparing a document, including across worker activation.
  for (const request of entries) {
    const response = await meta.match(request);
    if (!response) continue;
    const record = await response.json();
    if (Date.now() - record.savedAt < 600000) { keep.add(record.shellCache); keep.add(record.cache); }
  }
  for (const client of live) {
    const version = await clientVersion(client.id);
    // Older releases cannot report their version. Preserve their caches until they close.
    if (!version) return;
    keep.add(version.shellCache);
    keep.add(version.cache);
  }
  for (const name of await caches.keys()) {
    if ((shellName(name) || soundName(name)) && !keep.has(name)) { await caches.delete(name); inventories.delete(name); }
  }
  const ids = new Set(live.map(client => metadataURL(client.id)));
  for (const request of entries) {
    const response = await meta.match(request);
    if (!response) continue;
    const record = await response.json();
    if (!ids.has(request.url) && Date.now() - record.savedAt >= 600000) await meta.delete(request);
  }
}
self.addEventListener('install', event => event.waitUntil((async () => {
  const cache = await caches.open(CONFIG.shell);
  await cache.addAll(CONFIG.files.map(url => new Request(url, { cache: 'reload' })));
  await self.skipWaiting();
})()));
self.addEventListener('activate', event => event.waitUntil((async () => {
  // Claiming requests does not reload documents or touch their audio contexts.
  await self.clients.claim();
  // Cleanup happens after clients report their versions, not during activation.
})()));
self.addEventListener('message', event => {
  if (event.data?.type !== 'using-cache' || !event.source?.id) return;
  event.waitUntil((async () => {
    await remember(event.source.id, event.data);
    await cleanup();
  })());
});
async function savedDocument(pack) {
  const cache = await caches.open(pack.shellCache);
  if (!(await Promise.all(pack.shell.map(url => cache.match(url)))).every(item => item?.ok)) return null;
  const html = await cache.match(ROOT);
    if (!html?.ok) return null;
    // Reject an inconsistent deployment (new HTML with a different asset inventory).
    const text = await html.clone().text();
    for (const match of text.matchAll(/\b(?:src|href)=["']([^"']+)["']/g)) {
      const path = new URL(match[1], self.location.origin + ROOT).pathname;
      if (path.startsWith(ROOT + 'assets/') && !pack.shell.includes(path))
        return null;
    }
  return html;
}
async function navigation(event) {
  let pack;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    // Revalidate the tiny inventory instead of redownloading the sound bank.
    const response = await fetch(manifestURL, { cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw new Error('No update inventory');
    pack = await response.json();
    if (!shellName(pack.shellCache) || !soundName(pack.cache)) throw new Error('Invalid inventory');
    await remember(event.resultingClientId, pack);
    const cache = await caches.open(pack.shellCache);
    const present = await Promise.all(pack.shell.map(url => cache.match(url)));
    if (!present.every(item => item?.ok)) {
      // addAll commits the interface together; a failed download keeps the old version usable.
      await cache.addAll(pack.shell.map(url => new Request(url, { cache: 'reload', signal: controller.signal })));
    }
    const html = await savedDocument(pack);
    if (!html) throw new Error('Incomplete or inconsistent update');
    await remember(event.resultingClientId, pack);
    return html;
  } catch {
    const known = await clientVersion(event.clientId);
    const names = [...new Set([known?.shellCache, ...(await caches.keys()).filter(shellName).reverse()])].filter(Boolean);
    for (const name of names) {
      const saved = await inventory(name);
      const html = saved && await savedDocument(saved);
      if (html) {
        await remember(event.resultingClientId, saved);
        return html;
      }
    }
    return fetch(event.request);
  } finally { clearTimeout(timer); }
}
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith(ROOT)) return;
  if (request.mode === 'navigate' && (url.pathname === ROOT || url.pathname === ROOT + 'index.html')) {
    event.respondWith(navigation(event));
    return;
  }
  event.respondWith((async () => {
    const pack = await cachedVersion(event.clientId);
    if (pack?.files.some(file => file.url === url.pathname)) {
      const cache = await caches.open(pack.cache);
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) {
        try { await cache.put(request, response.clone()); } catch { /* Playback survives full storage. */ }
      }
      return response;
    }
    if (pack?.shell.includes(url.pathname)) {
      const cached = await (await caches.open(pack.shellCache)).match(url.pathname);
      if (cached) return cached;
    }
    // Hashed assets are immutable. Old live tabs can still request their own version.
    if (url.pathname.startsWith(ROOT + 'assets/')) {
      for (const name of (await caches.keys()).filter(shellName)) {
        const cached = await (await caches.open(name)).match(request);
        if (cached) return cached;
      }
    }
    return fetch(request);
  })());
});
`
  );
}
