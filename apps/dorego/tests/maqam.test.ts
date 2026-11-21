import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SPEC, generateExercise, SCALE_TUNINGS } from '../src/music';
import { audioEvents } from '../src/audio-timeline';
import { keyboardView } from '../src/keyboard-layout';
import { noteName } from '../src/note-spelling';
import { exportMidi } from '../src/midi';
import { editSpec, restoreSpec } from '../src/exercise-settings';

for (const scaleTuning of [
  'hijaz',
  'rast',
  'bayati',
  'ajam',
  'nahawand',
  'kurd',
  'nikriz',
] as const) {
  for (const direction of ['up', 'down', 'both'] as const) {
    test(`${scaleTuning} octave ${direction} preserves tuning and tonic`, () => {
      const exercise = generateExercise({
        ...DEFAULT_SPEC,
        pattern: 'maqamat',
        progression: 'up',
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
}
for (const scaleTuning of [
  'hijaz',
  'rast',
  'bayati',
  'ajam',
  'nahawand',
  'kurd',
  'nikriz',
] as const) {
  test(`${scaleTuning} cannot change Five-Note Scale or Major Scale`, () => {
    for (const pattern of ['fiveNote', 'major'] as const) {
      const input = { ...DEFAULT_SPEC, pattern, low: 60, high: 72, key: 0 };
      const ordinary = generateExercise(input);
      const stale = generateExercise({ ...input, scaleTuning, drone: true });
      assert.deepEqual(stale.notes, ordinary.notes);
      assert.ok(!audioEvents(stale, 0).some((event) => event.kind === 'drone'));
    }
  });
  test(`${scaleTuning} plays a complete transposed octave with fractional playback`, () => {
    const spec = editSpec(DEFAULT_SPEC, {
      pattern: 'maqamat',
      scaleTuning,
      low: 64,
      high: 76,
      drone: true,
    });
    const exercise = generateExercise(spec);
    assert.deepEqual(exercise.pitches, [
      ...SCALE_TUNINGS[scaleTuning].intervals.map((n) => n + 64),
      76,
    ]);
    const events = audioEvents(exercise, 0);
    const micro = exercise.notes.find((n) => !Number.isInteger(n.midi));
    if (micro) {
      assert.equal(
        events.find((e) => e.id === `note:${micro.id}`)!.frequency,
        440 * 2 ** ((micro.midi - 69) / 12)
      );
      assert.match(noteName(micro.midi), /[𝄳𝄲]/u);
      assert.throws(() => exportMidi(exercise), /Quarter-tone MIDI/);
    }
    assert.equal(audioEvents(exercise, (exercise.totalBeats * 60) / exercise.spec.bpm).length, 0);
  });
}
test('drone defaults off, survives restore, and only applies to straight scales', () => {
  assert.ok(!audioEvents(generateExercise(DEFAULT_SPEC), 0).some((e) => e.kind === 'drone'));
  const spec = editSpec(DEFAULT_SPEC, { pattern: 'maqamat', scaleTuning: 'rast', drone: true });
  assert.equal(restoreSpec(spec, '1').scaleTuning, 'rast');
  assert.equal(restoreSpec(spec, '1').drone, true);
  const ordinary = generateExercise({ ...spec, pattern: 'arpeggio' });
  assert.ok(ordinary.notes.every((n) => Number.isInteger(n.midi)));
  assert.ok(!audioEvents(ordinary, 0).some((e) => e.kind === 'drone'));
  assert.throws(() => generateExercise({ ...spec, drone: 'yes' }), /Invalid drone/);
});

test('quarter-tone names use musical accidentals across octave boundaries', () => {
  assert.equal(noteName(63.5), 'E𝄳4');
  assert.equal(noteName(60.5), 'C𝄲4');
  assert.equal(noteName(59.5), 'C𝄳4');
  assert.equal(noteName(66.5), 'G𝄳4');
});

test('Maqamat defaults to Hijaz and restores its multi-round range', () => {
  for (const direction of ['up', 'down', 'both'] as const) {
    const spec = editSpec(DEFAULT_SPEC, { pattern: 'maqamat', direction, low: 60, high: 74 });
    const restored = restoreSpec(spec, '1');
    const exercise = generateExercise(restored);
    assert.equal(exercise.spec.scaleTuning, 'hijaz');
    assert.equal(exercise.spec.high - exercise.spec.low, 14);
    const roots = exercise.rounds.map((round) => round.midi - round.degree);
    assert.deepEqual(roots, [60, 61, 62, 60, 61, 62]);
    assert.equal(exercise.title, 'Maqamat');
    for (const round of exercise.rounds) {
      const pitches = exercise.notes
        .filter((note) => note.onsetBeat >= round.onsetBeat && note.onsetBeat < round.endBeat)
        .map((note) => note.midi);
      assert.equal(Math.max(...pitches) - Math.min(...pitches), 12);
      assert.equal(new Set(pitches).size, 8);
    }
    const drones = audioEvents(exercise, 0).filter((event) => event.kind === 'drone');
    assert.equal(drones.length, 0);
  }
});
test('Maqamat sweep direction and drone follow every round tonic', () => {
  for (const progression of ['up', 'down', 'both'] as const) {
    const exercise = generateExercise({
      ...DEFAULT_SPEC,
      pattern: 'maqamat',
      progression,
      direction: 'down',
      low: 60,
      high: 74,
      repetitions: 1,
      drone: true,
    });
    const roots =
      progression === 'up'
        ? [60, 61, 62]
        : progression === 'down'
          ? [62, 61, 60]
          : [60, 61, 62, 61, 60];
    assert.deepEqual(
      exercise.rounds.map((round) => round.midi - round.degree),
      roots
    );
    assert.deepEqual(
      audioEvents(exercise, 0)
        .filter((e) => e.kind === 'drone')
        .map((e) => e.frequency),
      roots.map((root) => 440 * 2 ** ((root - 12 - 69) / 12))
    );
  }
});
