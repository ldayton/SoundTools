import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scaleLoopRoutes, positionKey } from '../src/scale-shift';
import { patternPositions, linkedPatternPositions, patternShift, SCALE_SHAPES } from '../src/guitar-scale-patterns';
const c = () => { const a = patternPositions(0,'major','1',0);return [a,linkedPatternPositions(0,'major','1',0,'5')] as const; };
test('high-E shift closes through low E, preserving both turnarounds and shape fingerings',()=>{
 const [a,b]=c();const loop=scaleLoopRoutes(a,b,'ascending').get('1:10')!;
 assert.ok(loop);assert.equal(positionKey(loop.out.previous),'1:8');assert.equal(loop.out.previous.finger,4);assert.equal(loop.out.arrival.finger,4);
 assert.equal(positionKey(loop.back.arrival),'6:5');assert.equal(positionKey(loop.back.previous),'6:7');assert.equal(loop.back.previous.finger,1);assert.equal(loop.back.arrival.finger,1);
 assert.equal(positionKey(loop.out.notes[0]),positionKey(loop.back.notes.at(-1)!));assert.equal(positionKey(loop.out.notes.at(-1)!),positionKey(loop.back.notes[0]));
 assert.ok(loop.out.notes.filter(n=>n.string===2).every(n=>b.includes(n)));assert.ok(loop.back.notes.filter(n=>n.string===2).every(n=>a.includes(n)));
});
test('user can change the return without changing the selected outward shift',()=>{
 const [a,b]=c();const first=scaleLoopRoutes(a,b,'ascending').get('1:10')!;
 const alternative=[...first.returns.keys()].find(k=>k!==positionKey(first.back.arrival))!;assert.ok(alternative);
 const edited=scaleLoopRoutes(a,b,'ascending',alternative).get('1:10')!;
 assert.equal(positionKey(edited.back.arrival),alternative);assert.equal(positionKey(edited.out.arrival),'1:10');
});
test('all offered loops are continuous, close on exact fret positions and change shape once on each leg',()=>{
 let count=0;
 for(const quality of ['major','minor','major-pentatonic','minor-pentatonic','major-blues','minor-blues'] as const)for(let tonic=0;tonic<12;tonic++)for(const shape of SCALE_SHAPES)for(const linked of SCALE_SHAPES){
 if(shape===linked)continue;const a=patternPositions(tonic,quality,shape,patternShift(tonic,quality,shape));const b=linkedPatternPositions(tonic,quality,shape,patternShift(tonic,quality,shape),linked);
 for(const direction of ['ascending','descending'] as const)for(const loop of scaleLoopRoutes(a,b,direction).values()){
 count++;assert.equal(positionKey(loop.out.notes[0]),positionKey(loop.back.notes.at(-1)!));assert.equal(positionKey(loop.out.notes.at(-1)!),positionKey(loop.back.notes[0]));
 for(const [leg,sign] of [[loop.out,direction==='ascending'?1:-1],[loop.back,direction==='ascending'?-1:1]] as const){
 const pivot=leg.notes.indexOf(leg.arrival);assert.ok(pivot>0);
 const beforePrimary=a.includes(leg.notes[0]);
 leg.notes.forEach((n,i)=>{assert.ok((i<pivot ? (beforePrimary?a:b):(beforePrimary?b:a)).includes(n));if(i){const prev=leg.notes[i-1];assert.ok(sign*(n.midi-prev.midi)>=1&&sign*(n.midi-prev.midi)<=(quality === "major" || quality === "minor" ? 2 : 3));}});
 }
 }
 }
 assert.ok(count>100);
});
