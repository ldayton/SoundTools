import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cagedRoute,cagedRoutes,reverseCagedRoute} from '../src/caged-route';
import {mergeGuitarScaleSettings,guitarScaleFromQuery} from '../src/guitar-scale-settings';

const intervals={major:[0,2,4,5,7,9,11],minor:[0,2,3,5,7,8,10],'major-pentatonic':[0,2,4,7,9],'minor-pentatonic':[0,3,5,7,10],'major-blues':[0,2,3,4,7,9],'minor-blues':[0,3,5,6,7,10]} as const;
test('all keys and Western families have a complete playable five-position scale',()=>{
 for(const quality of Object.keys(intervals) as (keyof typeof intervals)[])for(let tonic=0;tonic<12;tonic++){
  const alternatives=cagedRoutes(tonic,quality);assert.equal(alternatives.length,4);
  const signatures=alternatives.map(r=>r.shifts.map(s=>`${s.previous.string}:${s.previous.fret}>${s.arrival.fret}`).join('/'));
  assert.equal(new Set(signatures).size,4,'Each alternative changes actual hand shifts');
  for(const route of alternatives){assert(route,`${tonic} ${quality}`);
  assert.equal(route.regions.length,5);assert.equal(new Set(route.regions.map(r=>r.shape)).size,5);assert.equal(route.shifts.length,4);
  assert(route.notes[0].root&&route.notes.at(-1)!.root);assert(route.notes.at(-1)!.midi-route.notes[0].midi>=24);
  const expected=Array.from({length:route.notes.at(-1)!.midi-route.notes[0].midi+1},(_,i)=>route.notes[0].midi+i).filter(m=>intervals[quality].some(interval=>(tonic+interval)%12===m%12));
  assert.deepEqual(route.notes.map(n=>n.midi),expected,'No missing, repeated, or invented scale pitches');
  for(let region=0;region<5;region++)assert(route.notes.filter(n=>n.region===region).length>=2,'Every shape is actually played');
  route.notes.forEach((n,i)=>{
   assert(n.fret>=1&&n.fret<=22);assert(n.finger>=1&&n.finger<=4);
   assert(route.regions[n.region].notes.some(m=>m.midi===n.midi&&m.fret===n.fret&&m.string===n.string&&m.finger===n.finger));
   if(i){const p=route.notes[i-1];assert(n.region===p.region||n.region===p.region+1);assert(p.string-n.string>=0&&p.string-n.string<=1);}
  });
  for(const {previous,arrival} of route.shifts){assert.equal(previous.string,arrival.string);assert(arrival.fret>previous.fret&&arrival.fret-previous.fret<=3);}
  const back=reverseCagedRoute(route);assert.deepEqual(back.notes,[...route.notes].reverse());assert.deepEqual(back.shifts,route.shifts.map(s=>({previous:s.arrival,arrival:s.previous})).reverse());assert.deepEqual(reverseCagedRoute(back),route);
  }
 }
});
test('G major has a three-octave route across E, D, C, A and G forms',()=>{
 const r=cagedRoute(7,'major')!;assert.deepEqual(r.regions.map(s=>s.shape),['1','2','3','4','5']);assert.equal(r.notes[0].midi,43);assert.equal(r.notes.at(-1)!.midi,79);
});
test('all-five selection survives saved/query settings and exits for other shape systems',()=>{
 const base={tonic:7,quality:'major' as const,shapeSet:'standard' as const,wholeRoute:true};
 assert.equal(mergeGuitarScaleSettings(base).wholeRoute,true);
 assert.equal(guitarScaleFromQuery(new URLSearchParams('key=C&link=all'),{tonic:7,quality:'major'}).wholeRoute,true);
 assert.equal(guitarScaleFromQuery(new URLSearchParams('link=2'),base).wholeRoute,false);
 assert.equal(mergeGuitarScaleSettings({shapeSet:'hila'},base).wholeRoute,false);
 assert.equal(mergeGuitarScaleSettings({quality:'hijaz'},base).wholeRoute,false);
 assert.equal(cagedRoute(2,'hijaz'),undefined);
});

test('route direction validates, round trips and defaults to both ways',()=>{
 const base={tonic:7,quality:'major' as const,routeDirection:'down' as const};
 assert.equal(mergeGuitarScaleSettings({},base).routeDirection,'down');
 assert.equal(mergeGuitarScaleSettings({routeDirection:'both'},base).routeDirection,'both');
 for(const direction of ['up','down','both'])assert.equal(guitarScaleFromQuery(new URLSearchParams(`link=all&direction=${direction}`),base).routeDirection,direction);
 assert.equal(guitarScaleFromQuery(new URLSearchParams('link=all&direction=wrong'),{tonic:7,quality:'major'}).routeDirection,'both');
});

test('route alternatives persist and reject invalid selection indices',()=>{
 const base={tonic:7,quality:'major' as const,routeVariant:2};
 assert.equal(mergeGuitarScaleSettings({},base).routeVariant,2);
 assert.equal(mergeGuitarScaleSettings({routeVariant:10},base).routeVariant,2);
 assert.equal(guitarScaleFromQuery(new URLSearchParams('link=all&route=4'),base).routeVariant,3);
 assert.equal(guitarScaleFromQuery(new URLSearchParams('link=all&route=0'),{tonic:7,quality:'major'}).routeVariant,0);
});
