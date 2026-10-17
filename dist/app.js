// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const $=id=>document.getElementById(id),canvas=$('spectrogram'),ctx=canvas.getContext('2d',{alpha:false}),overlay=$('labels'),axis=overlay.getContext('2d');
let returningHome=false;
let engine=null,pcmNode=null,frameQueue=[],spectrumStep=20,spectrumFirst=0;
let currentSpectrumFrame=null,lastAudioTime=0;
let displayPeaks=[],paintedSlices=[],displayMaximum=0,paintedMaximum=0;
let processingStats={frames:0,blocks:0,lastMs:0};
canvas.dataset.engine='praat-wasm';
let inputMode='mic',speechBuffer=null,speechNode=null,speechDestination=null,monitor=null,clipOffset=0,clipStarted=0;
let audio,stream,source,bins,running=false,paused=false,starting=false,last=0,carry=0,raf=0,nyquist=24000,w=0,h=0,plotW=0,plotH=0,map=[],lut=[],dpr=1,pxLeft=0,pxTop=0,pxW=1,pxH=1,previousSlice=null;
const left=52,padTop=20,bottom=27,right=12;
const value=id=>Number($(id).value),maxHz=()=>Math.min(value('maximum'),nyquist);
function frequency(y){const f=1-y/plotH;return $('scale').value==='log'?60*Math.pow(maxHz()/60,f):maxHz()*f}
function yFor(f){return padTop+plotH*(1-($('scale').value==='log'?Math.log(f/60)/Math.log(maxHz()/60):f/maxHz()))}
function colourMap(){let stops='reference'==='reference'?[[17,8,133],[51,12,150],[157,22,167],[247,73,137],[255,237,65]]:'reference'==='ocean'?[[6,11,19],[20,37,86],[18,110,141],[74,209,190],[232,255,213]]:'reference'==='mono'?[[8,11,16],[55,62,73],[115,128,139],[190,207,216],[255,255,255]]:[[8,11,16],[61,39,85],[152,57,93],[231,120,59],[255,243,175]];lut=Array.from({length:256},(_,i)=>{const n=i/255*4,j=Math.min(3,Math.floor(n)),t=n-j;return stops[j].map((a,k)=>Math.round(a+(stops[j+1][k]-a)*t))});$('legend').querySelector('i').style.background=`linear-gradient(90deg,${stops.map(c=>`rgb(${c.join(',')})`).join(',')})`}
function redraw(){
  if(!w)return;
  ctx.fillStyle='reference'==='reference'?'#110885':'#080b10';ctx.fillRect(0,0,canvas.width,canvas.height);
  carry=0;last=0;previousSlice=null;paintedSlices=[];paintedMaximum=displayMaximum;
  const step=spectrumStep;
  // Sample at physical-pixel centres; interpolate spectral levels before colouring.
  map=Array.from({length:pxH},(_,y)=>(frequency((y+.5)*plotH/pxH)-spectrumFirst)/step);
  if(currentSpectrumFrame)delete currentSpectrumFrame.rows;for(const frame of frameQueue)delete frame.rows;
  drawAxes();
}
function sampleSpectrum(position,values=bins){
  const index=Math.max(0,Math.min(values.length-1,position));
  const lo=Math.floor(index),hi=Math.min(values.length-1,lo+1),mix=index-lo;
  const a=Number.isFinite(values[lo])?values[lo]:-160,b=Number.isFinite(values[hi])?values[hi]:-160;
  return a+(b-a)*mix;
}
function drawAxes(){axis.setTransform(dpr,0,0,dpr,0,0);axis.clearRect(0,0,w,h);axis.font='10px system-ui';axis.textBaseline='middle';const ticks=$('scale').value==='log'?[60,100,200,500,1000,2000,5000,10000,20000]:Array.from({length:9},(_,i)=>maxHz()*i/8);for(const f of ticks){if(f>maxHz()||f<($('scale').value==='log'?60:0))continue;const y=yFor(f);axis.fillStyle='#8796aa';axis.textAlign='right';axis.fillText(f>=1000?`${+(f/1000).toFixed(1)}k`:`${Math.round(f)}`,left-9,y);axis.strokeStyle='#96b3d313';axis.beginPath();axis.moveTo(left,y+.5);axis.lineTo(w-right,y+.5);axis.stroke()}axis.textAlign='left';axis.fillStyle='#657489';axis.fillText('Hz',10,10);axis.textAlign='center';for(let i=0;i<=4;i++){const x=left+plotW*i/4;axis.fillText(i===4?'now':`−${+(value('history')*(1-i/4)).toFixed(1)}s`,Math.min(w-20,Math.max(left,x)),h-11)}}
function resize(){
  const box=canvas.getBoundingClientRect();w=Math.max(1,Math.round(box.width));h=Math.max(1,Math.round(box.height));
  dpr=Math.max(1,window.devicePixelRatio||1);
  canvas.width=overlay.width=Math.round(w*dpr);canvas.height=overlay.height=Math.round(h*dpr);
  plotW=Math.max(1,w-left-right);plotH=Math.max(1,h-padTop-bottom);
  pxLeft=Math.round(left*dpr);pxTop=Math.round(padTop*dpr);pxW=Math.max(1,Math.round(plotW*dpr));pxH=Math.max(1,Math.round(plotH*dpr));
  redraw();
}
window.addEventListener('resize',resize);
new ResizeObserver(resize).observe($('plot'));
function render(time){
  if(!running)return;
  if(inputMode==='speech')updatePosition();
  raf=requestAnimationFrame(render);
  if(paused||document.hidden){last=0;previousSlice=null;return}
  if(!last){last=time;lastAudioTime=audio.currentTime;return}
  const dt=Math.max(0,Math.min(value('history'),audio.currentTime-lastAudioTime));last=time;lastAudioTime=audio.currentTime;
  carry+=dt*pxW/value('history');const pixels=Math.min(pxW,Math.floor(carry+1e-9));if(!pixels)return;carry=Math.max(0,carry-pixels);
  const target=audio.currentTime-.16;
  const current=Float32Array.from(map,position=>sampleSpectrum(position));
  const prior=previousSlice||current;
  const cutoff=audio.currentTime-.16-value('history');
  while(displayPeaks.length&&displayPeaks[0].time<cutoff)displayPeaks.shift();
  displayMaximum=displayPeaks.reduce((peak,frame)=>frame.time<=audio.currentTime-.16?Math.max(peak,frame.peak):peak,0);
  const dbPixels=new Float32Array(pixels*pxH);
  const secondsPerPixel=value('history')/pxW,endTime=target-carry*secondsPerPixel;
  function frameRows(frame){if(!frame.rows){const levels=Float32Array.from(frame.power,(p,f)=>PraatDisplay.powerDb(p,spectrumFirst+f*spectrumStep));frame.rows=Float32Array.from(map,position=>sampleSpectrum(position,levels))}return frame.rows}
  for(let x=0;x<pixels;x++){
    const columnTime=endTime-(pixels-x-.5)*secondsPerPixel;
    while(frameQueue.length&&frameQueue[0].time<=columnTime){currentSpectrumFrame=frameQueue.shift();canvas.dataset.frameTime=currentSpectrumFrame.time}
    if(currentSpectrumFrame){
      const a=frameRows(currentSpectrumFrame),next=frameQueue[0];
      const b=next?frameRows(next):a,mix=next?Math.max(0,Math.min(1,(columnTime-currentSpectrumFrame.time)/(next.time-currentSpectrumFrame.time))):0;
      for(let y=0;y<pxH;y++)dbPixels[y*pixels+x]=columnTime-currentSpectrumFrame.time>.03?-160:a[y]+(b[y]-a[y])*mix;
    }else for(let y=0;y<pxH;y++)dbPixels[y*pixels+x]=prior[y]+(current[y]-prior[y])*(x+1)/pixels;
  }
  if(inputMode==='speech')canvas.dataset.clipEndTime=speechPosition()-.16-carry*secondsPerPixel;
  paintedSlices.push({width:pixels,db:dbPixels});
  let excess=paintedSlices.reduce((sum,s)=>sum+s.width,0)-pxW;
  while(excess>0&&paintedSlices.length){const first=paintedSlices[0];if(first.width<=excess){excess-=first.width;paintedSlices.shift()}else{const width=first.width-excess,db=new Float32Array(width*pxH);for(let y=0;y<pxH;y++)db.set(first.db.subarray(y*first.width+excess,(y+1)*first.width),y*width);paintedSlices[0]={width,db};excess=0}}
  function paint(slices,width,x){
    const image=ctx.createImageData(width,pxH);let offset=0;
    for(const slice of slices){for(let y=0;y<pxH;y++)for(let i=0;i<slice.width;i++){
      const level=PraatDisplay.intensity(slice.db[y*slice.width+i],displayMaximum,value('floor'),value('gain'))*255;
      const lo=Math.floor(level),hi=Math.min(255,lo+1),fraction=level-lo,p=(y*width+offset+i)*4;
      for(let c=0;c<3;c++)image.data[p+c]=Math.round(lut[lo][c]+(lut[hi][c]-lut[lo][c])*fraction);image.data[p+3]=255;
    }offset+=slice.width}ctx.putImageData(image,x,pxTop);
  }
  if(displayMaximum!==paintedMaximum){
    const width=paintedSlices.reduce((sum,s)=>sum+s.width,0);paint(paintedSlices,width,pxLeft+pxW-width);paintedMaximum=displayMaximum;
  }else{
    if(pixels<pxW)ctx.drawImage(canvas,pxLeft+pixels,pxTop,pxW-pixels,pxH,pxLeft,pxTop,pxW-pixels,pxH);
    paint([{width:pixels,db:dbPixels}],pixels,pxLeft+pxW-pixels);
  }
  previousSlice=current;

}
function notice(message){$('notice').textContent=message;$('notice').hidden=!message}
function state(text,live=false){$('state').textContent=text;$('state').classList.toggle('live',live)}
function stop(){engine?.dispose();engine=null;pcmNode?.disconnect();pcmNode=null;frameQueue=[];currentSpectrumFrame=null;displayPeaks=[];displayMaximum=0;const stoppedMode=inputMode;running=false;if(speechNode){speechNode.onended=null;speechNode.stop();speechNode.disconnect();speechNode=null;}monitor?.disconnect();speechDestination=null;monitor=null;inputMode='mic';$('testControls').hidden=true;$('demo').textContent='Example';$('demo').setAttribute('aria-pressed','false');cancelAnimationFrame(raf);stream?.getTracks().forEach(t=>t.stop());source?.disconnect();if(audio&&audio.state!=='closed')audio.close().catch(()=>{});stream=source=audio=null;paused=false;$('freeze').disabled=true;setIcon('freeze','⏸','Pause');setIcon('start','🎙︎','Start microphone');state('STOPPED');$('device').textContent=stoppedMode==='speech'?'SAMPLE STOPPED':'MICROPHONE OFF'}
const recoverable=e=>['NotReadableError','AbortError','OverconstrainedError','TrackStartError'].includes(e.name);
async function microphones(){
  if(!navigator.mediaDevices?.enumerateDevices)return [];
  try{
    const devices=(await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='audioinput');
    const select=$('microphone'), selected=select.value;
    select.replaceChildren(new Option('System default',''));
    devices.filter(d=>d.deviceId&&d.deviceId!=='default'&&d.deviceId!=='communications').forEach((d,i)=>select.add(new Option(d.label||`Microphone ${i+1}`,d.deviceId)));
    if([...select.options].some(o=>o.value===selected))select.value=selected;
    return devices;
  }catch{return []}
}
async function capture(){
  const selected=$('microphone').value;
  const raw={echoCancellation:false,noiseSuppression:false,autoGainControl:false};
  if(selected)raw.deviceId={exact:selected};
  try{return await navigator.mediaDevices.getUserMedia({audio:raw,video:false})}
  catch(first){
    if(!recoverable(first))throw first;
    // Some drivers cannot open an unprocessed stream. Retry with native defaults.
    try{return await navigator.mediaDevices.getUserMedia({audio:selected?{deviceId:{exact:selected}}:true,video:false})}
    catch(second){
      if(!recoverable(second)||selected)throw second;
      const devices=await microphones();
      const candidates=devices.filter(d=>d.deviceId&&!['default','communications'].includes(d.deviceId)).sort((a,b)=>Number(/virtual|teams|blackhole|loopback/i.test(a.label))-Number(/virtual|teams|blackhole|loopback/i.test(b.label)));
      for(const d of candidates){
        try{const result=await navigator.mediaDevices.getUserMedia({audio:{deviceId:{exact:d.deviceId}},video:false});$('microphone').value=d.deviceId;return result}
        catch(e){if(!recoverable(e)&&e.name!=='NotFoundError')throw e}
      }
      throw second;
    }
  }
}
function microphoneError(e){
  if(e.name==='NotAllowedError')return 'Microphone access was denied. Allow it for this site in the browser and system microphone settings, then try again.';
  if(e.name==='NotFoundError')return 'No microphone was found. Connect one, then open Settings → Refresh microphones.';
  if(recoverable(e))return 'The browser could not open the microphone. In Settings, choose a physical microphone instead of a virtual input, then retry. Close other apps using it. If this persists in the in-app browser, open this page in Safari or Chrome. ('+e.name+')';
  return e.message||'Could not start the microphone.';
}
$('refreshMic').onclick=microphones;
$('microphone').onchange=async()=>{notice('');if(running&&inputMode==='mic'){stop();await start();}};
async function start(){if(starting)return;showSpectrogram();if(running){const wasSpeech=inputMode==='speech';stop();if(!wasSpeech)return;}starting=true;setBusy(true);notice('');state('CONNECTING');try{if(!navigator.mediaDevices?.getUserMedia)throw new Error('Microphone access requires HTTPS or localhost in a supported browser.');audio=new (window.AudioContext||window.webkitAudioContext)();stream=await capture();if(returningHome){stream.getTracks().forEach(t=>t.stop());stream=null;return}if(audio.state==='suspended')await audio.resume();await connectInput(stream);running=true;paused=false;$('welcome').hidden=true;$('freeze').disabled=false;setIcon('start','■','Stop microphone');state('LIVE',true);microphones();$('device').textContent=stream.getAudioTracks()[0].label||'MICROPHONE';updateResolution();redraw();raf=requestAnimationFrame(render);const activeStream=stream;stream.getAudioTracks()[0].addEventListener('ended',()=>{if(running&&stream===activeStream){stop();notice('The microphone disconnected. Tap Start microphone to reconnect.')}});audio.addEventListener('statechange',()=>{if(running&&audio?.state==='suspended'){state('INTERRUPTED');notice('Audio was interrupted. Tap Resume audio to continue.');setIcon('start','▶','Resume audio')}})}catch(e){stop();if(!returningHome){notice(microphoneError(e));panel(true);microphones();}}finally{starting=false;returningHome=false;setBusy(false)}}
function updateResolution(){if(audio)$('resolution').textContent=`PRAAT · ${(audio.sampleRate/1000).toFixed(1)} kHz · ${spectrumStep.toFixed(1)} Hz / bin`}
$('start').onclick=start;$('begin').onclick=start;
async function togglePause(){
  if(!running||starting)return;
  showSpectrogram();
  const next=!paused;starting=true;setBusy(true);
  try{
    if(inputMode==='speech'){if(next)await audio.suspend();else await audio.resume();}
    else if(!next&&audio.state==='suspended')await audio.resume();
    engine?.reset();frameQueue=[];currentSpectrumFrame=null;displayPeaks=[];displayMaximum=0;bins?.fill(-160);pcmNode?.port.postMessage('reset');
    paused=next;setIcon('freeze',paused?'▶':'⏸',paused?'Resume':'Pause');
    state(paused?'PAUSED':inputMode==='speech'?'EXAMPLE':'LIVE',!paused);last=0;previousSlice=null;
  }catch(e){notice(e.message||'Could not resume audio. Please restart the input.')}
  finally{starting=false;setBusy(false)}
}
$('freeze').onclick=togglePause;
function showSpectrogram(){
  if(location.hash==='#settings'){history.replaceState(null,'',location.pathname+location.search);syncSettings()}
}
function setBusy(busy){
  for(const id of ['start','begin','demo','microphone'])$(id).disabled=busy;
  $('freeze').disabled=busy||!running;
}
function syncSettings(){
  const open=location.hash==='#settings';
  $('panel').hidden=false;$('panel').inert=!open;$('visual').inert=open;
  $('stage').classList.toggle('settings-open',open);
  $('panel').setAttribute('aria-hidden',String(!open));
  $('settings').setAttribute('aria-expanded',String(open));
  $('settings').textContent='⚙';
  $('settings').setAttribute('aria-label',open?'Return to spectrogram':'Settings');
  $('settings').title=open?'Return to spectrogram':'Settings';
  if(open)microphones();
}
function panel(open){
  if(open===(location.hash==='#settings'))return;
  if(open)history.pushState({soundglowSettings:true},'',location.pathname+location.search+'#settings');
  else if(history.state?.soundglowSettings){history.back();return}
  else history.replaceState(null,'',location.pathname+location.search);
  syncSettings();
}
window.addEventListener('popstate',syncSettings);window.addEventListener('hashchange',syncSettings);
$('settings').onclick=()=>panel(location.hash!=='#settings');
document.addEventListener('keydown',e=>{if(e.key==='Escape')panel(false)});
syncSettings();
for(const id of ['maximum','scale','history','floor','gain','window'])$(id).addEventListener('input',()=>{$('maxOut').textContent=`${value('maximum')/1000} kHz`;$('historyOut').textContent=`${value('history')} s`;$('floorOut').textContent=`${value('floor')} dB`;$('gainOut').textContent=`${value('gain')} dB`;if(['maximum','window'].includes(id)){engine?.reset();frameQueue=[];currentSpectrumFrame=null;displayPeaks=[];displayMaximum=0;bins?.fill(-160)}if(['maximum','scale','history','window','floor','gain'].includes(id))redraw()});
window.addEventListener('pagehide',stop);colourMap();resize();

function acceptFrames(frames,result){
      if(spectrumStep!==result.frequencyStep||spectrumFirst!==result.firstFrequency){spectrumStep=result.frequencyStep;spectrumFirst=result.firstFrequency;redraw()}
      if(!bins||bins.length!==result.bins){bins=new Float32Array(result.bins);bins.fill(-160)}
      while(displayPeaks.length&&displayPeaks[0].time<audio.currentTime-value('history')-.2)displayPeaks.shift();
      for(const frame of frames){let peak=0;for(let f=0;f<frame.power.length;f++)peak=Math.max(peak,PraatDisplay.powerDb(frame.power[f],result.firstFrequency+f*result.frequencyStep));displayPeaks.push({time:frame.time,peak})}
      frameQueue.push(...frames);if(frameQueue.length>200)frameQueue.splice(0,frameQueue.length-200);
      processingStats.frames+=frames.length;processingStats.blocks++;processingStats.lastMs=result.timings.analysisMs;canvas.dataset.processedFrames=processingStats.frames;canvas.dataset.analysisMs=processingStats.lastMs;updateResolution();

}
async function connectInput(input){
  const context=audio;
  const client=new PraatClient({workerURL:'vendor/praat/worker.js?profile=release'});
  engine=new PraatStream({client,sampleRate:context.sampleRate,
    settings:()=>({maximumFrequency:maxHz(),windowSeconds:value('window'),frequencyStep:maxHz()/500}),
    onFrames:acceptFrames,onError:error=>{stop();notice('Praat audio processing failed: '+error.message)}
  });
  await client.init();
  await context.audioWorklet.addModule('pcm-worklet.js');
  if(returningHome||context!==audio){client.dispose();throw new Error('Input stopped')}
  source=context.createMediaStreamSource(input);pcmNode=new AudioWorkletNode(context,'pcm-input');
  const activeEngine=engine;
  pcmNode.port.onmessage=({data})=>{if(!paused&&engine===activeEngine)activeEngine.push(data.pcm,data.start)};
  source.connect(pcmNode);pcmNode.connect(context.destination);nyquist=context.sampleRate/2;
  bins=new Float32Array(400);bins.fill(-160);
}
function speechPosition(){if(!speechBuffer)return 0;const t=clipOffset+Math.max(0,audio.currentTime-clipStarted);return speechNode?.loop?t%speechBuffer.duration:Math.min(t,speechBuffer.duration)}
function updatePosition(){const t=speechPosition();$('seek').value=t;const format=n=>`${Math.floor(n/60)}:${String(Math.floor(n%60)).padStart(2,'0')}`;$('position').textContent=`${format(t)} / ${format(Math.ceil(speechBuffer.duration))}`}
function playFrom(offset){
  if(speechNode){speechNode.onended=null;speechNode.stop();speechNode.disconnect()}
  engine?.reset();frameQueue=[];currentSpectrumFrame=null;displayPeaks=[];displayMaximum=0;bins?.fill(-160);pcmNode?.port.postMessage('reset');
  clipOffset=Math.max(0,Math.min(offset,speechBuffer.duration-.001));clipStarted=audio.currentTime;
  speechNode=audio.createBufferSource();speechNode.buffer=speechBuffer;speechNode.loop=$('loop').checked;
  speechNode.connect(speechDestination);speechNode.connect(monitor);
  speechNode.onended=()=>{if(running&&inputMode==='speech'&&!speechNode.loop){stop();notice('Speech recording finished. Tap Example to play again.')}};
  speechNode.start(0,clipOffset);last=0;previousSlice=null;updatePosition();
}
async function startSpeech(){
  if(starting)return;showSpectrogram();
  if(running&&inputMode==='speech'){
    $('listen').checked=true;monitor.gain.value=1;
    if(paused){await togglePause();return}
    try{if(audio.state==='suspended')await audio.resume();playFrom(0);redraw();notice('')}catch(e){notice(e.message||'Could not resume the sample.')}return;
  }
  stop();starting=true;setBusy(true);notice('');state('LOADING');
  try{
    audio=new (window.AudioContext||window.webkitAudioContext)();await audio.resume();
    const response=await fetch('audio/speech-english.wav');if(returningHome)return;if(!response.ok)throw new Error('Speech recording could not be loaded. Please retry.');
    const bytes=await response.arrayBuffer();if(returningHome)return;speechBuffer=await audio.decodeAudioData(bytes);if(returningHome)return;
    speechDestination=audio.createMediaStreamDestination();stream=speechDestination.stream;await connectInput(stream);
    monitor=audio.createGain();$('listen').checked=true;monitor.gain.value=1;monitor.connect(audio.destination);
    inputMode='speech';running=true;paused=false;$('seek').max=speechBuffer.duration;
    $('testControls').hidden=false;$('welcome').hidden=true;$('freeze').disabled=false;setIcon('freeze','⏸','Pause');$('demo').textContent='Example';$('demo').setAttribute('aria-pressed','true');setIcon('start','🎙︎','Use microphone');
    $('device').textContent='TEST INPUT · RECORDED SPEECH';state('EXAMPLE',true);updateResolution();redraw();playFrom(0);raf=requestAnimationFrame(render);
  }catch(e){stop();if(!returningHome)notice(e.message||'Could not start recorded speech.')}
  finally{starting=false;returningHome=false;setBusy(false)}
}
$('demo').onclick=startSpeech;
$('seek').oninput=()=>{if(running&&inputMode==='speech')playFrom(value('seek'))};
$('restart').onclick=()=>{if(running&&inputMode==='speech'){playFrom(0);redraw()}};
$('loop').onchange=()=>{if(speechNode){const position=speechPosition();clipOffset=position;clipStarted=audio.currentTime;speechNode.loop=$('loop').checked}};
$('listen').onchange=()=>{if(monitor)monitor.gain.value=$('listen').checked?1:0};

function setIcon(id,icon,label){$(id).textContent=id==='start'&&icon==='🎙︎'?'●':icon;$(id).setAttribute('aria-label',label);$(id).title=label;}

$('home').onclick=e=>{
  e.preventDefault();
  returningHome=starting;
  stop();showSpectrogram();redraw();notice('');
  $('welcome').hidden=false;state('MIC OFF');
  $('device').textContent='MICROPHONE SPECTROGRAM';
  $('resolution').textContent='LOCAL AUDIO · NO UPLOADS';
};
