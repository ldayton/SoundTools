import test from 'node:test';
import assert from 'node:assert/strict';
import abcjs from 'abcjs';
import hymns from '../../../packages/music-practice/src/hymns.json';
import {instrumentEditionIds} from '../../../packages/music-practice/src/instrument-editions';
import {hymnArrangements,arrangeHymn} from '../../../packages/music-practice/src/hymn-arrangements';
import {hymnScoreFeatures,instrumentStaffIndexes} from '../../../packages/music-practice/src/hymn-score-features';
for(const id of instrumentEditionIds)test(`${id}: staff capabilities follow the instrument independently of Voice`,()=>{
 const hymn=hymns.find(h=>h.id===id)!;
 for(const arrangement of hymnArrangements(hymn)){
  const features=hymnScoreFeatures(arrangement.id);
  assert.equal(features.tablature,arrangement.id.startsWith('guitar'));
  assert.equal(features.fingerings,true);
  const tune=abcjs.parseOnly(arrangeHymn(hymn,arrangement.id,2).abc)[0];
  const staves=instrumentStaffIndexes(tune,features.voice);
  assert(staves.length>0);assert.equal(staves[0],features.voice?1:0);
  if(features.guitar)assert.equal(staves[0],features.guitarStaff);
 }
});

test('fingering availability follows visible instrument notes, not the Voice switch',()=>{
 for(const arrangement of ['guitar-edition','guitar-vocal'] as const){
  assert.equal(hymnScoreFeatures(arrangement,'tab').fingerings,true);
  const chart=hymnScoreFeatures(arrangement,'chords');
  assert.equal(chart.fingerings,false);assert(chart.fingeringReason?.includes('notation or tablature'));
 }
});

import {playableGuitarRange,recommendHymnGuitarCapos} from '../../../packages/music-practice/src/hymn-guitar-capos';
import {hymnRangeKeys} from '../../../packages/music-practice/src/hymn-range';
test('register eligibility keeps physically proved octaves and falls back to a playable key',()=>{
 const input=hymnRangeKeys('C',{low:60,high:67},null,null);
 const selected=playableGuitarRange(input,'original',undefined,false,(key,octave)=>key==='original'&&octave===1);
 assert.equal(selected.preferred,'original');assert.deepEqual(selected.choices[0].octaves,[1]);assert.equal(selected.choices[0].octave,1);
 const fallback=playableGuitarRange(input,'original',undefined,false,(key,octave)=>key==='G'&&octave===1);
 assert.equal(fallback.preferred,'G');assert.equal(fallback.choices[0].fits,false);
 const none=playableGuitarRange(input,'original',undefined,false,()=>false);
 assert.equal(none.preferred,undefined);assert(none.choices.every(c=>!c.fits));
});
test('Jesus Loves Me supports a physically proved higher octave without requiring capo twenty',()=>{
 const hymn=hymns.find(h=>h.slug==='jesus-loves-me')!;
 const choices=recommendHymnGuitarCapos(hymn,{transpose:12});
 assert(choices.length>0);assert(choices.every(c=>c.fret>=0&&c.fret<=11));
 const input=arrangeHymn(hymn,'guitar-edition',0).abc;
 const tune=abcjs.parseOnly(input)[0],pitches=tune.setUpAudio({chordsOff:true,midiTranspose:-12}).tracks.flatMap(t=>t.flatMap(n=>n.cmd==='note'?[n.pitch]:[]));
 const open=[64,59,55,50,45,40],capo=8;
 for(const [key,position] of choices[0].positions){
  const source=Number(key.split(':')[0]);
  assert(pitches.includes(source));assert.equal(open[position.str]+position.num+choices[0].fret,source+capo+12);
 }
});
