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
assert.equal(F.pitch(F.presets.soundglow).method,'corroborated');
assert.equal(F.pitch(F.presets.praat).method,'raw');
assert.equal(F.pitch({}).method,'raw'); // Old named custom presets retain their original method.
assert.throws(()=>F.pitch({method:'unknown'}));

const sg=F.pitch(F.presets.soundglow);
assert.equal(sg.breakUnconfirmedJumps,true);assert.equal(sg.bandMode,'target');assert.equal(sg.targetLow,175);assert.equal(sg.targetHigh,275);
assert.equal(praat.breakUnconfirmedJumps,false);assert.equal(praat.bandMode,'ranges');
for(const p of [{targetLow:275,targetHigh:175},{targetLow:NaN},{targetHigh:1201},{bandMode:'invalid'},{breakUnconfirmedJumps:'yes'}])assert.throws(()=>F.pitch(p));
// Preserve old custom ranges instead of silently switching them to a target.
const savedRanges=F.restore(JSON.stringify({version:1,selected:'saved-range',presets:[{id:'saved-range',name:'Old ranges',settings:{bands:true,ranges:F.defaults.ranges}}]}));assert.equal(savedRanges.pitch.bandMode,'ranges');
const marked=[{time:.01,pitch:200,strength:1},{time:.11,pitch:100,strength:1,breakBefore:true},{time:.21,pitch:200,strength:1,breakBefore:true}];
assert.deepEqual(F.points(marked,sg).map(r=>r.connected),[false,false,false]);
const all=F.points(marked,sg);for(let cut=1;cut<marked.length;cut++){const seed=F.groupSeed(marked.slice(0,cut),sg);assert.deepEqual(F.points(marked.slice(cut),sg,seed).slice(-1),all.slice(-1),'Pruning preserves line breaks');}
const first=[{time:.01,pitch:200,strength:1},{time:.09,pitch:210,strength:1}],next=[...first,{time:.1,pitch:220,strength:1}];
assert.equal(F.completedPoints(F.points(first,sg),sg,.099,.09).length,0);
assert.equal(F.completedPoints(F.points(next,sg),sg,.1,.1).length,1);
const visible=F.completedPoints(F.points(next,sg),sg,.1,.1);
assert.deepEqual(F.completedPoints(F.points([...next,{time:.19,pitch:250,strength:1}],sg),sg,.19,.19),visible,'Later partial bucket cannot revise the completed one');
assert.equal(F.completedPoints(F.points(next,praat),praat,.1,.1).length,next.length,'Ungrouped Praat measurements are unaffected');
console.log('PASS: Soundglow target validation, custom preset migration, line-break pruning, stable complete buckets and unchanged Praat sampling');

const {PitchContour}=require('../dist/pitch-contour.js');
const note=(pitch,n,start)=>Array.from({length:n},(_,i)=>({time:start+i*.01,pitch,strength:.9}));
function displayedPitch(input){const contour=new PitchContour({confirmationMs:50,breakUnconfirmedJumps:true});return F.points(contour.push(input),sg)}
const held=[...note(200,20,0),...note(100,20,.2),...note(200,20,.4),...note(0,10,.6)];
assert.equal(displayedPitch(held).find(p=>Math.abs(p.time-.25)<1e-8).connected,true,'Stable lower octave remains connected after bucketing');
// A rapid excursion can move through intermediate raw pitches without making
// any individual one-octave step. Check the actual displayed group boundary.
const slidingDip=[...note(200,15,0),...[180,150,120,95,80,75].map((pitch,i)=>({time:.15+i*.01,pitch,strength:.9})),...note(0,9,.21),...note(200,20,.3),...note(0,10,.5)];
const dipped=displayedPitch(slidingDip);assert.equal(dipped.find(p=>Math.abs(p.time-.25)<1e-8).connected,false);assert.equal(dipped.find(p=>Math.abs(p.time-.35)<1e-8).connected,false,'Both sides of an unsupported grouped excursion disconnect');
const opts={confirmationMs:50,breakUnconfirmedJumps:true},processed=new PitchContour(opts).push(slidingDip);
for(let cut=1;cut<processed.length;cut++){const seed=F.groupSeed(processed.slice(0,cut),sg),snapshot=structuredClone(seed),remaining=processed.slice(cut);assert.deepEqual(F.points(remaining,sg,seed).slice(-1),F.points(processed,sg).slice(-1));assert.deepEqual(seed,snapshot,'Support aggregation never mutates pruning seed');}
console.log('PASS: displayed jump support survives grouping, gradual excursions, sustained octave transitions and every history-pruning cut');

// A discarded candidate must not affect the line between selected buckets.
const flatWithOutlier=Array.from({length:50},(_,i)=>({time:i*.01,pitch:i===12?100:200,strength:.9}));
const flatContour=new PitchContour(opts).push(flatWithOutlier),flatPoints=F.points(flatContour,sg);
assert(flatContour.some(r=>r.breakBefore),'Fixture must exercise raw line-break evidence');
assert.deepEqual(flatPoints.map(p=>p.hz),[200,200,200,200,200]);
assert.deepEqual(flatPoints.map(p=>p.connected),[false,true,true,true,true]);
for(let cut=1;cut<flatContour.length;cut++){const seed=F.groupSeed(flatContour.slice(0,cut),sg);const from=(Math.floor((flatContour[cut].time+1e-8)/.1)+.5)*.1;assert.deepEqual(F.points(flatContour.slice(cut),sg,seed).filter(p=>p.time>=from-1e-8),flatPoints.filter(p=>p.time>=from-1e-8));}
const descending=Array.from({length:50},(_,i)=>({time:i*.01,pitch:i<15?400:400*2**(-Math.min(i-14,6)*500/1200),strength:.9}));
const descent=new PitchContour(opts).push(descending);
assert.equal(descent.find(r=>Math.abs(r.time-.2)<1e-8).pitchSupported,false,'A chain of small steps is not a stable preceding window');
const descentPoints=F.points(descent,sg);assert.equal(descentPoints.find(r=>Math.abs(r.time-.25)<1e-8).connected,false,'Unsupported multi-octave display jump breaks');
for(const size of [1,2,7,13]){const c=new PitchContour(opts),out=[];for(let i=0;i<descending.length;i+=size)out.push(...c.push(descending.slice(i,i+size)));assert.deepEqual(out,descent);}
console.log('PASS: discarded outliers preserve flat connections; full-window support rejects rapid drift, with pruning and packet invariance');
