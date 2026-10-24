const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
const elements={},images=[];let stopped=false,frame,signalDb=-10;
const context={save(){},restore(){},rect(){},clip(){},arc(){},strokeRect(){},measureText:()=>({width:40}),setTransform(){},fillRect(){},drawImage(){},clearRect(){},fillText(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},createImageData(w,h){return {width:w,height:h,data:new Uint8ClampedArray(w*h*4)}},putImageData(i){images.push(i)}};
for(const id of ['microphoneScope','formantSmoothing','formantFiltering','headerActions','workspaceTransport','openSettings','collapseSettings','normalizationClock','resampling','resampleQuality','frameInterpolation','peakSeconds','peakDecay','windowShape','analysisRate','frameStep','fftPadding','removeDC','spectrumUnits','interpolation','presetDialog','presetDialogTitle','cancelPresetEdit','presetToast','confirmPresetName','unnamedPreset','editPresets','renamePreset','deletePreset','savePresetForm','presetName','presetStatus','savedPresets','preset','colourLevels','fixedMaximum','fixedMaximumControl','fixedMaximumOut','suppression','suppressionOut','analysisOverlay','formants','formantCeiling','preemphasis','compression','preemphasisOut','compressionOut','home','stage','visual','spectrogram','labels','maximum','scale','history','floor','gain','fft','window','palette','legend','plot','state','notice','start','begin','freeze','welcome','device','resolution','panel','settings','close','clear','full','microphone','refreshMic','micHint','demo','demoBegin','testControls','seek','position','loop','listen','restart','maxOut','historyOut','floorOut','gainOut'])elements[id]={value:'',dataset:{},style:{},classList:{toggle(){}},getContext:()=>context,getBoundingClientRect:()=>({width:390,height:700}),addEventListener(){},append(){},prepend(){},options:[],replaceChildren(){},querySelector:()=>({style:{}}),setAttribute(){}};
Object.entries({...require('../dist/analysis-settings.js').defaults,colourLevels:'auto',fixedMaximum:100,suppression:0,preset:'praat',formants:'off',formantCeiling:5500,preemphasis:6,compression:0,maximum:8000,scale:'log',history:10,floor:70,gain:0,fft:4096,window:.025,palette:'reference'}).forEach(([k,v])=>elements[k].value=String(v));
const track={label:'Synthetic input',stop(){stopped=true},addEventListener(){}};
class AudioContext{constructor(){this.sampleRate=48000;this.state='running';this.currentTime=0;this.audioWorklet={addModule:async()=>{}}}async resume(){this.state='running'}async suspend(){this.state='suspended'}async decodeAudioData(){return {duration:30}}createMediaStreamDestination(){return {stream:{getTracks:()=>[track]}}}createGain(){return {gain:{value:0},connect(){},disconnect(){}}}createBufferSource(){return {connect(){},disconnect(){},start(){},stop(){}}}async close(){this.state='closed'}addEventListener(){}createMediaStreamSource(){return {connect(){},disconnect(){}}}createAnalyser(){return {fftSize:4096,frequencyBinCount:2048,getFloatFrequencyData(b){b.fill(-120);b[Math.round(1000/48000*4096)]=signalDb}}}}
const location={hash:'',pathname:'/',search:''};const history={state:null,pushState(state,_,url){this.state=state;location.hash=url.includes('#')?'#settings':''},replaceState(state,_,url){this.state=state;location.hash=''},back(){this.state=null;location.hash=''}};
const env={SoundglowPerformance:require('../dist/performance.js'),SettingsState:require('../dist/settings-state.js'),VoiceFeedback:require('../dist/voice-feedback.js'),AnalysisSettings:require('../dist/analysis-settings.js'),setTimeout,clearTimeout,PraatOverlays:require('../dist/praat-overlays.js'),PraatDisplay:require('../dist/praat-display.js'),AudioWorkletNode:class{constructor(){this.port={postMessage(){}}}addEventListener(){}connect(){}disconnect(){}},PraatClient:class{async init(){}dispose(){}},PraatStream:class{constructor(){}dispose(){}reset(){}reconfigure(){}},location,history,fetch:async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(8)}),console,Float32Array,Uint8ClampedArray,Math,Number,String,window:{devicePixelRatio:2,AudioContext,addEventListener(){},matchMedia:()=>({matches:false,addEventListener(){}})},document:{getElementById:id=>elements[id],addEventListener(){},documentElement:{},hidden:false},navigator:{mediaDevices:{getUserMedia:async()=>({getTracks:()=>[track],getAudioTracks:()=>[track]})}},ResizeObserver:class{observe(){}},requestAnimationFrame:f=>(frame=f,1),cancelAnimationFrame(){}};
const fixtureSettings=Object.fromEntries(Object.entries(elements).map(([id,e])=>[id,e.value]));
vm.createContext(env);vm.runInContext(fs.readFileSync('dist/app.js','utf8'),env);
for(const [id,v]of Object.entries(fixtureSettings))elements[id].value=v;vm.runInContext("updateSettings({type:'apply',selected:'praat',values:Object.fromEntries(SettingsState.ids.map(id=>[id,document.getElementById(id).value]))})",env);
(async()=>{await vm.runInContext('start()',env);assert.equal(elements.state.textContent,'LIVE');vm.runInContext('bins=new Float32Array(2048);bins.fill(-120);bins[Math.round(1000/48000*4096)]=-10;spectrumStep=48000/4096;redraw();audio.currentTime=100/1000;render(100);audio.currentTime=200/1000;render(200)',env);assert(images.length>0);const img=images.at(-1);let brightRow=-1;for(let y=0;y<img.height;y++)if(img.data[y*img.width*4]>200){brightRow=y;break}const expected=2*(700-20-27)*(1-Math.log(1000/60)/Math.log(8000/60));assert(Math.abs(brightRow-expected)<9,`1kHz plotted at ${brightRow}, expected ${expected}`);signalDb=-60;vm.runInContext('bins[Math.round(1000/48000*4096)]=-60;audio.currentTime=300/1000;render(300)',env);const transition=images.at(-1),row=brightRow;assert(transition.data[row*transition.width*4]>transition.data[(row*transition.width+transition.width-1)*4],'Time slices should interpolate');vm.runInContext('audio.currentTime=400/1000;render(400)',env);const settled=images.at(-1);assert.equal(settled.data[row*settled.width*4],settled.data[(row*settled.width+settled.width-1)*4],'No averaging tail');
assert.equal(elements.spectrogram.width,780);assert.equal(elements.labels.height,1400);
// Sidebar width changes reuse the same source rows; vertical geometry changes
// must reproject them. The projection itself remains independent of width.
vm.runInContext(`{
 const f={power:new Float32Array(2048).fill(4e-9),firstFrequency:spectrumFirst,frequencyStep:spectrumStep,spectrumUnits:'density'};
 const initial=spectrumRows(f),width=pxW,height=pxH;
 pxW-=100;redraw();if(spectrumRows(f)!==initial)throw Error('Width-only resize rebuilt frequency rows');
 pxH-=100;redraw();if(spectrumRows(f)===initial||spectrumRows(f).length!==pxH)throw Error('Height resize reused stale rows');
 pxW=width;pxH=height;redraw();
}`,env);

vm.runInContext('bins.fill(-100);bins[10]=-20;bins[11]=-40',env);assert.equal(vm.runInContext('sampleSpectrum(10.5)',env),-30);
vm.runInContext('bins.fill(-Infinity)',env);assert.equal(vm.runInContext('sampleSpectrum(10.5)',env),-160);
// A short analysis-frame peak between display refreshes must survive column sampling.
vm.runInContext(`currentSpectrumFrame=null;frameQueue=[{time:.79,power:new Float32Array(2048).fill(4e-9)},{time:.81,power:new Float32Array(2048).fill(4e-4)},{time:.83,power:new Float32Array(2048).fill(4e-9)},{time:.85,power:new Float32Array(2048).fill(4e-9)}].map(f=>({...f,firstFrequency:spectrumFirst,frequencyStep:spectrumStep,spectrumUnits:'density'}));last=900;lastPlotTime=.74;carry=0;audio.currentTime=1.14;render(1000)`,env);
const sampled=vm.runInContext('Array.from(paintedSlices.at(-1).db.subarray(0,paintedSlices.at(-1).width))',env);
assert(Math.max(...sampled)>sampled.at(-1)+15,'Intermediate analysis peak should be sampled rather than skipped');
const count=images.length;await elements.freeze.onclick();vm.runInContext('audio.currentTime=300/1000;render(300)',env);assert.equal(images.length,count);await elements.freeze.onclick();vm.runInContext('stop()',env);assert(stopped);assert.equal(elements.state.textContent,'STOPPED');env.navigator.mediaDevices.getUserMedia=async()=>{throw Object.assign(new Error('denied'),{name:'NotAllowedError'})};await vm.runInContext('start()',env);assert.match(elements.notice.textContent,/denied/);let attempts=[];
env.navigator.mediaDevices.getUserMedia=async args=>{attempts.push(args);if(attempts.length===1)throw Object.assign(new Error('driver'),{name:'NotReadableError'});return {getTracks:()=>[track],getAudioTracks:()=>[track]}};
await vm.runInContext('start()',env);assert.equal(attempts.length,2);assert.equal(attempts[1].audio,true);assert.equal(elements.state.textContent,'LIVE');vm.runInContext('stop()',env);
elements.microphone.value='chosen';attempts=[];
env.navigator.mediaDevices.getUserMedia=async args=>{attempts.push(args);throw Object.assign(new Error('driver'),{name:'NotReadableError'})};
await vm.runInContext('start()',env);assert.equal(attempts.length,2);assert.equal(attempts[1].audio.deviceId.exact,'chosen');assert.match(elements.notice.textContent,/physical microphone/);assert.equal(elements.panel.hidden,false);
env.navigator.mediaDevices.getUserMedia=()=>{throw new Error('Fake mic must not request hardware')};
elements.loop.checked=true;await vm.runInContext('startSpeech()',env);assert.equal(elements.state.textContent,'EXAMPLE');assert.equal(elements.testControls.hidden,false);assert.equal(vm.runInContext('inputMode',env),'speech');await elements.freeze.onclick();assert.equal(vm.runInContext('audio.state',env),'suspended');
// Deliver a worklet packet after suspend resolved, as MessagePort ordering can
// do on a busy renderer. Speech preserves it; paused microphone capture does not.
vm.runInContext('window.deliveredPCM=0;engine.push=()=>window.deliveredPCM++;',env);
const queuedPort=vm.runInContext('pcmNode.port.onmessage',env),packet={data:{pcm:new Float32Array(4800),start:0}};
queuedPort(packet);assert.equal(env.window.deliveredPCM,1);
vm.runInContext("inputMode='mic'",env);queuedPort(packet);assert.equal(env.window.deliveredPCM,1);vm.runInContext("inputMode='speech'",env);
await elements.freeze.onclick();assert.equal(vm.runInContext('audio.state',env),'running');elements.seek.value='12';elements.seek.oninput();assert.equal(vm.runInContext('clipOffset',env),12);elements.listen.checked=true;elements.listen.onchange();assert.equal(vm.runInContext('monitor.gain.value',env),1);vm.runInContext('stop()',env);assert.equal(elements.testControls.hidden,true);assert.doesNotThrow(()=>queuedPort(packet));assert.equal(env.window.deliveredPCM,1);
// Exercise every transport action from each source/pause/view combination.
const fakeStream=()=>({getTracks:()=>[track],getAudioTracks:()=>[track]});
for(const mode of ['idle','mic','mic-paused','speech','speech-paused'])for(const settings of [false,true])for(const action of ['record','sample','pause','settings']){
  vm.runInContext('stop()',env);history.replaceState(null,'','/');vm.runInContext('syncSettings()',env);
  env.navigator.mediaDevices.getUserMedia=async()=>fakeStream();
  if(mode.startsWith('mic'))await vm.runInContext('start()',env);
  if(mode.startsWith('speech'))await vm.runInContext('startSpeech()',env);
  if(mode.endsWith('paused'))await elements.freeze.onclick();
  if(settings)vm.runInContext('panel(true)',env);
  const before=vm.runInContext('({running,paused,inputMode})',env);
  if(action==='record')await elements.start.onclick();
  if(action==='sample')await elements.demo.onclick();
  if(action==='pause')await elements.freeze.onclick();
  if(action==='settings')elements.settings.onclick();
  const after=vm.runInContext('({running,paused,inputMode})',env);
  const tag=`${mode}/${settings}/${action}`;
  if(action==='sample'){assert(after.running&&!after.paused&&after.inputMode==='speech',tag);assert.equal(location.hash,'',tag);assert.equal(elements.listen.checked,true,tag)}
  if(action==='record'){assert.equal(after.running,!mode.startsWith('mic'),tag);assert.equal(after.inputMode,'mic',tag);assert.equal(location.hash,'',tag)}
  if(action==='pause'&&before.running){assert.equal(after.paused,!before.paused,tag);assert.equal(location.hash,'',tag)}
  if(action==='settings'){assert.equal(after.running,before.running,tag);assert.equal(after.paused,before.paused,tag);assert.equal(location.hash,settings?'':'#settings',tag)}
}
// Double activation during loading cannot create parallel input sessions.
vm.runInContext('stop()',env);let release;
env.fetch=()=>new Promise(resolve=>{release=()=>resolve({ok:true,arrayBuffer:async()=>new ArrayBuffer(8)})});
const pending=vm.runInContext('startSpeech()',env);await Promise.resolve();await Promise.resolve();
assert.equal(elements.start.disabled,true);assert.equal(elements.begin.disabled,true);
await elements.start.onclick();release();await pending;assert.equal(vm.runInContext('inputMode',env),'speech');
vm.runInContext('panel(true)',env);elements.home.onclick({preventDefault(){}});assert.equal(location.hash,'');assert.equal(elements.welcome.hidden,false);assert.equal(vm.runInContext('running',env),false);assert.equal(elements.state.textContent,'MIC OFF');
console.log('PASS: home reset, 40 source/view/action combinations, duplicate-start guard, speech routing, interpolation and capture fallback');
})().catch(e=>{console.error(e);process.exitCode=1});
