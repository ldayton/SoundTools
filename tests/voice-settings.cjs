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
