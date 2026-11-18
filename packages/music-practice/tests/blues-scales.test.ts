import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scaleNotes, relativeScale } from '../src/guitar-scales';
import { patternPositions, patternShift, relativePattern, SCALE_SHAPES } from '../src/guitar-scale-patterns';
import { guitarScaleFromQuery, mergeGuitarScaleSettings } from '../src/guitar-scale-settings';
test('blues scales retain correct note spelling and diatonic degrees', () => {
 assert.deepEqual(scaleNotes(0,'major-blues').map(n=>[n.name,n.degree]), [['C',1],['D',2],['Eb',3],['E',3],['G',5],['A',6]]);
 assert.deepEqual(scaleNotes(9,'minor-blues').map(n=>[n.name,n.degree]), [['A',1],['C',3],['D',4],['Eb',5],['E',5],['G',7]]);
 assert.deepEqual(scaleNotes(6,'major-blues').map(n=>n.name), ['F#','G#','A','A#','C#','D#']);
});
test('all keys have five complete boxes with playable fingers and identical relative shapes', () => {
 for(const quality of ['major-blues','minor-blues'] as const)for(let tonic=0;tonic<12;tonic++)for(const shape of SCALE_SHAPES){
 const shift=patternShift(tonic,quality,shape);const notes=patternPositions(tonic,quality,shape,shift);
 assert.ok(notes.length >= 14);
 for(let string=1;string<=6;string++)assert.ok(notes.filter(n=>n.string===string).length>=2);
 assert.ok(notes.every(n=>n.finger>=1&&n.finger<=4));
 assert.equal(new Set(notes.map(n=>n.pitchClass)).size,6);
 const pitches = scaleNotes(tonic,quality).map(n=>n.pitchClass);
 for(let midi=Math.min(...notes.map(n=>n.midi));midi<=Math.max(...notes.map(n=>n.midi));midi++)
   if(pitches.includes(midi%12)) assert.ok(notes.some(n=>n.midi===midi), `Missing pitch ${midi} in ${quality} shape ${shape}`);
 const relative=relativeScale(tonic,quality);const target=relativePattern(shape,quality);
 const other=patternPositions(relative.tonic,relative.quality,target,patternShift(relative.tonic,relative.quality,target,shift));
 assert.deepEqual(notes.map(n=>[n.string,n.fret,n.finger]),other.map(n=>[n.string,n.fret,n.finger]));
 }
});
test('blues selection survives settings and URL parsing',()=>{
 const settings={tonic:9,quality:'minor-blues' as const,pattern:'1' as const};
 assert.deepEqual(mergeGuitarScaleSettings(settings),settings);
 assert.deepEqual(guitarScaleFromQuery(new URLSearchParams('key=A&scale=minor-blues&pattern=1'),{tonic:0,quality:'major'}),settings);
});
