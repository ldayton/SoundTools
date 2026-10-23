const assert=require('node:assert/strict'),{PitchContour}=require('../dist/pitch-contour.js');
const make=(hz,n,start=0)=>Array.from({length:n},(_,i)=>({time:start+i*.01,pitch:hz,strength:.8}));
const base=make(200,20),tail=make(0,8,.4);
function run(rows,packet=rows.length,options={confirmationMs:50}){const p=new PitchContour(options),out=[];for(let i=0;i<rows.length;i+=packet)out.push(...p.push(rows.slice(i,i+packet)));return out;}
const transient=[...base,...make(850,3,.2),...make(200,17,.23),...tail];
const expected=run(transient);assert.equal(expected.filter(r=>r.pitch===850).length,0);assert.equal(expected.filter(r=>r.pitch===200).length,37);
for(const n of [1,2,3,7,13])assert.deepEqual(run(transient,n),expected,'Packet boundaries cannot change decisions');
for(const hz of [60,400,1000]){const rs=[...base,...make(hz,20,.2),...tail];assert.equal(run(rs).filter(r=>r.pitch===hz).length,20,'Real sustained pitch changes survive');}
assert.equal(run([...make(1000,3),...make(0,8,.03)]).filter(r=>r.pitch===1000).length,3,'Unanchored short high onset preserved');
const weak=[...make(200,10),...make(210,2,.1).map(r=>({...r,strength:.5})),...make(0,8,.12)];assert.equal(run(weak).filter(r=>r.pitch===210).length,2,'Brief ordinary voicing preserved');
const stream=new PitchContour({confirmationMs:50});let committed=[];for(const row of transient){const next=stream.push([row]);assert(next.every(r=>r.time<=row.time-.05+1e-8));committed.push(...next);assert.deepEqual(committed,expected.slice(0,committed.length),'Committed observations never revise');}
assert.deepEqual(run(transient,3,{confirmationMs:0}),transient,'Off is transparent');
const p=new PitchContour({confirmationMs:50});p.push(base);assert.throws(()=>p.push([{time:.2,pitch:200,strength:1},{time:.1,pitch:200,strength:1}]));assert.equal(p.last,.19,'Invalid batches are atomic');
for(const value of [-1,40,NaN])assert.throws(()=>new PitchContour({confirmationMs:value}));
console.log('PASS: bounded pitch confirmation, packet invariance, stable commitment, quiet/brief/high/low notes, transparent off and atomic validation');

// Line eligibility is independent of pitch acceptance. Octave dips are retained,
// but neither edge of an isolated dip should be drawn as a confident transition.
const lineOptions={confirmationMs:50,breakUnconfirmedJumps:true};
const dip=[...base,...make(100,2,.2),...make(200,18,.22),...tail];
const guarded=run(dip,1,lineOptions),plain=run(dip,1,{confirmationMs:50});
assert.deepEqual(guarded.map(({breakBefore,pitchSupported,supportedTransitions,...r})=>r),plain);
assert.deepEqual(guarded.filter(r=>r.breakBefore).map(r=>+r.time.toFixed(2)),[.2,.22]);
for(const n of [2,3,7,13])assert.deepEqual(run(dip,n,lineOptions),guarded);
for(const hz of [100,400]){const rs=[...base,...make(hz,20,.2),...tail];assert.equal(run(rs,3,lineOptions).some(r=>r.breakBefore),false,'Supported octave changes remain connected');}
assert.equal(run(transient,2,lineOptions).filter(r=>r.pitch===850).length,0,'Existing high-spike rejection unchanged');
const afterGap=[...base,...make(0,3,.2),...make(100,20,.23),...make(0,8,.43)];
assert.equal(run(afterGap,2,lineOptions).filter(r=>r.pitch===100).length,20,'Gaps cannot erase accepted pitch');
assert.equal(run(afterGap,2,lineOptions).find(r=>Math.abs(r.time-.23)<1e-8).breakBefore,true,'An unvoiced gap cannot corroborate an octave transition');
console.log('PASS: uncertain octave dip disconnects both edges, accepted values unchanged, sustained transitions and packet invariance');
