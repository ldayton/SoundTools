import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSequence, transitionSequence, type SequenceState } from '../src/sequence';
import {
  DEFAULT_SPEC,
  PATTERNS,
  type Pattern,
  secondsAt,
  stateAt,
  type ExerciseSpec,
} from '../src/music';
import { audioEvents } from '../src/audio-timeline';
import { phrasePitches } from '../src/keyboard-layout';
const settings: ExerciseSpec = {
  ...DEFAULT_SPEC,
  pattern: 'octaveArpeggio',
  low: 60,
  high: 75,
  direction: 'up',
  progression: 'up',
  countIn: 4,
  repetitions: 2,
  restBeats: 2,
  startingChords: false,
};
function edit(
  state: SequenceState,
  patch: Partial<ExerciseSpec>,
  beat: number,
  mode: 'playing' | 'paused' | 'complete' = 'playing'
) {
  return transitionSequence(state, {
    type: 'settings',
    settings: { ...state.settings, ...patch },
    position: secondsAt(beat, state.timeline.spec.bpm),
    mode,
  });
}

test('all exercise generators share the same immutable current-round contract', () => {
  for (const pattern of Object.keys(PATTERNS) as Pattern[]) {
    const original = createSequence({ ...settings, pattern, low: 48, high: 84 });
    const current = original.timeline.rounds[0];
    const originalNotes = original.timeline.notes.filter(
      (note) => note.onsetBeat < current.endBeat
    );
    const result = edit(
      original,
      { startingChords: true, repeatHome: true, restBeats: 5, countIn: 8 },
      current.onsetBeat + 1
    );
    assert.equal(result.effect, 'replace-future', pattern);
    assert.equal(result.state.timeline.rounds[0], current, pattern);
    assert.deepEqual(
      result.state.timeline.notes.filter((note) => note.onsetBeat < current.endBeat),
      originalNotes,
      pattern
    );
    assert.equal(result.state.timeline.spec.countIn, 4, pattern);
    const next = result.state.timeline.rounds[1];
    assert.ok(next, pattern);
    assert.equal(next.onsetBeat, current.endBeat + 5, pattern);
    assert.equal(
      next.commitment!.settings.startingChords,
      result.state.settings.startingChords,
      pattern
    );
    assert.equal(original.settings.startingChords, false, 'The previous state is not mutated');
    assert.deepEqual(
      phrasePitches(result.state.timeline, current),
      phrasePitches(original.timeline, current)
    );
  }
});
test('edits retain completed history, current identity, and beat while replacing only the future', () => {
  const original = createSequence(settings);
  const current = original.timeline.rounds[2];
  const beat = current.onsetBeat + 1;
  const result = edit(original, { startingChords: true, restBeats: 7 }, beat);
  for (let index = 0; index <= 2; index++)
    assert.equal(result.state.timeline.rounds[index], original.timeline.rounds[index]);
  assert.equal(result.position, secondsAt(beat, settings.bpm));
  assert.ok(result.state.timeline.rounds[3].commitment!.identity >= original.nextRoundId);
  assert.deepEqual(
    result.state.timeline.rounds.map((round) => round.commitment!.anchor),
    [60, 61, 62, 63, 60, 61, 62, 63]
  );
  const before = audioEvents(original.timeline, 0).filter(
    (event) => event.onsetBeat < current.endBeat
  );
  const after = audioEvents(result.state.timeline, 0).filter(
    (event) => event.onsetBeat < current.endBeat
  );
  assert.deepEqual(after, before, 'Committed audio event IDs and content are unchanged');
});
test('range edits never restart traversal or jump to a new starting pitch', () => {
  const original = createSequence(settings);
  const current = original.timeline.rounds[1];
  const expanded = edit(original, { high: 77 }, current.onsetBeat + 1).state;
  assert.deepEqual(
    expanded.timeline.rounds.slice(2, 6).map((round) => round.commitment!.anchor),
    [62, 63, 64, 65]
  );
  const excluded = edit(original, { low: 62, high: 75 }, current.onsetBeat + 1).state;
  assert.equal(excluded.timeline.rounds.length, 2);
  assert.equal(excluded.timeline.totalBeats, current.endBeat);
  assert.equal(
    stateAt(excluded.timeline, secondsAt(current.endBeat, settings.bpm)).phase,
    'complete'
  );
});
test('direction changes use the musical anchor rather than the old array index', () => {
  const original = createSequence({ ...settings, progression: 'both' });
  const current = original.timeline.rounds[2];
  const result = edit(original, { progression: 'down' }, current.onsetBeat + 1).state;
  assert.deepEqual(
    result.timeline.rounds.slice(3, 5).map((round) => round.commitment!.anchor),
    [61, 60]
  );
  const back = original.timeline.rounds[4];
  const returning = edit(original, { startingChords: true }, back.onsetBeat + 1).state;
  assert.deepEqual(
    returning.timeline.rounds.slice(5, 7).map((round) => round.commitment!.anchor),
    [61, 60]
  );
});
test('latest combined edits win, with no reuse of stale future event identities', () => {
  const original = createSequence(settings);
  const beat = original.timeline.rounds[0].onsetBeat + 1;
  const first = edit(original, { startingChords: true, restBeats: 7 }, beat).state;
  const second = edit(first, { startingChords: false, restBeats: 1 }, beat).state;
  assert.equal(second.timeline.rounds[0], original.timeline.rounds[0]);
  assert.equal(second.timeline.rounds[1].onsetBeat, original.timeline.rounds[0].endBeat + 1);
  assert.equal(second.timeline.rounds[1].commitment!.settings.startingChords, false);
  assert.ok(second.timeline.rounds[1].commitment!.identity >= first.nextRoundId);
  assert.ok(
    second.timeline.notes.find((note) => note.onsetBeat >= second.timeline.rounds[1].onsetBeat)!
      .id >= first.nextNoteId
  );
});
test('an underway rest and its destination remain committed', () => {
  const original = createSequence({ ...settings, restBeats: 8 });
  const next = original.timeline.rounds[1];
  const result = edit(original, { restBeats: 0, startingChords: true }, next.onsetBeat - 1).state;
  assert.equal(result.timeline.rounds[1], next);
  assert.equal(result.timeline.rounds[2].onsetBeat, next.endBeat);
  assert.equal(result.timeline.rounds[2].commitment!.settings.startingChords, true);
});
test('count-in edits wait for restart; live controls preserve musical position', () => {
  const original = createSequence(settings);
  const countIn = edit(original, { countIn: 8 }, 1);
  assert.equal(countIn.effect, 'live');
  assert.equal(countIn.state.timeline.spec.countIn, 4);
  const tempo = edit(countIn.state, { bpm: 60 }, 7);
  assert.equal(tempo.position, 7);
  assert.equal(tempo.state.timeline.rounds, original.timeline.rounds);
  const restart = transitionSequence(tempo.state, { type: 'restart' });
  assert.equal(restart.state.timeline.spec.countIn, 8);
  assert.equal(restart.position, 0);
});
test('paused edits preserve their round; completion remains complete until explicitly restarted', () => {
  const original = createSequence(settings);
  const paused = edit(original, { repeatTwice: true }, 5, 'paused');
  assert.equal(paused.state.timeline.rounds[0], original.timeline.rounds[0]);
  assert.equal(paused.position, secondsAt(5, settings.bpm));
  const completed = edit(original, { repetitions: 4 }, original.timeline.totalBeats, 'complete');
  assert.equal(completed.effect, 'live');
  assert.equal(completed.state.timeline.totalBeats, original.timeline.totalBeats);
  const restart = transitionSequence(completed.state, { type: 'restart' });
  assert.equal(restart.state.timeline.rounds.length, 16);
});
test('reducing passes finishes the current round; exercise changes explicitly reset', () => {
  const original = createSequence(settings);
  const current = original.timeline.rounds[5];
  assert.equal(
    edit(original, { repetitions: 1 }, current.onsetBeat + 1).state.timeline.totalBeats,
    current.endBeat
  );
  const changed = edit(original, { pattern: 'rossini', high: 84 }, 7);
  assert.equal(changed.effect, 'reset');
  assert.equal(changed.position, 0);
  assert.equal(changed.state.settings.pattern, 'rossini');
  assert.throws(() => edit(original, { high: 40 }, 7));
  assert.equal(original.settings.high, 75);
});

test('repeat refreshes round options while navigation uses the updated timeline', () => {
  const original = createSequence(settings);
  const current = original.timeline.rounds[1];
  const changed = edit(
    original,
    { startingChords: true, restBeats: 6 },
    current.onsetBeat + 1
  ).state;
  const position = secondsAt(current.onsetBeat + 1, settings.bpm);
  const repeat = transitionSequence(changed, { type: 'repeat', position });
  assert.equal(repeat.effect, 'play');
  assert.notEqual(
    repeat.state.timeline.rounds[1].commitment!.identity,
    current.commitment!.identity
  );
  assert.equal(repeat.state.timeline.rounds[1].commitment!.settings.startingChords, true);
  assert.equal(repeat.state.timeline.rounds[0], original.timeline.rounds[0]);
  assert.equal(repeat.position, secondsAt(current.onsetBeat, settings.bpm));
  assert.equal(repeat.restBeats, 6);
  const next = transitionSequence(changed, { type: 'move', position, step: 1 });
  assert.equal(next.effect, 'seek');
  assert.equal(next.position, secondsAt(changed.timeline.rounds[2].onsetBeat, settings.bpm));
  const last = changed.timeline.rounds.at(-1)!;
  assert.equal(
    transitionSequence(changed, {
      type: 'move',
      position: secondsAt(last.onsetBeat, settings.bpm),
      step: 1,
    }).effect,
    'live'
  );
});

test('sidebar exercise identity, rather than a musical variant, determines reset', () => {
  for (const [pattern, variant] of [
    ['pentatonic6', 'pentatonic9'],
    ['fifthGlide', 'octaveGlide'],
    ['major', 'fiveNote'],
  ] as const) {
    const original = createSequence({ ...settings, pattern, high: 84 });
    const current = original.timeline.rounds[0];
    const result = edit(original, { pattern: variant }, current.onsetBeat + 1);
    assert.equal(result.effect, 'replace-future');
    assert.equal(result.state.timeline.rounds[0], current);
    assert.equal(result.state.settings.pattern, variant);
  }
});

test('the running count-in stays committed while not-yet-started round content can change', () => {
  const original = createSequence(settings);
  const result = edit(original, { startingChords: true, countIn: 8 }, 1);
  assert.equal(result.effect, 'replace-future');
  assert.equal(result.state.timeline.spec.countIn, 4);
  assert.equal(result.state.settings.countIn, 8);
  assert.equal(result.state.timeline.rounds[0].onsetBeat, 4);
  assert.equal(result.state.timeline.rounds[0].commitment!.settings.startingChords, true);
  assert.ok(result.state.timeline.rounds[0].commitment!.identity >= original.nextRoundId);
  assert.equal(result.protectedThrough, 4);
  assert.equal(result.position, secondsAt(1, settings.bpm));
});

test('Repeat uses current options for every exercise, including after completion', () => {
  for (const pattern of Object.keys(PATTERNS) as Pattern[]) {
    const original = createSequence({ ...settings, pattern, low: 48, high: 84 });
    const current = original.timeline.rounds.at(-1)!;
    const changed = edit(
      original,
      { startingChords: true, repeatTwice: true, restBeats: 5, countIn: 8 },
      original.timeline.totalBeats,
      'complete'
    ).state;
    const result = transitionSequence(changed, {
      type: 'repeat',
      position: secondsAt(original.timeline.totalBeats, settings.bpm),
    });
    const repeated = result.state.timeline.rounds[current.id];
    assert.notEqual(repeated.commitment!.identity, current.commitment!.identity, pattern);
    assert.equal(repeated.commitment!.anchor, current.commitment!.anchor, pattern);
    assert.equal(repeated.commitment!.settings.repeatTwice, true, pattern);
    assert.equal(result.state.timeline.spec.countIn, 4, pattern);
    assert.equal(result.restBeats, 5, pattern);
    assert.equal(result.state.timeline.rounds.length, original.timeline.rounds.length, pattern);
    assert.ok(
      result.state.timeline.notes
        .filter((note) => note.onsetBeat >= repeated.onsetBeat)
        .every((note) => note.id >= original.nextNoteId),
      pattern
    );
  }
});

test('Repeat keeps its pitch outside the edited range and ends without an invalid continuation', () => {
  const original = createSequence(settings);
  const current = original.timeline.rounds[0];
  const changed = edit(
    original,
    { low: 62, high: 77, startingChords: true },
    current.onsetBeat + 1
  ).state;
  const repeat = transitionSequence(changed, {
    type: 'repeat',
    position: secondsAt(current.onsetBeat + 1, settings.bpm),
  });
  assert.equal(repeat.state.timeline.rounds.length, 1);
  assert.equal(repeat.state.timeline.rounds[0].commitment!.anchor, 60);
  assert.equal(repeat.state.timeline.rounds[0].commitment!.settings.startingChords, true);
  assert.equal(
    Math.min(...phrasePitches(repeat.state.timeline, repeat.state.timeline.rounds[0])),
    60
  );
});
