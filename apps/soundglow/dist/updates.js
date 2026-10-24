// SPDX-License-Identifier: GPL-3.0-or-later
(async()=>{
 const version=document.querySelector('meta[name="soundglow-release"]')?.content;
 if(!version)return;
 if(!window.BrowserOffline?.createResources){document.getElementById('offlineStatus').textContent='Offline setup unavailable. Reload to try again.';window.SoundglowDiagnostics?.offline('setup','failed',{cacheReason:'unavailable'});return;}
 const resources=BrowserOffline.createResources(),diagnostics=()=>window.SoundglowDiagnostics;
 const base=document.querySelector('meta[name="soundglow-base"]').content,update=document.getElementById('update'),button=document.getElementById('offlineDownload'),status=document.getElementById('offlineStatus'),progress=document.getElementById('offlineProgress');
 if(!('serviceWorker'in navigator)||!('caches'in window)){status.textContent='Offline downloads aren’t supported in this browser.';diagnostics()?.offline('setup','unsupported');return;}
 let registration,initializing,checking=false,lastCheck=0,downloading=false,resumeWanted=false,retryTimer,retryDelay=30000,statusGeneration=0;
 try{resumeWanted=localStorage.getItem('soundglow.offlineDownloadWanted')==='yes'}catch{}
 const intent=value=>{resumeWanted=value;try{localStorage.setItem('soundglow.offlineDownloadWanted',value?'yes':'no')}catch{}};
 const schedule=()=>{clearTimeout(retryTimer);retryTimer=setTimeout(()=>{if(document.hidden){schedule();return}if(!navigator.serviceWorker.controller)void initialize();else if(resumeWanted)void download();else void refreshStatus()},retryDelay);retryDelay=Math.min(300000,retryDelay*2)};
 update.onclick=()=>location.reload();
 function rpc(type,timeout=40000){return resources.deadline(timeout,signal=>new Promise((resolve,reject)=>{
  const channel=new MessageChannel(),abort=()=>{channel.port1.close();reject(signal.reason)};signal.addEventListener('abort',abort,{once:true});
  channel.port1.onmessage=({data})=>{signal.removeEventListener('abort',abort);channel.port1.close();resolve(data)};
  try{navigator.serviceWorker.controller.postMessage({type,version},[channel.port2])}catch(error){signal.removeEventListener('abort',abort);channel.port1.close();reject(error)}
 }))}
 function announce(){navigator.serviceWorker.controller?.postMessage({type:'using-release',version})}
 async function refreshStatus(){
  if(downloading||!navigator.serviceWorker.controller)return;
  const generation=++statusGeneration;
  try{const reply=await rpc('offline-status',5000);
   if(downloading||generation!==statusGeneration)return;
   if(reply.reason){diagnostics()?.offline('storage','failed',{cacheReason:reply.reason});status.textContent='Offline storage unavailable. Free some space or check browser settings, then retry.';button.hidden=false;button.textContent='Retry offline setup';return;}
   status.textContent=reply.ready?'✓ Available offline':`Save all features for offline use · ${Math.ceil(reply.bytes/1e6)} MB`;
   button.hidden=reply.ready;button.disabled=false;button.textContent='Download for offline use';
   diagnostics()?.offline('storage',reply.ready?'ready':'unavailable',{cacheReason:reply.ready?'none':'unavailable'});
   if(reply.ready)intent(false);else if(resumeWanted&&!document.hidden)void download();
  }catch(error){diagnostics()?.offline('storage','failed',{},error);if(downloading||generation!==statusGeneration)return;status.textContent='Could not check offline storage. Try again.';button.hidden=false;button.disabled=false;}
 }
 async function download(){
  if(downloading)return;if(!navigator.serviceWorker.controller){await initialize();return;}
  downloading=true;statusGeneration++;intent(true);clearTimeout(retryTimer);const started=performance.now();button.hidden=false;button.disabled=false;button.textContent='Cancel download';progress.hidden=false;progress.removeAttribute('value');status.textContent='Downloading for offline use…';diagnostics()?.offline('download','started');
  try{const reply=await rpc('download-offline',610000);if(!reply.ready)throw Object.assign(Error('Offline download incomplete'),{offlineReason:reply.reason||'unavailable'});
   intent(false);retryDelay=30000;diagnostics()?.offline('download','ready',{durationMs:performance.now()-started,byteCount:reply.bytes});
  }catch(error){const cancelled=error.offlineReason==='cancelled';diagnostics()?.offline('download',cancelled?'paused':'failed',{durationMs:performance.now()-started,cacheReason:error.offlineReason||'unknown'},error);
   status.textContent=cancelled?'Download paused. Download again to continue.':error.offlineReason==='quota'?'Not enough storage. Free some space, then resume.':'Download incomplete. Saved files are kept; retrying when the connection improves.';
   if(cancelled)intent(false);else if(['network','timeout'].includes(error.offlineReason))schedule();button.textContent='Resume download';
  }finally{downloading=false;progress.hidden=true;if(!resumeWanted)void refreshStatus();}
 }
 button.onclick=()=>{
  if(downloading){intent(false);clearTimeout(retryTimer);/* The download RPC is queued by deadline(); preserve start-before-cancel ordering. */queueMicrotask(()=>navigator.serviceWorker.controller?.postMessage({type:'cancel-offline'}));return;}
  void resources.deadline(3000,()=>navigator.storage?.persist?.()).then(persistent=>diagnostics()?.offline('storage','ready',{persistent})).catch(error=>diagnostics()?.offline('storage','failed',{},error));void download();
 };
 async function check(){
  if(checking||document.hidden||Date.now()-lastCheck<15000||!navigator.serviceWorker.controller)return;
  checking=true;lastCheck=Date.now();announce();const started=performance.now();diagnostics()?.offline('update','started');
  try{const reply=await rpc('prepare-update');diagnostics()?.offline('update',reply.ready?'ready':'failed',{durationMs:performance.now()-started,...(reply.reason?{cacheReason:reply.reason}:{})});
   if(reply.ready&&reply.version!==version){diagnostics()?.event('cache.update_available');update.hidden=false;update.dataset.version=reply.version}else if(reply.ready){update.hidden=true;delete update.dataset.version}if(reply.ready)void refreshStatus();
  }catch(error){diagnostics()?.offline('update','failed',{durationMs:performance.now()-started},error)}finally{checking=false}
  void registration?.update().catch(error=>diagnostics()?.offline('worker','failed',{},error));
 }
 function initialize(){
  if(initializing)return initializing;const started=performance.now();diagnostics()?.offline('setup','started');
  initializing=(async()=>{try{
   if(navigator.serviceWorker.controller)registration=await resources.deadline(2000,()=>navigator.serviceWorker.getRegistration());
   else{registration=await resources.deadline(15000,()=>navigator.serviceWorker.register(base+'sw.js',{scope:base,updateViaCache:'none'}));diagnostics()?.observeOffline(registration);await resources.deadline(60000,()=>navigator.serviceWorker.ready);
    if(!navigator.serviceWorker.controller)await resources.deadline(5000,signal=>new Promise((resolve,reject)=>{const cleanup=()=>{navigator.serviceWorker.removeEventListener('controllerchange',done);signal.removeEventListener('abort',abort)},done=()=>{cleanup();resolve()},abort=()=>{cleanup();reject(signal.reason)};navigator.serviceWorker.addEventListener('controllerchange',done,{once:true});signal.addEventListener('abort',abort,{once:true})}));
   }
   if(registration)diagnostics()?.observeOffline(registration);announce();await refreshStatus();void check();diagnostics()?.offline('setup','ready',{durationMs:performance.now()-started});retryDelay=30000;
  }catch(error){diagnostics()?.offline('setup','failed',{durationMs:performance.now()-started},error);status.textContent='Offline setup unavailable. Retry when your connection or storage improves.';button.hidden=false;button.disabled=false;button.textContent='Retry offline setup';schedule()}})().finally(()=>initializing=null);return initializing;
 }
 const wake=()=>{if(!navigator.serviceWorker.controller)void initialize();else{void refreshStatus();void check()}};
 navigator.serviceWorker.addEventListener('controllerchange',()=>{announce();wake()});
 window.addEventListener('online',()=>{retryDelay=30000;if(resumeWanted)void download();wake()});window.addEventListener('focus',wake);window.addEventListener('pageshow',wake);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)wake()});setInterval(()=>{if(!document.hidden)void check()},60000);
 void initialize();
})();
