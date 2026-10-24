import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SPEC, generateExercise, phraseContour, type Direction } from '../src/music';
import { Midi, exportMidi } from '../src/midi';

test('phrase contour is independent of all three round progressions', () => {
  for (const [pattern, span] of [
    ['arpeggio', 7],
    ['octaveArpeggio', 12],
    ['fiveNote', 7],
    ['rossini', 19],
    ['fifthGlide', 7],
    ['octaveGlide', 12],
  ] as const) {
    for (const direction of ['up', 'down'] as Direction[]) {
      for (const progression of ['up', 'down', 'both'] as Direction[]) {
        const exercise = generateExercise(
          {
            ...DEFAULT_SPEC,
            pattern,
            direction,
            progression,
            low: 52,
            high: 54 + span,
            countIn: 8,
            repetitions: 2,
            startingChords: false,
          },
          Infinity
        );
        const descending = pattern !== 'rossini' && direction === 'down';
        const targets =
          progression === 'up'
            ? [52, 53, 54]
            : progression === 'down'
              ? [54, 53, 52]
              : [52, 53, 54, 53, 52];
        const expected = [...targets, ...targets].map((root) => root + (descending ? span : 0));
        assert.deepEqual(
          exercise.rounds.map((round) => round.midi),
          expected
        );
        let contour: number[] | undefined;
        for (const round of exercise.rounds) {
          const notes = exercise.notes.filter(
            (n) => n.onsetBeat >= round.onsetBeat && n.onsetBeat < round.endBeat
          );
          const relative = notes.map((n) => n.midi - round.midi);
          if (contour)
            assert.deepEqual(relative, contour, `${pattern}: progression changed phrase`);
          contour = relative;
          if (notes[0].glideSpan) assert.equal(notes[0].glideSpan, descending ? -span : span);
          else
            assert.deepEqual(
              relative,
              phraseContour(pattern, descending ? 'down' : 'up').map(
                (p) => p - (descending ? span : 0)
              )
            );
        }
        for (let i = 1; i < exercise.rounds.length; i++)
          assert.equal(exercise.rounds[i].onsetBeat - exercise.rounds[i - 1].endBeat, 2);
        assert.equal(new Set(exercise.notes.map((n) => n.id)).size, exercise.notes.length);
        assert.equal(
          new Midi(exportMidi(exercise)).tracks
            .filter((t) => t.channel !== 9)
            .reduce((sum, t) => sum + t.notes.length, 0),
          exercise.notes.length
        );
      }
    }
  }
});

test('single-key turnarounds do not duplicate a round; chords transpose with each phrase', () => {
  const one = generateExercise({
    ...DEFAULT_SPEC,
    progression: 'both',
    direction: 'down',
    low: 52,
    high: 59,
    repetitions: 1,
  });
  assert.equal(one.rounds.length, 1);
  const e = generateExercise({
    ...DEFAULT_SPEC,
    progression: 'up',
    direction: 'down',
    low: 52,
    high: 60,
    repetitions: 1,
  });
  const phrase = (index: number) =>
    e.notes
      .filter(
        (n) => n.onsetBeat >= e.rounds[index].onsetBeat && n.onsetBeat < e.rounds[index].endBeat
      )
      .map((n) => n.midi);
  assert.deepEqual(
    phrase(1),
    phrase(0).map((midi) => midi + 1)
  );
  assert.throws(() => generateExercise({ ...DEFAULT_SPEC, progression: 'invalid' }), /rounds/);
  assert.throws(
    () => generateExercise({ ...DEFAULT_SPEC, progression: 'up', direction: 'both' }),
    /within each round/
  );
});
