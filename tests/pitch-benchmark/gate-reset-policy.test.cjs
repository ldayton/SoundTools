const assert=require('node:assert/strict'),{QuietReset}=require('./gate-reset-policy.cjs');
const q=new QuietReset();for(let i=0;i<32;i++){assert.equal(q.before(),false);q.after(.1)}assert.equal(q.before(),true);assert.equal(q.before(),false);assert.equal(q.resets,1);
for(let i=0;i<31;i++){q.after(.1);assert.equal(q.before(),false)}q.after(.2);assert.equal(q.before(),false);for(let i=0;i<32;i++)q.after(.19);assert.equal(q.before(),true);
for(let i=0;i<1000;i++){q.after(.8);assert.equal(q.before(),false)}
assert.throws(()=>q.after(NaN));assert.throws(()=>q.after(2));assert.equal(new QuietReset().before(),false);
console.log('Causal reset timing, threshold, rate limit, speech interruption and fresh-session tests passed');
