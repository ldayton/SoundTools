import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SPEC,
  generateExercise,
  roundNoteName,
  exerciseSpan,
  secondsAt,
  type Direction,
} from '../src/music';
import {
  YEMENITE_COLLECTIONS,
  type YemeniteCollection,
  collectionChoice,
} from '../src/yemenite-collections';
import { phrasePitches } from '../src/keyboard-layout';
import { audioEvents } from '../src/audio-timeline';
import { editSpec, restoreSpec } from '../src/exercise-settings';
import { encodePreferences, decodePreferences } from '../src/preferences';
import { exportMidi } from '../src/midi';
import { changes } from '@ldayton/account/sync';
const expected = {
  'rast-tetrachord': [0, 2, 3.5, 5],
  'rast-pentachord': [0, 2, 3.5, 5, 7],
  'rast-octave': [0, 2, 3.5, 5, 7, 9, 10.5, 12],
  'bayati-tetrachord': [0, 1.5, 3, 5],
  'bayati-pentachord': [0, 1.5, 3, 5, 7],
  'bayati-octave': [0, 1.5, 3, 5, 7, 8, 10, 12],
  'sikah-trichord': [0, 1.5, 3.5],
} satisfies Record<YemeniteCollection, number[]>;
for (const id of Object.keys(expected) as YemeniteCollection[]) {
  for (const direction of ['up', 'down', 'both'] as Direction[]) {
    test(`${id} ${direction}: authored notes, span, transposition, drone and fractions`, () => {
      for (let low = 60; low < 72; low++) {
        const offsets = expected[id];
        const span = offsets.at(-1)!;
        const spec = {
          ...DEFAULT_SPEC,
          pattern: 'yemenite' as const,
          yemeniteCollection: id,
          direction,
          progression: 'up' as const,
          low,
          high: low + Math.ceil(span) + 1,
          repetitions: 1,
          drone: true,
        };
        const e = generateExercise(spec);
        assert.equal(e.title, 'Yemenite ✡︎');
        assert.equal(e.spec.startingChords, false);
        for (const round of e.rounds) {
          const tonic = round.midi - round.degree;
          const notes = e.notes.filter(
            (n) => n.onsetBeat >= round.onsetBeat && n.onsetBeat < round.endBeat
          );
          const path =
            direction === 'down'
              ? [...offsets].reverse()
              : direction === 'both'
                ? [...offsets, ...offsets.slice(0, -1).reverse()]
                : offsets;
          assert.deepEqual(
            notes.map((n) => n.midi - tonic),
            path
          );
          assert.equal(
            Math.max(...notes.map((n) => n.midi)) - Math.min(...notes.map((n) => n.midi)),
            span
          );
          assert.equal(new Set(notes.map((n) => n.midi)).size, offsets.length);
          assert.deepEqual(
            phrasePitches(e, round),
            offsets.map((offset) => tonic + offset)
          );
        }
        const events = audioEvents(e, 0);
        assert.deepEqual(
          events.filter((event) => event.kind === 'drone').map((event) => event.frequency),
          e.rounds.map((round) => 440 * 2 ** ((round.midi - round.degree - 12 - 69) / 12))
        );
        const micro = e.notes.find((n) => !Number.isInteger(n.midi))!;
        assert.equal(
          events.find((event) => event.id === `note:${micro.id}`)!.frequency,
          440 * 2 ** ((micro.midi - 69) / 12)
        );
        const resumed = audioEvents(
          e,
          secondsAt(micro.onsetBeat + micro.durationBeats / 2, e.spec.bpm)
        );
        assert.ok(resumed.some((event) => event.id === `note:${micro.id}` && event.elapsed > 0));
        assert.throws(() => exportMidi(e), /Quarter-tone MIDI/);
      }
    });
  }
}
test('return paths and repeats preserve authored peaks and home notes', () => {
  const e = generateExercise({
    ...DEFAULT_SPEC,
    pattern: 'yemenite',
    yemeniteCollection: 'sikah-trichord',
    low: 60,
    high: 64,
    direction: 'both',
    progression: 'up',
    repetitions: 1,
    repeatTurn: true,
    repeatHome: true,
  });
  assert.deepEqual(
    e.notes.map((n) => n.midi),
    [60, 61.5, 63.5, 63.5, 63.5, 63.5, 61.5, 60, 60, 60, 60]
  );
  const twice = generateExercise({
    ...e.spec,
    repeatTurn: false,
    repeatHome: false,
    repeatTwice: true,
  });
  assert.deepEqual(
    twice.notes.map((n) => n.midi),
    [60, 61.5, 63.5, 61.5, 60, 61.5, 63.5, 61.5, 60]
  );
});
test('degree spellings survive direction and transposition', () => {
  for (const direction of ['up', 'down', 'both'] as const) {
    const e = generateExercise({
      ...DEFAULT_SPEC,
      pattern: 'yemenite',
      yemeniteCollection: 'rast-pentachord',
      low: 66,
      high: 73,
      direction,
      progression: 'up',
      repetitions: 1,
    });
    assert.deepEqual(
      phrasePitches(e, e.rounds[0]).map((midi) => roundNoteName(midi, e.rounds[0])),
      ['F♯4', 'G♯4', 'A𝄲4', 'B4', 'C♯5']
    );
    const c = generateExercise({ ...e.spec, low: 60, high: 67 });
    assert.equal(roundNoteName(63.5, c.rounds[0]), 'E𝄳4');
  }
});
test('authored extents validate, resize ranges safely and preserve old maqamat', () => {
  assert.equal(collectionChoice('sikah', 8), 'sikah-trichord');
  const spec = editSpec(DEFAULT_SPEC, {
    pattern: 'yemenite',
    yemeniteCollection: 'sikah-trichord',
    low: 60,
    high: 64,
  });
  const extended = editSpec(spec, { yemeniteCollection: 'rast-octave' });
  assert.equal(extended.high, 72);
  assert.equal(exerciseSpan(spec), 3.5);
  assert.equal(restoreSpec(spec, '1').yemeniteCollection, 'sikah-trichord');
  assert.throws(
    () => generateExercise({ ...spec, yemeniteCollection: 'sikah-octave' }),
    /supported Yemenite collection/
  );
  for (const scaleTuning of ['rast', 'bayati', 'hijaz'] as const) {
    const old = restoreSpec(
      { ...DEFAULT_SPEC, pattern: 'maqamat', scaleTuning, low: 60, high: 72 },
      '1'
    );
    assert.equal(old.scaleTuning, scaleTuning);
    assert.equal(old.pattern, 'maqamat');
  }
});
test('cloud settings keep collection and its pitch range atomic', () => {
  const spec = restoreSpec(
    {
      ...DEFAULT_SPEC,
      pattern: 'yemenite',
      yemeniteCollection: 'rast-pentachord',
      low: 60,
      high: 67,
      drone: true,
    },
    '1'
  );
  const state = {
    spec,
    breathing: { rounds: 4, seconds: 4 },
    channels: 'stereo' as const,
    selected: 'warmup' as const,
  };
  const records = encodePreferences(state);
  assert.deepEqual(encodePreferences(decodePreferences(records)), records);
  const edited = encodePreferences({
    ...state,
    spec: generateExercise(editSpec(spec, { yemeniteCollection: 'rast-octave' })).spec,
  });
  assert.deepEqual(
    changes(records, edited).map((change) => change.key),
    ['exercise.pitch']
  );
});

test('a fresh Yemenite exercise defaults to the authored Bayati octave', () => {
  const e = generateExercise(editSpec(DEFAULT_SPEC, { pattern: 'yemenite' }));
  assert.equal(e.spec.yemeniteCollection, 'bayati-octave');
  assert.equal(phrasePitches(e, e.rounds[0]).length, 8);
});
