import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SPEC, generateExercise, phraseContour, vocalSpan } from '../src/music';
import { Midi, exportMidi } from '../src/midi';

const base = {
  ...DEFAULT_SPEC,
  pattern: 'pentatonic12' as const,
  low: 60,
  high: 72,
  repetitions: 1,
  countIn: 0,
  restBeats: 0,
  startingChords: false,
  progression: 'up' as const,
};
const rising = [60, 62, 64, 67, 69, 72, 72, 69, 67, 64, 62, 60];
const falling = [72, 69, 67, 64, 62, 60, 60, 62, 64, 67, 69, 72];

test('12-note pentatonic phrases use major pentatonic pitches with a separate repeated turn', () => {
  assert.equal(vocalSpan(base.pattern), 12);
  for (const direction of ['up', 'down'] as const) {
    const exercise = generateExercise({ ...base, direction });
    const expected = direction === 'up' ? rising : falling;
    assert.deepEqual(
      exercise.notes.map((n) => n.midi),
      expected
    );
    assert.deepEqual(
      phraseContour(base.pattern, direction).map((n) => n + 60),
      expected
    );
    assert.equal(exercise.rounds.length, 1);
    assert.equal(exercise.rounds[0].midi, expected[0]);
    assert.ok(exercise.notes[6].onsetBeat > exercise.notes[5].onsetBeat);
    assert.equal(exercise.notes[5].slotBeats, DEFAULT_SPEC.noteBeats);
    assert.equal(exercise.notes[11].slotBeats, 2 * DEFAULT_SPEC.noteBeats);
    const midi = new Midi(exportMidi(exercise));
    assert.deepEqual(
      midi.tracks.flatMap((track) => track.notes.map((n) => n.midi)),
      expected
    );
  }
  assert.throws(() => generateExercise({ ...base, high: 71 }), /Pentatonic.*octave/);
});

test('pentatonic phrase direction and between-round progression remain independent', () => {
  for (const direction of ['up', 'down'] as const) {
    for (const progression of ['up', 'down', 'both'] as const) {
      for (const low of [24, 82]) {
        const e = generateExercise({ ...base, low, high: low + 14, direction, progression });
        const starts =
          progression === 'up' ? [0, 1, 2] : progression === 'down' ? [2, 1, 0] : [0, 1, 2, 1, 0];
        assert.deepEqual(
          e.rounds.map((r) => r.midi),
          starts.map((n) => low + n + (direction === 'down' ? 12 : 0))
        );
        for (const [index, shift] of starts.entries()) {
          assert.deepEqual(
            e.notes.slice(index * 12, (index + 1) * 12).map((n) => n.midi),
            (direction === 'up' ? rising : falling).map((n) => n - 60 + low + shift)
          );
        }
        assert.ok(e.notes.every((n) => n.midi >= low && n.midi <= low + 14));
      }
    }
  }
});

test('pentatonic uses the usual chord introduction and round timing', () => {
  const plain = generateExercise(base);
  const cued = generateExercise({ ...base, startingChords: true });
  const melody = cued.notes.filter((n) => n.onsetBeat >= 6 * base.noteBeats);
  assert.deepEqual(
    melody.map((n) => n.midi),
    rising
  );
  assert.equal(cued.totalBeats - plain.totalBeats, 6 * base.noteBeats);
  assert.ok(cued.notes.some((n) => n.onsetBeat < melody[0].onsetBeat));
});
