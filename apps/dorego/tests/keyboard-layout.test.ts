import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SPEC, generateExercise, secondsAt } from '../src/music';
import {
  keyboardRange,
  practiceRange,
  keyboardView,
  whiteKeyPosition,
  vocalPhraseNotes,
} from '../src/keyboard-layout';

test('mobile keyboard fits the vocal phrase and excludes intro accompaniment', () => {
  for (const pattern of ['arpeggio', 'fiveNote', 'octaveArpeggio', 'rossini'] as const)
    for (const direction of ['up', 'down'] as const) {
      const exercise = generateExercise({
        ...DEFAULT_SPEC,
        pattern,
        low: 36,
        high: 84,
        repetitions: 1,
        direction,
      });
      for (const round of exercise.rounds) {
        const { low, high } = keyboardRange(exercise, round, true);
        const notes = vocalPhraseNotes(exercise, round);
        assert.ok(notes.length > 0);
        assert.ok(notes.every((note) => note.onsetBeat >= round.onsetBeat + 6));
        const withoutChords = generateExercise({ ...exercise.spec, startingChords: false });
        assert.deepEqual(
          keyboardRange(exercise, round, true),
          keyboardRange(withoutChords, withoutChords.rounds[round.id], true)
        );
        for (const note of notes)
          assert.ok(
            note.midi >= low && note.midi <= high,
            `${direction}: note ${note.midi} clipped in round ${round.id}`
          );
        assert.ok(
          high - low <= 27,
          'Mobile keyboard should focus on the round, not the whole sweep'
        );
        assert.ok(![1, 3, 6, 8, 10].includes(low % 12));
        assert.ok(![1, 3, 6, 8, 10].includes(high % 12));
      }
      const desktop = keyboardRange(exercise, exercise.rounds[0], false);
      assert.ok(desktop.high - desktop.low > 48);
    }
});

test('keyboard slides continuously during rests and arrives before the next round', () => {
  for (const direction of ['up', 'down'] as const) {
    const exercise = generateExercise({ ...DEFAULT_SPEC, direction, repetitions: 1 });
    const index = exercise.rounds.findIndex((round, i) => {
      const next = exercise.rounds[i + 1];
      return (
        next && keyboardRange(exercise, round, true).low !== keyboardRange(exercise, next, true).low
      );
    });
    assert.ok(index >= 0);
    const round = exercise.rounds[index],
      next = exercise.rounds[index + 1];
    const boundary = secondsAt(next.onsetBeat, exercise.spec.bpm);
    const start = Math.max(secondsAt(round.endBeat, exercise.spec.bpm), boundary - 0.45);
    const before = keyboardView(exercise, start, true);
    const middle = keyboardView(exercise, (start + boundary) / 2, true);
    const after = keyboardView(exercise, boundary, true);
    assert.ok(middle.left > Math.min(before.left, after.left));
    assert.ok(middle.left < Math.max(before.left, after.left));
    assert.ok(Math.abs(keyboardView(exercise, boundary - 0.00001, true).left - after.left) < 0.001);
    assert.equal(after.left, whiteKeyPosition(keyboardRange(exercise, next, true).low));
    assert.equal(keyboardView(exercise, (start + boundary) / 2, true, true).left, before.left);
    assert.deepEqual(
      keyboardView(exercise, (start + boundary) / 2, false),
      keyboardView(exercise, 0, false)
    );
    // Rendering a later frame first must not change the interpolated position.
    keyboardView(exercise, boundary + 3, true);
    assert.deepEqual(keyboardView(exercise, (start + boundary) / 2, true), middle);
  }
});
test('without rests, keyboard slides from the prior position without jumping', () => {
  const exercise = generateExercise({ ...DEFAULT_SPEC, restBeats: 0, repetitions: 1 });
  const next = exercise.rounds[1];
  const boundary = secondsAt(next.onsetBeat, exercise.spec.bpm);
  const previous = keyboardRange(exercise, exercise.rounds[0], true);
  assert.equal(keyboardView(exercise, boundary, true).left, whiteKeyPosition(previous.low));
  assert.equal(
    keyboardView(exercise, boundary + 0.45, true).left,
    whiteKeyPosition(keyboardRange(exercise, next, true).low)
  );
});

test('mobile key width is fixed to the widest round, including during every slide', () => {
  for (const pattern of [
    'arpeggio',
    'fiveNote',
    'octaveArpeggio',
    'pentatonic12',
    'rossini',
    'major',
  ] as const)
    for (const direction of ['up', 'down'] as const)
      for (const restBeats of [0, 2]) {
        const exercise = generateExercise({
          ...DEFAULT_SPEC,
          pattern,
          direction,
          restBeats,
          low: 48,
          high: 79,
          repetitions: 2,
        });
        const widest = Math.max(
          ...exercise.rounds.map((round) => {
            const { low, high } = keyboardRange(exercise, round, true);
            return whiteKeyPosition(high) - whiteKeyPosition(low) + 1;
          })
        );
        for (const round of exercise.rounds) {
          const start = secondsAt(round.onsetBeat, exercise.spec.bpm);
          for (const time of [start - 0.225, start, start + 0.225, start + 0.45]) {
            const view = keyboardView(exercise, time, true);
            assert.equal(view.count, widest, `${pattern}/${direction}: keys resized at ${time}`);
            assert.ok(whiteKeyPosition(view.low) <= view.left);
            assert.ok(whiteKeyPosition(view.high) >= view.left + view.count);
          }
          // Once in position, every vocal note fits the fixed-width viewport.
          const view = keyboardView(exercise, start + 0.45, true);
          for (const note of vocalPhraseNotes(exercise, round)) {
            assert.ok(whiteKeyPosition(note.midi) >= view.left);
            assert.ok(whiteKeyPosition(note.midi) < view.left + view.count);
          }
        }
      }
});

test('iteration ranges exclude chords and include both endpoints of descending glides', () => {
  for (const [pattern, span] of [
    ['arpeggio', 7],
    ['octaveArpeggio', 12],
    ['fiveNote', 7],
    ['rossini', 19],
    ['fifthGlide', 7],
    ['octaveGlide', 12],
  ] as const) {
    for (const direction of ['up', 'down', 'both'] as const) {
      const e = generateExercise(
        { ...DEFAULT_SPEC, pattern, direction, low: 52, high: 53 + span, repetitions: 1 },
        Infinity
      );
      for (const round of e.rounds) {
        const range = practiceRange(e, round);
        assert.equal(range.high - range.low, span);
        assert.ok(range.low >= 52 && range.high <= 53 + span);
        assert.ok(round.midi === range.low || round.midi === range.high);
      }
      assert.notDeepEqual(practiceRange(e, e.rounds[0]), practiceRange(e, e.rounds[1]));
    }
  }
  const major = generateExercise({
    ...DEFAULT_SPEC,
    pattern: 'major',
    low: 60,
    high: 72,
    key: 0,
    direction: 'both',
  });
  assert.deepEqual(practiceRange(major, major.rounds[0]), { low: 60, high: 72 });
});
