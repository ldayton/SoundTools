// Exercise packaged releases behind HTTP cache headers like GitHub Pages.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('@playwright/test'),{build}=require('../scripts/build-site.cjs');
const root=path.resolve(__dirname,'..'),work=path.join(root,'test-results/updates');fs.rmSync(work,{recursive:true,force:true});fs.mkdirSync(work,{recursive:true});
// Chrome's fake audio capturer expects 44.1 or 48 kHz PCM. Resample the bundled
// English speech fixture for capture; the production recording stays untouched.
const speech=fs.readFileSync(path.join(root,'dist/audio/speech-english.wav'));
let rate,pcm;for(let at=12;at+8<=speech.length;){const kind=speech.toString('ascii',at,at+4),size=speech.readUInt32LE(at+4);if(kind==='fmt ')rate=speech.readUInt32LE(at+12);if(kind==='data')pcm=speech.subarray(at+8,at+8+size);at+=8+size+(size%2)}
const count=Math.floor(pcm.length/2*48000/rate),capture=Buffer.alloc(44+count*2);
capture.write('RIFF');capture.writeUInt32LE(capture.length-8,4);capture.write('WAVEfmt ',8);capture.writeUInt32LE(16,16);capture.writeUInt16LE(1,20);capture.writeUInt16LE(1,22);capture.writeUInt32LE(48000,24);capture.writeUInt32LE(96000,28);capture.writeUInt16LE(2,32);capture.writeUInt16LE(16,34);capture.write('data',36);capture.writeUInt32LE(count*2,40);
for(let i=0;i<count;i++){const x=i*rate/48000,a=Math.floor(x),b=Math.min(a+1,pcm.length/2-1);capture.writeInt16LE(Math.round(pcm.readInt16LE(a*2)*(1-x+a)+pcm.readInt16LE(b*2)*(x-a)),44+i*2)}
const microphone=path.join(work,'capture.wav');fs.writeFileSync(microphone,capture);
const releases=[];
for(let revision=0;revision<3;revision++){
 const source=path.join(work,'source-'+revision),out=path.join(work,'site-'+revision);fs.cpSync(path.join(root,'dist'),source,{recursive:true});fs.appendFileSync(path.join(source,'style.css'),'\n/* test release '+revision+' */');
 // CI has a real previous-site for deployment retention; fixtures must stay isolated.
 const pack=build({source,out,base:'/Soundglow/',previous:path.join(work,'no-previous-site')});releases.push({out,pack});
}
// Every rewritten script/style reference must exist in the immutable release manifest.
for(const {out,pack}of releases){
 const html=fs.readFileSync(path.join(out,pack.html.slice('/Soundglow/'.length)),'utf8'),urls=new Set(pack.files.map(f=>f.url));
 for(const match of html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)="([^"]+)"/g))if(match[1].startsWith('/Soundglow/'))assert(urls.has(match[1]),'Unpackaged page dependency: '+match[1]);
}
// Large optional speech assets must not delay app-cache installation or update readiness.
for(const {out,pack} of releases){assert(!pack.files.some(f=>f.url.includes('/vendor/neural/')));const pin=JSON.parse(fs.readFileSync(path.join(out,'vendor/praat/neural-manifest.json')));assert(fs.existsSync(path.join(out,'vendor/neural',pin.version,'silero.onnx')));}
// Optional migration probe: run an actual previous worker against the first release.
if(process.env.LEGACY_WORKER_SOURCE)fs.writeFileSync(path.join(releases[0].out,'sw.js'),require(path.resolve(process.env.LEGACY_WORKER_SOURCE))(releases[0].pack));
assert.notEqual(releases[0].pack.version,releases[1].pack.version);
assert.deepEqual(releases[0].pack.files.filter(f=>f.url.includes('/engines/')),releases[1].pack.files.filter(f=>f.url.includes('/engines/')),'UI releases reuse the same engine URLs');
const retained=path.join(work,'retained-site');build({source:path.join(work,'source-1'),out:retained,base:'/Soundglow/',previous:releases[0].out});
for(const file of releases[0].pack.files)assert(fs.existsSync(path.join(retained,file.url.slice('/Soundglow/'.length))),'Previous deployment asset retained');
assert.equal(JSON.parse(fs.readFileSync(path.join(retained,'release-history.json'))).length,2);
let revision=0,fault=null,modelFailures=0,holdModel=false,modelAborted=false,failDiscovery=false;const requests=[];
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');requests.push(url.pathname+url.search);
 if(failDiscovery&&url.pathname==='/Soundglow/release.json'){res.writeHead(503).end();return}
 if(!url.pathname.startsWith('/Soundglow/')){res.writeHead(404).end();return}
 if(url.pathname.endsWith('/silero.onnx')&&holdModel){res.on('close',()=>{modelAborted=true});return}
 if(url.pathname.endsWith('/silero.onnx')&&modelFailures-->0){res.writeHead(503).end('temporary interruption');return}
 const relative=url.pathname.slice('/Soundglow/'.length)||'index.html',file=path.resolve(releases[revision].out,relative);
 if(!file.startsWith(releases[revision].out+path.sep)){res.writeHead(403).end();return}
 if(fault&&url.pathname===releases[2].pack.files.find(f=>f.url.endsWith('/app.js')).url){res.writeHead(fault==='network'?503:200,{'Content-Type':'text/javascript'}).end('broken deployment');return}
 fs.readFile(file,(error,bytes)=>{if(error){res.writeHead(404).end();return}const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm'};res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'max-age=600'}).end(bytes)});
});
const rpc=page=>page.evaluate(()=>new Promise((resolve,reject)=>{const c=new MessageChannel(),timer=setTimeout(()=>{c.port1.close();reject(Error('Update RPC timeout'))},20000);c.port1.onmessage=e=>{clearTimeout(timer);c.port1.close();resolve(e.data)};navigator.serviceWorker.controller.postMessage({type:'prepare-update'},[c.port2])}));
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port,url=origin+'/Soundglow/';
 const browser=await chromium.launch({args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--use-file-for-fake-audio-capture='+microphone]});
 try{
 const context=await browser.newContext({permissions:['microphone']});await context.addInitScript(()=>{try{localStorage.setItem('soundglow:diagnostics:sharing','yes')}catch{}});const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(url);
 await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
 assert.equal(await page.locator('meta[name="soundglow-release"]').getAttribute('content'),releases[0].pack.version);
 await page.locator('#begin').click();await page.waitForFunction(()=>running&&processingStats.frames>200);
 const other=await context.newPage();other.on('pageerror',e=>errors.push(e.message));await other.goto(url);await other.waitForFunction(()=>!!navigator.serviceWorker.controller);
 const before=await page.evaluate(()=>processingStats.frames),wasmBefore=requests.filter(p=>p.split('?')[0].endsWith('.wasm')).length;
 revision=1;
 // Let the production check throttle elapse while real microphone processing continues.
 await page.waitForTimeout(15500);
 for(const p of [page,other])await p.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await page.waitForFunction(()=>!document.getElementById('update').hidden,undefined,{timeout:20000});await other.waitForFunction(()=>!document.getElementById('update').hidden);
 assert.equal(await page.locator('#update').getAttribute('data-version'),releases[1].pack.version);
 assert.equal(await page.evaluate(()=>running&&!paused&&inputMode==='mic'),true);assert((await page.evaluate(()=>processingStats.frames))>before);
 assert.equal(await page.locator('meta[name="soundglow-release"]').getAttribute('content'),releases[0].pack.version,'No automatic reload during capture');
 await other.screenshot({path:path.join(work,'update-available.png')});
 await other.setViewportSize({width:390,height:844});
 assert(await other.locator('#update').evaluate(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight}),'Update button fits mobile toolbar');
 assert(await other.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow with mobile update button');
 await other.screenshot({path:path.join(work,'update-mobile.png')});
 await other.setViewportSize({width:1280,height:720});
 await other.locator('#update').click();await other.waitForFunction(()=>document.querySelector('meta[name="soundglow-release"]').content===document.getElementById('update').dataset.version||document.getElementById('update').hidden);
 assert.equal(await other.locator('meta[name="soundglow-release"]').getAttribute('content'),releases[1].pack.version);
 assert.equal(await page.evaluate(()=>running&&inputMode==='mic'),true,'Updating another tab must not interrupt the microphone');
 assert.equal(requests.filter(p=>p.split('?')[0].endsWith('.wasm')).length,wasmBefore,'UI update must reuse the WASM');
 // Activate the new worker; each live tab still uses its own complete release.
 await other.evaluate(async()=>{await(await navigator.serviceWorker.getRegistration()).update()});
 let state;for(let i=0;i<30;i++){state=await rpc(other);if(state.workerVersion===releases[1].pack.version)break;await other.waitForTimeout(100)}
 assert.equal(state.workerVersion,releases[1].pack.version);
 assert.equal(await page.locator('meta[name="soundglow-release"]').getAttribute('content'),releases[0].pack.version);
 console.log('PASS: live microphone survives background staging, explicit update and worker activation; WASM reused');
 revision=2;fault='network';assert.equal((await rpc(other)).ready,false);
 fault='integrity';const integrity=await rpc(other);assert.equal(integrity.ready,false,'Reject mixed or corrupted release bytes');assert.equal(integrity.reason,'integrity');
 await other.reload();assert.equal(await other.locator('meta[name="soundglow-release"]').getAttribute('content'),releases[1].pack.version,'Failed deployment falls back to the last complete release');
 assert.equal(await other.locator('#update').isVisible(),false);
 // Explicit full offline preparation includes the optional model, with retry.
 await other.locator('#openSettings:visible, #settings:visible').click();
 holdModel=true;
 // Same-task clicks force cancellation before the worker's inventory lookup completes.
 await other.evaluate(()=>{const button=document.getElementById('offlineDownload');button.click();button.click()});
 await other.getByRole('button',{name:'Download for offline use',exact:true}).waitFor();
 holdModel=true;
 const modelBefore=requests.filter(p=>p.endsWith('/silero.onnx')).length;
 await other.getByRole('button',{name:'Download for offline use',exact:true}).click();
 for(let i=0;i<100&&requests.filter(p=>p.endsWith('/silero.onnx')).length===modelBefore;i++)await other.waitForTimeout(50);
 assert(requests.filter(p=>p.endsWith('/silero.onnx')).length>modelBefore,'Model transfer started');
 await other.getByRole('button',{name:'Cancel download',exact:true}).click();
 await other.getByRole('button',{name:'Download for offline use',exact:true}).waitFor();
 for(let i=0;i<100&&!modelAborted;i++)await other.waitForTimeout(50);
 assert(modelAborted,'Cancellation aborts the in-flight model transfer');
 holdModel=false;modelFailures=1;
 await other.getByRole('button',{name:'Download for offline use',exact:true}).click();
 await other.waitForFunction(()=>document.getElementById('offlineStatus').textContent.includes('Available offline'));
 assert(requests.filter(p=>p.endsWith('/silero.onnx')).length>=2,'Transient model failure retried');
 await context.setOffline(true);await other.reload();
 assert.equal(await other.locator('meta[name="soundglow-release"]').getAttribute('content'),releases[1].pack.version);
 await other.waitForFunction(()=>SoundglowDiagnostics.snapshot().events.some(e=>e.code==='cache.navigation.ready'&&e.details.cacheSource==='cache'));
 await other.getByRole('button',{name:'Play an Example',exact:true}).click();await other.waitForFunction(()=>inputMode==='speech'&&processingStats.frames>200);
 await other.locator('#freeze').click();
 console.log('PASS: failed/inconsistent deployments rejected; offline reload and English speech use cached worklet, worker, WASM and audio');
 await other.goto(url+'?experimentalSpeechGate=1');
 await other.locator('#pitchTab').click();await other.getByRole('button',{name:'Play an Example',exact:true}).click();
 await other.waitForFunction(()=>document.getElementById('pitchCanvas').dataset.neuralStatus==='ready',undefined,{timeout:45000});
 await other.locator('#freeze').click();
 console.log('PASS: optional neural model, ONNX runtime and WASM execute fully offline');
 await context.setOffline(false);revision=1;fault=null;
 // Expire navigation grace while an old tab is still alive: its release stays.
 await other.evaluate(async()=>{for(const name of await caches.keys())if(name.startsWith('soundglow-release-')){const cache=await caches.open(name);const request=(await cache.keys()).find(r=>r.url.endsWith('/__cache__/savedAt'));await cache.put(request,new Response('0'))}});
 const announce=p=>p.evaluate(()=>navigator.serviceWorker.controller.postMessage({type:'using-release',version:document.querySelector('meta[name="soundglow-release"]').content}));
 await announce(other);await other.waitForTimeout(200);assert(await other.evaluate(version=>caches.has('soundglow-release-'+version),releases[0].pack.version));
 await page.close();await announce(other);assert(await other.evaluate(version=>caches.has('soundglow-release-'+version),releases[0].pack.version),'Keep one committed recovery release after old tabs close');
 // A present but corrupted cached document must fall back to a verified recovery release.
 await other.evaluate(async html=>{const cache=await caches.open('soundglow-assets-v1');await cache.put(html,new Response('corrupt cached document',{headers:{'Content-Type':'text/html'}}))},releases[1].pack.html);
 await context.setOffline(true);await other.reload();
 assert.equal(await other.locator('meta[name="soundglow-release"]').getAttribute('content'),releases[0].pack.version,'Corrupt cached HTML must never be used as the startup document');
 await context.setOffline(false);assert.equal((await rpc(other)).ready,true);await other.reload();
 assert.equal(await other.locator('meta[name="soundglow-release"]').getAttribute('content'),releases[1].pack.version,'Online repair restores the latest verified release');
 console.log('PASS: cancellation aborts transfers; corrupted startup document falls back and repairs');
 // Installing a worker already saves its embedded release; startup must use it even if discovery is down.
 revision=2;fault=null;failDiscovery=true;
 await other.evaluate(async()=>{const changed=new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));await(await navigator.serviceWorker.getRegistration()).update();await changed});
 await context.setOffline(true);await other.reload();
 assert.equal(await other.locator('meta[name="soundglow-release"]').getAttribute('content'),releases[2].pack.version,'Newly installed release must supersede a stale discovery pointer while offline');
 console.log('PASS: newly installed release opens offline without update discovery');
 assert.deepEqual(errors,[]);assert(requests.some(p=>p.includes('/release.json?check=')),'Release discovery must bypass stale CDN URLs');
 await other.screenshot({path:path.join(work,'offline-example.png')});
 fs.writeFileSync(path.join(work,'report.json'),JSON.stringify({passed:true,versions:releases.map(r=>r.pack.version),wasmDownloads:wasmBefore,requests:requests.length},null,2));
 console.log('PASS: live-tab cache retention and closed-tab cleanup; no page errors');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>server.close());
