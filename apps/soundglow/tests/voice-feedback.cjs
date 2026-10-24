const assert=require('node:assert/strict');
const {FormantTracker,VowelTargets,relativeTarget,spectralSlice,bandEnergy}=require('../dist/voice-feedback.js');
const row=(time,f2=1500)=>({time,formants:[500,f2,2500],bandwidths:[80,100,120],pitch:180,strength:.9,intensity:75});
const tracker=new FormantTracker({smoothingSeconds:.03});const first=tracker.push(row(0));assert.equal(first.formants[1].hz,1500);const next=tracker.push(row(.01,1600));assert(next.formants[1].hz>1500&&next.formants[1].hz<1600);assert.equal(next.formants[1].connected,true);
const invalid=tracker.push({...row(.02),pitch:0});assert.equal(invalid.formants[1].hz,null);assert.equal(invalid.formants[1].quality,0);assert.equal(tracker.push(row(.03,1600)).formants[1].hz,1600,'Never smooth across rejected frames');
assert.equal(tracker.push(row(.2,1550)).formants[1].connected,false);assert.equal(tracker.push(row(.21,2300)).formants[1].connected,false,'Never bridge identity jumps');assert.equal(tracker.push(row(.1)).formants[1].connected,false,'Seek resets tracking');tracker.reset();assert.equal(tracker.push({...row(.3),bandwidths:[80,900,120]}).formants[1].hz,null);
assert.equal(tracker.push({...row(.4),intensity:20},{referenceIntensity:75}).formants[1].hz,null);
assert.throws(()=>new FormantTracker({smoothingSeconds:NaN}));assert.throws(()=>tracker.push({...row(0),time:NaN}));
// Equivalent smoothing after equal elapsed time at 10 ms and 20 ms input hops.
const a=new FormantTracker({smoothingSeconds:.03}),b=new FormantTracker({smoothingSeconds:.03});a.push(row(0));b.push(row(0));let ar,br;for(let i=1;i<=4;i++)ar=a.push(row(i*.01,1600));for(let i=1;i<=2;i++)br=b.push(row(i*.02,1600));assert(Math.abs(ar.formants[1].hz-br.formants[1].hz)<1e-8);
// Disabling uncertainty gates exposes raw finite estimates, while retaining numeric safety.
const unfiltered=new FormantTracker({filterUncertain:false});
assert.equal(unfiltered.push({...row(0),pitch:0,strength:0,intensity:-100,bandwidths:[900,900,900]}).formants[1].hz,1500);
assert.equal(unfiltered.push({...row(.01),formants:[NaN,-1,Infinity]}).formants[1].hz,null);
assert.throws(()=>new FormantTracker({filterUncertain:'off'}));
const target=relativeTarget({id:'my-vowel',vowel:'i',language:'en-US',baselineHz:1500,shiftSemitones:12,halfWidthHz:100});assert.equal(target.centreHz,3000);
const targets=new VowelTargets([target]);assert.equal(targets.compare(target.id,first,{vowel:'a',language:'en-US',nowSeconds:.01}).available,false);assert.equal(targets.compare(target.id,invalid,{vowel:'i',language:'en-US',nowSeconds:.03}).available,false);assert.equal(targets.compare(target.id,first,{vowel:'i',language:'en-US',nowSeconds:.03}).offsetHz,-1500);
let stored;const storage={setItem:(k,v)=>{stored=v},getItem:()=>stored};targets.save(storage);assert.deepEqual(VowelTargets.load(storage).list(),targets.list());targets.delete(target.id);assert.equal(targets.list().length,0);assert.throws(()=>targets.set({...target,centreHz:NaN}));assert.throws(()=>targets.save({setItem(){throw Error('full')}}));
const original={time:1,power:new Float32Array([1,2,3])};const slice=spectralSlice(original,{firstFrequency:0,frequencyStep:100});slice.power[0]=9;assert.equal(original.power[0],1,'Slices own their data');slice.power[0]=1;
assert.equal(bandEnergy(slice,[{fromHz:50,toHz:250}])[0].energy,500);assert.throws(()=>bandEnergy(slice,[{fromHz:0,toHz:1000}]));
(async()=>{
 const make=require('../dist/vendor/praat/build-release/praat-spectrogram.js'),{createProcessor}=require('../dist/vendor/praat/processor.js');const module=await make(),processor=createProcessor({load:async()=>module}),rate=24000;
 // Independent AR(2) resonator at 1 kHz driven by seeded white noise.
 let seed=42,y1=0,y2=0;const r=Math.exp(-Math.PI*80/rate),a=2*r*Math.cos(2*Math.PI*1000/rate),b=r*r;
 const pcm=Float32Array.from({length:rate*.2},()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;const y=(seed/4294967296-.5)+a*y1-b*y2;y2=y1;y1=y;return y*.01});
 const result=await processor.handle({type:'lpc',pcm,sampleRate:rate,ceiling:6000,order:2,bins:1024,preEmphasisHz:0});assert(!result.error,result.error);const ownedPower=Array.from(result.power),ownedCoefficients=Array.from(result.coefficients);assert.equal(result.method,'praat-burg');assert.equal(result.coefficients.length,2);assert.equal(result.power.length,1024);assert(result.power.every(p=>Number.isFinite(p)&&p>=0));
 const peak=result.power.indexOf(Math.max(...result.power))*result.frequencyStep;assert(Math.abs(peak-1000)<70,`Known LPC resonance: ${peak}`);
 const silence=await processor.handle({type:'lpc',pcm:new Float32Array(4800),sampleRate:rate});assert(!silence.error,silence.error);assert(silence.power.every(p=>p===0));
 for(const options of [{order:NaN},{bins:1},{ceiling:NaN},{windowSeconds:1},{preEmphasisHz:-1}]){const bad=await processor.handle({type:'lpc',pcm,sampleRate:rate,...options});assert(bad.error,'Reject invalid LPC options');}
 const spectrum=await processor.handle({pcm,sampleRate:rate,windowSeconds:.005,maximumFrequency:5000});assert(!spectrum.error,spectrum.error);assert(spectrum.frames>0,'Normal FFT remains available after LPC errors');
 assert.deepEqual(Array.from(result.power),ownedPower);assert.deepEqual(Array.from(result.coefficients),ownedCoefficients);assert.equal((await processor.handle({type:'dispose'})).disposed,true);assert.equal(module._sg_lpc_gain(),0);console.log('PASS: formant gating/smoothing/gaps, independent targets/storage, spectrum energy and real Praat Burg envelope');
})().catch(e=>{console.error(e);process.exitCode=1});

// Reject absent/invalid frequency coverage instead of silently claiming zero energy.
for(const firstFrequency of [NaN,Infinity,-1,undefined])assert.throws(()=>bandEnergy({firstFrequency,frequencyStep:100,power:new Float32Array([1,2,3])},[{fromHz:0,toHz:100}]));
assert.throws(()=>bandEnergy({firstFrequency:1000,frequencyStep:100,power:new Float32Array([1,2,3])},[{fromHz:0,toHz:100}]));
assert.throws(()=>bandEnergy({firstFrequency:0,frequencyStep:100,power:new Float32Array()},[{fromHz:0,toHz:100}]));
assert.throws(()=>bandEnergy({firstFrequency:0,frequencyStep:Infinity,power:new Float32Array([1])},[{fromHz:0,toHz:100}]));
assert.throws(()=>bandEnergy({firstFrequency:0,frequencyStep:100,power:new Float32Array([NaN])},[{fromHz:0,toHz:20}]));
const flat={firstFrequency:100,frequencyStep:100,power:new Float32Array([2,2,2])};assert.equal(bandEnergy(flat,[{fromHz:50,toHz:350}])[0].energy,600);assert.equal(bandEnergy(flat,[{fromHz:75,toHz:125}])[0].energy,100);assert.throws(()=>bandEnergy(flat,[{fromHz:49,toHz:100}]));assert.throws(()=>bandEnergy(flat,[{fromHz:300,toHz:351}]));
const checkTargets=new VowelTargets([target]),context={vowel:'i',language:'en-US',nowSeconds:.1,maxAgeSeconds:.1};
assert.equal(checkTargets.compare(target.id,first,context).available,true);assert.equal(checkTargets.compare(target.id,first,context).time,0);assert.equal(checkTargets.compare(target.id,first,context).ageSeconds,.1);
assert.equal(checkTargets.compare(target.id,first,{...context,nowSeconds:.101}).reason,'stale-frame');assert.equal(checkTargets.compare(target.id,first,{...context,nowSeconds:-.001}).reason,'future-frame');
assert.equal(checkTargets.compare(target.id,{formants:first.formants},context).reason,'missing-timestamp');assert.throws(()=>checkTargets.compare(target.id,first,{vowel:'i',language:'en-US'}));assert.throws(()=>checkTargets.compare(target.id,first,{...context,nowSeconds:NaN}));assert.throws(()=>checkTargets.compare(target.id,first,{...context,maxAgeSeconds:-1}));
assert.equal(checkTargets.compare(target.id,{...first,time:1},{...context,nowSeconds:1.1}).available,true,'Freshness boundary tolerates floating-point rounding');
console.log('PASS: band geometry/coverage and timestamped target freshness boundaries');

assert.throws(()=>bandEnergy({firstFrequency:1e308,frequencyStep:1e308,power:new Float32Array([1,2,3])},[{fromHz:1e308,toHz:1.1e308}]));
assert.throws(()=>bandEnergy({firstFrequency:0,frequencyStep:1e308,power:new Float32Array([3,3])},[{fromHz:0,toHz:1e308}]));
