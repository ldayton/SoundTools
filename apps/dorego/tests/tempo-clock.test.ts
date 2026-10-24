import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TempoClock } from '../src/tempo-clock';
import { DEFAULT_SPEC, generateExercise } from '../src/music';

test('tempo changes preserve beat position and history for audible output latency', () => {
  const clock = new TempoClock(10, 4, 120);
  assert.equal(clock.beatAt(9), 4);
  clock.setTempo(12, 60);
  assert.equal(clock.beatAt(12), 8);
  assert.equal(clock.beatAt(13), 9);
  assert.equal(clock.beatAt(11.9), 7.800000000000001);
  assert.equal(clock.timeAt(10), 14);
  clock.setTempo(13, 240);
  assert.equal(clock.beatAt(13.5), 11);
  assert.equal(clock.beatAt(12.5), 8.5);
  assert.equal(clock.timeAt(13), 14);
});
test('tempo can change while the first audio start is still buffered', () => {
  const clock = new TempoClock(0.2, 15, 150);
  clock.setTempo(0.05, 60);
  assert.equal(clock.beatAt(0.1), 15);
  assert.equal(clock.timeAt(15), 0.2);
  assert.equal(clock.beatAt(1.2), 16);
});
test('practice duration can grow when slowing down, while export remains bounded', () => {
  const slow = { ...DEFAULT_SPEC, bpm: 60 };
  assert.throws(() => generateExercise(slow), /10 minutes/);
  assert.ok(generateExercise(slow, Infinity).totalBeats > 600);
});
