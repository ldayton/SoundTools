import { workerSource } from '@ldayton/browser-offline';

// DoReGo adapter: separate interface generations and lazily downloaded sound banks.
export function offlineWorker(config: {
  shell: string;
  sounds: string;
  files: string[];
  base: string;
}) {
  return (
    `const CONFIG = ${JSON.stringify(config)};\n` +
    workerSource() +
    String.raw`
const ROOT = CONFIG.base;
const inventories = new Map();
const META = 'dorego-clients-v1';
const manifestURL = ROOT + 'offline-pack.json';
const metadataURL = id => new URL(ROOT + '__offline_client__/' + id, self.location.origin).href;
const metadata = offline.jsonStore(META, metadataURL);
const shellName = name => typeof name === 'string' && name.startsWith('dorego-shell-');
const soundName = name => typeof name === 'string' && name.startsWith('dorego-sounds-');
async function clientVersion(id) {
  if (!id) return null;
  try { return await metadata.read(id); } catch { return null; }
}
async function remember(id, version) {
  if (!id || !shellName(version.shellCache) || !soundName(version.cache)) return;
  try { await metadata.write(id, { shellCache: version.shellCache, cache: version.cache, savedAt: Date.now() }); }
  catch { /* Storage pressure must not prevent online navigation or playback. */ }
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
  if (known) { const pack = await inventory(known.shellCache); if (pack) return pack; }
  for (const name of (await caches.keys()).filter(shellName).reverse()) {
    const pack = await inventory(name);
    if (pack) return pack;
  }
  return null;
}
async function cleanup() { return offline.cleanup(async () => {
  const protectedState = await offline.protectedClients([CONFIG.shell, CONFIG.sounds], async id => {
    const version = await clientVersion(id);
    return version ? [version.shellCache, version.cache] : null;
  });
  if (!protectedState) return;
  const { live, keep } = protectedState;
  const meta = await caches.open(META), entries = await meta.keys();
  // Protect newly navigating clients even before the new document announces itself.
  for (const request of entries) {
    const response = await meta.match(request);
    if (!response) continue;
    const record = await response.json();
    if (offline.recent(record.savedAt)) { keep.add(record.shellCache); keep.add(record.cache); }
  }
  for (const name of await caches.keys()) {
    if ((shellName(name) || soundName(name)) && !keep.has(name)) { await caches.delete(name); inventories.delete(name); }
  }
  const ids = new Set(live.map(client => metadataURL(client.id)));
  for (const request of entries) {
    const response = await meta.match(request);
    if (!response) continue;
    const record = await response.json();
    if (!ids.has(request.url) && !offline.recent(record.savedAt)) await meta.delete(request);
  }
}); }
// Refresh the installation inventory even if a navigating old worker staged this cache.
offline.lifecycle(() => offline.publish(CONFIG.shell, async () => {
  const cache = await caches.open(CONFIG.shell);
  await cache.addAll(CONFIG.files.map(url => new Request(url, { cache: 'reload' })));
}));
self.addEventListener('message', event => {
  if (event.data?.type !== 'using-cache' || !event.source?.id) return;
  event.waitUntil((async () => { await remember(event.source.id, event.data); await cleanup(); })());
});
async function savedDocument(pack) {
  if (!await offline.complete(pack.shellCache, pack.shell)) return null;
  const html = await (await caches.open(pack.shellCache)).match(ROOT);
  if (!html?.ok) return null;
  // The HTML and inventory must refer to the same interface generation.
  const text = await html.clone().text();
  for (const match of text.matchAll(/\b(?:src|href)=["']([^"']+)["']/g)) {
    const path = new URL(match[1], self.location.origin + ROOT).pathname;
    if (path.startsWith(ROOT + 'assets/') && !pack.shell.includes(path)) return null;
  }
  return html;
}
function navigation(event) {
  return offline.withDeadline(5000, signal => offline.navigate(event, {
    latest: async () => {
      const response = await fetch(manifestURL, { cache: 'no-store', signal });
      if (!response.ok) throw Error('No update inventory');
      const pack = await response.json();
      if (!shellName(pack.shellCache) || !soundName(pack.cache)) throw Error('Invalid inventory');
      await remember(event.resultingClientId, pack);
      return offline.publish(pack.shellCache, async () => {
        await offline.stageAssets(pack.shellCache, pack.shell.map(url => ({ url })), { atomic: true, signal });
        if (!await savedDocument(pack)) throw Error('Incomplete or inconsistent update');
        return pack;
      });
    },
    candidates: async () => {
      const known = await clientVersion(event.clientId);
      return [...new Set([known?.shellCache, ...(await caches.keys()).filter(shellName).reverse()])].filter(Boolean);
    },
    load: inventory, document: savedDocument, remember
  }));
}
self.addEventListener('fetch', event => {
  const request = event.request, url = offline.requestURL(request);
  if (!url) return;
  if (request.mode === 'navigate' && (url.pathname === ROOT || url.pathname === ROOT + 'index.html')) {
    event.respondWith(navigation(event)); return;
  }
  event.respondWith((async () => {
    const pack = await cachedVersion(event.clientId);
    if (pack?.files.some(file => file.url === url.pathname)) {
      const cache = await caches.open(pack.cache), cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) { try { await cache.put(request, response.clone()); } catch { /* Storage pressure. */ } }
      return response;
    }
    if (pack?.shell.includes(url.pathname)) {
      const cached = await (await caches.open(pack.shellCache)).match(url.pathname);
      if (cached) return cached;
    }
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
