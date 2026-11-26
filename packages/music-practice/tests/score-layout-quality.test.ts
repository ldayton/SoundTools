import {test} from 'node:test';
import assert from 'node:assert/strict';
import {qualityViolations,type LayoutQuality} from '../browser-tests/score-layout-quality';
const good:LayoutQuality={staffSpace:10,viewportOverflow:0,scrollHeight:20,systems:[{height:20,topBlank:1,bottomBlank:1,maxNoteGap:8,maxRhythmicGap:8,minColumnGap:2,rhythmicColumns:4,staffCollisions:0,alignmentError:0,lyricCollisions:0,lyricCrowding:0,overflows:0}]};
test('quality checks accept readable spacing without consulting planner cost',()=>{
  assert.deepEqual(qualityViolations(good),[]);
});
test('quality checks reject distinct independently injected layout defects',()=>{
  for(const [field,value,message] of [
    ['topBlank',12,'blank vertical band'],['bottomBlank',12,'blank vertical band'],
    ['staffCollisions',1,'collision between staves'],
    ['minColumnGap',.2,'cramped rhythmic columns'],['alignmentError',1,'simultaneous voices misaligned'],
    ['maxRhythmicGap',40,'excessive note spacing'],['height',90,'excessive system height'],
    ['lyricCrowding',1,'insufficient lyric separation'],['lyricCollisions',1,'lyric collision'],['overflows',1,'clipped ink'],
  ] as const) {
    const mutated=structuredClone(good);mutated.systems[0][field]=value;
    assert(qualityViolations(mutated).some(error=>error.includes(message)),field);
  }
  assert(qualityViolations({...good,viewportOverflow:4}).includes('Unexpected horizontal scrolling'));
  assert(qualityViolations({...good,scrollHeight:300}).some(error=>error.includes('scroll height')));
  assert(qualityViolations({...good,staffSpace:NaN}).some(error=>error.includes('staff size')));
  assert(qualityViolations({...good,systems:[]}).includes('Missing music systems'));
});


test('rhythmic geometry uses the union of attacks across voices',async()=>{
  const {rhythmQuality}=await import('../browser-tests/score-rhythm-quality');
  const anchors=[{time:0,x:0},{time:0,x:0},{time:.125,x:20},{time:.25,x:40},{time:.25,x:40}];
  const result=rhythmQuality(anchors,10);
  assert.equal(result.minColumnGap,2);
  assert.equal(result.alignmentError,0);
  assert(Math.abs(result.maxRhythmicGap-2*Math.sqrt(2))<1e-9);
  assert.equal(rhythmQuality([...anchors,{time:.125,x:25}],10).alignmentError,.5);
  assert(rhythmQuality([{time:0,x:0},{time:.125,x:2}],10).minColumnGap<1);
});
