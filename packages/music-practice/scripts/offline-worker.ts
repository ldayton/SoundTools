import { APP_ROUTE_ROOTS } from "../src/exercise-catalog";
import { workerSource } from "@ldayton/browser-offline";
export function offlineWorker(config: {
  app?: "notewise" | "songalong";
  base: string;
  pack: { shellCache: string; files: { url: string; sha256: string }[] };
  inventory: string;
}) {
  return (
    `const CONFIG=${JSON.stringify({ ...config, routeRoots: config.app === "songalong" ? ["piano", "settings"] : APP_ROUTE_ROOTS })};\n` +
    workerSource() +
    String.raw`
const ROOT=CONFIG.base, MANIFEST=ROOT+'offline-pack.json', META=(CONFIG.app||'notewise')+'-clients-v1';
const shellName=name=>typeof name==='string'&&new RegExp('^'+(CONFIG.app||'notewise')+'-shell-[a-f0-9]{16}$').test(name);
const metadataURL=id=>new URL(ROOT+'__offline_client__/'+id,self.location.origin).href;
const metadata=offline.jsonStore(META,metadataURL);
function valid(pack){
  try { return shellName(pack?.shellCache)&&Array.isArray(pack.files)&&pack.files.length>0&&pack.files.length<256&&
    pack.files.some(f=>f.url===ROOT)&&new Set(pack.files.map(f=>f.url)).size===pack.files.length&&pack.files.every(f=>{
      try {const u=new URL(f.url,self.location.origin);return u.origin===self.location.origin&&u.pathname===f.url&&f.url.startsWith(ROOT)&&/^[a-f0-9]{64}$/.test(f.sha256);}catch{return false}
    }); } catch {return false;}
}
async function inventory(name){
  if(!shellName(name)||!await caches.has(name))return null;
  const r=await(await caches.open(name)).match(MANIFEST);
  const p=r?.ok?await r.json().catch(()=>null):null;
  return valid(p)&&p.shellCache===name?p:null;
}
async function savedDocument(pack){
  if(!valid(pack)||!await offline.verified(pack.shellCache,pack.files))return null;
  const r=await(await caches.open(pack.shellCache)).match(ROOT);
  if(!r?.ok)return null;
  const text=await r.clone().text();
  if(!text.includes('content="'+pack.shellCache+'"'))return null;
  for(const match of text.matchAll(/\b(?:src|href)=["']([^"']+)["']/g)){
    const u=new URL(match[1],self.location.origin+ROOT);
    if(u.origin===self.location.origin&&u.pathname.startsWith(ROOT+'assets/')&&!pack.files.some(f=>f.url===u.pathname))return null;
  }
  return r;
}
async function remember(id,pack){
  if(id&&shellName(pack.shellCache))await metadata.write(id,{shellCache:pack.shellCache,savedAt:Date.now()});
}
async function publish(pack,signal){
  if(!valid(pack))throw Object.assign(Error('Invalid offline inventory'),{offlineReason:'integrity'});
  await offline.publish(pack.shellCache,async()=>{
    // A failed first installation can leave a detached cache in WebKit. A
    // shell without a committed inventory is expendable and cheap to rebuild.
    if(!self.registration.active&&await caches.has(pack.shellCache)&&!await(await caches.open(pack.shellCache)).match(MANIFEST))await caches.delete(pack.shellCache);
    await offline.stageAssets(pack.shellCache,pack.files,{signal});
    signal.throwIfAborted();
    await(await caches.open(pack.shellCache)).put(MANIFEST,new Response(JSON.stringify(pack),{headers:{'Content-Type':'application/json'}}));
    if(!await savedDocument(pack))throw Object.assign(Error('Incomplete offline copy'),{offlineReason:'integrity'});
    signal.throwIfAborted();
  });
  await metadata.write('latest',{shellCache:pack.shellCache,savedAt:Date.now()});
  return pack;
}
let latestTask;
function latest(){
  if(latestTask)return latestTask;
  latestTask=offline.withDeadline(40000,async signal=>{
    const bytes=await offlineResources.fetchBytes(MANIFEST,{signal,attempts:2,timeoutMs:8000,idleMs:5000});
    return publish(JSON.parse(new TextDecoder().decode(bytes)),signal);
  }).finally(()=>latestTask=null);
  return latestTask;
}
async function candidates(id){
  const newest=await metadata.read('latest').catch(()=>null),known=id?await metadata.read(id).catch(()=>null):null;
  return [...new Set([newest?.shellCache,known?.shellCache,CONFIG.pack.shellCache,...(await caches.keys()).filter(shellName).reverse()])].filter(Boolean);
}
async function cleanup(){return offline.cleanup(async()=>{
  const state=await offline.protectedClients([CONFIG.pack.shellCache],async id=>{
    const v=await metadata.read(id);return v?[v.shellCache]:null;
  });
  if(!state)return;
  const {live,keep}=state, newest=await metadata.read('latest');
  if(newest)keep.add(newest.shellCache);
  const meta=await caches.open(META),entries=await meta.keys();
  for(const request of entries){const r=await meta.match(request),v=await r?.json().catch(()=>null);if(v&&offline.recent(v.savedAt))keep.add(v.shellCache);}
  for(const name of(await caches.keys()).filter(shellName).reverse()){
    if(keep.has(name))continue;const p=await inventory(name);if(p&&await savedDocument(p)){keep.add(name);break;}
  }
  for(const name of(await caches.keys()).filter(shellName))if(!keep.has(name))await caches.delete(name);
  const ids=new Set(live.map(c=>metadataURL(c.id)));
  for(const request of entries){const r=await meta.match(request),v=await r?.json().catch(()=>null);if(request.url!==metadataURL('latest')&&!ids.has(request.url)&&!offline.recent(v?.savedAt))await meta.delete(request);}
});}
offline.lifecycle(()=>offline.withDeadline(60000,signal=>publish(CONFIG.pack,signal)).catch(async error=>{
  const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  for(const client of clients)offline.report(client,'setup','failed',{cacheReason:offline.reason(error)});
  throw error;
}));
self.addEventListener('message',event=>{
  const type=event.data?.type;
  if(type==='using-cache'&&event.source?.id){event.waitUntil(remember(event.source.id,event.data).then(cleanup).catch(()=>{}));return;}
  if(!['offline-status','prepare-update'].includes(type))return;
  event.waitUntil((async()=>{try{
    if(type==='prepare-update'){const p=await latest();offline.reply(event,{ready:true,shellCache:p.shellCache});}
    else {const p=await inventory(event.data.shellCache);offline.reply(event,{ready:!!(p&&await savedDocument(p))});}
  }catch(error){offline.reply(event,{ready:false,reason:offline.reason(error)});}})());
});
self.addEventListener('fetch',event=>{
  const request=event.request,url=offline.requestURL(request);if(!url)return;
  if(request.mode==='navigate'&&(url.pathname===ROOT||url.pathname===ROOT+'index.html'||(CONFIG.routeRoots.includes(url.pathname.slice(ROOT.length).split('/')[0])&&/^([a-z0-9-]+\/?)+$/.test(url.pathname.slice(ROOT.length))))){
    event.respondWith(offline.navigate(event,{latest,candidates:()=>candidates(event.clientId),load:inventory,document:savedDocument,remember}));return;
  }
  // A stable URL must always be checked against the network for update discovery.
  if(url.pathname===ROOT+'sw.js'||url.pathname===MANIFEST)return;
  event.respondWith((async()=>{
    const saved=await offline.withDeadline(1500,async()=>{
      const pinned=url.pathname.slice(ROOT.length).match(/^releases\/((?:notewise|songalong)-shell-[a-f0-9]{16})\/offline-pack[.]json$/)?.[1];
      if(pinned){const p=await inventory(pinned);return p?new Response(JSON.stringify(p),{headers:{'Content-Type':'application/json'}}):null;}
      const known=event.clientId?await metadata.read(event.clientId).catch(()=>null):null;
      const names=[...new Set([known?.shellCache,...await candidates(event.clientId)])].filter(Boolean);
      for(const name of names){const p=await inventory(name),file=p?.files.find(f=>f.url===url.pathname);if(!file)continue;
        const r=await(await caches.open(name)).match(file.url);if(!r?.ok)continue;
        try{await offlineResources.verify(await r.clone().arrayBuffer(),file);return r;}catch{}
      }
      return null;
    }).catch(()=>null);
    return saved?offline.assetResponse(request,saved):offline.networkResponse(request);
  })());
});
`
  );
}
