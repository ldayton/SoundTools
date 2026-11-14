import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SPEC, generateExercise, noteName, roundNoteName } from '../src/music';
import { noteAlternative, noteChoiceLabel } from '../src/note-spelling';
import { parseNote } from '../src/note-spelling';

const base = { ...DEFAULT_SPEC, startingChords: false, countIn: 0, repetitions: 1, restBeats: 0 };

test('pitch selectors use stable familiar names and expose equivalent alternatives', () => {
  assert.deepEqual(
    Array.from({ length: 12 }, (_, i) => noteName(60 + i)),
    ['C4', 'D♭4', 'D4', 'E♭4', 'E4', 'F4', 'F♯4', 'G4', 'A♭4', 'A4', 'B♭4', 'B4']
  );
  assert.equal(noteChoiceLabel(61), 'C♯4');
  assert.equal(noteChoiceLabel(66), 'F♯4');
  assert.equal(noteChoiceLabel(60), 'C4');
  for (let midi = 24; midi <= 96; midi++) {
    assert.equal(parseNote(noteName(midi)), midi);
    assert.equal(parseNote(noteChoiceLabel(midi)), midi);
    assert.ok(!/[♭/]/.test(noteChoiceLabel(midi)));
    const alias = noteAlternative(midi);
    if (alias) assert.equal(parseNote(alias), midi);
  }
});

test('all twelve major scales use seven successive letters and retain their actual pitches', () => {
  const letters = 'CDEFGAB';
  for (let tonic = 0; tonic < 12; tonic++) {
    const midi = 60 + tonic;
    const scale = generateExercise({
      ...base,
      pattern: 'major',
      key: tonic,
      low: midi,
      high: midi + 12,
    });
    const names = scale.notes.map((n) => roundNoteName(n.midi, scale.rounds[0]));
    const first = letters.indexOf(names[0][0]);
    assert.deepEqual(
      names.map((n) => n[0]),
      Array.from({ length: 8 }, (_, i) => letters[(first + i) % 7])
    );
    assert.deepEqual(
      names.map(parseNote),
      scale.notes.map((n) => n.midi)
    );
  }
  assert.deepEqual(
    [66, 68, 70, 71, 73, 75, 77, 78].map((midi) => noteName(midi, 6)),
    ['F♯4', 'G♯4', 'A♯4', 'B4', 'C♯5', 'D♯5', 'E♯5', 'F♯5']
  );
  assert.equal(noteName(65, 6), 'E♯4');
});

test('vocal rounds use their own tonic, independent of the stale builder key or progression', () => {
  for (const progression of ['up', 'down', 'both'] as const) {
    const e = generateExercise({
      ...base,
      key: 4,
      pattern: 'arpeggio',
      low: 52,
      high: 61,
      progression,
    });
    for (const r of e.rounds) {
      const notes = e.notes.filter((n) => n.onsetBeat >= r.onsetBeat && n.onsetBeat < r.endBeat);
      const names = notes.map((n) => roundNoteName(n.midi, r));
      if (r.midi === 53)
        assert.deepEqual(names.slice(0, 7), ['F3', 'A3', 'C4', 'B♭3', 'A3', 'G3', 'F3']);
      if (r.midi === 54)
        assert.deepEqual(names.slice(0, 7), ['F♯3', 'A♯3', 'C♯4', 'B3', 'A♯3', 'G♯3', 'F♯3']);
    }
  }
});

test('falling-first practice targets can be fifths rather than tonics', () => {
  for (const pattern of ['fiveNote', 'arpeggio'] as const) {
    const e = generateExercise({
      ...base,
      pattern,
      direction: 'down',
      progression: 'up',
      key: 4,
      low: 53,
      high: 60,
    });
    const r = e.rounds[0];
    assert.equal(r.midi, 60); // The fifth, C4, above an F-major tonic.
    assert.equal(roundNoteName(58, r), 'B♭3');
    assert.equal(roundNoteName(53, r), 'F3');
  }
  const rossini = generateExercise({
    ...base,
    pattern: 'rossini',
    key: 4,
    low: 54,
    high: 73,
    progression: 'up',
  });
  assert.ok(rossini.notes.some((n) => n.midi === 65));
  assert.equal(roundNoteName(65, rossini.rounds[0]), 'E♯4');
});

test('descending scales retain the key spelling and partial CLI ranges retain their tonic', () => {
  const e = generateExercise({
    ...base,
    pattern: 'major',
    direction: 'down',
    key: 4,
    low: 64,
    high: 76,
  });
  assert.equal(roundNoteName(75, e.rounds[0]), 'D♯5');
  const partial = generateExercise({ ...base, pattern: 'major', key: 6, low: 65, high: 71 });
  assert.equal(roundNoteName(65, partial.rounds[0]), 'E♯4');
});
