import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SPEC, generateExercise, SCALE_TUNINGS } from '../src/music';
import { audioEvents } from '../src/audio-timeline';
import { keyboardView } from '../src/keyboard-layout';
import { noteName } from '../src/note-spelling';
import { exportMidi } from '../src/midi';
import { editSpec, restoreSpec } from '../src/exercise-settings';

for (const scaleTuning of ['rast', 'bayati', 'hijaz'] as const) {
  for (const direction of ['up', 'down', 'both'] as const) {
    test(`${scaleTuning} octave ${direction} preserves tuning and tonic`, () => {
      const exercise = generateExercise({
        ...DEFAULT_SPEC,
        pattern: 'major',
        low: 60,
        high: 72,
        key: 0,
        scaleTuning,
        direction,
        repetitions: 1,
        drone: true,
      });
      assert.deepEqual(exercise.pitches, [
        ...SCALE_TUNINGS[scaleTuning].intervals.map((n) => n + 60),
        72,
      ]);
      const drone = audioEvents(exercise, 0).find((e) => e.kind === 'drone')!;
      assert.equal(drone.frequency, 440 * 2 ** ((48 - 69) / 12));
      assert.equal(exercise.spec.startingChords, false);
      for (const mobile of [true, false]) {
        const view = keyboardView(exercise, 0, mobile);
        assert.ok(Number.isFinite(view.left) && Number.isFinite(view.count));
      }
    });
  }
  for (const direction of ['up', 'down'] as const) {
    test(`${scaleTuning} five-note ${direction} transposes whole rounds`, () => {
      const exercise = generateExercise({
        ...DEFAULT_SPEC,
        pattern: 'fiveNote',
        low: 60,
        high: 68,
        scaleTuning,
        direction,
        progression: 'both',
        repetitions: 1,
        drone: true,
      });
      for (const round of exercise.rounds) {
        const notes = exercise.notes.filter(
          (n) => n.onsetBeat >= round.onsetBeat && n.onsetBeat < round.endBeat
        );
        const tonic = round.midi - round.degree;
        assert.deepEqual(
          [...new Set(notes.map((n) => n.midi - tonic))].sort((a, b) => a - b),
          SCALE_TUNINGS[scaleTuning].intervals.slice(0, 5)
        );
      }
      const events = audioEvents(exercise, 0);
      assert.equal(events.filter((e) => e.kind === 'drone').length, exercise.rounds.length);
      const micro = exercise.notes.find((n) => !Number.isInteger(n.midi));
      if (micro) {
        assert.equal(
          events.find((e) => e.id === `note:${micro.id}`)!.frequency,
          440 * 2 ** ((micro.midi - 69) / 12)
        );
        assert.match(noteName(micro.midi), /−50¢/);
        assert.throws(() => exportMidi(exercise), /Quarter-tone MIDI/);
      }
      assert.equal(audioEvents(exercise, (exercise.totalBeats * 60) / exercise.spec.bpm).length, 0);
    });
  }
}
test('drone defaults off, survives restore, and only applies to straight scales', () => {
  assert.ok(!audioEvents(generateExercise(DEFAULT_SPEC), 0).some((e) => e.kind === 'drone'));
  const spec = editSpec(DEFAULT_SPEC, { pattern: 'fiveNote', scaleTuning: 'rast', drone: true });
  assert.equal(restoreSpec(spec, '1').scaleTuning, 'rast');
  assert.equal(restoreSpec(spec, '1').drone, true);
  const ordinary = generateExercise({ ...spec, pattern: 'arpeggio' });
  assert.ok(ordinary.notes.every((n) => Number.isInteger(n.midi)));
  assert.ok(!audioEvents(ordinary, 0).some((e) => e.kind === 'drone'));
  assert.throws(() => generateExercise({ ...spec, drone: 'yes' }), /Invalid drone/);
});
