import test from 'node:test';
import assert from 'node:assert/strict';
import { BERKLEE_SHAPES, berkleePositions, berkleeShift, berkleeChordDiagram, linkedBerkleePosition } from '../src/berklee-scale-shapes';
import { shiftRoutes, positionKey } from '../src/scale-shift';
const qualities=['major','minor','major-pentatonic','minor-pentatonic','major-blues','minor-blues'] as const;
const handPositions=[2,4,5,7,9,10,12];
const tuning=[64,59,55,50,45,40];

test('seven-region fingers preserve the hand position, with only index/pinky extensions and explicit blue-note slides',()=>{
  for(const shape of BERKLEE_SHAPES)for(const quality of qualities)for(let tonic=0;tonic<12;tonic++){
    const shift=berkleeShift(tonic,quality,shape);
    const notes=berkleePositions(tonic,quality,shape,shift);
    const parent=berkleePositions(tonic,quality.startsWith('major')?'major':'minor',shape,shift);
    for(const note of notes){
      assert.ok(Number.isInteger(note.finger)&&note.finger>=1&&note.finger<=4);
      const original=parent.find(n=>positionKey(n)===positionKey(note));
      if(original){
        assert.equal(note.finger,original.finger,'subsets retain the parent fingering');
        const extension=note.fret-(handPositions[shape-1]+shift+note.finger-1);
        assert.ok(extension===0||note.finger===1&&extension===-1||note.finger===4&&extension===1,`${quality} ${tonic} ${shape} ${positionKey(note)}: position stretch`);
      }
    }
    for(let string=1;string<=6;string++){
      const row=notes.filter(n=>n.string===string);
      for(let i=1;i<row.length;i++){
        assert.ok(row[i].finger>=row[i-1].finger,'no crossed fingers on a string');
        if(row[i].finger===row[i-1].finger){
          assert.ok(quality.endsWith('blues'));
          assert.equal(row[i].fret-row[i-1].fret,1,'same-finger passage is one semitone slide');
        }
      }
    }
  }
});

test('each chord is a complete tonic triad inside its region, with a simultaneously playable independent grip',()=>{
  for(const quality of qualities)for(const shape of BERKLEE_SHAPES)for(let tonic=0;tonic<12;tonic++){
    const shift=berkleeShift(tonic,quality,shape);
    const notes=berkleePositions(tonic,quality,shape,shift);
    const chord=berkleeChordDiagram(tonic,quality,shape,shift);
    const sounding=chord.frets.flatMap((fret,row)=>fret===null?[]:[{string:6-row,fret,finger:chord.fingers[row]!}]);
    assert.equal(sounding.length,3);
    assert.deepEqual([...new Set(sounding.map(n=>(tuning[n.string-1]+n.fret-tonic+120)%12))].sort((a,b)=>a-b),[0,quality.startsWith('major')?4:3,7]);
    assert.ok(sounding.every(n=>notes.some(p=>positionKey(n)===positionKey(p))),'panel matches real scale coordinates');
    assert.ok(Math.max(...sounding.map(n=>n.fret))-Math.min(...sounding.map(n=>n.fret))<=2,'compact held triad');
    for(const n of sounding){
      assert.ok(n.finger>=1&&n.finger<=4);
      const same=sounding.filter(p=>p.finger===n.finger);
      if(same.length>1)assert.ok(chord.barres.some(b=>b.finger===n.finger&&same.every(p=>p.fret===b.fret&&p.string>=b.toString&&p.string<=b.fromString)),'shared finger requires a real barre');
      for(const other of sounding)if(n.fret<other.fret)assert.ok(n.finger<other.finger,'no crossed chord fingers');
    }
    for(const barre of chord.barres){
      assert.ok(sounding.filter(n=>n.finger===barre.finger).length>=2);
      assert.ok(sounding.filter(n=>n.string>=barre.toString&&n.string<=barre.fromString).every(n=>n.fret>=barre.fret),'barre cannot override a lower note');
    }
    assert.match(chord.name,new RegExp(` · Shape ${shape}$`));
  }
});

test('adjacent regions link in every family/key, retain consecutive runs, and respect octave placement on reversal',()=>{
  for(const quality of qualities)for(const shape of BERKLEE_SHAPES)for(let tonic=0;tonic<12;tonic++){
    const shift=berkleeShift(tonic,quality,shape), next=(shape%7+1) as typeof shape;
    const primary=berkleePositions(tonic,quality,shape,shift);
    const linked=linkedBerkleePosition(tonic,quality,shape,shift,next);
    const again=linkedBerkleePosition(tonic,quality,next,linked.shift,shape,undefined,shift);
    assert.equal(again.shift,shift,'reversal preserves the exact original octave');
    assert.deepEqual(again.notes,primary);
    assert.ok(linked.notes.every(n=>n.fret>=1&&n.fret<=18));
    const routes=shiftRoutes(primary,linked.notes,'ascending',true,true);
    // Neck ends can put adjacent region numbers an octave apart: no invented route.
    const overlap=primary.some(n=>linked.notes.some(p=>positionKey(n)===positionKey(p)));
    if(!overlap)assert.equal(routes.size,0);
    else assert.ok(routes.size>0,`${quality} ${tonic} ${shape}->${next}: valid shift`);
    for(const route of routes.values()){
      assert.equal(route.previous.string,route.arrival.string);
      assert.ok(route.arrival.fret>=route.previous.fret&&route.arrival.fret-route.previous.fret<=4);
      assert.equal(new Set(route.notes.map(n=>n.midi)).size,route.notes.length);
      const pcs=new Set(primary.map(n=>n.pitchClass));
      const expected=Array.from({length:route.notes.at(-1)!.midi-route.notes[0].midi+1},(_,i)=>i+route.notes[0].midi).filter(n=>pcs.has(n%12));
      assert.deepEqual(route.notes.map(n=>n.midi),expected);
    }
  }
});
