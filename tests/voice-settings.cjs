const fs=require('node:fs'),zlib=require('node:zlib'),assert=require('node:assert/strict');
const settings=require('../dist/analysis-settings.js'),{createProcessor}=require('../dist/vendor/praat/processor.js'),{PraatStream}=require('../dist/praat-stream.js');
const make=require('../dist/vendor/praat/build-release/praat-spectrogram.js');
(async()=>{
 const module=await make(),processor=createProcessor({load:async()=>module});
 const analyse=async request=>{const r=await processor.handle(request);assert(!r.error,r.error);return r};
 const oracle=JSON.parse(zlib.gunzipSync(fs.readFileSync(__dirname+'/fixtures/voice-dsp.json.gz')));
 // Independent direct DFT of corrected, mean-centred Hann frames (not legacy dB fixtures).
 let maxError=0;
 function reference(pcm,rate){
  const win=Math.round(.064*rate),n=2*win,mean=pcm.slice(0,win).reduce((a,b)=>a+b,0)/win;
  return Array.from({length:n/2+1},(_,k)=>{let re=0,im=0;for(let j=0;j<win;j++){const v=Math.fround(Math.fround(pcm[j]-Math.fround(mean))*Math.fround(.5-.5*Math.cos(2*Math.PI*j/win)));re+=v*Math.cos(2*Math.PI*k*j/n);im-=v*Math.sin(2*Math.PI*k*j/n);}return (re*re+im*im)*((k===0||k===n/2?1:2)/win)**2;});
 }
 for(const t of oracle){
  const r=await analyse({pcm:Float32Array.from(t.rawPcm),sampleRate:t.rate,windowSeconds:.064,timeStep:.016,windowShape:'hann',analysisRate:t.rate,fftPadding:2,removeDC:true,spectrumUnits:'amplitude',firstCentre:.032});
  const expected=reference(Float32Array.from(t.rawPcm),t.rate);
  assert.equal(r.bins,expected.length);assert.equal(r.timeStep,.016);
  for(let i=0;i<r.bins;i++){maxError=Math.max(maxError,Math.abs(r.power[i]-expected[i]));assert(Math.abs(r.power[i]-expected[i])<1e-7);}
 }
 // A constant signal disappears with DC removal, for padded and unpadded windows.
 for(const rate of [8000,16000,44100])for(const windowShape of ['hann','gaussian'])for(const fftPadding of [0,2]){
  const r=await analyse({pcm:new Float32Array(rate/2).fill(.5),sampleRate:rate,windowSeconds:.025,windowShape,fftPadding,removeDC:true,spectrumUnits:'amplitude'});
  assert(r.power.every(v=>v===0),'DC removal must leave zero signal and zero padding');
 }
 // FFT padding changes the grid, not amplitudes at shared frequencies.
 for(const windowShape of ['hann','gaussian']){
  const pcm=Float32Array.from({length:8000},(_,i)=>.5*Math.sin(2*Math.PI*1000*i/8000));
  const request={pcm,sampleRate:8000,windowSeconds:.032,windowShape,spectrumUnits:'amplitude'};
  const a=await analyse({...request,fftPadding:0}),b=await analyse({...request,fftPadding:2});
  for(let k=0;k<a.bins;k++)assert(Math.abs(a.power[k]-b.power[2*k])<1e-8,'Padding changed amplitude');
 }
 // Stream real WASM at common device rates; each 16 ms centre occurs exactly once.
 for(const rate of [24000,44100,48000]){
  const frames=[];let failure;
  const stream=new PraatStream({client:{analyse,dispose(){}},sampleRate:rate,settings:()=>({windowSeconds:.064,windowShape:'hann',analysisRate:8000,timeStep:.016,fftPadding:2,removeDC:true,spectrumUnits:'amplitude'}),onFrames:(f)=>frames.push(...f),onError:e=>failure=e});
  for(let start=0;start<rate;start+=rate/10){stream.push(Float32Array.from({length:rate/10},(_,i)=>.1*Math.sin(2*Math.PI*1000*(start+i)/rate)),start/rate);while(stream.busy)await new Promise(r=>setImmediate(r));}
  assert(!failure,String(failure));assert(frames.length>50);for(let i=1;i<frames.length;i++)assert(Math.abs(frames[i].time-frames[i-1].time-.016)<1e-7,`Gap at ${rate}/${i}`);
  for(const frame of frames.slice(2)){const peak=frame.power.indexOf(Math.max(...frame.power));assert.equal(peak*7.8125,1000);}
  stream.dispose();
 }
 // Retain original input fixtures to check fractional-rate phases and FIR batch boundaries.
 const resamplingOracle=JSON.parse(zlib.gunzipSync(fs.readFileSync(__dirname+'/fixtures/resampling-dsp.json.gz')));
 for(const t of resamplingOracle){
  const frames=[];let failure;
  const config={windowSeconds:.064,windowShape:'hann',analysisRate:t.target,timeStep:.016,fftPadding:2,removeDC:true,spectrumUnits:'amplitude',resampling:'polyphase',resampleQuality:2};
  const stream=new PraatStream({client:{analyse,dispose(){}},sampleRate:t.rate,settings:()=>config,onFrames:f=>frames.push(...f),onError:e=>failure=e});
  for(let start=0;start<t.input.length;start+=t.rate/10){stream.push(Float32Array.from(t.input.slice(start,start+t.rate/10)),start/t.rate);while(stream.busy)await new Promise(r=>setImmediate(r));}
  assert(!failure,String(failure));assert(frames.length>=t.spectra.length);
  const padding=stream.filterPadding(config),pcm=new Float32Array(padding+t.input.length);pcm.set(t.input,padding);
  const whole=await analyse({...config,pcm,sampleRate:t.rate,firstCentre:.032+padding/t.rate});
  for(let j=0;j<Math.min(frames.length,whole.frames);j++){
   assert(Math.abs(frames[j].time-(.032+j*.016))<1e-8);
   for(let k=0;k<whole.bins;k++){
    const expected=whole.power[j*whole.bins+k],actual=frames[j].power[k];
    assert(Math.abs(actual-expected)<1e-6,`Resampled stream differs at ${t.rate}/${j}/${k}`);
   }
  }
  // Discontinuities reset FIR context and retain the new source's time origin.
  stream.reset();frames.length=0;stream.push(Float32Array.from(t.input),2);while(stream.busy)await new Promise(r=>setImmediate(r));assert(Math.abs(frames[0].time-2.032)<1e-8);
  // A brief queued burst must preserve the original FIR context and frame grid.
  stream.reset();frames.length=0;stream.push(Float32Array.from(t.input),3);stream.push(Float32Array.from(t.input),3.4);while(stream.busy)await new Promise(r=>setImmediate(r));assert(Math.abs(frames[0].time-3.032)<1e-8);
  for(let i=1;i<frames.length;i++)assert(Math.abs(frames[i].time-frames[i-1].time-.016)<1e-8);
  // Sustained overload beyond two seconds still drops the stale batch and
  // restores FIR padding at the retained packet's actual source timestamp.
  stream.reset();frames.length=0;for(let packet=0;packet<7;packet++)stream.push(Float32Array.from(t.input),3+packet*.4);while(stream.busy)await new Promise(r=>setImmediate(r));assert(Math.abs(frames[0].time-5.032)<1e-8);stream.dispose();
 }
 // Selecting a filter at device rate is inert: no implicit FFT/density-path change.
 const devicePcm=Float32Array.from(resamplingOracle[0].input);
 const defaultPath=await analyse({pcm:devicePcm,sampleRate:24000});
 const noResample=await analyse({pcm:devicePcm,sampleRate:24000,resampling:'polyphase',resampleQuality:2});
 assert.deepEqual(noResample.power,defaultPath.power);
 // Quality is a working filter parameter, not just a saved label.
 const edgeLevels=[];
 for(let quality=0;quality<=4;quality++){
  const t=resamplingOracle[0],r=await analyse({pcm:Float32Array.from(t.input),sampleRate:t.rate,windowSeconds:.064,timeStep:.016,windowShape:'hann',analysisRate:8000,fftPadding:2,removeDC:true,spectrumUnits:'amplitude',resampling:'polyphase',resampleQuality:quality});
  assert(r.power.every(Number.isFinite));edgeLevels.push(settings.level(r.power[4*r.bins+486],3796.875,'amplitude',0));
 }
 assert(edgeLevels[0]<edgeLevels[2]-1);assert(edgeLevels[4]>edgeLevels[2]);
 const badFilter=await processor.handle({pcm:new Float32Array(1600),sampleRate:8000,resampling:'unknown'});assert(badFilter.error);
 const badQuality=await processor.handle({pcm:new Float32Array(1600),sampleRate:8000,resampling:'polyphase',resampleQuality:9});assert(badQuality.error);
 // Audio and wall clocks deliberately diverge on seek/pause; the selected clock owns bucket expiry.
 assert.equal(settings.normalizationTime('audio',.25,4321),.25);assert.equal(settings.normalizationTime('wall',.25,4321),4.321);
 const audioPeak=settings.peakState(),wallPeak=settings.peakState();
 for(const [audioTime,wallTime,peak] of [[0,0,80],[.1,1,40],[.2,2,40],[.3,3,40],[.4,4,40]]){
  settings.heldMaximum(audioPeak,peak,settings.normalizationTime('audio',audioTime,wallTime*1000));
  settings.heldMaximum(wallPeak,peak,settings.normalizationTime('wall',audioTime,wallTime*1000));
 }
 assert.equal(audioPeak.hold,80);assert.equal(wallPeak.hold,80);
 settings.heldMaximum(wallPeak,40,5);assert(wallPeak.hold<80);
 for(const jump of [5,10,101]){const state=settings.peakState(5,0);settings.heldMaximum(state,100,0);assert.equal(settings.heldMaximum(state,0,jump),0);}
 const jumped=settings.peakState();settings.heldMaximum(jumped,100,0);assert(settings.heldMaximum(jumped,0,10)<5,'Expired peak must decay across elapsed time');
 // The same elapsed time produces the same decay regardless of callback rate.
 function decayAt(step){const state=settings.peakState(1,.995);settings.heldMaximum(state,100,0);for(let t=step;t<2-1e-8;t+=step)settings.heldMaximum(state,0,t);return settings.heldMaximum(state,0,2);}
 assert(Math.abs(decayAt(.008)-decayAt(.016))<.05);
 const backwards=settings.peakState(5,0);settings.heldMaximum(backwards,100,10);assert.equal(settings.heldMaximum(backwards,20,1),20);
 const single=settings.peakState(1,0);settings.heldMaximum(single,100,0);assert.equal(settings.heldMaximum(single,0,.5),100);assert.equal(settings.heldMaximum(single,0,1),0);
 console.log(`PASS: ${resamplingOracle.length} polyphase stream/full comparisons, FIR context/reset and clock expiry`);
 // Small device-rate windows can have odd sample counts; bounds must remain valid.
 for(const windowShape of ['gaussian','hann']){
  const r=await analyse({pcm:Float32Array.from({length:8820},(_,i)=>.1*Math.sin(2*Math.PI*1000*i/44100)),sampleRate:44100,windowSeconds:.005,timeStep:.005,windowShape,fftPadding:2,spectrumUnits:'amplitude'});assert(r.frames>30);
 }
 const invalid=await processor.handle({pcm:new Float32Array(1600),sampleRate:8000,windowSeconds:.064,windowShape:'hann',firstCentre:2});assert.equal(invalid.code,'ANALYSIS_ERROR');
 const peak=settings.peakState();assert.equal(settings.heldMaximum(peak,80,0),80);assert.equal(settings.heldMaximum(peak,40,1),80);assert.equal(settings.heldMaximum(peak,40,4),80);assert(settings.heldMaximum(peak,40,5)<80);
 for(const scale of ['linear','erb','mel','voice','log'])for(const hz of scale==='log'?[60,100,500,4000]:[0,100,500,4000])assert(Math.abs(settings.frequency(settings.position(hz,4000,scale),4000,scale)-hz)<1e-8);
 assert.equal(settings.plasma.length,256);assert.equal(settings.presets.voice.windowShape,'hann');assert.equal(settings.presets.praat.windowShape,'gaussian');
 console.log(`PASS: ${oracle.length} independent corrected DFT fixtures (${maxError.toFixed(6)} absolute power max), three real resampled streams, continuous frame grids, scales and normalization`);
})().catch(e=>{console.error(e);process.exitCode=1});
