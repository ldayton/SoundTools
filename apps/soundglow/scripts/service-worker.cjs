// SPDX-License-Identifier: GPL-3.0-or-later
// Adapted from DoReGo's release-aware offline worker. No document auto-reloads.
module.exports=function worker(config){return 'const CONFIG='+JSON.stringify(config)+';\n'+String.raw`
const ROOT=CONFIG.base,ASSETS='soundglow-assets-v1',META='soundglow-clients-v1',PREFIX='soundglow-release-';
const key=name=>new URL(ROOT+'__cache__/'+name,self.location.origin).href;
const inflight=new Map();let maintenance=Promise.resolve();
function serialize(action){const task=maintenance.then(action,action);maintenance=task.catch(()=>{});return task}
function valid(pack){
 if(pack?.schema!==1||pack.base!==ROOT||!/^[a-f0-9]{32}$/.test(pack.version)||pack.html!==ROOT+'releases/'+pack.version+'/index.html'||!Array.isArray(pack.files)||!pack.files.length)return false;
 return pack.files.some(f=>f.url===pack.html)&&new Set(pack.files.map(f=>f.url)).size===pack.files.length&&pack.files.every(f=>typeof f.url==='string'&&new URL(f.url,self.location.origin).origin===self.location.origin&&!f.url.includes('..')&&[ROOT+'releases/',ROOT+'engines/',ROOT+'media/'].some(p=>f.url.startsWith(p))&&/^[a-f0-9]{64}$/.test(f.sha256));
}
async function read(name){const r=await(await caches.open(META)).match(key(name));return r?await r.json():null}
async function write(name,data){await(await caches.open(META)).put(key(name),new Response(JSON.stringify(data)))}
async function record(id,version){if(id&&/^[a-f0-9]{32}$/.test(version))await write('client/'+id,{version,savedAt:Date.now()})}
async function inventory(version){const r=await(await caches.open(PREFIX+version)).match(key('manifest'));return r?await r.json():null}
async function complete(pack){if(!valid(pack))return false;const cache=await caches.open(ASSETS);return(await Promise.all(pack.files.map(f=>cache.match(f.url)))).every(r=>r?.ok)}
async function stage(pack){
 if(!valid(pack))throw Error('Invalid release manifest');
 if(inflight.has(pack.version))return inflight.get(pack.version);
 const task=serialize(async()=>{
  const cache=await caches.open(ASSETS);
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
  let results;try{results=await Promise.allSettled(pack.files.map(async file=>{
   if(await cache.match(file.url))return;
   const response=await fetch(new Request(file.url,{cache:'reload',signal:controller.signal}));if(!response.ok)throw Error('Incomplete release: '+file.url);
   const bytes=await response.clone().arrayBuffer();
   const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
   if(hash!==file.sha256)throw Error('Release integrity mismatch');
   await cache.put(file.url,response);
  }));}finally{clearTimeout(timer)}
  const failed=results.find(r=>r.status==='rejected');if(failed)throw failed.reason;
  if(!await complete(pack))throw Error('Release missing files');
  const cacheMeta=await caches.open(PREFIX+pack.version);
  // Commit metadata last. Partial downloads are never selected for navigation.
  await cacheMeta.put(key('manifest'),new Response(JSON.stringify(pack)));
  await cacheMeta.put(key('savedAt'),new Response(String(Date.now())));
  return pack;
 });inflight.set(pack.version,task);try{return await task}finally{inflight.delete(pack.version)}
}
async function latest(){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
 try{
  // Unique URL also avoids a previously fresh GitHub Pages CDN manifest.
  const response=await fetch(ROOT+'release.json?check='+Date.now(),{cache:'no-store',signal:controller.signal});
  if(!response.ok)throw Error('No release manifest');const pack=await stage(await response.json());await write('latest',{version:pack.version});return pack;
 }finally{clearTimeout(timer)}
}
async function cleanup(){return serialize(async()=>{
 if(inflight.size||self.registration.installing||self.registration.waiting)return;
 const clients=(await self.clients.matchAll({type:'window',includeUncontrolled:true})).filter(c=>new URL(c.url).pathname.startsWith(ROOT));
 const keep=new Set([CONFIG.version,(await read('latest'))?.version]);
 for(const client of clients){const meta=await read('client/'+client.id);if(!meta)return;keep.add(meta.version)}
 const assetURLs=new Set();
 for(const name of(await caches.keys()).filter(n=>n.startsWith(PREFIX))){
  const cache=await caches.open(name),r=await cache.match(key('manifest')),pack=r&&await r.json(),saved=await cache.match(key('savedAt'));
  if(saved&&Date.now()-Number(await saved.text())<600000)keep.add(name.slice(PREFIX.length));
  if(keep.has(name.slice(PREFIX.length))&&pack)for(const file of pack.files)assetURLs.add(file.url);
  else await caches.delete(name);
 }
 // Don't race a navigation/update that began during the client inventory check.
 if(inflight.size)return;
 const assets=await caches.open(ASSETS);for(const request of await assets.keys())if(!assetURLs.has(new URL(request.url).pathname))await assets.delete(request);
 const meta=await caches.open(META),live=new Set(clients.map(c=>key('client/'+c.id)));
 for(const request of await meta.keys())if(request.url.includes('/__cache__/client/')&&!live.has(request.url)){const data=await(await meta.match(request)).json();if(Date.now()-data.savedAt>=600000)await meta.delete(request)}
})}
self.addEventListener('install',event=>event.waitUntil((async()=>{await stage(CONFIG);await self.skipWaiting()})()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('message',event=>{
 if(event.data?.type==='using-release'&&event.source?.id)event.waitUntil((async()=>{await record(event.source.id,event.data.version);await cleanup()})());
 if(event.data?.type==='prepare-update')event.waitUntil((async()=>{try{const pack=await latest();event.ports[0]?.postMessage({ready:true,version:pack.version,workerVersion:CONFIG.version})}catch{event.ports[0]?.postMessage({ready:false})}})());
});
async function navigate(event){
 try{const pack=await latest();await record(event.resultingClientId,pack.version);return(await caches.open(ASSETS)).match(pack.html)}
 catch{
  const known=await read('client/'+event.clientId),last=await read('latest');
  const versions=[...new Set([last?.version,known?.version,...(await caches.keys()).filter(n=>n.startsWith(PREFIX)).reverse().map(n=>n.slice(PREFIX.length))])].filter(Boolean);
  for(const version of versions){const pack=await inventory(version);if(pack&&await complete(pack)){await record(event.resultingClientId,version);return(await caches.open(ASSETS)).match(pack.html)}}
  return fetch(event.request);
 }
}
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin||!url.pathname.startsWith(ROOT))return;
 if(event.request.mode==='navigate'&&(url.pathname===ROOT||url.pathname===ROOT+'index.html')){event.respondWith(navigate(event));return}
 if([ROOT+'releases/',ROOT+'engines/',ROOT+'media/'].some(p=>url.pathname.startsWith(p)))event.respondWith((async()=>{
  // The enclosing content-addressed directory pins worker imports and WASM too.
  // Rebuild the Response so its stored URL cannot strip the worker profile query.
  const cached=await(await caches.open(ASSETS)).match(url.pathname);return cached?new Response(cached.body,{status:cached.status,statusText:cached.statusText,headers:cached.headers}):fetch(event.request);
 })());
});
`};
