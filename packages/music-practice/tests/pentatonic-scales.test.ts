import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scaleNotes, relativeScale } from '../src/guitar-scales';
import { patternPositions, patternShift, relativePattern, patternBounds, SCALE_SHAPES } from '../src/guitar-scale-patterns';
import { guitarScaleFromQuery, mergeGuitarScaleSettings } from '../src/guitar-scale-settings';
test('pentatonics retain correct note spelling and diatonic degrees', () => {
 assert.deepEqual(scaleNotes(0,'major-pentatonic').map(n=>[n.name,n.degree]), [['C',1],['D',2],['E',3],['G',5],['A',6]]);
 assert.deepEqual(scaleNotes(9,'minor-pentatonic').map(n=>[n.name,n.degree]), [['A',1],['C',3],['D',4],['E',5],['G',7]]);
 assert.deepEqual(scaleNotes(6,'major-pentatonic').map(n=>n.name), ['F#','G#','A#','C#','D#']);
});
test('all keys have five playable pentatonic positions with the correct relative pitches', () => {
 for(const quality of ['major-pentatonic','minor-pentatonic'] as const)for(let tonic=0;tonic<12;tonic++)for(const shape of SCALE_SHAPES){
 assert.deepEqual(scaleNotes(tonic,quality).map(n=>(n.pitchClass-tonic+12)%12),quality.startsWith('major')?[0, 2, 4, 7, 9]:[0, 3, 5, 7, 10]);
 const shift=patternShift(tonic,quality,shape);const notes=patternPositions(tonic,quality,shape,shift);
 assert.equal(new Set(notes.map(n=>n.string)).size,6);
 assert.ok(notes.every(n=>n.finger>=1&&n.finger<=4));
 assert.equal(new Set(notes.map(n=>n.pitchClass)).size,5);
 const relative=relativeScale(tonic,quality);const target=relativePattern(shape,quality);
 const other=patternPositions(relative.tonic,relative.quality,target,patternShift(relative.tonic,relative.quality,target,shift));
 assert.deepEqual(new Set(notes.map(n=>n.pitchClass)),new Set(other.map(n=>n.pitchClass)));
 }
});
test('pentatonic selection survives settings and URL parsing',()=>{
 const settings={tonic:9,quality:'minor-pentatonic' as const,pattern:'1' as const};
 assert.deepEqual(mergeGuitarScaleSettings(settings),settings);
 assert.deepEqual(guitarScaleFromQuery(new URLSearchParams('key=A&scale=minor-pentatonic&pattern=1'),{tonic:0,quality:'major'}),settings);
});
// Fixed review fixtures: C major shape 2 differs from the conventional box,
// while A minor shape 1 keeps its familiar position with the parent fingers.
test('reviewed pentatonic positions retain practical full-scale fingerings', () => {
 const cases = [
  {tonic:0, quality:'major-pentatonic' as const, shape:'2' as const,
   frets:[[10,12],[10,12],[10,12,14],[12],[10,13],[10,12]],
   fingers:[[1,3],[1,2],[1,2,4],[3],[1,4],[1,3]]},
  {tonic:9, quality:'minor-pentatonic' as const, shape:'1' as const,
   frets:[[5,8],[5,7],[5,7],[5,7],[5,8],[5,8]],
   fingers:[[1,4],[1,3],[1,3],[2,4],[1,4],[1,4]]},
 ];
 for(const {tonic,quality,shape,frets,fingers} of cases){
  const notes=patternPositions(tonic,quality,shape,0);
  for(let row=0;row<6;row++){
   assert.deepEqual(notes.filter(n=>n.string===6-row).map(n=>n.fret),frets[row]);
   assert.deepEqual(notes.filter(n=>n.string===6-row).map(n=>n.finger),fingers[row]);
  }
 }
});
test('every pentatonic is exactly its matching full scale minus the omitted degrees', () => {
 for(const [quality,parent,omitted] of [
  ['major-pentatonic','major',[4,7]],
  ['minor-pentatonic','minor',[2,6]],
 ] as const)for(let tonic=0;tonic<12;tonic++)for(const shape of SCALE_SHAPES){
  // Check every octave placement supported by the full-scale position.
  for(const shift of [-24,-12,0,12,24].map(n=>n+tonic-(parent==='major'?0:9))){
   const [low,high]=patternBounds(shape,parent);
   if(low+shift<1||high+shift>22)continue;
   const full=patternPositions(tonic,parent,shape,shift);
   const pent=patternPositions(tonic,quality,shape,shift);
   const coordinates=(notes:typeof full)=>notes.map(n=>[n.string,n.fret,n.finger,n.degree]);
   assert.deepEqual(coordinates(pent),coordinates(full.filter(n=>!omitted.some(d=>d===n.degree))),
    `${tonic} ${quality} shape ${shape} shift ${shift}`);
  }
 }
});
