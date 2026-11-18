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
