import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scaleNotes, relativeScale } from '../src/guitar-scales';
import { patternPositions, patternShift, relativePattern, pentatonicOmissions, patternBounds, SCALE_SHAPES } from '../src/guitar-scale-patterns';
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
 assert.deepEqual([6,5,4,3,2,1].map(string=>notes.filter(n=>n.string===string).length),[2,2,2,2,2,2]);
 const formula=quality.startsWith('major')?[0,2,4,7,9]:[0,3,5,7,10];
 for(let midi=Math.min(...notes.map(n=>n.midi));midi<=Math.max(...notes.map(n=>n.midi));midi++)
   if(formula.includes((midi-tonic+120)%12))assert.ok(notes.some(n=>n.midi===midi));
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
test('hollow notes show only omitted degrees within the pentatonic box window',()=>{
 const tuning=[40,45,50,55,59,64];
 for(const quality of ['major-pentatonic','minor-pentatonic'] as const)for(let tonic=0;tonic<12;tonic++)for(const shape of SCALE_SHAPES){
  const shift=patternShift(tonic,quality,shape),notes=patternPositions(tonic,quality,shape,shift);
  const low=Math.min(...notes.map(n=>n.fret)),high=Math.max(...notes.map(n=>n.fret));
  const missing=quality.startsWith('major')?[5,11]:[2,8];
  const expected=[];
  for(let string=6;string>=1;string--)for(let fret=low;fret<=high;fret++)
    if(missing.includes((tuning[6-string]+fret-tonic+120)%12))expected.push([string,fret]);
  assert.deepEqual(pentatonicOmissions(tonic,quality,shape,shift).map(n=>[n.string,n.fret]),expected);
 }
 assert.deepEqual(pentatonicOmissions(0,'major','1',0),[]);
});
