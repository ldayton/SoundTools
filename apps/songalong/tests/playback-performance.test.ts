import test from "node:test";
import assert from "node:assert/strict";
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

test("vocal notes retain their instrument and sustain while the guitar strums and damps strings",()=>{
 const voice={instrument:"choir" as const,pitch:69,start:0,duration:4,volume:1};
 const source=[voice,{pitch:45,start:0,duration:1,volume:1},{pitch:52,start:0,duration:1,volume:1},{pitch:57,start:0,duration:1,volume:1},{pitch:45,start:1,duration:1,volume:1}];
 const result=performNotes(source,{instrument:"guitar",strum:true});
 assert.deepEqual(result[0],performNotes([voice],{instrument:"choir"})[0]);
 assert.equal(result[0].string,undefined);assert.equal(result[0].delay,undefined);assert.equal(result[0].duration,4);
 assert(result.slice(1).some(n=>(n.delay||0)>0));
});
