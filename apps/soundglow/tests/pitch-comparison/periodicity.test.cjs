const assert=require('node:assert/strict'),{periodicity}=require('./periodicity.cjs');
const rate=16000;
for(const hz of [60,100,200,500,1000]){const signal=Float32Array.from({length:rate},(_,i)=>.1*Math.sin(2*Math.PI*hz*i/rate));const p=periodicity(signal,rate,.5);assert(p.difference<.03,`${hz}: ${p.difference}`);const dc=Float32Array.from(signal,x=>x+.4);assert(Math.abs(periodicity(dc,rate,.5).difference-p.difference)<1e-5);}
assert.equal(periodicity(new Float32Array(rate),rate,.5).difference,1);
let seed=7;const noise=Float32Array.from({length:rate},()=>{seed=(1664525*seed+1013904223)>>>0;return seed/2**32-.5});assert(periodicity(noise,rate,.5).difference>.5);
assert.equal(periodicity(noise,rate,.001),null);assert.equal(periodicity(noise,rate,.999),null);
assert.throws(()=>periodicity(noise,0,.5));assert.throws(()=>periodicity(Float32Array.from(noise,()=>NaN),rate,.5));
console.log('PASS: periodicity tones including high notes, DC invariance, silence, noise, boundaries and invalid data');

// A genuine 200 Hz source remains present at 0 dB SNR. A strict gate can still reject it.
const noisy=Float32Array.from({length:rate},(_,i)=>{seed=(1664525*seed+1013904223)>>>0;return Math.sin(2*Math.PI*200*i/rate)+Math.sqrt(6)*(seed/2**32-.5)});
assert(periodicity(noisy,rate,.5).difference>.35);
console.log('PASS: known voiced source in noise demonstrates false rejection risk');
assert.throws(()=>periodicity(noise,rate,.5,{floor:NaN}));
assert.throws(()=>periodicity(noise,rate,-1));
