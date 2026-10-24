// SPDX-License-Identifier: GPL-3.0-or-later
// Soundglow adapter: immutable hashed assets and explicit update preparation.
const {workerSource}=require('@ldayton/browser-offline');
module.exports=function worker(config){return 'const CONFIG='+JSON.stringify(config)+';\n'+workerSource()+String.raw`
const ROOT=CONFIG.base,ASSETS='soundglow-assets-v1',META='soundglow-clients-v1',PREFIX='soundglow-release-';
const key=name=>new URL(ROOT+'__cache__/'+name,self.location.origin).href;
function valid(pack){
 if(pack?.schema!==1||pack.base!==ROOT||!/^[a-f0-9]{32}$/.test(pack.version)||pack.html!==ROOT+'releases/'+pack.version+'/index.html'||!Array.isArray(pack.files)||!pack.files.length)return false;
 return pack.files.some(f=>f.url===pack.html)&&new Set(pack.files.map(f=>f.url)).size===pack.files.length&&pack.files.every(f=>typeof f.url==='string'&&new URL(f.url,self.location.origin).origin===self.location.origin&&!f.url.includes('..')&&[ROOT+'releases/',ROOT+'engines/',ROOT+'media/'].some(p=>f.url.startsWith(p))&&/^[a-f0-9]{64}$/.test(f.sha256));
}
const metadata=offline.jsonStore(META,key),read=metadata.read,write=metadata.write;
async function record(id,version){if(id&&/^[a-f0-9]{32}$/.test(version))await write('client/'+id,{version,savedAt:Date.now()})}
async function inventory(version){const r=await(await caches.open(PREFIX+version)).match(key('manifest'));return r?await r.json():null}
async function complete(pack){return valid(pack)&&offline.complete(ASSETS,pack.files.map(f=>f.url))}
async function stage(pack,timeout=10000){
 if(!valid(pack))throw Error('Invalid release manifest');
 return offline.publish(pack.version,async()=>{
  await offline.withDeadline(timeout,signal=>offline.stageAssets(ASSETS,pack.files,{signal}));
  if(!await complete(pack))throw Error('Release missing files');
  const cacheMeta=await caches.open(PREFIX+pack.version);
  // Commit metadata last. Partial downloads are never selected for navigation.
  await cacheMeta.put(key('manifest'),new Response(JSON.stringify(pack)));
  await cacheMeta.put(key('savedAt'),new Response(String(Date.now())));
  return pack;
 });
}
function latest(){return offline.withDeadline(8000,async signal=>{
 const response=await fetch(ROOT+'release.json?check='+Date.now(),{cache:'no-store',signal});
 if(!response.ok)throw Error('No release manifest');
 const pack=await stage(await response.json());await write('latest',{version:pack.version});return pack;
})}
async function cleanup(){return offline.cleanup(async()=>{
 const protectedState=await offline.protectedClients([CONFIG.version,(await read('latest'))?.version],async id=>{
  const meta=await read('client/'+id);return meta?[meta.version]:null;
 });
 if(!protectedState)return;
 const {live:clients,keep}=protectedState;
 const assetURLs=new Set();
 for(const name of(await caches.keys()).filter(n=>n.startsWith(PREFIX))){
  const cache=await caches.open(name),r=await cache.match(key('manifest')),pack=r&&await r.json(),saved=await cache.match(key('savedAt'));
  if(saved&&offline.recent(Number(await saved.text())))keep.add(name.slice(PREFIX.length));
  if(keep.has(name.slice(PREFIX.length))&&pack)for(const file of pack.files)assetURLs.add(file.url);
  else await caches.delete(name);
 }
 const assets=await caches.open(ASSETS);for(const request of await assets.keys())if(!assetURLs.has(new URL(request.url).pathname))await assets.delete(request);
 const meta=await caches.open(META),live=new Set(clients.map(c=>key('client/'+c.id)));
 for(const request of await meta.keys())if(request.url.includes('/__cache__/client/')&&!live.has(request.url)){const data=await(await meta.match(request)).json();if(!offline.recent(data.savedAt))await meta.delete(request)}
})}
// First installation can download the complete analysis engine and example audio.
// Keep background update checks short; only the cold install gets a larger budget.
offline.lifecycle(()=>stage(CONFIG,60000));
self.addEventListener('message',event=>{
 if(event.data?.type==='using-release'&&event.source?.id)event.waitUntil((async()=>{await record(event.source.id,event.data.version);await cleanup()})());
 if(event.data?.type==='prepare-update')event.waitUntil((async()=>{try{const pack=await latest();event.ports[0]?.postMessage({ready:true,version:pack.version,workerVersion:CONFIG.version})}catch{event.ports[0]?.postMessage({ready:false})}})());
});
function navigate(event){return offline.navigate(event,{
 latest,
 candidates:async()=>{
  const known=await read('client/'+event.clientId),last=await read('latest');
  return [...new Set([last?.version,known?.version,...(await caches.keys()).filter(n=>n.startsWith(PREFIX)).reverse().map(n=>n.slice(PREFIX.length))])].filter(Boolean);
 },
 load:inventory,
 document:async pack=>await complete(pack)?(await caches.open(ASSETS)).match(pack.html):null,
 remember:(id,pack)=>record(id,pack.version)
})}
self.addEventListener('fetch',event=>{
 const url=offline.requestURL(event.request);if(!url)return;
 if(event.request.mode==='navigate'&&(url.pathname===ROOT||url.pathname===ROOT+'index.html')){event.respondWith(navigate(event));return}
 if([ROOT+'releases/',ROOT+'engines/',ROOT+'media/'].some(p=>url.pathname.startsWith(p)))event.respondWith((async()=>{
  // The enclosing content-addressed directory pins worker imports and WASM too.
  // Rebuild the Response so its stored URL cannot strip the worker profile query.
  const cached=await(await caches.open(ASSETS)).match(url.pathname);return cached?new Response(cached.body,{status:cached.status,statusText:cached.statusText,headers:cached.headers}):fetch(event.request);
 })());
});
`};
