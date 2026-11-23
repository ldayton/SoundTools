import { test } from 'node:test';
import assert from 'node:assert/strict';
import { patternPositions, patternBounds, linkedPatternPositions, SCALE_SHAPES } from '../src/guitar-scale-patterns';
import { scaleLoopRoutes, positionKey } from '../src/scale-shift';

// Independent interval formulas, checked against Berklee PULSE and GuitarScale.org.
const formulas = {
  'major-pentatonic': [0,2,4,7,9],
  'minor-pentatonic': [0,3,5,7,10],
  'major-blues': [0,2,3,4,7,9],
  'minor-blues': [0,3,5,6,7,10],
} as const;
const tuning = [40,45,50,55,59,64]; // strings 6 through 1

test('all pentatonic/blues placements and every offered return form mechanically consistent complete loops', () => {
  const covered=new Set<string>();
  for (const quality of Object.keys(formulas) as (keyof typeof formulas)[])
  for (let tonic=0;tonic<12;tonic++)
  for (const shape of SCALE_SHAPES) {
    const [low,high]=patternBounds(shape,quality);
    const delta=tonic-(quality.startsWith('major')?0:9);
    for (const shift of [delta-24,delta-12,delta,delta+12,delta+24].filter(s=>low+s>=1&&high+s<=22)) {
      const a=patternPositions(tonic,quality,shape,shift);

      for(const n of a) {
        assert.equal(n.midi,tuning[6-n.string]+n.fret);
        assert.ok(formulas[quality].some(offset=>(tonic+offset)%12===n.pitchClass));
        assert.ok(Number.isInteger(n.finger)&&n.finger>=1&&n.finger<=4);
      }
      // Blues fingerings preserve their pentatonic box; seven-note patterns
      // may use other strings and fingerings for the same pitches.
      const handPositions=a.map(n=>n.fret-n.finger+1);
      assert.ok(Math.max(...handPositions)-Math.min(...handPositions)<=1);
      for(let string=1;string<=6;string++) {
        const row=a.filter(n=>n.string===string);
        row.forEach((n,i)=>{if(i){
          assert.ok(n.fret>row[i-1].fret&&n.finger>=row[i-1].finger);
          const fretDistance=n.fret-row[i-1].fret;
          const fingerDistance=n.finger-row[i-1].finger;
          assert.ok(fretDistance>=fingerDistance&&fretDistance<=fingerDistance+1);
          if(fingerDistance===0){
            assert.ok(quality.endsWith('blues'));
            assert.equal(fretDistance,1);
            const blue=quality.startsWith('major')?3:6;
            assert.ok([n,row[i-1]].some(p=>(p.pitchClass-tonic+12)%12===blue));
          }
        }});
      }
      for(const linked of SCALE_SHAPES) {
        if(shape===linked)continue;
        const b=linkedPatternPositions(tonic,quality,shape,shift,linked);
        for(const direction of ['ascending','descending'] as const) {
          const sign=direction==='ascending'?1:-1;
          for(const loop of scaleLoopRoutes(a,b,direction).values()) {
            covered.add(`${quality}:${tonic}:${shape}`);
            // Check every selectable return, not just the suggested one.
            for(const back of loop.returns.values()) {

              for(const [end,start] of [[loop.out.notes.at(-1)!,back.notes[0]],[back.notes.at(-1)!,loop.out.notes[0]]]) {
                assert.equal(positionKey(end),positionKey(start));
                assert.equal(end.finger,start.finger);
              }
              for(const [leg,s] of [[loop.out,sign],[back,-sign]] as const) {
                const pivot=leg.notes.indexOf(leg.arrival);
                assert.ok(pivot>0);
                const source=a.includes(leg.notes[0])?a:b;
                const target=source===a?b:a;
                leg.notes.forEach((n,i)=>{
                  assert.ok((i<pivot?source:target).includes(n));
                  if(!i)return;
                  const previous=leg.notes[i-1];
                  assert.ok(s*(n.midi-previous.midi)>0);
                  assert.ok(s*(previous.string-n.string)>=0&&s*(previous.string-n.string)<=1);
                  // Construct the next sounding note independently of the route generator.
                  let next=previous.midi+s;
                  while(!formulas[quality].some(offset=>(tonic+offset)%12===(next%12+12)%12))next+=s;
                  assert.equal(n.midi,next);
                  if(previous.string===n.string&&i!==pivot)
                    {
                      const sameFingerSlide=n.finger===previous.finger&&Math.abs(n.fret-previous.fret)===1&&quality.endsWith('blues')&&
                        [n,previous].some(p=>(p.pitchClass-tonic+12)%12===(quality.startsWith('major')?3:6));
                      assert.ok((n.fret-previous.fret)*(n.finger-previous.finger)>0||sameFingerSlide);
                    }
                });
                assert.ok(s*(leg.arrival.fret-leg.previous.fret)>=0, JSON.stringify({quality,tonic,shape,shift,linked,direction,previous:leg.previous,arrival:leg.arrival}));
                assert.ok(Math.abs(leg.arrival.fret-leg.previous.fret)<=4);
              }
            }
          }
        }
      }
    }
  }
  const expected=Object.keys(formulas).flatMap(quality=>Array.from({length:12},(_,tonic)=>SCALE_SHAPES.map(shape=>`${quality}:${tonic}:${shape}`)).flat());
  assert.deepEqual([...covered].sort(),expected.sort(),'every scale/key/shape has a playable closed loop');
});
