import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SPEC,
  generateExercise,
  glideOffset,
  notePitchAt,
  practiceAt,
  secondsAt,
} from '../src/music';
import { audioEvents } from '../src/audio-timeline';
import { keyboardRange } from '../src/keyboard-layout';
import { Midi, exportMidi } from '../src/midi';

test('glides sweep continuously within the chosen range, with the usual chord intro and one continuous source per round', () => {
  for (const [pattern, span] of [
    ['fifthGlide', 7],
    ['octaveGlide', 12],
  ] as const) {
    const spec = {
      ...DEFAULT_SPEC,
      pattern,
      low: 52,
      high: 53 + span,
      repetitions: 2,
      countIn: 8,
      restBeats: 2,
    };
    const exercise = generateExercise(spec);
    assert.deepEqual(
      exercise.rounds.map((r) => r.midi),
      [52, 53, 52, 53]
    );
    assert.equal(exercise.notes.length, 32);
    const reference = generateExercise({ ...spec, pattern: 'arpeggio' });
    assert.deepEqual(exercise.notes.slice(0, 7), reference.notes.slice(0, 7));
    const withoutChords = generateExercise({ ...spec, startingChords: false });
    assert.equal(withoutChords.notes.length, 4);
    assert.equal(withoutChords.notes[0].onsetBeat, 8);
    assert.equal(withoutChords.notes[0].durationBeats, 14);
    const cue = exercise.notes[0],
      glide = exercise.notes[7];
    assert.equal(cue.glideSpan, undefined);
    assert.equal(glide.glideSpan, span);
    assert.equal(glide.onsetBeat, 14);
    assert.equal(glide.durationBeats, glide.slotBeats);
    for (const [progress, pitch] of [
      [0, 52],
      [4 / 14, 52 + span / 2],
      [7 / 14, 52 + span],
      [10 / 14, 52 + span / 2],
      [1, 52],
    ])
      assert.ok(
        Math.abs(notePitchAt(glide, glide.onsetBeat + progress * glide.slotBeats) - pitch) < 1e-8
      );
    const mobile = keyboardRange(exercise, exercise.rounds[0], true);
    assert.ok(mobile.low <= 52 && mobile.high >= 52 + span);
    assert.equal(practiceAt(exercise, secondsAt(15, spec.bpm)).current.midi, 52);
    const offset = secondsAt(18, spec.bpm);
    const resumed = audioEvents(exercise, offset)[0];
    assert.equal(resumed.kind, 'glide');
    assert.equal(resumed.glide?.span, span);
    assert.equal(resumed.time, 0);
    assert.ok(Math.abs(resumed.elapsed - secondsAt(4, spec.bpm)) < 1e-8);
    assert.ok(Math.abs(resumed.duration + resumed.elapsed - resumed.glide!.duration) < 1e-8);
    assert.throws(() => generateExercise({ ...spec, high: 52 + span - 1 }), /range/);
    const midi = new Midi(exportMidi(exercise));
    assert.equal(midi.tracks[0].notes.length, 28);
    const cello = midi.tracks.find((t) => t.name === 'Cello glides')!;
    assert.equal(cello.notes.length, 4);
    assert.equal(cello.instrument.number, 42);
    assert.ok(Math.abs(Math.max(...cello.pitchBends.map((b) => b.value)) - span / 12) < 0.001);
    assert.equal(cello.pitchBends.at(-1)!.value, 0);
  }
});
test('glide pitch has smooth endpoints and no overshoot', () => {
  for (let i = 0; i <= 1100; i++)
    assert.ok(glideOffset(i / 1100, 12) >= 0 && glideOffset(i / 1100, 12) <= 12);
  for (const t of [0, 2 / 14, 6 / 14, 8 / 14, 12 / 14, 1])
    assert.ok(Math.abs(glideOffset(t + 1e-6, 12) - glideOffset(t - 1e-6, 12)) < 1e-6);
});

test('descending glides start high and finish low without returning up', () => {
  for (const [pattern, span] of [
    ['fifthGlide', 7],
    ['octaveGlide', 12],
  ] as const) {
    const spec = {
      ...DEFAULT_SPEC,
      pattern,
      direction: 'down',
      low: 52,
      high: 53 + span,
      countIn: 8,
      repetitions: 2,
    };
    const e = generateExercise(spec);
    assert.deepEqual(
      e.rounds.map((r) => r.midi),
      [53 + span, 52 + span, 53 + span, 52 + span]
    );
    const glides = e.notes.filter((n) => n.glideSpan);
    assert.equal(glides.length, 4);
    for (const n of glides) {
      assert.equal(n.glideSpan, -span);
      assert.equal(notePitchAt(n, n.onsetBeat), n.midi);
      assert.equal(n.slotBeats, 8);
      assert.equal(notePitchAt(n, n.onsetBeat + n.slotBeats * 0.75), n.midi - span);
      assert.equal(notePitchAt(n, n.onsetBeat + n.slotBeats), n.midi - span);
      let previous = n.midi;
      for (let i = 0; i <= 100; i++) {
        const pitch = notePitchAt(n, n.onsetBeat + (n.slotBeats * i) / 100);
        assert.ok(pitch <= previous + 1e-9);
        previous = pitch;
      }
      const range = keyboardRange(e, e.rounds[glides.indexOf(n)], true);
      assert.ok(range.low <= n.midi - span && range.high >= n.midi);
    }
    const reference = generateExercise({
      ...spec,
      pattern: span === 12 ? 'octaveArpeggio' : 'fiveNote',
    });
    assert.deepEqual(e.notes.slice(0, 8), reference.notes.slice(0, 8));
    const midi = new Midi(exportMidi(e));
    const cello = midi.tracks.find((t) => t.name === 'Cello glides')!;
    assert.ok(Math.abs(Math.min(...cello.pitchBends.map((p) => p.value)) + span / 12) < 0.001);
    assert.ok(cello.pitchBends.every((p) => p.value <= 0));
    assert.equal(cello.pitchBends.at(-1)!.value, 0);
    assert.match(e.title!, /Descending/);
  }
});

test('independent glide choices have matching visual, audio and MIDI endpoints', () => {
  for (const pattern of ['fifthGlide', 'octaveGlide'] as const) {
    const span = pattern === 'fifthGlide' ? 7 : 12;
    for (const direction of ['up', 'down', 'both'] as const) {
      for (const progression of ['up', 'down', 'both'] as const) {
        const e = generateExercise({
          ...DEFAULT_SPEC,
          pattern,
          direction,
          progression,
          low: 52,
          high: 54 + span,
          countIn: 0,
          startingChords: false,
          repetitions: 1,
        });
        for (const n of e.notes) {
          assert.equal(n.glideReturns, direction === 'both');
          assert.equal(n.slotBeats, direction === 'both' ? 14 : 8);
          const end = notePitchAt(n, n.onsetBeat + n.slotBeats);
          assert.equal(end, n.midi + (direction === 'both' ? 0 : n.glideSpan!));
          if (direction !== 'both') {
            let previous = n.midi;
            for (let i = 0; i <= 100; i++) {
              const pitch = notePitchAt(n, n.onsetBeat + (n.slotBeats * i) / 100);
              assert.ok(direction === 'up' ? pitch >= previous - 1e-9 : pitch <= previous + 1e-9);
              previous = pitch;
            }
          }
        }
        assert.ok(
          audioEvents(e, 0)
            .filter((event) => event.glide)
            .every((event) => event.glide!.returns === (direction === 'both'))
        );
        const cello = new Midi(exportMidi(e)).tracks.find(
          (track) => track.name === 'Cello glides'
        )!;
        assert.equal(cello.pitchBends.at(-1)!.value, 0);
        assert.ok(cello.pitchBends.some((bend) => Math.abs(bend.value) > 0.5));
      }
    }
  }
});
