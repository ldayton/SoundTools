import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SPEC, generateExercise, PATTERNS, vocalSpan } from '../src/music';

test('turn and returning home repeats add exactly three attacks, in either phrase direction and any progression', () => {
  for (const pattern of ['octaveArpeggio', 'rossini', 'fiveNote'] as const)
    for (const direction of ['up', 'down'] as const)
      for (const progression of ['up', 'down', 'both'] as const)
        for (const repeatTurn of [false, true])
          for (const repeatHome of [false, true]) {
            const input = {
              ...DEFAULT_SPEC,
              pattern,
              direction,
              progression,
              low: 52,
              high: 54 + vocalSpan(pattern),
              countIn: 0,
              repetitions: 1,
              restBeats: 2,
              startingChords: true,
            };
            const baseline = generateExercise(input, Infinity);
            const exercise = generateExercise({ ...input, repeatTurn, repeatHome }, Infinity);
            assert.equal(exercise.rounds.length, baseline.rounds.length);
            const extra = 3 * (Number(repeatTurn) + Number(repeatHome));
            assert.equal(exercise.totalBeats, baseline.totalBeats + extra * exercise.rounds.length);
            for (let i = 0; i < exercise.rounds.length; i++) {
              const round = exercise.rounds[i],
                original = baseline.rounds[i];
              const notes = exercise.guideNotes!.filter(
                (n) => n.onsetBeat >= round.onsetBeat + 6 && n.onsetBeat < round.endBeat
              );
              const before = baseline.guideNotes!.filter(
                (n) => n.onsetBeat >= original.onsetBeat + 6 && n.onsetBeat < original.endBeat
              );
              const pitches = before.map((n) => n.midi);
              const turnPitch =
                direction === 'down' && pattern !== 'rossini'
                  ? Math.min(...pitches)
                  : Math.max(...pitches);
              const expected = pitches.flatMap((p, index) =>
                Array(
                  (repeatTurn && p === turnPitch) || (repeatHome && index === pitches.length - 1)
                    ? 4
                    : 1
                ).fill(p)
              );
              assert.deepEqual(
                notes.map((n) => n.midi),
                expected
              );
              for (let n = 1; n < notes.length; n++)
                assert.equal(notes[n].onsetBeat, notes[n - 1].onsetBeat + notes[n - 1].slotBeats);
              const last = notes.at(-1)!;
              assert.equal(last.slotBeats, 2);
              assert.equal(last.onsetBeat + last.slotBeats, round.endBeat);
              const chords = exercise.notes.filter(
                (n) => n.onsetBeat >= round.onsetBeat && n.onsetBeat < notes[0].onsetBeat
              );
              const oldChords = baseline.notes.filter(
                (n) => n.onsetBeat >= original.onsetBeat && n.onsetBeat < before[0].onsetBeat
              );
              assert.deepEqual(
                chords.map((n) => n.midi),
                oldChords.map((n) => n.midi)
              );
            }
          }
  assert.deepEqual(PATTERNS.octaveArpeggio.intervals, [0, 4, 7, 12, 7, 4, 0]);
});

test('repeated-note options default off, reject malformed values, and do not alter other exercises', () => {
  for (const pattern of ['arpeggio', 'major', 'fifthGlide', 'octaveGlide'] as const) {
    const spec = { ...DEFAULT_SPEC, pattern, progression: 'up' as const };
    assert.deepEqual(
      generateExercise(spec).notes,
      generateExercise({ ...spec, repeatTurn: true, repeatHome: true }).notes
    );
  }
  assert.throws(
    () => generateExercise({ ...DEFAULT_SPEC, repeatTurn: 'yes' }),
    /Invalid repeatTurn/
  );
  assert.throws(() => generateExercise({ ...DEFAULT_SPEC, repeatHome: 4 }), /Invalid repeatHome/);
});
