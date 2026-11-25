import test from 'node:test';
import assert from 'node:assert/strict';
import abcjs from 'abcjs';
import { beginnerFingers, beginnerLandmarks } from '../../../packages/music-practice/src/beginner-score';
import { arrangeHymn } from '../../../packages/music-practice/src/hymn-arrangements';
import hymns from '../../../packages/music-practice/src/hymns.json';

test('guitar fingering follows the supplied riff, position change, and distinct chord shapes',()=>{
 assert.deepEqual([64,67,69].map(p=>beginnerFingers('guitar',0,0,[p])[0]),[3,1,4]);
 assert.deepEqual([59,66].map(p=>beginnerFingers('guitar',8,0,[p])[0]),[null,2]);
 assert.deepEqual(beginnerFingers('guitar',8,1,[47]),[1]);
 assert.deepEqual([61,67].map(p=>beginnerFingers('guitar',9,0,[p])[0]),[1,2]);
 assert.deepEqual(beginnerFingers('guitar',11,0,[52,56,61]),[2,1,3]);
 assert.deepEqual(beginnerFingers('guitar',12,0,[52,56,62,64]),[3,1,4,null]);
 assert.deepEqual(beginnerFingers('guitar',12,1,[40,47]),[null,2]);
});
test('piano fingering plans the riff, two hand moves, and the closing chord by hand',()=>{
 assert.deepEqual(beginnerFingers('piano',0,0,[64,67,69]),[1,3,4]);
 assert.deepEqual(beginnerFingers('piano',8,0,[59,66]),[1,5]);
 assert.deepEqual(beginnerFingers('piano',9,0,[61,67]),[2,5]);
 assert.deepEqual(beginnerFingers('piano',11,1,[52,56,61]),[5,3,1]);
 assert.deepEqual(beginnerFingers('piano',12,0,[56,62,64]),[1,4,5]);
 assert.deepEqual(beginnerFingers('piano',12,1,[40,47]),[5,1]);
});
test('bar and phrase landmarks retain every sounding pitch, duration, and repeat',()=>{
 const hymn=hymns.find(h=>h.slug === 'the-1st-fingerstyle-blues')!;
 for(const arrangement of ['piano','guitar-fingerstyle'] as const) {
  const abc=arrangeHymn(hymn,arrangement,0).abc;
  for(const part of ['A','B','C','Ending']) assert.equal(abc.split(`[P:${part}]`).length,2);
  const plain=abc.replace(/^%%barnumbers.*\n/m,'').replace(/\[P:[^\]]+\]/g,'');
  const read=(s:string)=>{
   const tune=abcjs.parseOnly(s)[0];assert.equal(tune.warnings?.length||0,0);
   return tune.setUpAudio({qpm:60,chordsOff:true});
  };
  const musical=(audio:ReturnType<typeof read>)=>audio.tracks.map(track=>track.flatMap(n=>n.cmd==='note' ? [[n.pitch,n.start,n.duration,n.volume]]:[]));
  assert.deepEqual(musical(read(abc)),musical(read(plain)));
  assert.equal(read(abc).totalDuration,25);
 }
 assert.match(beginnerLandmarks('X:1\nK:C\n[V:v0] C4 |\n',4),/\[P:B\]/);
});
