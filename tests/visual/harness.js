// Controlled replay through the production PraatStream, acceptFrames and render.
(async()=>{
 window.visualReplay={status:'running'};
 try{
  // Isolate signal rendering from platform font metrics in surrounding chrome.
  const fixtureHeight=window.innerWidth<=600?707:739;
  canvas.style.height=overlay.style.height=fixtureHeight+'px';
  await document.fonts.ready;
  const pcm=new Float32Array(await (await fetch('/tests/visual/generated/matched.f32')).arrayBuffer());
  const client=new PraatClient({workerURL:'vendor/praat/worker.js?profile=release'});
  const settings={windowSeconds:.005,maximumFrequency:5000,timeStep:.005,frequencyStep:10};
  const preview=await client.analyse({pcm:pcm.slice(0,2640),sampleRate:24000,...settings});
  audio={currentTime:.16,sampleRate:24000,state:'running',close:async()=>{}};nyquist=12000;spectrumStep=preview.frequencyStep;spectrumFirst=preview.firstFrequency;
  bins=new Float32Array(preview.bins);bins.fill(-160);running=true;paused=false;
  state('COMPARISON');$('device').textContent='ENGLISH SPEECH · IDENTICAL PCM';updateResolution();$('welcome').hidden=true;
  await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);resize();
  window.requestAnimationFrame=()=>0;redraw();render(1);
  let failure;const frames=[];
  engine=new PraatStream({client,sampleRate:24000,settings:()=>settings,onFrames:(batch,result)=>{frames.push(...batch);acceptFrames(batch,result)},onError:e=>{failure=e}});
  let clock=.16;
  for(let i=0;i<pcm.length;i+=2400){
   engine.push(pcm.slice(i,i+2400),i/24000);while(engine.busy)await new Promise(resolve=>setTimeout(resolve,0));if(failure)throw failure;
   const until=Math.min((i+2400)/24000,10.16);
   while(clock+1/60<until){clock+=1/60;audio.currentTime=clock;render(clock*1000+1)}
   if(until>clock){clock=until;audio.currentTime=clock;render(clock*1000+1)}
  }
  paused=true;
  canvas.dataset.comparison=JSON.stringify({sampleRate:24000,hop:.005,window:.005,frequencyStep:spectrumStep,frames:frames.length,firstTime:frames[0].time,lastTime:frames.at(-1).time,displayEnd:clock-.16,columns:paintedSlices.reduce((n,s)=>n+s.width,0),width:pxW,maximum:displayMaximum});
  client.dispose();window.visualReplay={status:'complete',...JSON.parse(canvas.dataset.comparison)};
 }catch(e){window.visualReplay={status:'failed',error:e.stack||e.message};notice(e.stack||e.message);state('COMPARISON FAILED')}
})();
