import test from 'node:test';
import assert from 'node:assert/strict';
import abcjs from 'abcjs';
import {initialHymnSignatures} from '../src/hymn-signatures';

test('inline key changes are not printed again at the next system opening',()=>{
  const source='X:1\nM:4/4\nL:1/4\nK:D\nD E F G | [K:G] G A B c |\nd c B A | [K:F] F G A B |\nc B A G |]';
  const tune=abcjs.parseOnly(source)[0],staves=tune.lines.flatMap(line=>line.staff||[]);
  assert.equal(staves.length,3);
  const original=staves.map(staff=>structuredClone({key:staff.key,clef:staff.clef}));
  const restore=initialHymnSignatures(tune);
  assert(staves[0].key!.accidentals.length>0);
  assert.deepEqual(staves.slice(1).map(staff=>staff.key!.accidentals),[[],[]]);
  restore();
  assert.deepEqual(staves.map(staff=>({key:staff.key,clef:staff.clef})),original);
  assert.deepEqual(tune.setUpAudio({chordsOff:true}).tracks,abcjs.parseOnly(source)[0].setUpAudio({chordsOff:true}).tracks);
});

test('inline clef changes are tracked before the following system header',()=>{
  const tune=abcjs.parseOnly('X:1\nM:4/4\nL:1/4\nK:C\nC D E F | [K:C clef=bass] C, D, E, F, |\nG, A, B, C |]')[0];
  const staves=tune.lines.flatMap(line=>line.staff||[]);
  assert.equal(staves[1].clef!.type,'bass');
  const restore=initialHymnSignatures(tune);
  assert.equal(staves[1].clef!.type,'none');
  restore();assert.equal(staves[1].clef!.type,'bass');
});
