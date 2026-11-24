import test from "node:test";
import assert from "node:assert/strict";
import abcjs from "abcjs";
import { guitarSustainAudio } from "../../../packages/music-practice/src/guitar-sustain";
import { playbackNotes } from "../../../packages/music-practice/src/hymn-playback";
import { swingAudio } from "../../../packages/music-practice/src/hymn-swing";
import {
  performNotes,
  pianoLayer,
} from "../../../packages/music-practice/src/playback-performance";
const note = (pitch: number, start = 0, duration = 2) => ({
  pitch,
  start,
  duration,
  volume: 0.8,
});
test("piano voices melody, preserves score timing and selects recorded dynamics", () => {
  const source = [note(48), note(60), note(67), note(64, 3)];
  const result = performNotes(source, { instrument: "piano" });
  assert.deepEqual(
    result.map((n) => [n.pitch, n.start, n.duration]),
    source.map((n) => [n.pitch, n.start, n.duration]),
  );
  assert.ok(result[2].volume > result[0].volume);
  assert.equal(source[0].volume, 0.8);
  assert.deepEqual([0.2, 0.6, 0.9].map(pianoLayer), [4, 8, 12]);
});
test("fingerstyle respects edition strings and truncates a displaced string without reattacking ties", () => {
  const result = performNotes(
    [note(64, 0, 4), note(67, 2, 1), note(48, 0, 4)],
    {
      instrument: "guitar",
      positionFor: (p) =>
        p >= 64 ? { str: 0, num: p - 64 } : { str: 4, num: 3 },
    },
  );
  assert.equal(result[0].string, 5);
  assert.equal(result[1].string, 5);
  assert.equal(result[0].duration, 2);
  assert.equal(result[2].duration, 4);
  assert.equal(result.length, 3);
  assert.ok(result.every((n) => !n.delay));
});
test("guitar chords use distinct strings; only accompaniment strums and score ends stay fixed", () => {
  const source = [40, 47, 52, 55, 59, 64].map((p) => note(p));
  const strum = performNotes(source, { instrument: "guitar", strum: true });
  assert.equal(new Set(strum.map((n) => n.string)).size, 6);
  assert.deepEqual(
    strum.map((n) => n.delay),
    [0, 0.009, 0.018, 0.026999999999999996, 0.036, 0.045],
  );
  assert.deepEqual(
    strum.map((n) => n.duration),
    source.map((n) => n.duration),
  );
  assert.ok(
    performNotes(source, { instrument: "guitar" }).every(
      (n) => n.delay === undefined,
    ),
  );
});
test("out-of-range notes retain pitch and deterministic performance", () => {
  const source = [note(20), note(100)];
  assert.deepEqual(
    performNotes(source, { instrument: "guitar" }).map((n) => n.pitch),
    [20, 100],
  );
  assert.deepEqual(
    performNotes(source, { instrument: "guitar" }),
    performNotes(source, { instrument: "guitar" }),
  );
});

test("unassigned guitar melody replucks the high E string instead of climbing the neck to keep old notes ringing", () => {
  const notes=[note(64,0,1),note(67,1,1),note(64,2,1)].map(n=>({...n,ringUntil:4}));
  const played=performNotes(notes,{instrument:"guitar"});
  assert.deepEqual(played.map(n=>[n.string,n.fret,n.duration]),[[5,0,1],[5,3,1],[5,0,2]]);
});

test("vocal notes retain their instrument and sustain while the guitar strums and damps strings",()=>{
 const voice={instrument:"choir" as const,pitch:69,start:0,duration:4,volume:1};
 const source=[voice,{pitch:45,start:0,duration:1,volume:1},{pitch:52,start:0,duration:1,volume:1},{pitch:57,start:0,duration:1,volume:1},{pitch:45,start:1,duration:1,volume:1}];
 const result=performNotes(source,{instrument:"guitar",strum:true});
 assert.deepEqual(result[0],performNotes([voice],{instrument:"choir"})[0]);
 assert.equal(result[0].string,undefined);assert.equal(result[0].delay,undefined);assert.equal(result[0].duration,4);
 assert(result.slice(1).some(n=>(n.delay||0)>0));
});

function ringing(abc: string, swing = false) {
  const audio = abcjs.parseOnly(abc)[0].setUpAudio({qpm:60,chordsOff:true});
  return playbackNotes(guitarSustainAudio(swingAudio(audio,swing),abc,swing));
}
test("let ring joins separate strings, stops at changed harmony, and does not rewrite written rhythm", () => {
  const abc = 'X:1\nM:4/4\nL:1/4\nK:C\n"C" C E G E | "C" C E "F" F A |]';
  const source = ringing(abc);
  assert.deepEqual(source.slice(0,4).map(n=>n.duration),[1,1,1,1]);
  assert.deepEqual(source.map(n=>n.ringUntil),[6,6,6,6,6,6,8,8]);
  const played = performNotes(source, {instrument:"guitar",positionFor:p=>({str:({60:4,64:3,67:2,65:1,69:0} as Record<number,number>)[p],num:0})});
  assert.equal(played[0].duration,4,"bass rings until its string is replayed");
  assert.equal(played[1].duration,2,"repeated inner note replaces its earlier string");
  assert.equal(played[2].duration,4,"open harmony string rings until the F chord");
  assert.equal(source[2].duration,1,"written values remain unchanged");
});
test("voice rests, detached articulations, repeats and endings bound resonance", () => {
  const abc = 'X:1\nM:4/4\nL:1/4\nK:C\n|: "C" C E z G | .A B c2 :|';
  const notes = ringing(abc);
  assert.deepEqual(notes.map(n=>n.ringUntil),[2,2,8,5,8,8,10,10,16,13,16,16]);
  assert.equal(notes.at(-1)!.ringUntil,16);
  const polyphonic='X:1\nM:4/4\nL:1/4\n%%score (a b)\nV:a\nV:b\nK:C\n[V:a] C z E2 |\n[V:b] C,4 |]';
  const voices=ringing(polyphonic);
  assert.equal(voices.find(n=>n.pitch===60)!.ringUntil,1);
  assert.equal(voices.find(n=>n.pitch===48)!.ringUntil,4,"melody rest does not mute the bass");
});
test("swing boundaries follow the performed chord change and singer metadata stays untouched", () => {
  const abc='X:1\nM:4/4\nL:1/8\nK:C\n"C" C "F" F G6 |]';
  assert.equal(ringing(abc,true)[0].ringUntil,2/3);
  const audio=abcjs.parseOnly(abc)[0].setUpAudio({qpm:60,chordsOff:true});
  const voiced={...audio,tracks:audio.tracks.map(t=>t.map(n=>n.cmd==="note"?{...n,playbackInstrument:"choir"}:n))};
  assert.deepEqual(guitarSustainAudio(voiced,abc),voiced);
});
