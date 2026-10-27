import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SPEC as APP_DEFAULT_SPEC,
  PATTERNS,
  generateExercise,
  metronomeBeat,
  noteName,
  secondsAt,
  stateAt,
  practiceAt,
  validateSpec,
} from '../src/music';
import { Midi, exportMidi } from '../src/midi';

const DEFAULT_SPEC = {
  ...APP_DEFAULT_SPEC,
  pattern: 'arpeggio' as const,
  key: 0,
  low: 60,
  high: 72,
  bpm: 200,
};
test('exercise choices include Rossini Scale, with Arpeggio & Scale E3-E5 at 150 BPM as the default', () => {
  assert.deepEqual(
    Object.values(PATTERNS).map((p) => p.name),
    [
      'Arpeggio & Scale',
      'Octave Arpeggio',
      'Rossini Scale',
      'Five-Note Scale',
      'Pentatonic Sequence (Threes)',
      'Major Scale',
      'Fifth Glide',
      'Octave Glide',
    ]
  );
  assert.equal(APP_DEFAULT_SPEC.pattern, 'arpeggio');
  assert.equal(APP_DEFAULT_SPEC.low, 52);
  assert.equal(APP_DEFAULT_SPEC.high, 76);
  assert.equal(APP_DEFAULT_SPEC.bpm, 150);
  assert.equal(DEFAULT_SPEC.direction, 'up');
  assert.equal(DEFAULT_SPEC.countIn, 8);
});
test('Arpeggio generates the reference phrase and chromatic sweep in either direction', () => {
  const base = {
    ...DEFAULT_SPEC,
    low: 60,
    high: 68,
    countIn: 0,
    repetitions: 1,
    restBeats: 0,
    gate: 1,
    startingChords: false,
  };
  const up = generateExercise({ ...base, direction: 'up' });
  assert.deepEqual(
    up.notes.slice(0, 13).map((n) => n.midi - 60),
    [0, 4, 7, 5, 4, 2, 0, 4, 7, 5, 4, 2, 0]
  );
  assert.equal(up.notes[13].midi, 61);
  assert.equal(up.totalBeats, 36);
  const down = generateExercise({ ...base, direction: 'down' });
  assert.deepEqual(
    down.notes.slice(0, 13).map((n) => n.midi - 68),
    [0, -3, -7, -5, -3, -2, 0, -3, -7, -5, -3, -2, 0]
  );
  assert.equal(down.notes[13].midi, 67);
  assert.equal(up.title, 'Arpeggio & Scale (Ascending)');
  assert.equal(down.title, 'Arpeggio & Scale (Descending)');
  for (const n of [...up.notes, ...down.notes]) assert.ok(n.midi >= 60 && n.midi <= 68);
  assert.throws(() => generateExercise({ ...base, high: 66 }), /perfect fifth/);
});
test('Major Scale respects key and range, with ascending and descending order', () => {
  for (let key = 0; key < 12; key++) {
    const spec = {
      ...DEFAULT_SPEC,
      pattern: 'major',
      key,
      low: 45,
      high: 77,
      countIn: 0,
      repetitions: 1,
    };
    const up = generateExercise({ ...spec, direction: 'up' }),
      down = generateExercise({ ...spec, direction: 'down' });
    assert.deepEqual(
      down.notes.map((n) => n.midi),
      up.notes.map((n) => n.midi).reverse()
    );
    for (const n of up.notes) {
      assert.ok(n.midi >= 45 && n.midi <= 77);
      assert.ok(
        (PATTERNS.major.intervals as readonly number[]).includes((n.midi - key + 120) % 12)
      );
    }
  }
});
test('starting chords, tempo, articulation, note length, rests, and rounds stay adjustable', () => {
  const e = generateExercise({
    ...DEFAULT_SPEC,
    low: 60,
    high: 67,
    countIn: 2,
    repetitions: 2,
    restBeats: 3,
    bpm: 120,
    gate: 0.5,
    noteBeats: 0.5,
  });
  assert.deepEqual(
    e.notes.slice(0, 4).map((n) => n.midi),
    [47, 54, 59, 63]
  );
  assert.equal(e.notes[0].onsetBeat, 2);
  assert.equal(e.notes[0].durationBeats, 0.5);
  assert.equal(e.notes[7].midi, 60);
  assert.equal(e.notes[7].onsetBeat, 5);
  assert.equal(e.totalBeats, 29);
  assert.equal(stateAt(e, secondsAt(14.5, 120)).phase, 'rest');
  assert.equal(stateAt(e, secondsAt(14.5, 120)).count, 3);
  assert.equal(new Midi(exportMidi(e)).tracks[0].notes.length, e.notes.length);
});
test('scene boundaries separate preparation, count-in, rhythmic slots, rest, and completion', () => {
  const e = generateExercise({
    ...DEFAULT_SPEC,
    pattern: 'major',
    low: 60,
    high: 60,
    bpm: 120,
    countIn: 2,
    repetitions: 2,
    restBeats: 2,
  });
  assert.equal(stateAt(e, -1).phase, 'ready');
  assert.equal(stateAt(e, 0).count, 1);
  assert.equal(stateAt(e, 0.5).count, 2);
  assert.equal(stateAt(e, 1).note?.id, 0);
  assert.equal(stateAt(e, 1.49).note?.id, 0);
  assert.equal(stateAt(e, 1.5).phase, 'rest');
  assert.equal(stateAt(e, 2.5).note?.id, 1);
  assert.equal(stateAt(e, 3).phase, 'complete');
});
test('MIDI preserves fractional note timing and accents every bar of the forward count-in', () => {
  const e = generateExercise({
    ...DEFAULT_SPEC,
    pattern: 'major',
    countIn: 8,
    bpm: 120,
    noteBeats: 0.25,
    repetitions: 1,
  });
  assert.deepEqual(
    Array.from({ length: 8 }, (_, beat) => stateAt(e, beat * 0.5).count),
    [1, 2, 3, 4, 1, 2, 3, 4]
  );
  const midi = new Midi(exportMidi(e)),
    clicks = midi.tracks[1].notes;
  assert.equal(midi.header.tempos[0].bpm, 120);
  assert.equal(midi.tracks[1].channel, 9);
  assert.ok(clicks[0].velocity > clicks[1].velocity);
  assert.equal(clicks[0].velocity, clicks[4].velocity);
  assert.deepEqual(
    clicks.map((n) => n.ticks),
    Array.from({ length: 8 }, (_, i) => i * 480)
  );
  for (const [i, n] of e.notes.entries()) {
    assert.equal(midi.tracks[0].notes[i].ticks, Math.round(n.onsetBeat * 480));
    assert.ok(Math.abs(midi.tracks[0].notes[i].time - secondsAt(n.onsetBeat, 120)) < 0.00001);
  }
  assert.equal(metronomeBeat(2, 2).number, 1);
  assert.equal(metronomeBeat(6, 2).number, 1);
});
test('invalid input and removed exercises/directions are rejected', () => {
  for (const patch of [
    { bpm: 0 },
    { bpm: 59 },
    { bpm: Infinity },
    { low: 90, high: 60 },
    { key: 12 },
    { pattern: '__proto__' },
    { pattern: 'minor' },
    { pattern: 'strawDescending' },
    { direction: 'updown' },
    { repetitions: 1.5 },
    { gate: 0 },
    { noteBeats: 0 },
    { countIn: -1 },
    { metronome: 'true' },
    { transition: NaN },
  ])
    assert.throws(() => generateExercise({ ...DEFAULT_SPEC, ...patch }));
  assert.throws(() => validateSpec(null));
  assert.throws(
    () =>
      generateExercise({
        ...DEFAULT_SPEC,
        low: 24,
        high: 96,
        noteBeats: 4,
        bpm: 60,
        repetitions: 16,
      }),
    /10 minutes/
  );
});
test('note labels use standard MIDI middle C', () => {
  assert.equal(noteName(60), 'C4');
  assert.equal(noteName(61), 'C♯4');
  assert.equal(noteName(70, 5), 'B♭4');
});
test('practice targets stay fixed through chords and melody and advance only at round boundaries', () => {
  for (const direction of ['up', 'down'] as const) {
    const e = generateExercise({
      ...DEFAULT_SPEC,
      direction,
      low: 60,
      high: 68,
      countIn: 8,
      repetitions: 1,
      restBeats: 2,
      bpm: 120,
    });
    const first = direction === 'up' ? 60 : 68,
      second = direction === 'up' ? 61 : 67;
    for (const beat of [0, 8, 10, 14, 16, 20, 31.99, 32, 33.99]) {
      const p = practiceAt(e, secondsAt(beat, 120));
      assert.equal(p.current.midi, first, `beat ${beat}`);
      assert.equal(p.next?.midi, second);
    }
    assert.notEqual(stateAt(e, secondsAt(16, 120)).note?.midi, first);
    assert.equal(practiceAt(e, secondsAt(34, 120)).current.midi, second);
    assert.equal(practiceAt(e, secondsAt(e.totalBeats, 120)).next, null);
    assert.deepEqual(practiceAt(e, secondsAt(10, 120)), practiceAt(e, secondsAt(10, 120)));
  }
});
test('each complete scale round has one practice target regardless of its individual notes', () => {
  const e = generateExercise({
    ...DEFAULT_SPEC,
    pattern: 'major',
    direction: 'down',
    countIn: 0,
    repetitions: 2,
    bpm: 120,
  });
  assert.equal(e.rounds.length, 2);
  assert.equal(practiceAt(e, secondsAt(3, 120)).current.midi, 72);
  assert.equal(practiceAt(e, secondsAt(3, 120)).next?.midi, 72);
});

test('Rossini matches the supplied pitches and ignores direction, with roots fitting the range', () => {
  const input = {
    ...DEFAULT_SPEC,
    pattern: 'rossini',
    low: 56,
    high: 76,
    countIn: 0,
    repetitions: 2,
    restBeats: 2,
    startingChords: false,
  };
  const exercise = generateExercise(input);
  assert.equal(exercise.title, 'Rossini Scale');
  assert.deepEqual(
    exercise.notes.slice(0, 13).map((note) => note.midi),
    [56, 60, 63, 68, 72, 75, 73, 70, 67, 63, 61, 58, 56]
  );
  assert.deepEqual(
    exercise.rounds.map((round) => round.midi),
    [56, 57, 56, 57]
  );
  assert.deepEqual(generateExercise({ ...input, direction: 'down' }), exercise);
  assert.ok(exercise.notes.every((note) => note.midi >= 56 && note.midi <= 76));
  assert.equal(practiceAt(exercise, 1).current.midi, 56);
  const midi = new Midi(exportMidi(exercise));
  assert.deepEqual(
    midi.tracks[0].notes.slice(0, 13).map((note) => note.midi),
    exercise.notes.slice(0, 13).map((note) => note.midi)
  );
  assert.throws(() => generateExercise({ ...input, high: 74 }), /octave and a fifth/);
  const withChords = generateExercise({ ...input, startingChords: true });
  assert.deepEqual(
    withChords.guideNotes!.slice(2, 15).map((note) => note.midi),
    exercise.notes.slice(0, 13).map((note) => note.midi)
  );
});

test('five-note scales and octave arpeggios fit the range and preserve their major-key return', () => {
  for (const [pattern, span, ascending, descending] of [
    ['fiveNote', 7, [60, 62, 64, 65, 67, 65, 64, 62, 60], [68, 66, 65, 63, 61, 63, 65, 66, 68]],
    ['octaveArpeggio', 12, [60, 64, 67, 72, 67, 64, 60], [73, 68, 65, 61, 65, 68, 73]],
  ] as const) {
    const base = {
      ...DEFAULT_SPEC,
      pattern,
      low: 60,
      high: 61 + span,
      startingChords: false,
      countIn: 8,
      repetitions: 2,
      restBeats: 2,
    };
    for (const [direction, expected, roots] of [
      ['up', ascending, [60, 61, 60, 61]],
      ['down', descending, [61 + span, 60 + span, 61 + span, 60 + span]],
    ] as const) {
      const exercise = generateExercise({ ...base, direction });
      assert.deepEqual(
        exercise.notes.slice(0, expected.length).map((n) => n.midi),
        expected
      );
      assert.deepEqual(
        exercise.rounds.map((r) => r.midi),
        roots
      );
      assert.ok(exercise.notes.every((n) => n.midi >= base.low && n.midi <= base.high));
      assert.equal(exercise.notes[expected.length - 1].slotBeats, 2);
      assert.equal(exercise.rounds[1].onsetBeat, 8 + expected.length + 1 + base.restBeats);
      assert.equal(practiceAt(exercise, secondsAt(9, base.bpm)).current.midi, roots[0]);
      const midi = new Midi(exportMidi(exercise));
      assert.deepEqual(
        midi.tracks[0].notes.map((n) => n.midi),
        exercise.notes.map((n) => n.midi)
      );
      const chords = generateExercise({ ...base, direction, startingChords: true });
      assert.deepEqual(
        chords.guideNotes!.slice(2, 2 + expected.length).map((n) => n.midi),
        expected
      );
      const tonic = direction === 'down' ? roots[0] - span : roots[0];
      assert.deepEqual(
        chords.notes.slice(4, direction === 'down' ? 8 : 7).map((n) => n.midi),
        (direction === 'down' ? [-12, 0, 4, 7] : [-12, 0, 4]).map((offset) => tonic + offset)
      );
    }
    assert.throws(() => generateExercise({ ...base, high: 60 + span - 1 }), /range/);
  }
});
