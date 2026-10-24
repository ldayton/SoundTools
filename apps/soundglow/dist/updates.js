// SPDX-License-Identifier: GPL-3.0-or-later
// No registration in the source preview: only packaged releases have this meta.
(async()=>{
 const version=document.querySelector('meta[name="soundglow-release"]')?.content;
 if(!version||!('serviceWorker' in navigator))return;
 const base=document.querySelector('meta[name="soundglow-base"]').content,button=document.getElementById('update');
 button.onclick=()=>location.reload();
 try{
  const registration=await navigator.serviceWorker.register(base+'sw.js',{scope:base,updateViaCache:'none'});
  await navigator.serviceWorker.ready;
  if(!navigator.serviceWorker.controller)await new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));
  function announce(){navigator.serviceWorker.controller?.postMessage({type:'using-release',version})}
  let checking=false,lastCheck=0;
  async function check(){
   if(checking||document.hidden||Date.now()-lastCheck<15000)return;
   checking=true;lastCheck=Date.now();announce();
   try{
    const reply=await new Promise((resolve,reject)=>{
     const channel=new MessageChannel(),timer=setTimeout(()=>{channel.port1.close();reject(Error('Update check timed out'))},12000);
     channel.port1.onmessage=({data})=>{clearTimeout(timer);channel.port1.close();resolve(data)};
     navigator.serviceWorker.controller.postMessage({type:'prepare-update'},[channel.port2]);
    });
    // Worker installation/activation never reloads a page or touches audio.
    if(reply.ready&&reply.version!==version){window.SoundglowDiagnostics?.event('cache.update_available');button.hidden=false;button.dataset.version=reply.version}
    else if(reply.ready){button.hidden=true;delete button.dataset.version}
   }catch{/* The currently running release remains usable while offline. */}
   finally{checking=false}
   void registration.update().catch(()=>{});
  }
  navigator.serviceWorker.addEventListener('controllerchange',()=>{announce();void check()});
  window.addEventListener('online',()=>void check());window.addEventListener('focus',()=>void check());
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void check()});
  setInterval(()=>void check(),60000);announce();void check();
 }catch(error){window.SoundglowDiagnostics?.capture(error,'cache.setup_failed');/* Caching is optional; failure must not prevent microphone use. */}
})();
