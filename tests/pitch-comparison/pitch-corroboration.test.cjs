const assert=require('node:assert/strict'),{corroborate}=require('./pitch-corroboration.cjs');
const row=(pitch,strength=.9,time=.05)=>({time,pitch,strength});
assert.equal(corroborate([row(220)],[row(110)])[0].pitch,220);
assert.equal(corroborate([row(900)],[row(220)])[0].pitch,0);
assert.equal(corroborate([row(900)],[row(0,0)])[0].pitch,0);
assert.equal(corroborate([row(800)],[row(810)])[0].pitch,800);
assert.equal(corroborate([row(800)],[row(800,.4)])[0].pitch,0);
assert.equal(corroborate([row(0,0)],[row(220)])[0].pitch,0); // No fabricated fallback.
assert.throws(()=>corroborate([row(200)],[]));assert.throws(()=>corroborate([row(200)],[row(200,.9,.06)]));
const a=[row(900)],b=[row(200)],snapshot=JSON.stringify([a,b]);corroborate(a,b);assert.equal(JSON.stringify([a,b]),snapshot);
console.log('PASS: raw membership, octave preservation, high-pitch corroboration, unvoiced handling, alignment and non-mutation');
