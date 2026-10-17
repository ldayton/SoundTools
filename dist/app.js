// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const $=id=>document.getElementById(id),canvas=$('spectrogram'),ctx=canvas.getContext('2d',{alpha:false}),overlay=$('labels'),axis=overlay.getContext('2d');
let returningHome=false;
let featureHistory=[];
const analysisCanvas=$('analysisOverlay'),analysisContext=analysisCanvas.getContext('2d');
const analysisFlags=()=>$('formants').value!=='off'?7:0; // Pitch/intensity gate formant reliability internally.
let spectrumUnits='density',heldPeak=newPeakState();
const displayDb=(power,frequency)=>spectrumUnits==='amplitude'?AnalysisSettings.level(power,frequency,spectrumUnits,value('preemphasis')):PraatDisplay.powerDb(power,frequency,value('preemphasis'));
function newPeakState(){return AnalysisSettings.peakState(Number($('peakSeconds').value),Number($('peakDecay').value))}
function resetAnalysis(){heldPeak=newPeakState();featureHistory=[];processingStats.lastFrameTime=null;engine?.reset();frameQueue=[];currentSpectrumFrame=null;displayPeaks=[];displayMaximum=0;bins?.fill(-160)}
let engine=null,pcmNode=null,frameQueue=[],spectrumStep=20,spectrumFirst=0;
const analysisDelay=.3; // 100 ms capture packets + overlap + delivery headroom.
let currentSpectrumFrame=null,lastPlotTime=0;
let displayPeaks=[],paintedSlices=[],displayMaximum=0,paintedMaximum=0;
const performanceSession=typeof SoundglowPerformance==='object'?new SoundglowPerformance.PerformanceSession():null;
let processingStats={frames:0,blocks:0,lastMs:0};
canvas.dataset.engine='praat-wasm';
let inputMode='mic',speechBuffer=null,speechNode=null,speechDestination=null,monitor=null,clipOffset=0,clipStarted=0;
let audio,stream,source,bins,running=false,paused=false,starting=false,last=0,carry=0,raf=0,nyquist=24000,w=0,h=0,plotW=0,plotH=0,map=[],lut=[],packedColours,dpr=1,pxLeft=0,pxTop=0,pxW=1,pxH=1,previousSlice=null;
const left=52,padTop=20,bottom=27,right=12;
const value=id=>Number($(id).value),maxHz=()=>Math.min(value('maximum'),nyquist,value('analysisRate')?value('analysisRate')/2:nyquist);
function frequency(y){return AnalysisSettings.frequency(1-y/plotH,maxHz(),$('scale').value)}
function yFor(f){return padTop+plotH*(1-AnalysisSettings.position(f,maxHz(),$('scale').value))}
function colourMap(){const stops=[[17,8,133],[51,12,150],[157,22,167],[247,73,137],[255,237,65]];lut=Array.from({length:256},(_,i)=>{const n=i/255*4,j=Math.min(3,Math.floor(n)),t=n-j;return stops[j].map((a,k)=>Math.round(a+(stops[j+1][k]-a)*t))});if($('palette').value==='plasma')lut=AnalysisSettings.plasma;packedColours=PraatDisplay.palette(lut,$('interpolation').value==='bucket');$('legend').querySelector('i').style.background=`linear-gradient(90deg,${($('palette').value==='plasma'?[lut[0],lut[64],lut[128],lut[192],lut[255]]:stops).map(c=>`rgb(${c.join(',')})`).join(',')})`}
function redraw(){
  performanceSession?.break();
  if(!w)return;
  ctx.fillStyle=`rgb(${lut?.[0]?.join(',')||'17,8,133'})`;ctx.fillRect(0,0,canvas.width,canvas.height);
  carry=0;last=0;previousSlice=null;paintedSlices=[];paintedMaximum=displayMaximum;
  const step=spectrumStep;
  // Sample at physical-pixel centres; interpolate spectral levels before colouring.
  map=Array.from({length:pxH},(_,y)=>(frequency((y+($('interpolation').value==='bucket'?1:.5))*plotH/pxH)-spectrumFirst)/step+($('interpolation').value==='bucket'?1:0));
  if(currentSpectrumFrame)delete currentSpectrumFrame.rows;for(const frame of frameQueue)delete frame.rows;
  drawAxes();drawAnalysis();
}
function sampleSpectrum(position,values=bins){
  const index=Math.max(0,Math.min(values.length-1,position));
  if($('interpolation').value==='bucket')return Number.isFinite(values[Math.trunc(index)])?values[Math.trunc(index)]:-160;
  const lo=Math.floor(index),hi=Math.min(values.length-1,lo+1),mix=index-lo;
  const a=Number.isFinite(values[lo])?values[lo]:-160,b=Number.isFinite(values[hi])?values[hi]:-160;
  return a+(b-a)*mix;
}
function drawAxes(){axis.setTransform(dpr,0,0,dpr,0,0);axis.clearRect(0,0,w,h);axis.font='10px system-ui';axis.textBaseline='middle';const ticks=['voice','erb','mel'].includes($('scale').value)?[0,100,200,300,400,500,1000,1500,2000,2500,3000,3500,5000,8000,16000,20000]:$('scale').value==='log'?[60,100,200,500,1000,2000,5000,10000,20000]:Array.from({length:9},(_,i)=>maxHz()*i/8);for(const f of ticks){if(f>maxHz()||f<($('scale').value==='log'?60:0))continue;const y=yFor(f);axis.fillStyle='#8796aa';axis.textAlign='right';axis.fillText(f>=1000?`${+(f/1000).toFixed(1)}k`:`${Math.round(f)}`,left-9,y);axis.strokeStyle='#96b3d313';axis.beginPath();axis.moveTo(left,y+.5);axis.lineTo(w-right,y+.5);axis.stroke()}axis.textAlign='left';axis.fillStyle='#657489';axis.fillText('Hz',10,10);axis.textAlign='center';for(let i=0;i<=4;i++){const x=left+plotW*i/4;axis.fillText(i===4?'now':`−${+(value('history')*(1-i/4)).toFixed(1)}s`,Math.min(w-20,Math.max(left,x)),h-11)}}
function resize(){
  const box=canvas.getBoundingClientRect();w=Math.max(1,Math.round(box.width));h=Math.max(1,Math.round(box.height));
  dpr=Math.max(1,window.devicePixelRatio||1);
  canvas.width=overlay.width=analysisCanvas.width=Math.round(w*dpr);canvas.height=overlay.height=analysisCanvas.height=Math.round(h*dpr);
  plotW=Math.max(1,w-left-right);plotH=Math.max(1,h-padTop-bottom);
  pxLeft=Math.round(left*dpr);pxTop=Math.round(padTop*dpr);pxW=Math.max(1,Math.round(plotW*dpr));pxH=Math.max(1,Math.round(plotH*dpr));
  redraw();
}
window.addEventListener('resize',resize);
new ResizeObserver(resize).observe($('plot'));
function render(time){
 if(!performanceSession?.enabled)return renderFrame(time);
 const started=performance.now();
 try{return renderFrame(time)}finally{performanceSession?.frame({time,cost:performance.now()-started,audioTime:audio?.currentTime||0,plotted:Number(canvas.dataset.plottedUntil),active:running&&!paused&&!document.hidden&&location.hash!=='#settings'});}
}
function renderFrame(time){
  if(!running)return;
  if(inputMode==='speech')updatePosition();
  raf=requestAnimationFrame(render);
  if(paused||document.hidden){last=0;previousSlice=null;return}
  const desired=audio.currentTime-analysisDelay;
  const available=frameQueue.at(-1)?.time??currentSpectrumFrame?.time;
  const target=available===undefined?desired:Math.min(desired,available);
  processingStats.maxPlayoutLag=Math.max(processingStats.maxPlayoutLag||0,audio.currentTime-target);
  if(target<desired-1e-6){processingStats.underflowHolds=(processingStats.underflowHolds||0)+1;performanceSession?.count('underflowCallbacks');}
  if(!last){last=time;lastPlotTime=target;return}
  const dt=Math.max(0,Math.min(value('history'),target-lastPlotTime));last=time;lastPlotTime=target;
  carry+=dt*pxW/value('history');const pixels=Math.min(pxW,Math.floor(carry+1e-9));if(!pixels)return;carry=Math.max(0,carry-pixels);
  const current=Float32Array.from(map,position=>sampleSpectrum(position));
  const prior=previousSlice||current;
  const cutoff=target-value('history');
  while(displayPeaks.length&&displayPeaks[0].time<cutoff)displayPeaks.shift();
  displayMaximum=$('colourLevels').value==='held'?100:$('colourLevels').value==='fixed'?value('fixedMaximum'):displayPeaks.reduce((peak,frame)=>frame.time<=target?Math.max(peak,frame.peak):peak,0);
  const dbPixels=new Float32Array(pixels*pxH);
  const secondsPerPixel=value('history')/pxW,endTime=target-carry*secondsPerPixel;
  function frameRows(frame){if(!frame.rows){const levels=Float32Array.from(frame.power,(p,f)=>displayDb(p,spectrumFirst+f*spectrumStep));if($('colourLevels').value==='held')for(let i=0;i<levels.length;i++)levels[i]=frame.levelMaximum>0?levels[i]/frame.levelMaximum*100:0;frame.rows=Float32Array.from(map,position=>sampleSpectrum(position,levels))}return frame.rows}
  for(let x=0;x<pixels;x++){
    const columnTime=endTime-(pixels-x-.5)*secondsPerPixel;
    while(frameQueue.length&&frameQueue[0].time<=columnTime){currentSpectrumFrame=frameQueue.shift();canvas.dataset.frameTime=currentSpectrumFrame.time}
    if(currentSpectrumFrame){
      const a=frameRows(currentSpectrumFrame),next=frameQueue[0];
      const b=next?frameRows(next):a,mix=next&&$('frameInterpolation').value==='linear'?Math.max(0,Math.min(1,(columnTime-currentSpectrumFrame.time)/(next.time-currentSpectrumFrame.time))):0;
      for(let y=0;y<pxH;y++)dbPixels[y*pixels+x]=columnTime-currentSpectrumFrame.time>.03?-160:a[y]+(b[y]-a[y])*mix;
    }else for(let y=0;y<pxH;y++)dbPixels[y*pixels+x]=prior[y]+(current[y]-prior[y])*(x+1)/pixels;
  }
  canvas.dataset.plottedUntil=endTime;
  if(inputMode==='speech')canvas.dataset.clipEndTime=speechPosition()-(audio.currentTime-endTime);
  paintedSlices.push({width:pixels,db:dbPixels});
  let excess=paintedSlices.reduce((sum,s)=>sum+s.width,0)-pxW;
  while(excess>0&&paintedSlices.length){const first=paintedSlices[0];if(first.width<=excess){excess-=first.width;paintedSlices.shift()}else{const width=first.width-excess,db=new Float32Array(width*pxH);for(let y=0;y<pxH;y++)db.set(first.db.subarray(y*first.width+excess,(y+1)*first.width),y*width);paintedSlices[0]={width,db};excess=0}}
  function paint(slices,width,x){
    // Autoscaling can repaint millions of Retina pixels; read controls once.
    const range=$('colourLevels').value==='held'?100:value('floor'),gain=value('gain');
    const image=ctx.createImageData(width,pxH);
    PraatDisplay.colourPixels(slices,width,pxH,displayMaximum,range,gain,packedColours,image.data,value('compression'),value('suppression'));
    ctx.putImageData(image,x,pxTop);
  }
  if(displayMaximum!==paintedMaximum){
    const width=paintedSlices.reduce((sum,s)=>sum+s.width,0);paint(paintedSlices,width,pxLeft+pxW-width);paintedMaximum=displayMaximum;
  }else{
    if(pixels<pxW)ctx.drawImage(canvas,pxLeft+pixels,pxTop,pxW-pixels,pxH,pxLeft,pxTop,pxW-pixels,pxH);
    paint([{width:pixels,db:dbPixels}],pixels,pxLeft+pxW-pixels);
  }
  previousSlice=current;drawAnalysis();

}
function notice(message){$('notice').textContent=message;$('notice').hidden=!message}
function state(text,live=false){$('state').textContent=text;$('state').classList.toggle('live',live)}
function stop(){heldPeak=newPeakState();featureHistory=[];drawAnalysis();processingStats.lastFrameTime=null;engine?.dispose();engine=null;pcmNode?.disconnect();pcmNode=null;frameQueue=[];currentSpectrumFrame=null;displayPeaks=[];displayMaximum=0;const stoppedMode=inputMode;running=false;if(speechNode){speechNode.onended=null;speechNode.stop();speechNode.disconnect();speechNode=null;}monitor?.disconnect();speechDestination=null;monitor=null;inputMode='mic';$('testControls').hidden=true;$('demo').textContent='Play an Example';$('demo').setAttribute('aria-pressed','false');cancelAnimationFrame(raf);stream?.getTracks().forEach(t=>t.stop());source?.disconnect();if(audio&&audio.state!=='closed')audio.close().catch(()=>{});stream=source=audio=null;paused=false;$('freeze').disabled=true;setIcon('freeze','⏸','Pause');setIcon('start','🎙︎','Start microphone');state('STOPPED');$('device').textContent=stoppedMode==='speech'?'SAMPLE STOPPED':'MICROPHONE OFF'}
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
function updateResolution(){$('resolution').textContent=$('preset').selectedOptions?.[0]?.textContent||$('preset').value}
$('start').onclick=start;$('begin').onclick=start;
async function togglePause(){
  if(!running||starting)return;
  showSpectrogram();
  const next=!paused;starting=true;setBusy(true);
  try{
    if(inputMode==='speech'){if(next)await audio.suspend();else await audio.resume();}
    else if(!next&&audio.state==='suspended')await audio.resume();
    processingStats.lastFrameTime=null;engine?.reset();frameQueue=[];currentSpectrumFrame=null;displayPeaks=[];displayMaximum=0;bins?.fill(-160);pcmNode?.port.postMessage('reset');
    paused=next;setIcon('freeze',paused?'▶':'⏸',paused?'Resume':'Pause');
    state(paused?'PAUSED':inputMode==='speech'?'EXAMPLE':'LIVE',!paused);last=0;previousSlice=null;
  }catch(e){notice(e.message||'Could not resume audio. Please restart the input.')}
  finally{starting=false;setBusy(false)}
}
$('freeze').onclick=togglePause;
$('freeze').setAttribute('aria-keyshortcuts','Space');
function showSpectrogram(){
  if(location.hash==='#settings'){history.replaceState(null,'',location.pathname+location.search);syncSettings()}
}
function setBusy(busy){
  for(const id of ['start','begin','demo','microphone'])$(id).disabled=busy;
  $('freeze').disabled=busy||!running;
}
function syncSettings(){
  const open=location.hash==='#settings';
  if(!open&&$('presetDialog').open)closePresetEditor();
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
document.addEventListener('keydown',e=>{
  if($('presetDialog').open)return;
  if(e.key==='Escape')panel(false);
  if(e.code!=='Space'&&e.key!==' ')return;
  if(e.defaultPrevented||e.ctrlKey||e.altKey||e.metaKey||e.shiftKey||!running)return;
  if(e.target?.isContentEditable||e.target?.closest?.('input,select,textarea,[role="textbox"]'))return;
  // Prevent focused-button activation so Space after playback starts pauses it.
  e.preventDefault();
  if(!e.repeat)void togglePause();
});
syncSettings();
for(const id of ['maximum','scale','history','floor','gain','window'])$(id).addEventListener('input',()=>{$('maxOut').textContent=`${value('maximum')/1000} kHz`;$('historyOut').textContent=`${value('history')} s`;$('floorOut').textContent=`${value('floor')} dB`;$('gainOut').textContent=`${value('gain')} dB`;if(['maximum','window'].includes(id)){heldPeak=newPeakState();processingStats.lastFrameTime=null;engine?.reset();frameQueue=[];currentSpectrumFrame=null;displayPeaks=[];displayMaximum=0;bins?.fill(-160)}if(['maximum','scale','history','window','floor','gain'].includes(id))redraw()});
window.addEventListener('pagehide',stop);colourMap();resize();

function acceptFrames(frames,result){
      spectrumUnits=result.spectrumUnits||'density';
      for(const [name,ms] of Object.entries(result.timings||{}))performanceSession?.add(name,ms);
      performanceSession?.add('pendingAudioMs',result.pendingAudioMs);
      performanceSession?.add('analysisDeliveryAgeMs',(audio.currentTime-(frames.at(-1)?.time??audio.currentTime))*1000);
      const cutoff=audio.currentTime-value('history')-1;
      featureHistory.push(...(result.features||[]));while(featureHistory.length&&featureHistory[0].time<cutoff)featureHistory.shift();

      if(frames.length){
        if(processingStats.lastFrameTime!=null&&frames[0].time-processingStats.lastFrameTime>result.timeStep*1.5){processingStats.discontinuousBatches=(processingStats.discontinuousBatches||0)+1;performanceSession?.count('discontinuousBatches');heldPeak=newPeakState();}
        processingStats.lastFrameTime=frames.at(-1).time;
      }

      if(spectrumStep!==result.frequencyStep||spectrumFirst!==result.firstFrequency){spectrumStep=result.frequencyStep;spectrumFirst=result.firstFrequency;redraw()}
      if(!bins||bins.length!==result.bins){bins=new Float32Array(result.bins);bins.fill(-160)}
      while(displayPeaks.length&&displayPeaks[0].time<audio.currentTime-value('history')-.2)displayPeaks.shift();
      for(const frame of frames){let peak=0;for(let f=0;f<frame.power.length;f++)peak=Math.max(peak,displayDb(frame.power[f],result.firstFrequency+f*result.frequencyStep));frame.levelMaximum=AnalysisSettings.heldMaximum(heldPeak,peak,AnalysisSettings.normalizationTime($('normalizationClock').value,frame.time));displayPeaks.push({time:frame.time,peak})}
      frameQueue.push(...frames);if(frameQueue.length>200){performanceSession?.count('discardedAnalysisFrames',frameQueue.length-200);frameQueue.splice(0,frameQueue.length-200);}
      processingStats.frames+=frames.length;processingStats.blocks++;processingStats.lastMs=result.timings.analysisMs;canvas.dataset.processedFrames=processingStats.frames;canvas.dataset.analysisMs=processingStats.lastMs;updateResolution();

}
function analysisSettings(){return {maximumFrequency:maxHz(),windowSeconds:value('window'),frequencyStep:maxHz()/500,windowShape:$('windowShape').value,analysisRate:value('analysisRate'),timeStep:value('frameStep'),fftPadding:value('fftPadding'),removeDC:$('removeDC').value==='on',spectrumUnits:$('spectrumUnits').value,resampling:$('resampling').value,resampleQuality:value('resampleQuality'),analysisFlags:analysisFlags(),formantCeiling:value('formantCeiling')}}
async function connectInput(input){
  const context=audio;
  const client=new PraatClient({workerURL:'vendor/praat/worker.js?profile=release'});
  engine=new PraatStream({onEvent:(name,details)=>performanceSession?.event(name,{audioTime:audio?.currentTime,...details}),client,sampleRate:context.sampleRate,
    settings:analysisSettings,
    onFrames:acceptFrames,onError:error=>{stop();notice('Praat audio processing failed: '+error.message)}
  });
  await client.init();
  await context.audioWorklet.addModule('pcm-worklet.js');
  if(returningHome||context!==audio){client.dispose();throw new Error('Input stopped')}
  source=context.createMediaStreamSource(input);pcmNode=new AudioWorkletNode(context,'pcm-input');
  const activeEngine=engine;
  pcmNode.port.onmessage=({data})=>{performanceSession?.add('capturePacketAgeMs',(audio.currentTime-data.start-data.pcm.length/audio.sampleRate)*1000);if(!paused&&engine===activeEngine)activeEngine.push(data.pcm,data.start)};
  source.connect(pcmNode);pcmNode.connect(context.destination);nyquist=context.sampleRate/2;
  bins=new Float32Array(400);bins.fill(-160);
}
function speechPosition(){if(!speechBuffer)return 0;const t=clipOffset+Math.max(0,audio.currentTime-clipStarted);return speechNode?.loop?t%speechBuffer.duration:Math.min(t,speechBuffer.duration)}
function updatePosition(){const t=speechPosition();$('seek').value=t;const format=n=>`${Math.floor(n/60)}:${String(Math.floor(n%60)).padStart(2,'0')}`;$('position').textContent=`${format(t)} / ${format(Math.ceil(speechBuffer.duration))}`}
function playFrom(offset){
  heldPeak=newPeakState();
  featureHistory=[];drawAnalysis();
  if(speechNode){speechNode.onended=null;speechNode.stop();speechNode.disconnect()}
  processingStats.lastFrameTime=null;engine?.reset();frameQueue=[];currentSpectrumFrame=null;displayPeaks=[];displayMaximum=0;bins?.fill(-160);pcmNode?.port.postMessage('reset');
  clipOffset=Math.max(0,Math.min(offset,speechBuffer.duration-.001));clipStarted=audio.currentTime;
  speechNode=audio.createBufferSource();speechNode.buffer=speechBuffer;speechNode.loop=$('loop').checked;
  speechNode.connect(speechDestination);speechNode.connect(monitor);
  speechNode.onended=()=>{if(running&&inputMode==='speech'&&!speechNode.loop){stop();notice('Speech recording finished. Tap Play an Example to play again.')}};
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
    const response=await fetch('audio/alice-waters.m4a');if(returningHome)return;if(!response.ok)throw new Error('Speech recording could not be loaded. Please retry.');
    const bytes=await response.arrayBuffer();if(returningHome)return;speechBuffer=await audio.decodeAudioData(bytes);if(returningHome)return;
    speechDestination=audio.createMediaStreamDestination();stream=speechDestination.stream;await connectInput(stream);
    monitor=audio.createGain();$('listen').checked=true;monitor.gain.value=1;monitor.connect(audio.destination);
    inputMode='speech';running=true;paused=false;$('seek').max=speechBuffer.duration;
    $('testControls').hidden=false;$('welcome').hidden=true;$('freeze').disabled=false;setIcon('freeze','⏸','Pause');$('demo').textContent='Play an Example';$('demo').setAttribute('aria-pressed','true');setIcon('start','🎙︎','Use microphone');
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
  updateResolution();
};

// Optional overlays live on a separate canvas; toggling them never recolours the plot.
function drawAnalysis(){
  if(!w)return;
  const g=analysisContext;g.setTransform(dpr,0,0,dpr,0,0);g.clearRect(0,0,w,h);
  const end=Number(canvas.dataset.plottedUntil)||lastPlotTime,begin=end-value('history');
  const rows=featureHistory.filter(f=>f.time>=begin&&f.time<=end);
  const xFor=time=>left+(time-begin)/value('history')*plotW;
  g.save();g.beginPath();g.rect(left,padTop,plotW,plotH);g.clip();g.font='11px system-ui';g.lineWidth=1.4;
  const mode=$('formants').value,peak=rows.reduce((a,f)=>Math.max(a,f.intensity),-160);
  function contour(getValue,colour,dots=false,lines=true){
    g.strokeStyle=colour;g.fillStyle=colour;let previous=null;g.beginPath();
    for(const row of rows){const value=getValue(row);if(!Number.isFinite(value)||value<=0||value>maxHz()||$('scale').value==='log'&&value<60){previous=null;continue}const point={time:row.time,value},x=xFor(row.time),y=yFor(value);
      if(lines&&PraatOverlays.connected(previous,point)){g.moveTo(xFor(previous.time),yFor(previous.value));g.lineTo(x,y)}
      if(dots){g.moveTo(x+1.5,y);g.arc(x,y,1.5,0,Math.PI*2)}previous=point;
    }g.stroke();
  }
  if(mode!=='off')for(let i=0;i<3;i++)contour(row=>row.pitch>0&&row.strength>=.45&&row.intensity>=peak-35?PraatOverlays.formants(row)[i]:0,['#b6ffff','#ffffff','#baffb0'][i],mode==='dots'||mode==='both',mode!=='dots');
  g.restore();analysisCanvas.dataset.frames=rows.length;
}
for(const id of ['formants','formantCeiling'])$(id).addEventListener('change',()=>{
  resetAnalysis();drawAnalysis();
});
for(const id of ['preemphasis','compression'])$(id).addEventListener('input',()=>{
  $('preemphasisOut').textContent=value('preemphasis')+' dB/octave';$('compressionOut').textContent=Math.round(value('compression')*100)+'%';
  if(id==='preemphasis'&&$('colourLevels').value==='held')resetAnalysis();
  if(id==='preemphasis'){displayPeaks=[];displayMaximum=0;for(const frame of frameQueue)delete frame.rows;}
  redraw();
});

// Presets change display/analysis-window settings; formant overlays stay independent.
const displayPresets=AnalysisSettings.presets;
const presetStorageKey='soundglow-presets-v1';
const savedSettingIds=[...Object.keys(displayPresets.praat),'formants','formantCeiling'];
let savedPresets=[],selectedPreset=null;
function validSavedPreset(preset){
 if(!preset||typeof preset.id!=='string'||!/^saved-[a-zA-Z0-9-]+$/.test(preset.id)||typeof preset.name!=='string'||!preset.name.trim()||preset.name.length>60||preset.name.includes('*'))return false;
 if(!preset.settings||typeof preset.settings!=='object'||Object.keys(preset.settings).length!==savedSettingIds.length)return false;
 return savedSettingIds.every(id=>{
  const setting=preset.settings?.[id],control=$(id);if(typeof setting!=='string')return false;
  if(control.tagName==='SELECT')return [...control.options].some(option=>option.value===setting);
  const n=Number(setting),step=Number(control.step)||1;return setting.trim()!==''&&Number.isFinite(n)&&n>=Number(control.min)&&n<=Number(control.max)&&Math.abs((n-Number(control.min))/step-Math.round((n-Number(control.min))/step))<1e-6;
 });
}
try{
 const stored=JSON.parse(localStorage.getItem(presetStorageKey)||'null');
 if(stored?.version===1&&Array.isArray(stored.presets)){
  const ids=new Set(),names=new Set(['soundglow','praat','voice tools']);
  stored.presets=stored.presets.map(p=>p&&typeof p.settings==='object'?{...p,settings:{...AnalysisSettings.defaults,...p.settings}}:p);
  // Preserve an older custom preset whose name is now used by the new built-in.
  const existingNames=new Set(stored.presets.map(p=>typeof p?.name==='string'?p.name.trim().toLowerCase():null));
  for(const p of stored.presets)if(typeof p?.name==='string'&&p.name.trim().toLowerCase()==='soundglow'){let name='Soundglow (custom)',n=2;while(existingNames.has(name.toLowerCase())){name='Soundglow (custom '+n+')';n++;}p.name=name;existingNames.add(name.toLowerCase())}
  savedPresets=stored.presets.filter(p=>{if(!validSavedPreset(p)||ids.has(p.id)||names.has(p.name.trim().toLowerCase()))return false;ids.add(p.id);names.add(p.name.trim().toLowerCase());return true});
  selectedPreset=stored.selected;
 }
}catch{/* Corrupt or unavailable storage must not prevent audio use. */}
let presetToastTimer;
function savedPresetStatus(text){
 $('presetStatus').textContent=text;$('presetToast').hidden=true;clearTimeout(presetToastTimer);
 if(text&&!$('presetDialog').open){$('presetToast').textContent=text;$('presetToast').hidden=false;presetToastTimer=setTimeout(()=>$('presetToast').hidden=true,6000)}
}
function persistPresets(presets=savedPresets,selected=$('preset').value){
 try{localStorage.setItem(presetStorageKey,JSON.stringify({version:1,presets,selected}));return true}
 catch{savedPresetStatus('Could not save presets in this browser. Allow local storage and try again.');return false}
}
function renderSavedPresets(){
 for(const option of [...$('preset').options])if(option.value.startsWith('saved-'))option.remove();
 for(const preset of savedPresets)$('preset').add(new Option(preset.name,preset.id));
}
function currentPresetSettings(){return Object.fromEntries(savedSettingIds.map(id=>[id,$(id).value]))}
function settingsForPreset(id){return (Object.hasOwn(displayPresets,id)?displayPresets[id]:null)||savedPresets.find(p=>p.id===id)?.settings}
function syncPreset(edited=false){
 const matches=settings=>Object.entries(settings).every(([id,v])=>$(id).value===v);
 const wasSaved=$('preset').value.startsWith('saved-'),active=settingsForPreset($('preset').value);
 const match=active&&matches(active)?[$('preset').value]:savedPresets.filter(p=>matches(p.settings)).map(p=>p.id);
 $('preset').value=edited?'custom':match[0]||(!wasSaved&&Object.entries(displayPresets).find(([,settings])=>matches(settings))?.[0])||'custom';
 $('unnamedPreset').hidden=$('preset').value!=='custom';
 $('floor').disabled=$('colourLevels').value==='held';
 $('resampleQuality').disabled=$('resampling').value!=='polyphase';
 $('fixedMaximumControl').hidden=$('colourLevels').value!=='fixed';
 $('fixedMaximumOut').textContent=value('fixedMaximum')+' dB';$('suppressionOut').textContent=value('suppression')+' dB';updateResolution();
}
function applyPreset(id){
 const settings=settingsForPreset(id);if(!settings)return;
 for(const [id,v] of Object.entries(settings))$(id).value=v;
 $('preset').value=id;
 for(const [id,text] of [['maxOut',value('maximum')/1000+' kHz'],['historyOut',value('history')+' s'],['floorOut',value('floor')+' dB'],['gainOut',value('gain')+' dB'],['preemphasisOut',value('preemphasis')+' dB/octave'],['compressionOut',Math.round(value('compression')*100)+'%']])$(id).textContent=text;
 resetAnalysis();syncPreset();colourMap();redraw();
}
$('preset').addEventListener('change',()=>{applyPreset($('preset').value);closePresetEditor();savedPresetStatus('');persistPresets()});
let editingPresetId=null;
function closePresetEditor(){
 $('savePresetForm').hidden=true;$('editPresets').setAttribute('aria-expanded','false');
 if($('presetDialog').open)$('presetDialog').close();
}
$('cancelPresetEdit').onclick=()=>{savedPresetStatus('');closePresetEditor()};
$('presetDialog').addEventListener('close',()=>{$('savePresetForm').hidden=true;$('editPresets').setAttribute('aria-expanded','false')});

function commitPresetName(closeEditor=true){
 const name=$('presetName').value.trim();if(!name)return false;
 if(name.length>60||name.includes('*')){savedPresetStatus('Preset names cannot include * and must be at most 60 characters.');return false}
 const existing=savedPresets.find(p=>p.id===editingPresetId);
 if(['soundglow','praat','voice tools',...savedPresets.filter(p=>p.id!==existing?.id).map(p=>p.name.toLowerCase())].includes(name.toLowerCase())){savedPresetStatus('That preset name is already in use. Choose another name.');return false}
 if(existing&&existing.name===name){if(closeEditor)closePresetEditor();return true}
 const preset=existing?{...existing,name}:{id:'saved-'+crypto.randomUUID(),name,settings:currentPresetSettings()};
 const next=existing?savedPresets.map(p=>p.id===preset.id?preset:p):[...savedPresets,preset];
 if(!persistPresets(next,preset.id))return false;
 savedPresets=next;renderSavedPresets();$('preset').value=preset.id;syncPreset();if(closeEditor)closePresetEditor();savedPresetStatus('');return true;
}
$('savePresetForm').onsubmit=event=>{event.preventDefault();commitPresetName()};
$('editPresets').onclick=()=>{
 if(!$('savePresetForm').hidden){closePresetEditor();return}
 editingPresetId=savedPresets.find(p=>p.id===$('preset').value)?.id||null;
 $('deletePreset').hidden=!editingPresetId;
 $('confirmPresetName').textContent=editingPresetId?'Rename':'Create';
 $('presetName').value=savedPresets.find(p=>p.id===editingPresetId)?.name||'';
 $('presetDialogTitle').textContent=editingPresetId?'Edit preset':'Name preset';savedPresetStatus('');
 $('savePresetForm').hidden=false;$('editPresets').setAttribute('aria-expanded','true');$('presetDialog').showModal();$('presetName').focus();
};
$('deletePreset').onclick=()=>{
 const preset=savedPresets.find(p=>p.id===$('preset').value);if(!preset)return;
 const next=savedPresets.filter(p=>p.id!==preset.id);if(!persistPresets(next,'soundglow'))return;
 savedPresets=next;renderSavedPresets();applyPreset('soundglow');closePresetEditor();savedPresetStatus('Deleted “'+preset.name+'”.');
};
for(const id of savedSettingIds)$(id).addEventListener('input',()=>{
 savedPresetStatus('');
 const selected=savedPresets.find(p=>p.id===$('preset').value);
 if(selected){
  const next=savedPresets.map(p=>p.id===selected.id?{...p,settings:currentPresetSettings()}:p);
  if(persistPresets(next,selected.id)){savedPresets=next;syncPreset()}else syncPreset(true);
 }else syncPreset(true);
 closePresetEditor();if(['colourLevels','fixedMaximum','suppression'].includes(id))redraw();
});
renderSavedPresets();
if(settingsForPreset(selectedPreset))applyPreset(selectedPreset);else applyPreset('soundglow');

for(const id of Object.keys(AnalysisSettings.defaults))$(id).addEventListener('input',()=>{if(!['palette','interpolation','frameInterpolation'].includes(id))resetAnalysis();colourMap();redraw()});
$('colourLevels').addEventListener('input',()=>{resetAnalysis();redraw()});
function performanceReport(){return performanceSession.report({userAgent:navigator.userAgent,viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},canvas:{width:canvas.width,height:canvas.height},sampleRate:audio?.sampleRate,source:inputMode,analysisDelayMs:analysisDelay*1000,settings:Object.fromEntries(savedSettingIds.map(id=>[id,$(id).value])),preset:$('preset').selectedOptions[0]?.textContent,visibility:document.visibilityState,build:document.querySelector('meta[name="soundglow-release"]')?.content||'local-source',health:{...processingStats}})}
window.soundglowPerformance={report:performanceReport,reset:()=>performanceSession.reset()};
if($('measurePerformance')){
 $('measurePerformance').onchange=()=>{performanceSession.enabled=$('measurePerformance').checked;performanceSession.reset();};
 $('resetPerformance').onclick=()=>performanceSession.reset();
 $('exportPerformance').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(performanceReport(),null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='soundglow-performance-'+Date.now()+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
}

document.addEventListener('visibilitychange',()=>{performanceSession?.count('visibilityChanges');performanceSession?.break();});
