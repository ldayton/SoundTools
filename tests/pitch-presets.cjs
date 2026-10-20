const assert=require('node:assert/strict'),F=require('../dist/feature-state.js'),oracle=require('./fixtures/voice-tools-pitch.json');
for(const c of oracle.cases){const actual=F.group(c.rows.map(([time,pitch])=>({time,pitch,strength:1})),F.pitch(F.legacyVoice));assert.equal(actual.length,c.expected.length,c.name);actual.forEach((p,i)=>{assert(Math.abs(p.time-c.expected[i].time)<1e-9,c.name+' timestamp');assert(Math.abs(p.pitch-c.expected[i].pitch)<.0001,c.name+' pitch')})}
const selection=oracle.cases.find(c=>c.name==='closest-not-mean');assert.notDeepEqual(F.group(selection.rows.map(([time,pitch])=>({time,pitch,strength:1})),{...F.pitch(F.legacyVoice),aggregation:'mean'}).map(p=>p.pitch),selection.expected.map(p=>p.pitch),'Oracle must distinguish continuity grouping from averaging');
const gap=F.points([{time:0,pitch:100,strength:1},{time:.1,pitch:200,strength:1},{time:.5,pitch:250,strength:1},{time:1.5,pitch:180,strength:1}],F.legacyVoice);assert.deepEqual(gap.map(p=>p.connected),[false,true,true,false]);
const poly=[{x:0,y:0,hz:200,connected:false},{x:100,y:0,hz:200,connected:true},{x:100,y:100,hz:200,connected:true}];
assert.deepEqual(F.path(poly,20),[['moveTo',0,0],['quadraticCurveTo',0,0,20,0],['lineTo',80,0],['quadraticCurveTo',100,0,100,20],['lineTo',100,80],['lineTo',100,100]]);
assert.deepEqual(F.path([{...poly[0]},{...poly[1],connected:false}],20),[['moveTo',0,0],['lineTo',0,0],['moveTo',100,0],['lineTo',100,0]]);
const withSilence=F.points([{time:.01,pitch:200,strength:1},{time:.11,pitch:0,strength:0},{time:.21,pitch:220,strength:1}],F.legacyVoice);
const drawn=F.path(withSilence.map(p=>({...p,x:p.time,y:p.hz})),0);assert.equal(drawn.filter(p=>p[0]==='moveTo').length,1,'A permitted silence gap must not split the path');
const separate=F.points([{time:.01,pitch:200,strength:1},{time:.11,pitch:0,strength:0},{time:.91,pitch:220,strength:1}],F.legacyVoice);assert.equal(F.path(separate.map(p=>({...p,x:p.time,y:p.hz}))).filter(p=>p[0]==='moveTo').length,2);
let state=F.restore(null);assert.equal(state.selected,'soundglow');state=F.choose(state,'soundglow');assert.equal(state.pitch.gapMs,200);assert.equal(state.pitch.samplingMs,100);
assert.equal(F.changed(state,state.pitch),state);state=F.changed(state,{...state.pitch,history:7});assert.equal(state.selected,'custom');
state=F.save(state,'My pitch','saved-1');assert.equal(state.selected,'saved-1');state=F.changed(state,{...state.pitch,history:8});assert.equal(state.presets[0].settings.history,8);
for(const name of ['Praat','soundGLOW','Bad*',''])assert.throws(()=>F.save(state,name,'saved-2'));
state=F.save(state,'Renamed','unused');assert.equal(state.presets.length,1);assert.equal(state.presets[0].name,'Renamed');
assert.deepEqual(F.restore(JSON.stringify({version:1,...state})),state);state=F.remove(state);assert.equal(state.selected,'soundglow');assert.equal(state.presets.length,0);
const old=F.restore(JSON.stringify({version:1,active:'pitch',pitch:{...F.defaults,history:9}}));assert.equal(old.selected,'custom');assert.equal(old.pitch.history,9);
console.log('PASS: original-library pitch grouping oracle, gap/octave policy, rounded path geometry, preset edits, names, persistence and migration');
const praat=F.pitch(F.presets.praat);assert.equal(praat.minimum,50);assert.equal(praat.maximum,800);assert.equal(praat.axis,'log');assert.equal(praat.bands,false);assert.equal(praat.smoothing,'off');assert.equal(praat.jumpCents,0);
assert.deepEqual(F.drawingPolicy(praat,.01,10),{curve:true,dots:false});assert.deepEqual(F.drawingPolicy(praat,.01,1),{curve:true,dots:true});assert.deepEqual(F.drawingPolicy(praat,.1,10),{curve:false,dots:true});
assert.equal(F.position(50,praat),0);assert.equal(F.position(800,praat),1);assert(Math.abs(F.position(200,praat)-.5)<1e-12);
const frames=F.points([{time:.1,pitch:100,strength:.1},{time:.11,pitch:200,strength:.1},{time:.12,pitch:0,strength:0},{time:.13,pitch:180,strength:.1}],praat);
assert.deepEqual(frames.map(p=>p.connected),[false,true,false,false]);const edges=F.edges(frames,.01).filter(p=>p.hz);
assert.deepEqual(edges.map(p=>+p.time.toFixed(3)),[.095,.1,.11,.115,.125,.13,.135]);assert.deepEqual(edges.map(p=>p.hz),[100,100,200,200,180,180,180]);
assert.throws(()=>F.validName('PrAaT'));
console.log('PASS: Praat logarithmic defaults, automatic speckles/curve, unvoiced boundaries, half-frame extensions and no display-stage octave filtering');

assert.equal(F.points([{time:0,pitch:800,strength:1}],praat)[0].hz,0,'Praat treats its ceiling as unvoiced');

const collision=F.restore(JSON.stringify({version:1,active:'pitch',selected:'saved-old',pitch:F.defaults,presets:[{id:'saved-old',name:'Praat',settings:{...F.defaults,history:7}}]}));assert.equal(collision.selected,'saved-old');assert.equal(collision.presets[0].name,'Praat (custom)');assert.equal(collision.pitch.history,7);
const cascade=[[.01,200],[.11,180],[.12,220],[.21,230],[.22,170],[.31,240],[.32,160]].map(([time,pitch])=>({time,pitch,strength:1}));
for(const aggregation of ['continuity','mean']){
 const p=F.pitch({...F.legacyVoice,aggregation}),full=F.group(cascade,p);
 for(let cut=1;cut<cascade.length;cut++){
  const seed=F.groupSeed(cascade.slice(0,cut),p),snapshot=structuredClone(seed),first=(Math.floor(cascade[cut].time/.1)+.5)*.1;
  const actual=F.group(cascade.slice(cut),p,seed).filter(r=>r.time>=first-1e-8);
  assert.deepEqual(actual,full.filter(r=>r.time>=first-1e-8),'Discarding history must preserve established '+aggregation+' grouping, including partial buckets');assert.deepEqual(seed,snapshot);
 }
 // Repeated small trims must be equivalent to one large trim.
 let seed=null;for(const row of cascade.slice(0,5))seed=F.groupSeed([row],p,seed);
 assert.deepEqual(seed,F.groupSeed(cascade.slice(0,5),p));
}
console.log('PASS: bounded grouping prefix preserves historical measurements across pruning');

const priorVoice=[{time:.01,pitch:200,strength:1},{time:.11,pitch:0,strength:0},{time:.21,pitch:220,strength:1}];const voiceSettings=F.pitch(F.legacyVoice),prefix=F.groupSeed(priorVoice.slice(0,2),voiceSettings);assert.equal(F.points(priorVoice.slice(2),voiceSettings,prefix).at(-1).connected,true,'Pruning through an unvoiced group must preserve the previous voiced connection');

assert.deepEqual(Object.keys(F.presets).sort(),['praat','soundglow']);
assert.equal(F.pitch(F.presets.soundglow).confirmationMs,50);
assert.equal(F.restore(JSON.stringify({version:1,selected:'voice',pitch:F.legacyVoice})).selected,'soundglow');
assert.deepEqual(F.restore(null).pitch,F.pitch(F.presets.soundglow));
assert.deepEqual(F.restore(JSON.stringify({version:1,selected:'soundglow',pitch:F.defaults})).pitch,F.pitch(F.presets.soundglow));
assert.equal(F.pitch(F.presets.soundglow).method,'filtered');
assert.equal(F.pitch(F.presets.praat).method,'raw');
assert.equal(F.pitch({}).method,'raw'); // Old named custom presets retain their original method.
assert.throws(()=>F.pitch({method:'unknown'}));
