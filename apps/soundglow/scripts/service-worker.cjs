// SPDX-License-Identifier: GPL-3.0-or-later
const {workerSource}=require('@ldayton/browser-offline');
module.exports=function worker(config){return 'const CONFIG='+JSON.stringify(config)+';\n'+workerSource()+String.raw`
const ROOT=CONFIG.base,ASSETS='soundglow-assets-v1',META='soundglow-clients-v1',PREFIX='soundglow-release-';
const key=name=>new URL(ROOT+'__cache__/'+name,self.location.origin).href;
function valid(pack){
 try{
  if(!pack||!Array.isArray(pack.files)||!Array.isArray(pack.optional||[])||pack.files.length>1024||(pack.optional||[]).length>128)return false;
  const file=f=>typeof f?.url==='string'&&new URL(f.url,self.location.origin).origin===self.location.origin&&new URL(f.url,self.location.origin).pathname===f.url&&!f.url.includes('..')&&[ROOT+'releases/',ROOT+'engines/',ROOT+'media/',ROOT+'vendor/neural/'].some(p=>f.url.startsWith(p))&&/^[a-f0-9]{64}$/.test(f.sha256)&&Number.isSafeInteger(f.bytes)&&f.bytes>=0&&f.bytes<=64*1024*1024;
  return pack.schema===1&&pack.base===ROOT&&/^[a-f0-9]{32}$/.test(pack.version)&&pack.html===ROOT+'releases/'+pack.version+'/index.html'&&pack.files.length>0&&pack.files.some(f=>f.url===pack.html)&&new Set([...pack.files,...(pack.optional||[])].map(f=>f.url)).size===pack.files.length+(pack.optional||[]).length&&pack.files.every(file)&&(pack.optional||[]).every(file);
 }catch{return false}
}
const metadata=offline.jsonStore(META,key),read=key=>metadata.read(key).catch(()=>null),write=metadata.write;
async function record(id,version){if(id&&/^[a-f0-9]{32}$/.test(version))await write('client/'+id,{version,savedAt:Date.now()})}
async function inventory(version){const r=await(await caches.open(PREFIX+version)).match(key('manifest'));const pack=r?await r.json().catch(()=>null):null;return valid(pack)?pack:null}
async function complete(pack){return valid(pack)&&await offline.complete(ASSETS,pack.files.map(f=>f.url))&&offline.verified(ASSETS,pack.files)}
async function stage(pack,timeout=180000,parentSignal){
 if(!valid(pack))throw Object.assign(Error('Invalid release manifest'),{offlineReason:'integrity'});
 return offline.publish(pack.version,()=>offlineResources.deadline(timeout,async signal=>{
  await offline.stageAssets(ASSETS,pack.files,{signal});signal.throwIfAborted();
  if(!await complete(pack))throw Object.assign(Error('Release missing files'),{offlineReason:'integrity'});
  const cacheMeta=await caches.open(PREFIX+pack.version);signal.throwIfAborted();
  await cacheMeta.put(key('manifest'),new Response(JSON.stringify(pack)));signal.throwIfAborted();
  await cacheMeta.put(key('savedAt'),new Response(String(Date.now())));return pack;
 },parentSignal));
}
let latestTask;
function latest(){
 if(latestTask)return latestTask;
 latestTask=offline.withDeadline(200000,async signal=>{
  const bytes=await offlineResources.fetchBytes(ROOT+'release.json?check='+Date.now(),{signal,timeoutMs:8000,idleMs:5000,attempts:2});
  const pack=await stage(JSON.parse(new TextDecoder().decode(bytes)),180000,signal);signal.throwIfAborted();
  await write('latest',{version:pack.version});return pack;
 }).finally(()=>latestTask=null);return latestTask;
}
async function cleanup(){return offline.cleanup(async()=>{
 const protectedState=await offline.protectedClients([CONFIG.version,(await read('latest'))?.version],async id=>{const meta=await read('client/'+id);return meta?[meta.version]:null});if(!protectedState)return;
 const {live:clients,keep}=protectedState,assetURLs=new Set();
 let backups=0;for(const name of(await caches.keys()).filter(n=>n.startsWith(PREFIX)).reverse()){const version=name.slice(PREFIX.length);if(keep.has(version))continue;const pack=await inventory(version);if(pack&&await complete(pack)){keep.add(version);if(++backups>=1)break;}}
 for(const name of(await caches.keys()).filter(n=>n.startsWith(PREFIX))){
  const cache=await caches.open(name),r=await cache.match(key('manifest')),pack=r&&await r.json().catch(()=>null),saved=await cache.match(key('savedAt'));
  if(saved&&offline.recent(Number(await saved.text())))keep.add(name.slice(PREFIX.length));
  if(keep.has(name.slice(PREFIX.length))&&valid(pack))for(const file of [...pack.files,...(pack.optional||[])])assetURLs.add(file.url);else await caches.delete(name);
 }
 const assets=await caches.open(ASSETS);for(const request of await assets.keys())if(!assetURLs.has(new URL(request.url).pathname))await assets.delete(request);
 const meta=await caches.open(META),live=new Set(clients.map(c=>key('client/'+c.id)));
 for(const request of await meta.keys())if(request.url.includes('/__cache__/client/')&&!live.has(request.url)){const data=await(await meta.match(request)).json().catch(()=>null);if(!data||!offline.recent(data.savedAt))await meta.delete(request)}
})}
offline.lifecycle(async()=>{const pack=await stage(CONFIG,180000);await offline.withDeadline(2000,()=>write('latest',{version:pack.version}));});
const downloads=new Map();
self.addEventListener('message',event=>{
 if(event.data?.type==='using-release'&&event.source?.id)event.waitUntil((async()=>{await record(event.source.id,event.data.version);await cleanup()})().catch(error=>offline.report(event.source,'storage','failed',{cacheReason:offline.reason(error)})));
 if(event.data?.type==='prepare-update')event.waitUntil((async()=>{try{const pack=await latest();offline.reply(event,{ready:true,version:pack.version,workerVersion:CONFIG.version})}catch(error){offline.reply(event,{ready:false,reason:offline.reason(error),workerVersion:CONFIG.version})}})());
 if(event.data?.type==='download-state'&&event.source?.id){offline.reply(event,{active:downloads.has(event.source.id)});return;}
 if(event.data?.type==='cancel-offline'&&event.source?.id)downloads.get(event.source.id)?.abort(new DOMException('Download cancelled','AbortError'));
 if(['offline-status','download-offline'].includes(event.data?.type)&&event.source?.id)event.waitUntil((async()=>{
  const controller=new AbortController(),downloadStarted=Date.now();let tracked=false;
  if(event.data.type==='download-offline'){tracked=true;downloads.get(event.source.id)?.abort();downloads.set(event.source.id,controller);}
  try{
   const pack=await offline.withDeadline(2000,()=>inventory(event.data.version))||(event.data.version===CONFIG.version?CONFIG:null);if(!valid(pack))throw Error('Offline inventory unavailable');
   if(event.data.type==='download-offline'){
    controller.signal.throwIfAborted();
    const estimate=await offlineResources.deadline(1000,()=>self.navigator.storage?.estimate?.()).catch(()=>null);
    if(estimate?.quota!==undefined&&estimate.usage!==undefined){const cache=await offlineResources.deadline(2000,()=>caches.open(ASSETS));const missing=await offlineResources.deadline(2000,()=>Promise.all([...pack.files,...(pack.optional||[])].map(async f=>(await cache.match(f.url))?0:f.bytes)));if(estimate.quota-estimate.usage<missing.reduce((a,b)=>a+b,0))throw new DOMException('Not enough offline storage','QuotaExceededError');}
    await offlineResources.deadline(180000,signal=>stage(pack,180000,signal),controller.signal);controller.signal.throwIfAborted();
    await offlineResources.deadline(Math.max(1,240000-(Date.now()-downloadStarted)),signal=>offline.publish('optional-'+pack.version,()=>offline.stageAssets(ASSETS,pack.optional||[],{signal,onRetry:(attempt,cacheReason)=>offline.report(event.source,'download','retrying',{retryCount:attempt,cacheReason})})),controller.signal);
   }
   const full=await offline.withDeadline(8000,()=>offline.verified(ASSETS,[...pack.files,...(pack.optional||[])],()=>offline.report(event.source,'storage','failed',{cacheReason:'integrity'})));
   offline.reply(event,{ready:full,bytes:[...pack.files,...(pack.optional||[])].reduce((sum,f)=>sum+f.bytes,0)});
  }catch(error){offline.reply(event,{ready:false,reason:controller.signal.aborted?'cancelled':offline.reason(error)})}
  finally{if(tracked&&downloads.get(event.source.id)===controller)downloads.delete(event.source.id)}
 })());
});
function navigate(event){return offline.navigate(event,{
 latest,
 candidates:async()=>{const known=await read('client/'+event.clientId),last=await read('latest');return [...new Set([last?.version,...(await caches.keys()).filter(n=>n.startsWith(PREFIX)).reverse().map(n=>n.slice(PREFIX.length)),known?.version])].filter(Boolean)},
 load:inventory,document:async pack=>await complete(pack)?(await caches.open(ASSETS)).match(pack.html):null,remember:(id,pack)=>record(id,pack.version)
})}
self.addEventListener('fetch',event=>{
 const url=offline.requestURL(event.request);if(!url)return;
 if(event.request.mode==='navigate'&&(url.pathname===ROOT||url.pathname===ROOT+'index.html')){event.respondWith(navigate(event));return}
 if([ROOT+'releases/',ROOT+'engines/',ROOT+'media/',ROOT+'vendor/neural/'].some(p=>url.pathname.startsWith(p)))event.respondWith((async()=>{
  const cached=await offline.withDeadline(1500,async()=>{
   const cache=await caches.open(ASSETS),response=await cache.match(url.pathname);if(!response||event.request.cache==='reload')return null;
   const file=[...CONFIG.files,...(CONFIG.optional||[])].find(f=>f.url===url.pathname);
   if(file)try{await offlineResources.verify(await response.clone().arrayBuffer(),file)}catch(error){if(error.offlineReason!=='integrity'||event.request.signal.aborted)throw error;await cache.delete(url.pathname);void self.clients.get(event.clientId).then(client=>offline.report(client,'storage','failed',{cacheReason:'integrity'})).catch(()=>{});return null}
   return response;
  }).catch(error=>{void self.clients.get(event.clientId).then(client=>offline.report(client,'storage','failed',{cacheReason:offline.reason(error)})).catch(()=>{});return null});
  if(cached)return offline.assetResponse(event.request,new Response(cached.body,{status:cached.status,statusText:cached.statusText,headers:cached.headers}));
  return offline.networkResponse(event.request);
 })());
});
`};
