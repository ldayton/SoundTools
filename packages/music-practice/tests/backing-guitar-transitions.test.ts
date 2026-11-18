import {test} from 'node:test';
import assert from 'node:assert/strict';
import {plannedBackingArrangement} from '../src/backing-musical-plan';
import {articulateDrums} from '../src/backing-drum-articulation';
import {connectBackingGuitar} from '../src/backing-guitar-transitions';
test('guitar transitions leave approved drums, percussion and sparse bass exactly unchanged',()=>{
 let carried=0;
 for(const style of ['blues','rock'] as const)for(const mode of ['steady','active'] as const)for(const tempo of [72,90,120])for(const tonic of [0,2,6,9]) {
  const a=articulateDrums(plannedBackingArrangement(style,mode,style==='blues'?'minor':'major',0,tempo,tonic)),b=connectBackingGuitar(a,tempo);
  assert.deepEqual(b.events.filter(e=>e.part!=='guitar'),a.events.filter(e=>e.part!=='guitar'));
  const notes=b.events.filter(e=>e.part==='guitar');assert.ok(notes.length<=a.events.filter(e=>e.part==='guitar').length);
  assert.ok(notes.every(e=>e.duration>0&&e.beat>=0&&e.beat+e.duration<=b.beats));
  for(let i=0;i<notes.length;i++) {
   const e=notes[i],next=notes.slice(i+1).find(n=>n.string===e.string);if(next)assert.ok(e.beat+e.duration<=next.beat+.001);
   for(let bar=Math.floor(e.beat/4)+1;bar*4<e.beat+e.duration;bar++){
    const c=b.plan.bars[bar];assert.ok([c.root,(c.root+(c.minor?3:4))%12,(c.root+7)%12].includes(e.note%12));
   }
  }
  carried+=b.carriedGuitarNotes;
 }
 assert.ok(carried>0,'common string pitches sometimes sustain through the brush');
});
