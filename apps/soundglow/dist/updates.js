// SPDX-License-Identifier: GPL-3.0-or-later
(async()=>{
 const version=document.querySelector('meta[name="soundglow-release"]')?.content;
 if(!version)return;
 const button=document.getElementById('offlineDownload'),status=document.getElementById('offlineStatus'),progress=document.getElementById('offlineProgress'),update=document.getElementById('update');
 const diagnostics=()=>window.SoundglowDiagnostics;
 if(!window.BrowserOffline?.createResources||!window.BrowserOffline?.createWorkerSession){status.textContent='Offline setup unavailable. Reload to try again.';diagnostics()?.offline('setup','failed',{cacheReason:'unavailable'});return;}
 if(!('serviceWorker'in navigator)||!('caches'in window)){status.textContent='Offline downloads aren’t supported in this browser.';diagnostics()?.offline('setup','unsupported');return;}
 const resources=BrowserOffline.createResources(),session=BrowserOffline.createWorkerSession({resources});
 const freshness=BrowserOffline.createUpdatePolicy({app:'soundglow',current:version});
 const base=document.querySelector('meta[name="soundglow-base"]').content;
 let registration,initializing,initialized=false,checking=false,lastCheck=0,downloading=false,resumeWanted=false,retryTimer,retryDelay=30000,statusGeneration=0,active=true,downloadController,downloadWorker;
 try{resumeWanted=localStorage.getItem('soundglow.offlineDownloadWanted')==='yes'}catch{}
 const intent=value=>{resumeWanted=value;try{localStorage.setItem('soundglow.offlineDownloadWanted',value?'yes':'no')}catch{}};
 const rpc=(type,timeout=40000,signal)=>session.call(type,{version},timeout,signal);
 const schedule=()=>{clearTimeout(retryTimer);retryTimer=setTimeout(()=>{if(!active||document.hidden){schedule();return}if(!navigator.serviceWorker.controller)void initialize();else if(resumeWanted)void download();else void refreshStatus()},retryDelay);retryDelay=Math.min(300000,retryDelay*2)};
 update.onclick=()=>update.dataset.version?BrowserOffline.applyUpdate(update.dataset.version):location.reload();
 const cancelWorker=worker=>{try{worker?.postMessage({type:'cancel-offline'})}catch{/* A redundant worker has already stopped. */}};
 const announce=()=>navigator.serviceWorker.controller?.postMessage({type:'using-release',version});
 async function refreshStatus(){
  if(!active||downloading||!navigator.serviceWorker.controller)return;
  const generation=++statusGeneration,epoch=session.generation();
  try{
   const reply=await rpc('offline-status',12000);
   if(!active||epoch!==session.generation()||downloading||generation!==statusGeneration)return;
   if(reply.reason){diagnostics()?.offline('storage','failed',{cacheReason:reply.reason});status.textContent='Offline storage unavailable. Free some space or check browser settings, then retry.';button.hidden=false;button.disabled=false;button.textContent='Retry offline setup';return;}
   status.textContent=reply.ready?'✓ Available offline':`Save all features for offline use · ${Math.ceil(reply.bytes/1e6)} MB`;
   button.hidden=reply.ready;button.disabled=false;button.textContent='Download for offline use';
   diagnostics()?.offline('storage',reply.ready?'ready':'unavailable',{cacheReason:reply.ready?'none':'unavailable'});
   if(reply.ready)intent(false);else if(resumeWanted&&!document.hidden)void download();
  }catch(error){
   if(!active||epoch!==session.generation()||downloading||generation!==statusGeneration)return;
   diagnostics()?.offline('storage','failed',{},error);status.textContent='Could not check offline storage. Try again.';button.hidden=false;button.disabled=false;
  }
 }
 async function download(){
  if(!active||downloading)return;
  if(!navigator.serviceWorker.controller){await initialize();return;}
  const epoch=session.generation(),controller=downloadController=new AbortController(),worker=downloadWorker=navigator.serviceWorker.controller;
  downloading=true;statusGeneration++;intent(true);clearTimeout(retryTimer);
  const started=performance.now();button.hidden=false;button.disabled=false;button.textContent='Cancel download';progress.hidden=false;progress.removeAttribute('value');status.textContent='Downloading for offline use…';diagnostics()?.offline('download','started');
  let pulsing=false;
  const pulse=setInterval(async()=>{
   if(pulsing||controller.signal.aborted)return;pulsing=true;
   try{const reply=await rpc('download-state',5000,controller.signal);if(!reply.active)throw new DOMException('Worker download interrupted','TimeoutError')}
   catch(error){if(!controller.signal.aborted)controller.abort(error)}finally{pulsing=false}
  },20000);
  try{
   const reply=await rpc('download-offline',260000,controller.signal);
   if(!active||epoch!==session.generation())return;
   if(!reply.ready)throw Object.assign(Error('Offline download incomplete'),{offlineReason:reply.reason||'unavailable'});
   intent(false);retryDelay=30000;diagnostics()?.offline('download','ready',{durationMs:performance.now()-started,byteCount:reply.bytes});
  }catch(error){
   if(!active||epoch!==session.generation())return;
   const cancelled=error.offlineReason==='cancelled';diagnostics()?.offline('download',cancelled?'paused':'failed',{durationMs:performance.now()-started,cacheReason:error.offlineReason||(['TimeoutError','AbortError'].includes(error.name)?'timeout':'unknown')},error);
   status.textContent=cancelled?'Download paused. Download again to continue.':error.offlineReason==='quota'?'Not enough storage. Free some space, then resume.':'Download incomplete. Saved files are kept; retrying when the connection improves.';
   if(cancelled)intent(false);else if(['network','timeout'].includes(error.offlineReason)||error.name==='TimeoutError')schedule();button.textContent='Resume download';
   if(controller.signal.aborted)cancelWorker(worker);
  }finally{
   clearInterval(pulse);
   if(active&&epoch===session.generation()){downloading=false;downloadController=null;downloadWorker=null;progress.hidden=true;if(!resumeWanted)void refreshStatus();}
  }
 }
 button.onclick=()=>{
  if(downloading){intent(false);clearTimeout(retryTimer);/* Keep the queued RPC start-before-cancel ordering. */const worker=downloadWorker;queueMicrotask(()=>cancelWorker(worker));return;}
  void resources.deadline(3000,()=>navigator.storage?.persist?.()).then(persistent=>diagnostics()?.offline('storage','ready',{persistent})).catch(error=>diagnostics()?.offline('storage','failed',{},error));void download();
 };
 async function check(force=false){
  if(!active||checking||document.hidden||!force&&Date.now()-lastCheck<15000||!navigator.serviceWorker.controller)return;
  const epoch=session.generation();checking=true;lastCheck=Date.now();announce();const started=performance.now();diagnostics()?.offline('update','started');
  try{
   const reply=await rpc('prepare-update',205000);
   if(!active||epoch!==session.generation())return;
   await resources.deadline(15000,()=>registration?.update(),session.signal());
   await session.settle(registration,190000);
   if(!active||epoch!==session.generation())return;
   diagnostics()?.offline('update',reply.ready?'ready':'failed',{durationMs:performance.now()-started,...(reply.reason?{cacheReason:reply.reason}:{})});
   if(reply.ready&&reply.version!==version){diagnostics()?.event('cache.update_available');update.hidden=false;update.dataset.version=reply.version;freshness.offer(reply.version)}else if(reply.ready){update.hidden=true;delete update.dataset.version}
   if(reply.ready)void refreshStatus();
  }catch(error){if(active&&epoch===session.generation())diagnostics()?.offline('update','failed',{durationMs:performance.now()-started},error)}
  finally{if(epoch===session.generation())checking=false;}
 }
 function initialize(){
  if(initializing)return initializing;
  const epoch=session.generation(),signal=session.signal(),started=performance.now();diagnostics()?.offline('setup','started');
  initializing=(async()=>{try{
   if(navigator.serviceWorker.controller)registration=await resources.deadline(2000,()=>navigator.serviceWorker.getRegistration(),signal);
   else{
    registration=await resources.deadline(15000,()=>navigator.serviceWorker.register(base+'sw.js',{scope:base,updateViaCache:'none'}),signal);diagnostics()?.observeOffline(registration);
    await resources.deadline(60000,()=>navigator.serviceWorker.ready,signal);
    if(!navigator.serviceWorker.controller)await resources.deadline(5000,inner=>new Promise((resolve,reject)=>{
     const cleanup=()=>{navigator.serviceWorker.removeEventListener('controllerchange',done);inner.removeEventListener('abort',abort)},done=()=>{cleanup();resolve()},abort=()=>{cleanup();reject(inner.reason)};
     navigator.serviceWorker.addEventListener('controllerchange',done,{once:true});inner.addEventListener('abort',abort,{once:true});
    }),signal);
   }
   if(!active||epoch!==session.generation())return;
   if(registration)diagnostics()?.observeOffline(registration);announce();await refreshStatus();if(!active||epoch!==session.generation())return;initialized=true;void check();diagnostics()?.offline('setup','ready',{durationMs:performance.now()-started});retryDelay=30000;
  }catch(error){
   if(!active||epoch!==session.generation())return;
   diagnostics()?.offline('setup','failed',{durationMs:performance.now()-started},error);status.textContent='Offline setup unavailable. Retry when your connection or storage improves.';button.hidden=false;button.disabled=false;button.textContent='Retry offline setup';schedule();
  }})().finally(()=>{if(epoch===session.generation())initializing=null});return initializing;
 }
 const wake=(force=false)=>{if(!active)return;if(!initialized||!navigator.serviceWorker.controller||!registration)void initialize();else{if(resumeWanted&&!document.hidden)void download();void refreshStatus();void check(force)}};
 function interrupt(){
  if(downloadWorker){const worker=downloadWorker;queueMicrotask(()=>cancelWorker(worker))}
  session.abort();downloadController?.abort(new DOMException('Page suspended','TimeoutError'));downloadController=null;downloadWorker=null;
  statusGeneration++;downloading=false;checking=false;initializing=null;initialized=false;progress.hidden=true;lastCheck=0;
 }
 navigator.serviceWorker.addEventListener('controllerchange',()=>{interrupt();session.reset();announce();wake(true)});
 window.addEventListener('pagehide',()=>{active=false;clearTimeout(retryTimer);interrupt()});
 window.addEventListener('pageshow',()=>{if(!active)session.reset();active=true;wake(true)});
 window.addEventListener('online',()=>{retryDelay=30000;wake(true)});window.addEventListener('focus',()=>wake());
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)wake(true)});setInterval(()=>{if(!document.hidden)void check()},60000);
 void initialize();
})();
