// Controlled replay through the production PraatStream, acceptFrames and render.
(async()=>{
 window.voiceReplay={status:'running'};
 try{
  applyPreset("voice");
  const reference=await (await fetch("/tests/visual/generated/voice-reference.json")).json();
  // Isolate signal rendering from platform font metrics in surrounding chrome.
  const fixtureHeight=window.innerWidth<=600?707:739;
  canvas.style.height=overlay.style.height=fixtureHeight+'px';
  await document.fonts.ready;
  const pcm=new Float32Array(await (await fetch('/tests/visual/generated/voice-speech.f32')).arrayBuffer());
  const client=new PraatClient({workerURL:'vendor/praat/worker.js?profile=release'});
  const settings=analysisSettings();
  const preview=await client.analyse({pcm:pcm.slice(0,9600),sampleRate:48000,...settings});
  audio={currentTime:analysisDelay,sampleRate:48000,state:'running',close:async()=>{}};nyquist=12000;spectrumStep=preview.frequencyStep;spectrumFirst=preview.firstFrequency;
  bins=new Float32Array(preview.bins);bins.fill(-160);running=true;paused=false;
  state('COMPARISON');$('device').textContent='ENGLISH SPEECH · IDENTICAL PCM';updateResolution();$('welcome').hidden=true;
  await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);resize();
  window.requestAnimationFrame=()=>0;redraw();render(1);
  let failure;const frames=[];let clock=0,nativePending=false,waiting=null,sequence=0;
  const jitter=new URL(location.href).searchParams.get('delivery')==='jitter';
  const delayedClient={dispose:()=>client.dispose(),analyse:async request=>{
    const started=clock,index=sequence++;nativePending=true;
    try{const result=await client.analyse(request);const delay=jitter?({6:.35,31:.12,61:.28}[index]||0):0;
      await new Promise(resolve=>{waiting={due:started+delay,resolve};nativePending=false});return result;
    }finally{nativePending=false}
  }};
  engine=new PraatStream({client:delayedClient,sampleRate:48000,settings:()=>settings,onFrames:(batch,result)=>{const now=Date.now;try{for(const frame of batch){const i=Math.round((frame.time-.032)/.016);if(i>=reference.clockTimes.length)throw Error('Clock oracle exhausted');Date.now=()=>reference.clockTimes[i];frames.push(...acceptFrames([frame],result))}}finally{Date.now=now}},onError:e=>{failure=e}});
  async function settle(){
    for(;;){while(nativePending)await new Promise(resolve=>setTimeout(resolve,0));if(failure)throw failure;
      if(engine.busy&&!waiting&&!nativePending){await new Promise(resolve=>setTimeout(resolve,0));continue}
      if(waiting&&waiting.due<=clock+1e-9){const done=waiting;waiting=null;done.resolve();for(let i=0;i<8;i++)await Promise.resolve();continue}break;
    }
  }
  let offset=0;
  // PCM packets arrive independently of delivery. Rendering keeps running while
  // a completed WASM result is held, unlike the original wait-per-block replay.
  for(let tick=0;tick<=Math.ceil((10+analysisDelay)*60);tick++){
    clock=Math.min(tick/60,10+analysisDelay);audio.currentTime=clock;
    while(offset<pcm.length&&Math.min(offset+4800,pcm.length)/48000<=clock+1e-9){const end=Math.min(offset+4800,pcm.length);engine.push(pcm.slice(offset,end),offset/48000);offset=end;await settle()}
    await settle();if(clock>=analysisDelay)render(clock*1000+1);
  }
  paused=true;
  canvas.dataset.comparison=JSON.stringify({sampleRate:48000,hop:settings.timeStep,window:settings.windowSeconds,frequencyStep:spectrumStep,inputSamples:pcm.length,offset,pendingSamples:engine.pending.length,sequence,frames:frames.length,firstTime:frames[0].time,lastTime:frames.at(-1).time,displayEnd:Number(canvas.dataset.plottedUntil),delivery:jitter?'jitter':'paced',underflowHolds:processingStats.underflowHolds||0,columns:paintedSlices.reduce((n,s)=>n+s.width,0),width:pxW,maximum:displayMaximum});
  window.voiceComparison={reference,frames:frames.filter(f=>f.time<10-1e-7)};
  client.dispose();window.voiceReplay={status:'complete',...JSON.parse(canvas.dataset.comparison)};
 }catch(e){window.voiceReplay={status:'failed',error:e.stack||e.message};notice(e.stack||e.message);state('COMPARISON FAILED')}
})();
