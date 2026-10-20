const assert=require('node:assert/strict'),{fallback}=require('./filtered-fallback.cjs');
const rows=Array.from({length:30},(_,i)=>({time:i*.01,pitch:200,strength:.9,speech:true})),raw=rows.map((r,i)=>i>=10&&i<=12?{...r,pitch:0,strength:0}:{...r}),filtered=rows.map(r=>({...r}));
let out=fallback(raw,filtered,raw);assert(out.slice(10,13).every(r=>r.pitch===200&&r.fallback));assert(out.every((r,i)=>!r.fallback||r.pitch===filtered[i].pitch));
for(const hz of [100,400,700]){let f=filtered.map((r,i)=>i>=10&&i<=12?{...r,pitch:hz}:{...r});assert(fallback(raw,f,raw).slice(10,13).every(r=>r.pitch===0));}
assert(fallback(raw,filtered.map(r=>({...r,strength:.5})),raw).slice(10,13).every(r=>r.pitch===0));
assert(fallback(raw.map(r=>({...r,speech:false})),filtered,raw.map(r=>({...r,speech:false}))).every(r=>!r.fallback));
let high=raw.map((r,i)=>i===11?{...r,pitch:900,strength:.9}:r),base=raw.map(r=>({...r}));assert.equal(fallback(high,filtered,base)[11].pitch,0,'Cannot undo a rejected strong raw high estimate');
const snapshot=JSON.stringify([raw,filtered]);fallback(raw,filtered,raw);assert.equal(JSON.stringify([raw,filtered]),snapshot);
for(let end=0;end<rows.length;end++){let prefix=fallback(raw.slice(0,end),filtered.slice(0,end),raw.slice(0,end));for(let i=0;i<prefix.length-5;i++)assert.deepEqual(prefix[i],out[i],'No evidence beyond 50 ms can revise a committed decision');}
assert.throws(()=>fallback(raw,filtered.slice(1),raw));console.log('PASS: recovery from bracketing raw anchors, no octave/high substitution, speech/confidence gating, immutable input and 50 ms commitment');
