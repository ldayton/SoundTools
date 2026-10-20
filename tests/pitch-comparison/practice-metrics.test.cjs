const assert=require('node:assert/strict'),{score,continuity}=require('./practice-metrics.cjs'),F=require('../../dist/feature-state.js');
const ref=Array.from({length:120},(_,i)=>i<80?200:0),rows=[{time:.3,pitch:200,strength:1},{time:.4,pitch:400,strength:1},{time:.5,pitch:0,strength:0},{time:.6,pitch:200,strength:.2},{time:.9,pitch:200,strength:1}];
assert.deepEqual(score(rows,ref,0),{voiced:4,missed:2,unvoiced:1,falseVoice:1,both:2,gross:1});
assert.deepEqual(score(rows.map(r=>({...r,time:r.time+2})),ref,2),score(rows,ref,0),'Explicit source origin cannot shift scores');
assert.deepEqual(score([{time:.8,pitch:200,strength:1}],ref,0),{voiced:0,missed:0,unvoiced:0,falseVoice:0,both:0,gross:0},'Boundary uncertainty excluded rather than mislabelled');
const gapRef=Array.from({length:120},(_,i)=>i>=40&&i<60?0:200),gapRows=[{time:.3,pitch:200,strength:1},{time:.7,pitch:200,strength:1},{time:.9,pitch:0,strength:0}];
assert.equal(continuity(gapRows,F.legacyVoice,gapRef).longReferenceGapsBridged,1);
assert.equal(continuity(gapRows,F.presets.soundglow,gapRef).longReferenceGapsBridged,0);
assert.equal(continuity(gapRows,F.presets.soundglow,Array(120).fill(200)).breaksWithinReferenceVoicing,1);
assert.equal(continuity(gapRows.slice(0,2),F.legacyVoice,gapRef).connections,0,'Incomplete final group excluded');
console.log('PASS: independent pitch/voicing counts, octave errors, confidence, source origins, uncertainty masks and continuity scoring');

const {floatWave}=require('./float-wave.cjs'),pcm=Buffer.from(Float32Array.from([-.5,0,.25]).buffer),wave=floatWave(pcm);assert.equal(wave.readUInt32LE(4),wave.length-8);assert.equal(wave.readUInt16LE(20),3);assert.equal(wave.readUInt32LE(44),3);assert.deepEqual(wave.subarray(56),pcm);assert.throws(()=>floatWave(Buffer.alloc(3)));
