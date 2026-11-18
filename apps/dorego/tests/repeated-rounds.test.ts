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
            const sharedHome = oldNotes.at(-1)!.midi === oldNotes[0].midi;
            const removed = sharedHome ? oldNotes[0].slotBeats : 0;
            const shortened = sharedHome ? oldNotes.at(-1)!.slotBeats - input.noteBeats : 0;
            assert.equal(after.midi, before.midi);
            assert.equal(after.endBeat - after.onsetBeat, cue + 2 * body - removed - shortened);
            assert.equal(notes.length, oldNotes.length * 2 - Number(sharedHome));
            assert.deepEqual(
              notes.map((n) => [n.midi, n.onsetBeat - after.onsetBeat, n.slotBeats]),
              [
                ...oldNotes.map((n, index) => [
                  n.midi,
                  n.onsetBeat - before.onsetBeat,
                  n.slotBeats - (index === oldNotes.length - 1 ? shortened : 0),
                ]),
                ...oldNotes
                  .slice(Number(sharedHome))
                  .map((n) => [
                    n.midi,
                    n.onsetBeat - before.onsetBeat + body - removed - shortened,
                    n.slotBeats,
                  ]),
              ]
            );
            const intro = (exercise: typeof baseline, round: typeof before) =>
              exercise.notes
                .filter(
                  (n) => n.onsetBeat >= round.onsetBeat && n.onsetBeat < round.onsetBeat + cue
                )
                .map((n) => [n.midi, n.onsetBeat - round.onsetBeat, n.slotBeats]);
            assert.deepEqual(intro(doubled, after), intro(baseline, before));
            if (i) assert.equal(after.onsetBeat - doubled.rounds[i - 1].endBeat, input.restBeats);
            extra += body - removed - shortened;
          }
          assert.equal(doubled.totalBeats, baseline.totalBeats + extra);
        }
});

test('returning scales use a quarter at the join and a half only at the final home', () => {
  for (const pattern of [
    'arpeggio',
    'octaveArpeggio',
    'rossini',
    'fiveNote',
    'pentatonic6',
    'pentatonic9',
    'pentatonic12',
  ] as const)
    for (const direction of ['up', 'down'] as const)
      for (const repeatHome of [false, true])
        for (const noteBeats of [0.5, 1, 2]) {
          const input = {
            ...DEFAULT_SPEC,
            pattern,
            direction,
            low: 52,
            high: 72,
            countIn: 0,
            startingChords: false,
            repetitions: 2,
            progression: 'both',
            repeatHome,
            noteBeats,
            gate: 0.9,
          };
          const single = generateExercise(input, Infinity);
          const doubled = generateExercise({ ...input, repeatTwice: true }, Infinity);
          for (const [i, round] of doubled.rounds.entries()) {
            const notes = doubled.notes.filter(
              (n) => n.onsetBeat >= round.onsetBeat && n.onsetBeat < round.endBeat
            );
            const singleRound = single.rounds[i];
            const singleNotes = single.notes.filter(
              (n) => n.onsetBeat >= singleRound.onsetBeat && n.onsetBeat < singleRound.endBeat
            );
            const join = notes[singleNotes.length - 1];
            assert.equal(join.midi, round.midi);
            assert.equal(join.slotBeats, noteBeats);
            assert.equal(join.durationBeats, noteBeats * input.gate);
            assert.equal(notes[singleNotes.length].onsetBeat, join.onsetBeat + noteBeats);
            assert.equal(notes[singleNotes.length].midi, singleNotes[1].midi);
            assert.notEqual(
              notes[singleNotes.length].midi,
              join.midi,
              'the next pass leaves home immediately'
            );
            assert.equal(notes.at(-1)!.midi, round.midi);
            assert.equal(notes.at(-1)!.slotBeats, 2 * noteBeats);
            assert.equal(singleNotes.at(-1)!.slotBeats, 2 * noteBeats);
            assert.equal(round.endBeat, notes.at(-1)!.onsetBeat + 2 * noteBeats);
          }
        }
});

test('joined five-note passes play 3-2-1-2-3 across the shared home note', () => {
  const exercise = generateExercise({
    ...DEFAULT_SPEC,
    pattern: 'fiveNote',
    low: 60,
    high: 67,
    startingChords: false,
    countIn: 0,
    repetitions: 1,
    repeatTwice: true,
  });
  assert.deepEqual(
    exercise.notes.slice(6, 11).map((n) => n.midi),
    [64, 62, 60, 62, 64]
  );
  assert.equal(exercise.notes.length, 17);
  assert.equal(exercise.notes[8].slotBeats, 1);
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
