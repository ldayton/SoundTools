import {test} from 'node:test';import assert from 'node:assert/strict';
import {shiftRoutes,positionKey} from '../src/scale-shift';
import {patternPositions,linkedPatternPositions,patternShift,SCALE_SHAPES} from '../src/guitar-scale-patterns';
test('C major 5 to 1 can shift into B on low E at fret 7',()=>{
 const a=patternPositions(0,'major','1',0),b=linkedPatternPositions(0,'major','1',0,'5');
 const route=shiftRoutes(a,b,'ascending').get('6:7')!;
 assert.equal(route.previous.fret,5);assert.equal(route.previous.finger,1);assert.equal(route.arrival.finger,1);
 assert.equal(route.notes.filter(n=>n.string===1).length,3);
 assert.equal(shiftRoutes(a,b,'ascending').has('6:5'),false);
});
test('every offered route has one switch of shapes and consecutive scale pitches in either direction',()=>{
 let count=0;
 for(const quality of ['major','minor'] as const)for(let tonic=0;tonic<12;tonic++)for(const shape of SCALE_SHAPES)for(const linked of SCALE_SHAPES){
 if(shape===linked)continue;
 const a=patternPositions(tonic,quality,shape,patternShift(tonic,quality,shape));const b=linkedPatternPositions(tonic,quality,shape,patternShift(tonic,quality,shape),linked);
 for(const direction of ['ascending','descending'] as const){
 const sign=direction==='ascending'?1:-1;
 for(const route of shiftRoutes(a,b,direction).values()){
 count++; const lowerFirst=Math.min(...a.map(n=>n.fret))<Math.min(...b.map(n=>n.fret));
 const lower=lowerFirst?a:b,upper=lowerFirst?b:a,source=sign===1?lower:upper,dest=sign===1?upper:lower;
 const pivot=route.notes.findIndex(n=>positionKey(n)===positionKey(route.arrival));assert.ok(pivot>0);
 route.notes.forEach((n,i)=>{const expected=(i<pivot?source:dest).find(m=>positionKey(n)===positionKey(m));assert.equal(n.finger,expected?.finger);if(i){const prev=route.notes[i-1];const gap=sign*(n.midi-prev.midi);assert.ok(gap===1||gap===2);assert.equal(sign===1?(prev.degree%7)+1:(n.degree%7)+1,sign===1?n.degree:prev.degree);}});
 }
 }
 }
 assert.ok(count>100);
});

test('uneven pentatonic subsets never suggest a shift against the hand direction',()=>{
 const a=patternPositions(0,'major-pentatonic','2',0);
 const b=patternPositions(0,'major-pentatonic','3',0);
 // G at string 3/fret 12 to E at string 4/fret 14 descends in pitch,
 // but moves the hand up the neck: it is not a descending position shift.
 assert.equal(shiftRoutes(a,b,'descending',true).has('4:14'),false);
 for(const direction of ['ascending','descending'] as const){
  const routes=shiftRoutes(a,b,direction,true);
  assert.ok(routes.size>0);
  for(const route of routes.values()){
   const distance=(direction==='ascending'?1:-1)*(route.arrival.fret-route.previous.fret);
   assert.ok(distance>=0&&distance<=4);
  }
 }
});
