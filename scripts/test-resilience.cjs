// Actual packaged apps, persistent browser profiles, and server/worker faults.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const app=process.argv[2];if(!['dorego','soundglow'].includes(app))throw Error('Choose dorego or soundglow');
const root=path.resolve(__dirname,'..'),base=app==='dorego'?'/DoReGo/':'/';
let output;
if(app==='soundglow'){
 const previous=process.cwd();process.chdir(path.join(root,'apps/soundglow'));
 try{output=fs.mkdtempSync(path.join(os.tmpdir(),'soundglow-resilience-site-'));require('../apps/soundglow/scripts/build-site.cjs').build({out:output,base:'/',previous:path.join(output,'absent')})}finally{process.chdir(previous)}
}else output=path.join(root,'apps/dorego/dist-pages');
const artifact=path.join(root,'work','resilience-'+app);fs.mkdirSync(artifact,{recursive:true});
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'soundtools-resilience-profile-'));
const retryPath=app==='dorego'?JSON.parse(fs.readFileSync(path.join(output,'offline-pack.json'))).files[0].url:null;
let stall=false,failed=false;const held=new Set(),sockets=new Set();
const cacheFaultHook=`let testCacheFault='';const nativeCacheStorage=self.caches;Object.defineProperty(self,'caches',{value:new Proxy(nativeCacheStorage,{get(target,name){if(['open','keys','match','has','delete'].includes(name))return(...args)=>testCacheFault==='stall'?new Promise(()=>{}):testCacheFault==='deny'?Promise.reject(new DOMException('denied','SecurityError')):target[name](...args);return Reflect.get(target,name)}})});self.addEventListener('message',event=>{if(event.data?.type==='test-storage-fault'){testCacheFault=event.data.kind;event.ports[0]?.postMessage(true)}});\n`;
const server=http.createServer((req,res)=>{
 const name=new URL(req.url,'http://localhost').pathname;
 if(name==='/__resilience-away'){res.writeHead(200,{'Content-Type':'text/html'}).end('<!doctype html><title>Away</title>History probe');return}
 if(!name.startsWith(base)){res.writeHead(404).end();return}
 if(stall&&(name.endsWith('offline-pack.json')||name.endsWith('release.json'))){held.add(res);res.on('close',()=>held.delete(res));return}
 if(!failed&&(name===retryPath||name.endsWith('/silero.onnx'))){failed=true;res.writeHead(503).end('temporary failure');return}
 const relative=name.slice(base.length)||'index.html',file=path.resolve(output,relative);
 if(!file.startsWith(output+path.sep)){res.writeHead(403).end();return}
 fs.readFile(file,(error,body)=>{if(error){res.writeHead(404).end();return}if(name.endsWith('/sw.js'))body=Buffer.concat([Buffer.from(cacheFaultHook),body]);
  const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.svg':'image/svg+xml','.flac':'audio/flac','.m4a':'audio/mp4'};
  res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'}).end(body);
 });
});server.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket))});
let context;
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url='http://127.0.0.1:'+server.address().port+base;
 await require('./test-startup-recovery.cjs').testStartupRecovery(url,app);
 const launch=()=>chromium.launchPersistentContext(profile,{headless:true});
 context=await launch();await context.addInitScript(app=>{try{localStorage.setItem(app+':diagnostics:sharing','yes')}catch{}},app);
 let page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(url);await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
 if(app==='soundglow')await page.locator('#openSettings:visible, #settings:visible').click();
 const download=app==='dorego'?'#offline-download':'#offlineDownload',status=app==='dorego'?'#offline-status':'#offlineStatus';
 await page.locator(download).waitFor({state:'visible'});await page.locator(download).click();
 await page.waitForFunction(selector=>document.querySelector(selector).textContent.includes('Available offline'),status,{timeout:60000});
 assert(failed,'The transient transfer failure must be exercised');
 const diagnostic=await page.evaluate(app=>(app==='dorego'?window.doregoDiagnostics:window.SoundglowDiagnostics).snapshot(),app);
 fs.writeFileSync(path.join(artifact,'diagnostics.json'),JSON.stringify(diagnostic,null,2));
 assert(diagnostic.events.some(e=>e.code==='cache.download.retrying'),'Retry reaches the consent-gated diagnostics collector: '+JSON.stringify(diagnostic.events.map(e=>e.code)));
 stall=true;const started=Date.now();await page.reload({waitUntil:'domcontentloaded'});const cachedMs=Date.now()-started;
 assert(cachedMs<2000,'Cached startup waited for a stalled update: '+cachedMs+' ms');
 stall=false;for(const response of held)response.writeHead(503).end();
 await page.goto(new URL('/__resilience-away',url).href);await page.goBack({waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__soundtoolsStartup?.ready);
 await page.waitForFunction(selector=>document.querySelector(selector).textContent.includes('Available offline'),status);
 await context.close();context=await launch();await context.setOffline(true);page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
 const restarted=Date.now();await page.goto(url,{waitUntil:'domcontentloaded'});const restartMs=Date.now()-restarted;
 if(app==='dorego'){await page.waitForFunction(()=>!document.querySelector('#play').disabled);await page.locator('#play').click();await page.getByRole('button',{name:'Pause',exact:true}).waitFor();await page.locator('#play').click();}
 else{await page.getByRole('button',{name:'Play an Example',exact:true}).click();await page.waitForFunction(()=>inputMode==='speech'&&processingStats.frames>200);await page.locator('#freeze').click();await page.locator('#openSettings:visible, #settings:visible').click();}
 await page.waitForFunction(selector=>document.querySelector(selector).textContent.includes('Available offline'),status,{timeout:15000});
 await page.screenshot({path:path.join(artifact,'offline-after-restart.png')});
 // Browser-driven partial requests must work without network and never replace full cache entries.
 const media=await page.evaluate(async app=>{
  let pack;
  if(app==='dorego')pack=await(await fetch(document.querySelector('meta[name="dorego-inventory"]').content)).json();
  else{const version=document.querySelector('meta[name="soundglow-release"]').content;const cache=await caches.open('soundglow-release-'+version);pack=await(await cache.match(new URL('/__cache__/manifest',location.origin))).json()}
  const file=pack.files.find(f=>app==='dorego'?f.url.endsWith('.flac'):f.url.endsWith('.m4a'));
  const response=await fetch(file.url+'?offline-probe=1',{headers:{Range:'bytes=0-31'}}),head=await fetch(file.url,{method:'HEAD'}),full=await fetch(file.url);
  return{rangeStatus:response.status,rangeSize:(await response.arrayBuffer()).byteLength,headStatus:head.status,headSize:(await head.arrayBuffer()).byteLength,fullSize:(await full.arrayBuffer()).byteLength,expected:file.bytes};
 },app);
 assert.deepEqual(media,{rangeStatus:206,rangeSize:32,headStatus:200,headSize:0,fullSize:media.expected,expected:media.expected});
 await page.evaluate(async app=>{const cache=await caches.open(app==='dorego'?'dorego-clients-v1':'soundglow-clients-v1');for(const request of await cache.keys())await cache.put(request,new Response('{broken advisory json'))},app);
 await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>!!window.__soundtoolsStartup?.ready);
 console.log('PASS: offline Range, HEAD, query normalization and corrupt advisory metadata recovery');

 await context.setOffline(false);
 const fault=kind=>page.evaluate(kind=>new Promise(resolve=>{const channel=new MessageChannel();channel.port1.onmessage=()=>{channel.port1.close();resolve()};navigator.serviceWorker.controller.postMessage({type:'test-storage-fault',kind},[channel.port2])}),kind);
 await fault('stall');const blockedStart=Date.now();await page.reload({waitUntil:'domcontentloaded'});const blockedMs=Date.now()-blockedStart;
 assert(blockedMs<10000,'Stalled storage must fail open to a working network');
 await fault('deny');await page.reload({waitUntil:'domcontentloaded'});
 assert(await page.locator(app==='dorego'?'#stage':'#plot').isVisible(),'Storage denial must not break the online app');
 await context.setOffline(true);await page.reload({waitUntil:'domcontentloaded'});
 await page.getByRole('heading',{name:'No offline copy available',exact:true}).waitFor();
 assert.deepEqual(errors,[]);
 const report={app,passed:true,cachedStartupWithHangingUpdateMs:cachedMs,offlineBrowserRestartMs:restartMs,networkStartupWithStalledCacheMs:blockedMs};
 fs.writeFileSync(path.join(artifact,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
})().catch(error=>{console.error(error);process.exitCode=1}).finally(async()=>{await context?.close();for(const response of held)response.destroy();for(const socket of sockets)socket.destroy();server.close();fs.rmSync(profile,{recursive:true,force:true});if(app==='soundglow'&&output)fs.rmSync(output,{recursive:true,force:true})});
