const assert=require('node:assert/strict'),{score}=require('./metrics.cjs');
const ref=[0,100,100,100,0].map((hz,i)=>({time:i*.01,hz}));
assert.equal(score(ref,ref).f1_50,1);
assert.equal(score(ref,[]).missed,3); // missing output cannot improve the denominator
const doubled=ref.map(r=>({...r,hz:r.hz*2}));let s=score(ref,doubled);assert.equal(s.octaveUpEvents,1);assert.equal(s.octaveUpFrames,3);assert.equal(s.f1_100,0);
assert.equal(score(ref,ref.map(r=>({...r,time:r.time+.1}))).missed,3);
assert.equal(score([{time:0,hz:0}],[{time:0,hz:100}]).falseVoicedSeconds,.01);
assert.equal(score([{time:0,hz:100,exclude:true}],[]).excluded,1);
assert.throws(()=>score(ref,[{time:0,hz:100},{time:0,hz:200}]));
assert.equal(score([{time:0,hz:100}], [{time:0,hz:100*2**(50/1200)}]).correct50,1);
console.log('Benchmark scoring regressions passed');

assert.throws(()=>score([{time:0,hz:100},{time:.02,hz:100}],[]));
const {aggregate,bootstrap}=require('./aggregate.cjs');
const samples=[{corpus:'a',speaker:'1',score:score(ref,ref)},{corpus:'a',speaker:'2',score:score(ref,[])}];
assert.equal(aggregate(samples).voiced,6);assert.deepEqual(bootstrap(samples),bootstrap(samples));assert.equal(bootstrap([...samples,samples[0]]).speakers,2);assert.throws(()=>bootstrap([samples[0]]));
const {pairedDelta}=require('./aggregate.cjs');const named=samples.map((c,i)=>({...c,id:String(i)}));assert.deepEqual(pairedDelta(named,named).interval95,[0,0]);assert.throws(()=>pairedDelta(named,[named[0]]));

assert.throws(()=>score(ref,ref,{hop:Infinity}));assert.throws(()=>score(ref,ref,{tolerance:Infinity}));
const {speechAt}=require('./gate.cjs');assert.equal(speechAt([{time:1.025,speech:true}],{time:1,availableAt:1.02}),false);assert.equal(speechAt([{time:1.025,speech:true}],{time:1,availableAt:1.04}),true);assert.equal(speechAt([{time:.89,speech:true}],{time:1,availableAt:1.2}),false);assert.throws(()=>speechAt([],{time:1}));
const {neuralAt}=require('./evaluate-gate-trial.cjs');
const decision={time:1.04,start:1.024,end:1.056,probability:.3,availableAt:1.1};
assert.equal(neuralAt([decision],{time:1,availableAt:1.1},.3),true); // interval overlaps even though its centre is beyond +30 ms
assert.equal(neuralAt([decision],{time:1,availableAt:1.099},.3),false); // future computation is unavailable
assert.equal(neuralAt([{...decision,start:1.031}],{time:1,availableAt:1.1},.3),false);
assert.equal(neuralAt([{...decision,probability:.299}],{time:1,availableAt:1.1},.3),false);
console.log('Speech confirmation interval and availability regressions passed');
