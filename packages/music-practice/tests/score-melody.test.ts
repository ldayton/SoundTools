import test from "node:test";
import assert from "node:assert/strict";
import abcjs from "abcjs";
import {beamByBeat} from "../src/score-melody";

test("short-note beams follow compound eighth-note groups and retain ordinary quarter beats",()=>{
 for(const [meter,body,starts,ends] of [
  ["6/8","C D E F G A",[0,3],[2,5]],
  ["9/8","C D E F G A B c d",[0,3,6],[2,5,8]],
  ["4/4","C D E F G A B c",[0,2,4,6],[1,3,5,7]],
 ] as const){
  const source=`X:1\nM:${meter}\nL:1/8\nK:C\n${body} |]`,abc=beamByBeat(source),tune=abcjs.parseOnly(abc)[0];
  assert.equal(tune.warnings?.length||0,0);
  const notes=tune.lines.flatMap(l=>l.staff?.[0]?.voices?.[0]||[]).filter(n=>n.el_type==="note");
  assert.deepEqual(notes.flatMap((n,i)=>n.el_type==="note"&&n.startBeam?[i]:[]),[...starts],meter);
  assert.deepEqual(notes.flatMap((n,i)=>n.el_type==="note"&&n.endBeam?[i]:[]),[...ends],meter);
  const sound=(text:string)=>abcjs.parseOnly(text)[0].setUpAudio({chordsOff:true}).tracks.map(t=>t.flatMap(n=>n.cmd==="note"?[[n.pitch,n.start,n.duration]]:[]));
  assert.deepEqual(sound(abc),sound(source));
 }
});
