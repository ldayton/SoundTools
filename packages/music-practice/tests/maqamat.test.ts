import test from 'node:test';
import assert from 'node:assert/strict';
import {MAQAM_QUALITIES} from '../src/maqamat';
import {scaleNotes, relativeScale, scaleKeyPitch} from '../src/guitar-scales';
import {maqamPositions} from '../src/maqam-guitar';
import {guitarScaleFromQuery,mergeGuitarScaleSettings} from '../src/guitar-scale-settings';
// Independently transcribed reference forms: Nahawand uses Hijaz on degree 5.
const intervals={hijaz:[0,1,4,5,7,8,10],kurd:[0,1,3,5,7,8,10],nahawand:[0,2,3,5,7,8,11],ajam:[0,2,4,5,7,9,11],nikriz:[0,2,3,6,7,9,10],hijazkar:[0,1,4,5,7,8,11]};
const names={hijaz:'D Eb F# G A Bb C',kurd:'D Eb F G A Bb C',nahawand:'D E F G A Bb C#',ajam:'D E F# G A B C#',nikriz:'D E F G# A B C',hijazkar:'D Eb F# G A Bb C#'};
test('six maqam reference forms preserve intervals, spelling and diatonic degrees in every key',()=>{
 for(const quality of MAQAM_QUALITIES){
  assert.equal(scaleNotes(2,quality).map(n=>n.name).join(' '),names[quality]);
  for(let tonic=0;tonic<12;tonic++){
   const notes=scaleNotes(tonic,quality);
   assert.deepEqual(notes.map(n=>(n.pitchClass-tonic+12)%12),intervals[quality]);
   assert.deepEqual(notes.map(n=>n.degree),[1,2,3,4,5,6,7]);
   assert.equal(new Set(notes.map(n=>n.name[0])).size,7);
   assert.throws(()=>relativeScale(tonic,quality));
  }
 }
 assert.equal(scaleKeyPitch('C#','hijaz'),1);
 assert.equal(scaleKeyPitch('Gb','ajam'),6);
});
test('all 1008 maqam hand positions are complete, correctly tuned and mechanically playable',()=>{
 const tuning=[64,59,55,50,45,40];
 for(const quality of MAQAM_QUALITIES)for(let tonic=0;tonic<12;tonic++)for(let first=1;first<=14;first++){
  const notes=maqamPositions(tonic,quality,first);
  assert.equal(new Set(notes.map(n=>n.pitchClass)).size,7);
  assert.equal(new Set(notes.map(n=>n.string)).size,6);
  for(const n of notes){assert.equal(n.midi,tuning[n.string-1]+n.fret);assert.ok(n.fret>=first&&n.fret<=first+4);assert.ok(n.finger>=1&&n.finger<=4);}
  const midi=new Set(notes.map(n=>n.midi));
  for(let n=Math.min(...midi);n<=Math.max(...midi);n++)if(intervals[quality].includes((n-tonic+120)%12))assert.ok(midi.has(n));
  const anchors=notes.map(n=>n.fret-n.finger+1);assert.ok(Math.max(...anchors)-Math.min(...anchors)<=1);
  for(let string=1;string<=6;string++){
   const row=notes.filter(n=>n.string===string);
   row.forEach((n,i)=>{if(i){assert.ok(n.finger>row[i-1].finger);const f=n.fret-row[i-1].fret,d=n.finger-row[i-1].finger;assert.ok(f>=d&&f<=d+1);}});
  }
 }
 assert.throws(()=>maqamPositions(2,'hijaz',0));assert.throws(()=>maqamPositions(2,'hijaz',15));
});
test('maqam routes and account settings normalize away CAGED/Hila selections while retaining key and hand position',()=>{
 for(const quality of MAQAM_QUALITIES){
  const settings=guitarScaleFromQuery(new URLSearchParams(`key=D&scale=${quality}&pattern=1&set=hila&from=7&labels=fingers`),{tonic:0,quality:'major'});
  assert.equal(settings.quality,quality);assert.equal(settings.tonic,2);assert.equal(settings.pattern,'map');assert.equal(settings.shapeSet,'standard');assert.equal(settings.firstFret,7);assert.equal(settings.lastFret,11);
  assert.deepEqual(mergeGuitarScaleSettings(JSON.parse(JSON.stringify(settings))),settings);
  assert.equal(mergeGuitarScaleSettings({quality,firstFret:18,returnPosition:{pattern:'1',shift:0}}).firstFret,14);
  assert.equal(mergeGuitarScaleSettings({quality,returnPosition:{pattern:'1',shift:0}}).returnPosition,undefined);
 }
});

test('reviewed D Hijaz fingering keeps the augmented second playable at frets 5–9',()=>{
 const notes=maqamPositions(2,'hijaz',5);
 const expected=[
  [[5,'A',1],[6,'Bb',2],[8,'C',4]],
  [[5,'D',1],[6,'Eb',2],[9,'F#',4]],
  [[5,'G',1],[7,'A',3],[8,'Bb',4]],
  [[5,'C',1],[7,'D',3],[8,'Eb',4]],
  [[7,'F#',3],[8,'G',4]],
  [[5,'A',1],[6,'Bb',2],[8,'C',4]],
 ];
 assert.deepEqual(Array.from({length:6},(_,i)=>notes.filter(n=>n.string===6-i).map(n=>[n.fret,n.name,n.finger])),expected);
 assert.deepEqual(notes.filter(n=>n.root).map(n=>[n.string,n.fret]),[[5,5],[3,7]]);
});
