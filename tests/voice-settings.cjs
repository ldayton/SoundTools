const fs=require('node:fs'),zlib=require('node:zlib'),assert=require('node:assert/strict');
const settings=require('../dist/analysis-settings.js'),{createProcessor}=require('../dist/vendor/praat/processor.js'),{PraatStream}=require('../dist/praat-stream.js');
const make=require('../dist/vendor/praat/build-release/praat-spectrogram.js');
(async()=>{
 const module=await make(),processor=createProcessor({load:async()=>module});
 const analyse=async request=>{const r=await processor.handle(request);assert(!r.error,r.error);return r};
 const oracle=JSON.parse(zlib.gunzipSync(fs.readFileSync(__dirname+'/fixtures/voice-dsp.json.gz')));
 let maxError=0;
 for(const t of oracle){
  const r=await analyse({pcm:Float32Array.from(t.rawPcm),sampleRate:t.rate,windowSeconds:.064,timeStep:.016,windowShape:'hann',analysisRate:t.rate,fftPadding:2,removeDC:true,spectrumUnits:'amplitude',firstCentre:.032});
  assert.equal(r.bins,t.rate*.128/2+1);assert.equal(r.timeStep,.016);assert.equal(r.frequencyStep,7.8125);
  for(let i=0;i<r.bins;i++){const db=settings.level(r.power[i],i*r.frequencyStep,'amplitude',0),ref=t.shiftedDb[i];if(db>1||ref>1)maxError=Math.max(maxError,Math.abs(db-ref));}
 }
 assert(maxError<.01,`Shipped Voice Tools DSP oracle differs: ${maxError} dB`);
 // Stream real WASM at common device rates; each 16 ms centre occurs exactly once.
 for(const rate of [24000,44100,48000]){
  const frames=[];let failure;
  const stream=new PraatStream({client:{analyse,dispose(){}},sampleRate:rate,settings:()=>({windowSeconds:.064,windowShape:'hann',analysisRate:8000,timeStep:.016,fftPadding:2,removeDC:true,spectrumUnits:'amplitude'}),onFrames:(f)=>frames.push(...f),onError:e=>failure=e});
  for(let start=0;start<rate;start+=rate/10){stream.push(Float32Array.from({length:rate/10},(_,i)=>.1*Math.sin(2*Math.PI*1000*(start+i)/rate)),start/rate);while(stream.busy)await new Promise(r=>setImmediate(r));}
  assert(!failure,String(failure));assert(frames.length>50);for(let i=1;i<frames.length;i++)assert(Math.abs(frames[i].time-frames[i-1].time-.016)<1e-7,`Gap at ${rate}/${i}`);
  for(const frame of frames.slice(2)){const peak=frame.power.indexOf(Math.max(...frame.power));assert.equal(peak*7.8125,1000);}
  stream.dispose();
 }
 // Independent original-binary fixtures include fractional-rate phases and FIR batch boundaries.
 const resamplingOracle=JSON.parse(zlib.gunzipSync(fs.readFileSync(__dirname+'/fixtures/resampling-dsp.json.gz')));let filterError=0;
 for(const t of resamplingOracle){
  let caseError=0,strong=0;
  const frames=[];let failure;
  const config={windowSeconds:.064,windowShape:'hann',analysisRate:t.target,timeStep:.016,fftPadding:2,removeDC:true,spectrumUnits:'amplitude',resampling:'polyphase',resampleQuality:2};
  const stream=new PraatStream({client:{analyse,dispose(){}},sampleRate:t.rate,settings:()=>config,onFrames:f=>frames.push(...f),onError:e=>failure=e});
  for(let start=0;start<t.input.length;start+=t.rate/10){stream.push(Float32Array.from(t.input.slice(start,start+t.rate/10)),start/t.rate);while(stream.busy)await new Promise(r=>setImmediate(r));}
  assert(!failure,String(failure));assert(frames.length>=t.spectra.length);
  for(let j=0;j<t.spectra.length;j++){
   assert(Math.abs(frames[j].time-(.032+j*.016))<1e-8);
   for(let i=0;i<t.spectra[j].length;i++){
    const db=settings.level(frames[j].power[i],i*7.8125,'amplitude',0),ref=t.spectra[j][i];
    if(ref>40)strong=Math.max(strong,Math.abs(db-ref));if(ref>20){caseError=Math.max(caseError,Math.abs(db-ref));filterError=Math.max(filterError,Math.abs(db-ref));}
   }
  }
  // Fractional-rate reference phases depend on native accumulated time and wrap rounding.
  // Preserve a strict bound on stronger peaks as well as weak bins, rather than hide it.
  assert(caseError<(t.rate===44100?.7:.001),`Filter mismatch at ${t.rate}/${t.target}: ${caseError}`);
  assert(strong<(t.rate===44100?.12:.001),`Peak mismatch at ${t.rate}/${t.target}: ${strong}`);
  // Discontinuities reset FIR context and retain the new source's time origin.
  stream.reset();frames.length=0;stream.push(Float32Array.from(t.input),2);while(stream.busy)await new Promise(r=>setImmediate(r));assert(Math.abs(frames[0].time-2.032)<1e-8);
  // Dropping a slow/stale batch must restore FIR padding at the retained packet.
  stream.reset();frames.length=0;stream.push(Float32Array.from(t.input),3);stream.push(Float32Array.from(t.input),3.4);while(stream.busy)await new Promise(r=>setImmediate(r));assert(Math.abs(frames[0].time-3.432)<1e-8);stream.dispose();
 }
 assert(filterError<.7,`Original polyphase oracle differs: ${filterError} dB`);
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
 assert.equal(audioPeak.hold,80);assert(wallPeak.hold<80);
 console.log(`PASS: ${resamplingOracle.length} original polyphase streams (${filterError.toFixed(6)} dB max), FIR context/reset and clock selection`);
 // Small device-rate windows can have odd sample counts; bounds must remain valid.
 for(const windowShape of ['gaussian','hann']){
  const r=await analyse({pcm:Float32Array.from({length:8820},(_,i)=>.1*Math.sin(2*Math.PI*1000*i/44100)),sampleRate:44100,windowSeconds:.005,timeStep:.005,windowShape,fftPadding:2,spectrumUnits:'amplitude'});assert(r.frames>30);
 }
 const invalid=await processor.handle({pcm:new Float32Array(1600),sampleRate:8000,windowSeconds:.064,windowShape:'hann',firstCentre:2});assert.equal(invalid.code,'ANALYSIS_ERROR');
 const peak=settings.peakState();assert.equal(settings.heldMaximum(peak,80,0),80);assert.equal(settings.heldMaximum(peak,40,1),80);assert(settings.heldMaximum(peak,40,4)<80);
 for(const scale of ['linear','erb','mel','voice','log'])for(const hz of scale==='log'?[60,100,500,4000]:[0,100,500,4000])assert(Math.abs(settings.frequency(settings.position(hz,4000,scale),4000,scale)-hz)<1e-8);
 assert.equal(settings.plasma.length,256);assert.equal(settings.presets.voice.windowShape,'hann');assert.equal(settings.presets.praat.windowShape,'gaussian');
 console.log(`PASS: ${oracle.length} original Voice Tools DSP fixtures (${maxError.toFixed(6)} dB max), three real resampled streams, continuous frame grids, scales and normalization`);
})().catch(e=>{console.error(e);process.exitCode=1});
