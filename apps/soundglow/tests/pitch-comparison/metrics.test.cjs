const assert=require('node:assert/strict'),{score}=require('./metrics.cjs');
assert.equal(score([{time:0,hz:200}],[],1).voicingRecall,null);
const r=score([{time:0,hz:200},{time:.5,hz:400},{time:1,hz:200},{time:1.5,hz:0}],[{start:0,end:1,label:'voiced',hz:200},{start:1,end:2,label:'nonvoice'}],2,{maxHoldSeconds:.5});
assert.equal(r.voicingRecall,1);assert.equal(r.pitchAccuracy,.5);assert.equal(r.falseAlarmRate,.5);
assert.equal(score([{time:0,hz:200}],[{start:0,end:1,label:'unknown'}],1).voicedSeconds,0);
assert.throws(()=>score([{time:0,hz:1},{time:0,hz:0}],[],1));assert.throws(()=>score([],[{start:0,end:2,label:'voiced'}],1));
console.log('PASS: interval overlap, octave errors, unknown labels and timestamp validation');

assert.equal(score([],[{start:0,end:1,label:'voiced',hz:200}],1).voicingRecall,0);
assert.throws(()=>score([],[{start:NaN,end:1,label:'voiced'}],1));

assert.equal(score([{time:0,hz:200}],[{start:0,end:1,label:'voiced'}],1).voicingRecall,.15);
