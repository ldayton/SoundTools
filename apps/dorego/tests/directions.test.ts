import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SPEC, generateExercise, secondsAt, practiceAt, stateAt } from '../src/music';
import { Midi, exportMidi } from '../src/midi';

test('legacy coupled CLI directions retain their ascending/descending passes', () => {
  for (const [pattern, span] of [
    ['arpeggio', 7],
    ['octaveArpeggio', 12],
    ['fiveNote', 7],
    ['fifthGlide', 7],
    ['octaveGlide', 12],
  ] as const) {
    const spec = {
      ...DEFAULT_SPEC,
      pattern,
      direction: 'both',
      low: 60,
      high: 62 + span,
      repetitions: 2,
      restBeats: 2,
      countIn: 8,
      startingChords: false,
    };
    const e = generateExercise(spec, Infinity);
    const targets = [60, 61, 62, span + 61, span + 60];
    assert.deepEqual(
      e.rounds.map((r) => r.midi),
      [...targets, ...targets]
    );
    assert.equal(e.spec.direction, 'both');
    assert.match(e.title!, /Ascending & Descending/);
    for (let i = 1; i < e.rounds.length; i++)
      assert.equal(e.rounds[i].onsetBeat - e.rounds[i - 1].endBeat, 2);
    const down = generateExercise({ ...spec, direction: 'down', repetitions: 1, countIn: 0 });
    const firstDown = e.rounds[3];
    assert.deepEqual(
      e.notes
        .filter((n) => n.onsetBeat >= firstDown.onsetBeat && n.onsetBeat < firstDown.endBeat)
        .map((n) => n.midi),
      down.notes
        .filter(
          (n) => n.onsetBeat >= down.rounds[1].onsetBeat && n.onsetBeat < down.rounds[1].endBeat
        )
        .map((n) => n.midi)
    );
    assert.equal(practiceAt(e, secondsAt(firstDown.onsetBeat, spec.bpm)).current.midi, span + 61);
    assert.equal(stateAt(e, secondsAt(e.totalBeats, spec.bpm)).phase, 'complete');
    assert.equal(new Set(e.notes.map((n) => n.id)).size, e.notes.length);
    assert.ok(e.notes.every((n) => n.midi >= spec.low && n.midi <= spec.high));
    assert.equal(
      new Midi(exportMidi(e)).tracks
        .filter((t) => t.channel !== 9)
        .reduce((sum, t) => sum + t.notes.length, 0),
      e.notes.length
    );
    const chords = generateExercise({ ...spec, startingChords: true }, Infinity);
    assert.equal(chords.rounds.length, e.rounds.length);
    assert.ok(chords.totalBeats > e.totalBeats);
    // One-key ranges still perform both versions, rather than losing a direction.
    assert.deepEqual(
      generateExercise({ ...spec, high: 60 + span, repetitions: 1 }).rounds.map((r) => r.midi),
      [60, 60 + span]
    );
  }
});
test('Major Scale rises and returns to its starting note without repeating the apex', () => {
  const e = generateExercise({
    ...DEFAULT_SPEC,
    pattern: 'major',
    direction: 'both',
    low: 60,
    high: 72,
    key: 0,
    repetitions: 2,
    countIn: 8,
    restBeats: 2,
  });
  const phrase = [60, 62, 64, 65, 67, 69, 71, 72, 71, 69, 67, 65, 64, 62, 60];
  assert.deepEqual(
    e.notes.map((n) => n.midi),
    [...phrase, ...phrase]
  );
  assert.equal(e.rounds.length, 2);
  assert.equal(e.phraseBeats, 15);
  assert.equal(e.totalBeats, 40);
});
test('legacy fixed-contour specs keep their existing directions', () => {
  for (const pattern of ['rossini'])
    assert.deepEqual(
      generateExercise({ ...DEFAULT_SPEC, pattern, direction: 'both' }),
      generateExercise({ ...DEFAULT_SPEC, pattern, direction: 'up' })
    );
});
