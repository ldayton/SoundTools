// Real Praat measurements, display gating, and display-only emphasis/compression.
const assert=require('node:assert/strict'),{formants,connected}=require('../dist/praat-overlays.js'),{powerDb,colourPixels,palette}=require('../dist/praat-display.js');
assert.deepEqual(formants({formants:[500,1500,2500],bandwidths:[80,100,1000]}),[500,1500,0]);
assert(connected({time:1,value:500},{time:1.01,value:510}));assert(!connected({time:1,value:500},{time:1.1,value:510}));assert(!connected({time:1,value:500},{time:1.01,value:1500}));
assert.equal(powerDb(4e-4,2000,0),powerDb(4e-4,1000,0));assert.equal(powerDb(4e-4,2000,6)-powerDb(4e-4,2000,0),6);
const colours=palette(Array.from({length:256},(_,i)=>[i,i,i])),plain=new Uint8ClampedArray(8),boosted=new Uint8ClampedArray(8),slices=[{width:2,db:new Float32Array([80,40])}];colourPixels(slices,2,1,80,70,0,colours,plain);colourPixels(slices,2,1,80,70,0,colours,boosted,1);assert(boosted[4]>plain[4]);assert.equal(boosted[0],plain[0]);
const suppressed=new Uint8ClampedArray(8);colourPixels([{width:2,db:new Float32Array([50,80])}],2,1,100,55,0,colours,suppressed,0,10);assert.equal(suppressed[0],0);assert(suppressed[4]>0);
(async()=>{
 const create=require('../dist/vendor/praat/build-release/praat-spectrogram.js'),{createProcessor}=require('../dist/vendor/praat/processor.js'),module=await create(),processor=createProcessor({load:async()=>module}),rate=24000;
 const pcm=Float32Array.from({length:rate*.2},(_,i)=>.1*Math.sin(2*Math.PI*150*i/rate));
 const result=await processor.handle({pcm,sampleRate:rate,windowSeconds:.005,maximumFrequency:5000,analysisFlags:7});assert(!result.error,result.error);assert.equal(result.features.length,10);
 for(const row of result.features){assert(Math.abs(row.pitch-150)<2,`Pitch ${row.pitch}`);assert(row.intensity>60&&row.intensity<90);assert(row.formants.every(Number.isFinite));}
 // A deterministic noise-excited five-resonance vowel checks Burg frequencies.
 let seed=42;const vowel=new Float32Array(rate*.2),filters=[500,1500,2500,3500,4500].map((f,i)=>{const r=Math.exp(-Math.PI*[80,100,120,140,160][i]/rate);return {a:2*r*Math.cos(2*Math.PI*f/rate),b:r*r,y1:0,y2:0}});
 for(let i=0;i<vowel.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;let x=seed/4294967296-.5;for(const f of filters){const y=x+f.a*f.y1-f.b*f.y2;f.y2=f.y1;f.y1=y;x=y;}vowel[i]=x;}
 const peak=Math.max(...vowel.map(Math.abs));for(let i=0;i<vowel.length;i++)vowel[i]*=.2/peak;
 const resonances=await processor.handle({pcm:vowel,sampleRate:rate,analysisFlags:1,formantCeiling:5500});assert(!resonances.error,resonances.error);
 for(let f=0;f<3;f++){const estimates=resonances.features.map(row=>row.formants[f]).sort((a,b)=>a-b),median=estimates[Math.floor(estimates.length/2)];assert(Math.abs(median-[500,1500,2500][f])<130,'Burg F'+(f+1)+' = '+median);}
 const silence=await processor.handle({pcm:new Float32Array(rate*.2),sampleRate:rate,analysisFlags:7});assert(!silence.error,silence.error);assert(silence.features.every(row=>row.pitch===0));
 for(const flags of [2,4]){const isolated=await processor.handle({pcm,sampleRate:rate,analysisFlags:flags});assert(!isolated.error,isolated.error);assert(isolated.features.every(row=>row.formants.every(f=>f===0)));if(flags===2){assert(isolated.features.every(row=>row.pitch>140&&row.intensity===-160));}else{assert(isolated.features.every(row=>row.pitch===0&&row.intensity>60));}}
 const off=await processor.handle({pcm,sampleRate:rate,windowSeconds:.005,maximumFrequency:5000});assert.deepEqual(off.features,[]);
 console.log('PASS: real Praat pitch/intensity/silence, optional analysis, formant gating, gap/jump rejection and display controls');
})().catch(e=>{console.error(e);process.exitCode=1});
