import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SPEC, PATTERNS, generateExercise, isGlidePattern, vocalSpan } from '../src/music';

test('double rounds repeat the sung notes contiguously in the same key, with one introduction', () => {
  for (const pattern of Object.keys(PATTERNS) as (keyof typeof PATTERNS)[])
    for (const direction of ['up', 'down', 'both'] as const)
      for (const progression of ['up', 'down', 'both'] as const)
        for (const startingChords of [false, true]) {
          if (direction === 'both' && pattern !== 'major' && !isGlidePattern(pattern)) continue;
          const input = {
            ...DEFAULT_SPEC,
            pattern,
            direction,
            progression,
            startingChords,
            low: 52,
            high: 54 + vocalSpan(pattern),
            repetitions: 2,
            repeatTurn: true,
            repeatHome: true,
            restBeats: 3,
          };
          const baseline = generateExercise(input, Infinity);
          const doubled = generateExercise({ ...input, repeatTwice: true }, Infinity);
          if (isGlidePattern(pattern)) {
            assert.deepEqual(doubled.notes, baseline.notes, 'glides ignore the scale-only option');
            continue;
          }
          assert.equal(doubled.rounds.length, baseline.rounds.length);
          let extra = 0;
          for (let i = 0; i < baseline.rounds.length; i++) {
            const before = baseline.rounds[i],
              after = doubled.rounds[i];
            const cue: number = pattern !== 'major' && startingChords ? 6 : 0;
            const body = before.endBeat - before.onsetBeat - cue;
            const oldNotes = baseline.notes.filter(
              (n) => n.onsetBeat >= before.onsetBeat + cue && n.onsetBeat < before.endBeat
            );
            const notes = doubled.notes.filter(
              (n) => n.onsetBeat >= after.onsetBeat + cue && n.onsetBeat < after.endBeat
            );
            assert.equal(after.midi, before.midi);
            assert.equal(after.endBeat - after.onsetBeat, cue + 2 * body);
            assert.equal(notes.length, oldNotes.length * 2);
            for (const pass of [0, 1]) {
              assert.deepEqual(
                notes
                  .slice(pass * oldNotes.length, (pass + 1) * oldNotes.length)
                  .map((n) => [n.midi, n.onsetBeat - after.onsetBeat - pass * body, n.slotBeats]),
                oldNotes.map((n) => [n.midi, n.onsetBeat - before.onsetBeat, n.slotBeats])
              );
            }
            const intro = (exercise: typeof baseline, round: typeof before) =>
              exercise.notes
                .filter(
                  (n) => n.onsetBeat >= round.onsetBeat && n.onsetBeat < round.onsetBeat + cue
                )
                .map((n) => [n.midi, n.onsetBeat - round.onsetBeat, n.slotBeats]);
            assert.deepEqual(intro(doubled, after), intro(baseline, before));
            if (i) assert.equal(after.onsetBeat - doubled.rounds[i - 1].endBeat, input.restBeats);
            extra += body;
          }
          assert.equal(doubled.totalBeats, baseline.totalBeats + extra);
        }
});

test('double-round setting defaults off, survives validation, and rejects malformed input', () => {
  assert.equal(generateExercise(DEFAULT_SPEC).spec.repeatTwice, false);
  assert.equal(
    generateExercise({ ...DEFAULT_SPEC, repeatTwice: true }, Infinity).spec.repeatTwice,
    true
  );
  assert.throws(
    () => generateExercise({ ...DEFAULT_SPEC, repeatTwice: 'yes' }),
    /Invalid repeatTwice/
  );
});
