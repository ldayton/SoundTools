'use strict';
const $=id=>document.getElementById(id),canvas=$('spectrogram'),ctx=canvas.getContext('2d',{alpha:false}),overlay=$('labels'),axis=overlay.getContext('2d');
let inputMode='mic',speechBuffer=null,speechNode=null,speechDestination=null,monitor=null,clipOffset=0,clipStarted=0;
let audio,stream,source,analyser,bins,running=false,paused=false,starting=false,last=0,carry=0,raf=0,nyquist=24000,w=0,h=0,plotW=0,plotH=0,map=[],lut=[],dpr=1,pxLeft=0,pxTop=0,pxW=1,pxH=1,previousSlice=null;
const left=52,padTop=20,bottom=27,right=12;
const value=id=>Number($(id).value),maxHz=()=>Math.min(value('maximum'),nyquist);
function frequency(y){const f=1-y/plotH;return $('scale').value==='log'?60*Math.pow(maxHz()/60,f):maxHz()*f}
function yFor(f){return padTop+plotH*(1-($('scale').value==='log'?Math.log(f/60)/Math.log(maxHz()/60):f/maxHz()))}
function colourMap(){let stops=$('palette').value==='ocean'?[[6,11,19],[20,37,86],[18,110,141],[74,209,190],[232,255,213]]:$('palette').value==='mono'?[[8,11,16],[55,62,73],[115,128,139],[190,207,216],[255,255,255]]:[[8,11,16],[61,39,85],[152,57,93],[231,120,59],[255,243,175]];lut=Array.from({length:256},(_,i)=>{const n=i/255*4,j=Math.min(3,Math.floor(n)),t=n-j;return stops[j].map((a,k)=>Math.round(a+(stops[j+1][k]-a)*t))});$('legend').querySelector('i').style.background=`linear-gradient(90deg,${stops.map(c=>`rgb(${c.join(',')})`).join(',')})`}
function redraw(){
  if(!w)return;
  ctx.fillStyle='#080b10';ctx.fillRect(0,0,canvas.width,canvas.height);
  carry=0;last=0;previousSlice=null;
  const step=(audio?.sampleRate||48000)/(analyser?.fftSize||4096);
  // Sample at physical-pixel centres; interpolate spectral levels before colouring.
  map=Array.from({length:pxH},(_,y)=>frequency((y+.5)*plotH/pxH)/step);
  drawAxes();
}
function sampleSpectrum(position){
  const index=Math.max(0,Math.min(bins.length-1,position));
  const lo=Math.floor(index),hi=Math.min(bins.length-1,lo+1),mix=index-lo;
  const a=Number.isFinite(bins[lo])?bins[lo]:-160,b=Number.isFinite(bins[hi])?bins[hi]:-160;
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
  if(!last){last=time;return}
  const dt=Math.min(.1,(time-last)/1000);last=time;
  carry+=dt*pxW/value('history');const pixels=Math.min(pxW,Math.floor(carry));if(!pixels)return;carry-=pixels;
  analyser.getFloatFrequencyData(bins);
  const current=Float32Array.from(map,sampleSpectrum);
  const prior=previousSlice||current;
  if(pixels<pxW)ctx.drawImage(canvas,pxLeft+pixels,pxTop,pxW-pixels,pxH,pxLeft,pxTop,pxW-pixels,pxH);
  const image=ctx.createImageData(pixels,pxH),floor=value('floor'),gain=value('gain');
  for(let y=0;y<pxH;y++)for(let x=0;x<pixels;x++){
    // Interpolate only across this new slice, without an averaging tail.
    const mix=(x+1)/pixels,db=prior[y]+(current[y]-prior[y])*mix;
    const level=Math.max(0,Math.min(1,(db+gain-floor)/(-20-floor)))*255;
    const lo=Math.floor(level),hi=Math.min(255,lo+1),fraction=level-lo,p=(y*pixels+x)*4;
    for(let c=0;c<3;c++)image.data[p+c]=Math.round(lut[lo][c]+(lut[hi][c]-lut[lo][c])*fraction);
    image.data[p+3]=255;
  }
  ctx.putImageData(image,pxLeft+pxW-pixels,pxTop);previousSlice=current;
}
function notice(message){$('notice').textContent=message;$('notice').hidden=!message}
function state(text,live=false){$('state').textContent=text;$('state').classList.toggle('live',live)}
function stop(){running=false;if(speechNode){speechNode.onended=null;speechNode.stop();speechNode.disconnect();speechNode=null;}monitor?.disconnect();speechDestination=null;monitor=null;inputMode='mic';$('testControls').hidden=true;$('demo').textContent='Test speech';cancelAnimationFrame(raf);stream?.getTracks().forEach(t=>t.stop());source?.disconnect();if(audio&&audio.state!=='closed')audio.close().catch(()=>{});stream=source=audio=analyser=null;paused=false;$('freeze').disabled=true;$('freeze').textContent='Pause';$('start').textContent='Start microphone';state('MIC OFF');$('device').textContent='MICROPHONE OFF · HISTORY RETAINED'}
const recoverable=e=>['NotReadableError','AbortError','OverconstrainedError','TrackStartError'].includes(e.name);
async function microphones(){
  if(!navigator.mediaDevices?.enumerateDevices)return [];
  try{
    const devices=(await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='audioinput');
    const select=$('microphone'), selected=select.value;
    select.replaceChildren(new Option('System default',''));
    devices.filter(d=>d.deviceId&&d.deviceId!=='default'&&d.deviceId!=='communications').forEach((d,i)=>select.add(new Option(d.label||`Microphone ${i+1}`,d.deviceId)));
    if([...select.options].some(o=>o.value===selected))select.value=selected;
    $('micHint').textContent=devices.length?'Choose a physical microphone if the default or a virtual audio device fails. Changing the input stops capture; tap Start microphone to reconnect.':'No microphone inputs are visible yet. Allow microphone access, then refresh. If this embedded browser cannot capture audio, open this page in Safari or Chrome.';
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
$('microphone').onchange=()=>{if(running)stop();notice('');};
async function start(){if(starting)return;if(running){const wasSpeech=inputMode==='speech';stop();if(!wasSpeech)return;}starting=true;$('start').disabled=$('begin').disabled=true;notice('');state('CONNECTING');try{if(!navigator.mediaDevices?.getUserMedia)throw new Error('Microphone access requires HTTPS or localhost in a supported browser.');audio=new (window.AudioContext||window.webkitAudioContext)();stream=await capture();if(audio.state==='suspended')await audio.resume();connectInput(stream);running=true;paused=false;$('welcome').hidden=true;$('freeze').disabled=false;$('start').textContent='Stop mic';state('LIVE',true);microphones();$('device').textContent=stream.getAudioTracks()[0].label||'MICROPHONE';updateResolution();redraw();raf=requestAnimationFrame(render);stream.getAudioTracks()[0].addEventListener('ended',()=>{if(running){stop();notice('The microphone disconnected. Tap Start microphone to reconnect.')}});audio.addEventListener('statechange',()=>{if(running&&audio?.state==='suspended'){state('INTERRUPTED');notice('Audio was interrupted. Tap Resume audio to continue.');$('start').textContent='Resume audio'}})}catch(e){stop();notice(microphoneError(e));panel(true);microphones();}finally{starting=false;$('start').disabled=$('begin').disabled=false}}
function updateResolution(){if(audio&&analyser)$('resolution').textContent=`${(audio.sampleRate/1000).toFixed(1)} kHz · ${(audio.sampleRate/analyser.fftSize).toFixed(1)} Hz / bin`}
$('start').onclick=async()=>{if(running&&audio?.state==='suspended'){try{await audio.resume();notice('');state(paused?'PAUSED':inputMode==='speech'?'TEST SPEECH':'LIVE',!paused);$('start').textContent='Stop mic'}catch(e){notice(e.message)}}else start()};$('begin').onclick=start;
$('freeze').onclick=()=>{paused=!paused;if(inputMode==='speech'){if(paused)audio.suspend();else audio.resume();}$('freeze').textContent=paused?'Resume':'Pause';state(paused?'PAUSED':inputMode==='speech'?'TEST SPEECH':'LIVE',!paused);last=0};
function panel(open){if(open)microphones();$('panel').hidden=!open;$('settings').setAttribute('aria-expanded',String(open))}$('settings').onclick=()=>panel($('panel').hidden);$('close').onclick=()=>panel(false);document.addEventListener('keydown',e=>{if(e.key==='Escape')panel(false)});
for(const id of ['maximum','scale','history','floor','gain','fft','palette'])$(id).addEventListener('input',()=>{$('maxOut').textContent=`${value('maximum')/1000} kHz`;$('historyOut').textContent=`${value('history')} s`;$('floorOut').textContent=`${value('floor')} dB`;$('gainOut').textContent=`${value('gain')} dB`;if(id==='fft'&&analyser){analyser.fftSize=value('fft');bins=new Float32Array(analyser.frequencyBinCount);updateResolution()}if(id==='palette')colourMap();if(['maximum','scale','history','fft'].includes(id))redraw()});$('clear').onclick=redraw;
$('full').hidden=!document.documentElement.requestFullscreen;$('full').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen()}catch(e){notice('Full screen is unavailable in this browser.')}};
window.addEventListener('pagehide',stop);colourMap();resize();

function connectInput(input){
  analyser=audio.createAnalyser();analyser.fftSize=value('fft');analyser.smoothingTimeConstant=0;
  bins=new Float32Array(analyser.frequencyBinCount);source=audio.createMediaStreamSource(input);source.connect(analyser);nyquist=audio.sampleRate/2;
}
function speechPosition(){if(!speechBuffer)return 0;const t=clipOffset+Math.max(0,audio.currentTime-clipStarted);return speechNode?.loop?t%speechBuffer.duration:Math.min(t,speechBuffer.duration)}
function updatePosition(){const t=speechPosition();$('seek').value=t;const format=n=>`${Math.floor(n/60)}:${String(Math.floor(n%60)).padStart(2,'0')}`;$('position').textContent=`${format(t)} / ${format(Math.ceil(speechBuffer.duration))}`}
function playFrom(offset){
  if(speechNode){speechNode.onended=null;speechNode.stop();speechNode.disconnect()}
  clipOffset=Math.max(0,Math.min(offset,speechBuffer.duration-.001));clipStarted=audio.currentTime;
  speechNode=audio.createBufferSource();speechNode.buffer=speechBuffer;speechNode.loop=$('loop').checked;
  speechNode.connect(speechDestination);speechNode.connect(monitor);
  speechNode.onended=()=>{if(running&&inputMode==='speech'&&!speechNode.loop){stop();notice('Speech recording finished. Tap Test speech to play again.')}};
  speechNode.start(0,clipOffset);last=0;previousSlice=null;updatePosition();
}
async function startSpeech(){
  if(starting)return;if(running&&inputMode==='speech'){stop();return}stop();starting=true;notice('');state('LOADING');$('demo').disabled=$('demoBegin').disabled=$('start').disabled=true;
  try{
    audio=new (window.AudioContext||window.webkitAudioContext)();await audio.resume();
    const response=await fetch('audio/speech-english.wav');if(!response.ok)throw new Error('Speech recording could not be loaded. Please retry.');
    speechBuffer=await audio.decodeAudioData(await response.arrayBuffer());
    speechDestination=audio.createMediaStreamDestination();stream=speechDestination.stream;connectInput(stream);
    monitor=audio.createGain();monitor.gain.value=$('listen').checked?1:0;monitor.connect(audio.destination);
    inputMode='speech';running=true;paused=false;$('seek').max=speechBuffer.duration;
    $('testControls').hidden=false;$('welcome').hidden=true;$('freeze').disabled=false;$('freeze').textContent='Pause';$('demo').textContent='Stop test';$('start').textContent='Use microphone';
    $('device').textContent='TEST INPUT · RECORDED SPEECH';state('TEST SPEECH',true);updateResolution();redraw();playFrom(0);panel(true);raf=requestAnimationFrame(render);
  }catch(e){stop();notice(e.message||'Could not start recorded speech.')}
  finally{starting=false;$('demo').disabled=$('demoBegin').disabled=$('start').disabled=false}
}
$('demo').onclick=$('demoBegin').onclick=startSpeech;
$('seek').oninput=()=>{if(running&&inputMode==='speech')playFrom(value('seek'))};
$('restart').onclick=()=>{if(running&&inputMode==='speech'){playFrom(0);redraw()}};
$('loop').onchange=()=>{if(speechNode){const position=speechPosition();clipOffset=position;clipStarted=audio.currentTime;speechNode.loop=$('loop').checked}};
$('listen').onchange=()=>{if(monitor)monitor.gain.value=$('listen').checked?1:0};
