import test from "node:test";
import assert from "node:assert/strict";
import abcjs from "abcjs";
import { hasSwing, swingAudio, swingBeat } from "../../../packages/music-practice/src/hymn-swing";

test("swing keeps beats fixed and delays eighth offbeats", () => {
  for (const beat of [0,1,4,48,96,100]) assert.equal(swingBeat(beat),beat);
  assert.equal(swingBeat(0.5),2/3);
  assert(Math.abs(swingBeat(3.5) - 11/3) < 1e-10);
  assert(hasSwing('X:1\nQ:"Swing"\nK:C\nC8 |'));
  assert(!hasSwing('X:1\nQ:1/4=80\nK:C\nC8 |'));
});

test("swing transforms note ends too, preserves tied syncopation and never applies twice", () => {
  const abc = 'X:1\nM:4/4\nL:1/8\nK:C\nzC D2 E F3 | C8 |]';
  const straight = abcjs.parseOnly(abc)[0].setUpAudio({qpm:60,chordsOff:true});
  const before = structuredClone(straight);
  const swung = swingAudio(straight,true);
  const notes = swung.tracks.flatMap(t => t.filter(n => n.cmd === 'note'));
  assert(Math.abs(notes[0].start - 1/6) < 1e-10);
  assert(Math.abs(notes[0].duration - 1/12) < 1e-10);
  assert.equal(notes[1].start,1/4);
  assert.equal(notes[1].duration,1/4);
  assert(Math.abs(notes[3].start - 2/3) < 1e-10);
  assert(Math.abs(notes[3].duration - 1/3) < 1e-10);
  assert.equal(notes[4].start,1);
  assert.equal(notes[4].duration,1);
  assert.equal(swung.totalDuration,straight.totalDuration);
  assert.deepEqual(straight,before);
  assert.equal(swingAudio(swung,true),swung);
  assert.equal(swingAudio(straight,false),straight);
});
