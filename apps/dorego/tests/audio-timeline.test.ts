import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SPEC, generateExercise } from '../src/music';
import { audioEvents } from '../src/audio-timeline';

test('resuming inside a note retains its sample offset and remaining duration', () => {
  const exercise = generateExercise({
    ...DEFAULT_SPEC,
    pattern: 'major',
    key: 0,
    low: 60,
    high: 64,
    bpm: 60,
    countIn: 0,
    repetitions: 1,
    noteBeats: 1,
    gate: 1,
  });
  const events = audioEvents(exercise, 0.6);
  assert.equal(events[0].time, 0);
  assert.equal(events[0].elapsed, 0.6);
  assert.equal(events[0].duration, 0.4);
  assert.equal(events[1].time, 0.4);
  assert.equal(events[1].elapsed, 0);
  assert.equal(audioEvents(exercise, 1)[0].frequency, 440 * 2 ** ((62 - 69) / 12));
});
test('the audio timeline keeps simultaneous chords and both accented count-in bars', () => {
  const exercise = generateExercise({ ...DEFAULT_SPEC, countIn: 8 });
  const events = audioEvents(exercise, 0);
  for (let i = 1; i < events.length; i++) assert.ok(events[i].time >= events[i - 1].time);
  const clicks = events.filter((event) => event.kind === 'click');
  assert.equal(clicks.length, 8);
  assert.equal(clicks[0].velocity, clicks[4].velocity);
  assert.ok(clicks[0].velocity > clicks[1].velocity);
  const chordTime = (exercise.notes[0].onsetBeat * 60) / exercise.spec.bpm;
  assert.equal(
    events.filter((event) => event.kind === 'note' && event.time === chordTime).length,
    4
  );
});
test('toggling drone preserves all scheduled piano and click events at the current beat', () => {
  for (const pattern of ['maqamat', 'yemenite'] as const) {
    const exercise = generateExercise({ ...DEFAULT_SPEC, pattern, low: 60, high: 72, countIn: 4, restBeats: 4, repetitions: 2, drone: false });
    for (const beat of [0, 2, exercise.rounds[0].onsetBeat + 0.5, exercise.rounds[0].endBeat + 0.5]) {
      const offset = (beat * 60) / exercise.spec.bpm;
      const before = audioEvents(exercise, offset);
      const after = audioEvents({ ...exercise, spec: { ...exercise.spec, drone: true } }, offset);
      assert.deepEqual(after.filter(event => event.kind !== 'drone'), before);
      const current = exercise.rounds.find(round => round.onsetBeat <= beat && round.endBeat > beat);
      assert.equal(after.some(event => event.kind === 'drone' && event.time === 0), !!current);
    }
  }
});
