import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scaleNotes, relativeScale } from '../src/guitar-scales';
import { patternPositions, patternShift, relativePattern, SCALE_SHAPES } from '../src/guitar-scale-patterns';
import { guitarScaleFromQuery, mergeGuitarScaleSettings } from '../src/guitar-scale-settings';
test('pentatonics retain correct note spelling and diatonic degrees', () => {
 assert.deepEqual(scaleNotes(0,'major-pentatonic').map(n=>[n.name,n.degree]), [['C',1],['D',2],['E',3],['G',5],['A',6]]);
 assert.deepEqual(scaleNotes(9,'minor-pentatonic').map(n=>[n.name,n.degree]), [['A',1],['C',3],['D',4],['E',5],['G',7]]);
 assert.deepEqual(scaleNotes(6,'major-pentatonic').map(n=>n.name), ['F#','G#','A#','C#','D#']);
});
test('all keys have five two-note-per-string boxes with playable fingers and identical relative shapes', () => {
 for(const quality of ['major-pentatonic','minor-pentatonic'] as const)for(let tonic=0;tonic<12;tonic++)for(const shape of SCALE_SHAPES){
 assert.deepEqual(scaleNotes(tonic,quality).map(n=>(n.pitchClass-tonic+12)%12),quality.startsWith('major')?[0, 2, 4, 7, 9]:[0, 3, 5, 7, 10]);
 const shift=patternShift(tonic,quality,shape);const notes=patternPositions(tonic,quality,shape,shift);
 assert.equal(notes.length,12);
 for(let string=1;string<=6;string++)assert.equal(notes.filter(n=>n.string===string).length,2);
 assert.ok(notes.every(n=>n.finger>=1&&n.finger<=4));
 assert.equal(new Set(notes.map(n=>n.pitchClass)).size,5);
 const relative=relativeScale(tonic,quality);const target=relativePattern(shape,quality);
 const other=patternPositions(relative.tonic,relative.quality,target,patternShift(relative.tonic,relative.quality,target,shift));
 assert.deepEqual(notes.map(n=>[n.string,n.fret,n.finger]),other.map(n=>[n.string,n.fret,n.finger]));
 }
});
test('pentatonic selection survives settings and URL parsing',()=>{
 const settings={tonic:9,quality:'minor-pentatonic' as const,pattern:'1' as const};
 assert.deepEqual(mergeGuitarScaleSettings(settings),settings);
 assert.deepEqual(guitarScaleFromQuery(new URLSearchParams('key=A&scale=minor-pentatonic&pattern=1'),{tonic:0,quality:'major'}),settings);
});
// Independent transcription of the five fingered diagrams at
// https://www.guitarscale.org/a-pentatonic-minor.html
// Rows run from low E to high E.
test('pentatonic boxes and suggested fingers match the published diagrams',()=>{
 const frets=[
  [[5,8],[5,7],[5,7],[5,7],[5,8],[5,8]],
  [[8,10],[7,10],[7,10],[7,9],[8,10],[8,10]],
  [[10,12],[10,12],[10,12],[9,12],[10,13],[10,12]],
  [[12,15],[12,15],[12,14],[12,14],[13,15],[12,15]],
  [[3,5],[3,5],[2,5],[2,5],[3,5],[3,5]],
 ];
 const fingers=[
  [[1,4],[1,3],[1,3],[1,3],[1,4],[1,4]],
  [[2,4],[1,4],[1,4],[1,3],[1,3],[1,3]],
  [[1,3],[1,3],[1,3],[1,4],[1,4],[1,3]],
  [[1,4],[1,4],[1,3],[1,3],[2,4],[1,4]],
  [[1,3],[1,3],[1,4],[1,4],[1,3],[1,3]],
 ];
 SCALE_SHAPES.forEach((shape,i)=>{
  const notes=patternPositions(9,'minor-pentatonic',shape,0);
  for(let row=0;row<6;row++){
   assert.deepEqual(notes.filter(n=>n.string===6-row).map(n=>n.fret),frets[i][row]);
   assert.deepEqual(notes.filter(n=>n.string===6-row).map(n=>n.finger),fingers[i][row]);
  }
 });
});
