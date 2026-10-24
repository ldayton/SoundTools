const assert=require('node:assert/strict'),F=require('../dist/feature-state.js');
const p=F.pitch();assert.equal(p.minimum,50);assert.equal(p.maximum,450);assert.deepEqual(p.ranges.map(r=>[r.low,r.high]),[[85,145],[145,175],[175,275]]);
const other=F.pitch();p.ranges[0].low=90;assert.equal(other.ranges[0].low,85);
for(const patch of [{minimum:500,maximum:450},{history:NaN},{ranges:[]},{ranges:[{...other.ranges[0],name:'<b>ok</b>'},...other.ranges.slice(1)]}]){
 if(patch.ranges?.[0]?.name==='<b>ok</b>')assert.equal(F.pitch(patch).ranges[0].name,'<b>ok</b>');else assert.throws(()=>F.pitch(patch));
}
assert.equal(F.restore('garbage').active,'spectrogram');assert.equal(F.restore(JSON.stringify({version:1,active:'pitch',pitch:other})).active,'pitch');
const rows=[{time:0,pitch:200,strength:.9},{time:.01,pitch:210,strength:.9},{time:.02,pitch:0,strength:0},{time:.03,pitch:220,strength:.9},{time:.04,pitch:440,strength:.9},{time:.1,pitch:445,strength:.9}];
const points=F.points(rows);assert.deepEqual(points.map(p=>p.connected),[false,true,false,false,false,false]);assert(points[1].hz>200&&points[1].hz<210);assert.equal(points[4].hz,440);assert.equal(F.points(rows,{smoothing:'off'})[1].hz,210);
assert.equal(F.points([{time:0,pitch:200,strength:.2}])[0].hz,0);
const scrolling=Array.from({length:100},(_,i)=>({time:.003+i*.01,pitch:200+10*Math.sin(i/5),strength:.9}));
const before=F.points(scrolling.slice(0,80)),after=F.points(scrolling);
assert.deepEqual(after.slice(0,80),before,'New measurements must not alter historical curve or marker placement');
const markers=rs=>F.points(rs,{smoothing:'off'}).filter(p=>p.marker&&p.time>=.2&&p.time<.7).map(p=>p.time);
assert.deepEqual(markers(scrolling.slice(1)),markers(scrolling),'Scrolling the oldest measurement out must not shift all markers');
console.log('PASS: feature settings isolation, validated persistence, pitch confidence, smoothing and unvoiced/octave/time gaps');
(async()=>{
 const {createProcessor}=require('../dist/vendor/praat/processor.js'),make=require('../dist/vendor/praat/build-release/praat-spectrogram.js'),p=createProcessor({load:make}),rate=24000;
 for(const hz of [65,100,200,400,800]){
  const pcm=Float32Array.from({length:rate*.3},(_,i)=>.15*Math.sin(2*Math.PI*hz*i/rate));
  const r=await p.handle({pcm,sampleRate:rate,analysisFlags:6,pitchFloor:50,pitchCeiling:1200});assert(!r.error,r.error);
  const voiced=r.features.filter(f=>f.pitch>0);assert(voiced.length>5);for(const f of voiced)assert(Math.abs(f.pitch-hz)<2,`Expected ${hz}, measured ${f.pitch}`);
 }
 for(const pitchFloor of [NaN,40,700]){const r=await p.handle({pcm:new Float32Array(4800),sampleRate:rate,analysisFlags:2,pitchFloor});assert.equal(r.code,'INVALID_REQUEST')}
 console.log('PASS: real Praat pitch including low voices and invalid detector ranges');
})().catch(e=>{console.error(e);process.exitCode=1});
