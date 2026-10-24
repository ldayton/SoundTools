const assert=require('node:assert/strict'),{temporal,candidateCorrelation,eligible}=require('./temporal-filters.cjs');
const make=(hz,n,start=0,score=.8)=>Array.from({length:n},(_,i)=>({time:start+i*.01,pitch:hz,strength:.7,periodicity:{difference:score}}));
assert.equal(temporal(make(870,3)).filter(eligible).length,0);
assert.equal(temporal(make(750,5)).filter(eligible).length,0);
assert.equal(temporal(make(200,6)).filter(eligible).length,6);
assert.equal(temporal(make(1000,10)).filter(eligible).length,10);
assert.equal(temporal([...make(200,10),...make(400,10,.1)]).filter(eligible).length,20);
assert.equal(temporal(make(200,3),{rescueDifference:.25}).filter(eligible).length,0);
assert.equal(temporal(make(200,3,0,.1),{rescueDifference:.25}).filter(eligible).length,3);
assert.equal(temporal([...make(200,3),...make(200,3,.2)]).filter(eligible).length,0,'Do not join real gaps');
assert.equal(temporal([...make(200,3),...make(800,3,.03)]).filter(eligible).length,0,'Do not join octave jumps');
const glide=make(120,30).map((r,i)=>({...r,pitch:120+i*6}));assert.equal(temporal(glide).filter(eligible).length,30);
assert.throws(()=>temporal([make(200,1)[0],make(200,1)[0]]));assert.throws(()=>temporal([],{minimumFrames:0}));
// Completed decisions cannot change when later context is appended beyond confirmation.
const first=[...make(200,6),...make(0,20,.06)],later=[...first,...make(200,20,.26)];assert.deepEqual(temporal(first),temporal(later).slice(0,first.length));
const rate=16000;for(const hz of [60,200,500,1000]){const pcm=Float32Array.from({length:rate},(_,i)=>.2*Math.sin(2*Math.PI*hz*i/rate)+.4);assert(candidateCorrelation(pcm,rate,.5,hz)>.98);}
assert.equal(candidateCorrelation(new Float32Array(rate),rate,.5,200),0);
assert.equal(candidateCorrelation(new Float32Array(rate),rate,0,200),null);
assert.throws(()=>candidateCorrelation(new Float32Array(rate),rate,.5,NaN));
assert.throws(()=>candidateCorrelation(Float32Array.from({length:rate},()=>NaN),rate,.5,200));
console.log('PASS: brief weak events, sustained/high notes, jumps, gaps, glides, rescue, bounded confirmation, fractional correlation and invalid data');
const supported=[...make(200,8),...make(210,3,.16)];
assert.equal(temporal(supported,{supportSeconds:.3}).filter(eligible).length,11);
assert.equal(temporal([...make(200,8),...make(870,3,.16)],{supportSeconds:.3}).filter(eligible).length,8);
// A rescued short segment cannot itself rescue another segment beyond a real anchor.
assert.equal(temporal([...make(200,8),...make(210,3,.3),...make(220,3,.6)],{supportSeconds:.3}).filter(eligible).length,11);
for(const end of [.15,.2,.3,.4]){const all=[...make(200,8),...make(210,3,.16),...make(750,4,.24),...make(200,20,.34)];const prefix=all.filter(r=>r.time<=end);const stable=temporal(prefix,{rescueDifference:.35,supportSeconds:.3}).filter(r=>r.time<end-.101);const complete=temporal(all,{rescueDifference:.35,supportSeconds:.3}).filter(r=>r.time<end-.101);assert.deepEqual(stable,complete);}
console.log('PASS: past support, no rescue chains and stable decisions after bounded lookahead');
