import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scaleNotes, relativeScale } from '../src/guitar-scales';
import { patternPositions, patternBounds, patternShift, relativePattern, SCALE_SHAPES } from '../src/guitar-scale-patterns';
import { guitarScaleFromQuery, mergeGuitarScaleSettings } from '../src/guitar-scale-settings';
test('blues scales retain correct note spelling and diatonic degrees', () => {
 assert.deepEqual(scaleNotes(0,'major-blues').map(n=>[n.name,n.degree]), [['C',1],['D',2],['Eb',3],['E',3],['G',5],['A',6]]);
 assert.deepEqual(scaleNotes(9,'minor-blues').map(n=>[n.name,n.degree]), [['A',1],['C',3],['D',4],['Eb',5],['E',5],['G',7]]);
 assert.deepEqual(scaleNotes(6,'major-blues').map(n=>n.name), ['F#','G#','A','A#','C#','D#']);
});
test('all keys have five complete positions with playable fingers and correct relative pitches', () => {
 for(const quality of ['major-blues','minor-blues'] as const)for(let tonic=0;tonic<12;tonic++)for(const shape of SCALE_SHAPES){
 assert.deepEqual(scaleNotes(tonic,quality).map(n=>(n.pitchClass-tonic+12)%12),quality.startsWith('major')?[0, 2, 3, 4, 7, 9]:[0, 3, 5, 6, 7, 10]);
 const shift=patternShift(tonic,quality,shape);const notes=patternPositions(tonic,quality,shape,shift);
 assert.ok(notes.length >= 14);
 assert.equal(new Set(notes.map(n=>n.string)).size,6);
 assert.ok(notes.every(n=>n.finger>=1&&n.finger<=4));
 assert.equal(new Set(notes.map(n=>n.pitchClass)).size,6);
 const pitches = scaleNotes(tonic,quality).map(n=>n.pitchClass);
 for(let midi=Math.min(...notes.map(n=>n.midi));midi<=Math.max(...notes.map(n=>n.midi));midi++)
   if(pitches.includes(midi%12)) assert.ok(notes.some(n=>n.midi===midi), `Missing pitch ${midi} in ${quality} shape ${shape}`);
 const relative=relativeScale(tonic,quality);const target=relativePattern(shape,quality);
 const other=patternPositions(relative.tonic,relative.quality,target,patternShift(relative.tonic,relative.quality,target,shift));
 assert.deepEqual(new Set(notes.map(n=>n.pitchClass)),new Set(other.map(n=>n.pitchClass)));
 }
});
test('blues selection survives settings and URL parsing',()=>{
 const settings={tonic:9,quality:'minor-blues' as const,pattern:'1' as const};
 assert.deepEqual(mergeGuitarScaleSettings(settings),settings);
 assert.deepEqual(guitarScaleFromQuery(new URLSearchParams('key=A&scale=minor-blues&pattern=1'),{tonic:0,quality:'major'}),settings);
});
// Independent transcription of https://www.guitarscale.org/a-blues.html
// (rows low E through high E; its open-position box 4 is moved up 12 frets).
test('five blues boxes match the published reference, including edge blue notes',()=>{
 const reference = [
  [[5,8],[5,6,7],[5,7],[5,7,8],[5,8],[5,8]],
  [[8,10,11],[7,10],[7,10],[7,8,9],[8,10],[8,10,11]],
  [[10,11,12],[10,12],[10,12,13],[9,12],[10,13],[10,11,12]],
  [[12,15],[12,15],[12,13,14],[12,14],[13,15,16],[12,15]],
  [[3,5],[3,5,6],[2,5],[2,5],[3,4,5],[3,5]],
 ];
 SCALE_SHAPES.forEach((shape,i)=>{
  const notes=patternPositions(9,'minor-blues',shape,0);
  assert.deepEqual(Array.from({length:6},(_,row)=>notes.filter(n=>n.string===6-row).map(n=>n.fret)),reference[i]);
 });
});

test('every blues position is exactly its matching pentatonic plus blue notes, with shared fingers unchanged',()=>{
 for(const family of ['major','minor'] as const)for(let tonic=0;tonic<12;tonic++)for(const shape of SCALE_SHAPES){
  const quality=`${family}-blues` as const;
  const [low,high]=patternBounds(shape,quality);
  const delta=tonic-(family==='major'?0:9);
  for(const shift of [-24,-12,0,12,24].map(n=>n+delta)){
   if(low+shift<1||high+shift>22)continue;
   const notes=patternPositions(tonic,quality,shape,shift);
   const pent=patternPositions(tonic,`${family}-pentatonic`,shape,shift);
   const blue=notes.filter(n=>(n.pitchClass-tonic+12)%12===(family==='major'?3:6));
   assert.ok(blue.length>0);
   assert.deepEqual(notes.filter(n=>!blue.includes(n)).map(n=>[n.string,n.fret,n.finger]),
    pent.map(n=>[n.string,n.fret,n.finger]));
  }
 }
});
test('major blues D shape retains the conventional pentatonic E on the G string',()=>{
 const notes=patternPositions(0,'major-blues','2',0);
 assert.deepEqual(notes.filter(n=>n.string===4).map(n=>[n.fret,n.finger]),[[10,1],[12,3],[13,4]]);
 assert.deepEqual(notes.filter(n=>n.string===3).map(n=>[n.fret,n.finger]),[[9,1],[12,3]]);
});
test('an available little finger plays the blue note without moving the shared fingers',()=>{
 const notes=patternPositions(9,'minor-blues','1',0).filter(n=>n.string===3);
 assert.deepEqual(notes.map(n=>[n.fret,n.finger]),[[5,1],[7,3],[8,4]]);
});
