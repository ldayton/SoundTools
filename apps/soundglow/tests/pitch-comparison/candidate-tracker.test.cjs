const assert=require('node:assert/strict'),{CandidateTracker}=require('./candidate-tracker.cjs');
const row=(i,candidates,speech=true)=>({time:.05+i*.01,relativeIntensity:.2,candidates:candidates.map(([frequency,strength])=>({frequency,strength})),speech});
const steady=Array.from({length:100},(_,i)=>row(i,[[200,.9],[400,.7],[0,0]]));
for(const highCost of [0,.3]){let t=new CandidateTracker({highCost}),r=t.push(steady);assert.equal(r.length,95);assert(r.every(p=>p.pitch===200));let u=new CandidateTracker({highCost}),split=[];for(const p of steady)split.push(...u.push([p]));assert.deepEqual(split,r);assert(t.pending.length<=5);const snapshot=JSON.stringify(r);t.push(Array.from({length:10},(_,i)=>row(i+100,[[800,.98],[0,0]])));assert.equal(JSON.stringify(r),snapshot);}
let r=new CandidateTracker({highCost:.3}).push(Array.from({length:100},(_,i)=>row(i,[[800,.98],[0,0]])));assert(r.every(p=>p.pitch===800),'Sustained strongly supported high pitch must remain possible');
r=new CandidateTracker().push(steady.map(p=>({...p,speech:false})));assert(r.every(p=>p.pitch===0));
r=new CandidateTracker().push(steady.map(p=>({...p,relativeIntensity:0})));assert(r.every(p=>p.pitch===0));
const alternating=Array.from({length:40},(_,i)=>row(i,[[200,.8],[800,i===20?.99:.1],[0,0]]));r=new CandidateTracker().push(alternating);assert(r.every(p=>p.pitch===200),'One high candidate cannot override a supported continuous path');
const transition=Array.from({length:100},(_,i)=>row(i,[[i<40?200:400,.95],[0,0]]));r=new CandidateTracker().push(transition);assert(r.filter(p=>p.time>.6).every(p=>p.pitch===400),'Real register transition must recover');
const t=new CandidateTracker();assert.throws(()=>t.push([steady[0],{...steady[1],time:0}]));assert.equal(t.lastTime,-Infinity);assert.equal(t.pending.length,0);assert.throws(()=>t.push([{...steady[0],candidates:[{frequency:NaN,strength:.8}]}]));assert.throws(()=>new CandidateTracker({highCost:-1}));
console.log('PASS: candidate membership, silence/speech gating, packet invariance, 50 ms commitment, immutable output, high pitch retention, jumps and atomic validation');
