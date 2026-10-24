import { workerSource } from '@ldayton/browser-offline';

// DoReGo adapter: separate interface generations and lazily downloaded sound banks.
export function offlineWorker(config: {
  shell: string;
  sounds: string;
  files: string[];
  hashes?: Record<string, string>;
  base: string;
}) {
  return (
    `const CONFIG = ${JSON.stringify(config)};\n` +
    workerSource() +
    String.raw`
const ROOT = CONFIG.base;
const inventories = new Map();
const usableInventories = new Set();
const META = 'dorego-clients-v1';
const manifestURL = ROOT + 'offline-pack.json';
const metadataURL = id => new URL(ROOT + '__offline_client__/' + id, self.location.origin).href;
const metadata = offline.jsonStore(META, metadataURL);
let latestTask;
async function latest(){
  if(latestTask)return latestTask;
  latestTask=offline.withDeadline(30000,async signal=>{
    const response=await fetch(manifestURL,{cache:'no-store',signal});
    if(!response.ok)throw Object.assign(Error('No update inventory'),{offlineReason:response.status>=500?'network':'unavailable'});
    const pack=await response.json();
    if(!shellName(pack.shellCache)||!soundName(pack.cache))throw Error('Invalid inventory');
    await offline.publish(pack.shellCache,async()=>{
      await offline.stageAssets(pack.shellCache,pack.shell.filter(url=>url!==manifestURL).map(url=>({url,sha256:pack.hashes?.[url]})),{signal});
      signal.throwIfAborted();await(await caches.open(pack.shellCache)).put(manifestURL,new Response(JSON.stringify(pack),{headers:{'Content-Type':'application/json'}}));
      signal.throwIfAborted();
      if(!await savedDocument(pack))throw Error('Incomplete update');
    });
    signal.throwIfAborted();
    await metadata.write('latest',{shellCache:pack.shellCache,cache:pack.cache,savedAt:Date.now()});
    return pack;
  }).finally(()=>latestTask=null);
  return latestTask;
}
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
async function usableInventory(name) {
  const pack=await inventory(name);
  return pack && (usableInventories.has(name) || await savedDocument(pack)) ? pack : null;
}
async function cachedVersion(id) {
  const known=await clientVersion(id);
  if(known){const pack=await usableInventory(known.shellCache);if(pack)return pack;}
  const newest=await metadata.read('latest');
  if(newest){const pack=await usableInventory(newest.shellCache);if(pack)return pack;}
  for(const name of(await caches.keys()).filter(shellName).reverse()){
    const pack=await usableInventory(name);if(pack)return pack;
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
  const latest = await metadata.read('latest');
  if(latest){keep.add(latest.shellCache);keep.add(latest.cache);}
  let backups=0;
  for(const name of(await caches.keys()).filter(shellName).reverse()){if(keep.has(name))continue;const pack=await inventory(name);if(pack&&await savedDocument(pack)){keep.add(name);keep.add(pack.cache);if(++backups>=1)break;}}
  const meta = await caches.open(META), entries = await meta.keys();
  // Protect newly navigating clients even before the new document announces itself.
  for (const request of entries) {
    const response = await meta.match(request);
    if (!response) continue;
    const record = await response.json();
    if (offline.recent(record.savedAt)) { keep.add(record.shellCache); keep.add(record.cache); }
  }
  for (const name of await caches.keys()) {
    if ((shellName(name) || soundName(name)) && !keep.has(name)) { await caches.delete(name); inventories.delete(name); usableInventories.delete(name); }
  }
  const ids = new Set(live.map(client => metadataURL(client.id)));
  for (const request of entries) {
    const response = await meta.match(request);
    if (!response) continue;
    const record = await response.json();
    if (request.url !== metadataURL('latest') && !ids.has(request.url) && !offline.recent(record.savedAt)) await meta.delete(request);
  }
}); }
// Publish the inventory last, only after the complete interface is verified.
offline.lifecycle(() => offline.withDeadline(60000, signal => offline.publish(CONFIG.shell, async () => {
  await offline.stageAssets(CONFIG.shell, CONFIG.files.filter(url=>url!==manifestURL).map(url=>({url,sha256:CONFIG.hashes?.[url]})),{signal});
  const response=await fetch(manifestURL,{cache:'reload',signal});if(!response.ok)throw Error('Offline inventory unavailable');
  const pack=await response.json();signal.throwIfAborted();
  if(pack.shellCache!==CONFIG.shell||CONFIG.hashes&&Object.entries(CONFIG.hashes).some(([url,hash])=>pack.hashes?.[url]!==hash))throw Object.assign(Error('Inconsistent installation'),{offlineReason:'integrity'});
  await(await caches.open(CONFIG.shell)).put(manifestURL,new Response(JSON.stringify(pack),{headers:{'Content-Type':'application/json'}}));
  if(!await savedDocument(pack))throw Object.assign(Error('Incomplete installation'),{offlineReason:'integrity'});
  signal.throwIfAborted();await metadata.write('latest',{shellCache:pack.shellCache,cache:pack.cache,savedAt:Date.now()});
})));
self.addEventListener('message', event => {
  if(event.data?.type==='prepare-update'){event.waitUntil((async()=>{try{const pack=await latest();event.ports[0]?.postMessage({ready:true,shellCache:pack.shellCache})}catch(error){event.ports[0]?.postMessage({ready:false,reason:offline.reason(error)})}})());return;}
  if (event.data?.type !== 'using-cache' || !event.source?.id) return;
  event.waitUntil((async () => { await remember(event.source.id, event.data); await cleanup(); })().catch(error => offline.report(event.source, 'storage', 'failed', {cacheReason:offline.reason(error)})));
});
async function savedDocument(pack) {
  if (!await offline.complete(pack.shellCache, pack.shell) || pack.hashes && !await offline.verified(pack.shellCache,pack.shell.filter(url=>url!==manifestURL).map(url=>({url,sha256:pack.hashes[url]})))) {usableInventories.delete(pack.shellCache);return null;}
  const html = await (await caches.open(pack.shellCache)).match(ROOT);
  if (!html?.ok) {usableInventories.delete(pack.shellCache);return null;}
  // The HTML and inventory must refer to the same interface generation.
  const text = await html.clone().text();
  for (const match of text.matchAll(/\b(?:src|href)=["']([^"']+)["']/g)) {
    const path = new URL(match[1], self.location.origin + ROOT).pathname;
    if (path.startsWith(ROOT + 'assets/') && !pack.shell.includes(path)) {usableInventories.delete(pack.shellCache);return null;}
  }
  usableInventories.add(pack.shellCache);return html;
}
function navigation(event) {
  return offline.navigate(event, {
    latest,
    candidates: async () => {
      const known = await clientVersion(event.clientId), newest = await metadata.read('latest');
      return [...new Set([newest?.shellCache, known?.shellCache, ...(await caches.keys()).filter(shellName).reverse()])].filter(Boolean);
    },
    load: inventory, document: savedDocument, remember
  });
}
self.addEventListener('fetch', event => {
  const request = event.request, url = offline.requestURL(request);
  if (!url) return;
  if (request.mode === 'navigate' && (url.pathname === ROOT || url.pathname === ROOT + 'index.html')) {
    event.respondWith(navigation(event)); return;
  }
  event.respondWith((async () => {
    let file, soundCache;
    const cached = await offline.withDeadline(1500, async () => {
      const pack=await cachedVersion(event.clientId);
      file=pack?.files.find(file=>file.url===url.pathname);
      if(file){
        soundCache=pack.cache;
        const cache=await caches.open(soundCache), response=await cache.match(request);
        if(response && request.cache !== 'reload'){try{await offlineResources.verify(await response.clone().arrayBuffer(),file);return response}catch(error){if(error.offlineReason!=='integrity')throw error;await cache.delete(request);}}
      }
      if(pack?.shell.includes(url.pathname))return (await caches.open(pack.shellCache)).match(url.pathname);
      if(url.pathname.startsWith(ROOT+'assets/'))for(const name of(await caches.keys()).filter(shellName)){
        const response=await(await caches.open(name)).match(request);if(response)return response;
      }
    }).catch(error=>{void self.clients.get(event.clientId).then(client=>offline.report(client,'storage','failed',{cacheReason:offline.reason(error)})).catch(()=>{});return null});
    if(cached)return cached;
    if(!file)return offline.networkResponse(request);
    let bytes;
    try { bytes=await offlineResources.fetchBytes(request.url,{...file,signal:request.signal,attempts:1,timeoutMs:25000,idleMs:7000}); }
    catch(error){const reason=offline.reason(error);return new Response('',{status:reason==='unavailable'?404:503,headers:{'X-Offline-Reason':reason}});}
    const response=new Response(bytes,{headers:{'Content-Type':'audio/flac','Content-Length':String(bytes.byteLength)}});
    const saved=response.clone();
    event.waitUntil(offline.withDeadline(1500,async()=>{await(await caches.open(soundCache)).put(request,saved)}).catch(error=>self.clients.get(event.clientId).then(client=>offline.report(client,'storage','failed',{cacheReason:offline.reason(error)})).catch(()=>{})));
    return response;
  })());
});
`
  );
}
