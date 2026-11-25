// SPDX-License-Identifier: MIT
import test from "node:test";
import assert from "node:assert/strict";
import corpus from "../test-fixtures/external/musicxml-suite/phrases.json";
import { planGuitarPhrase } from "../src/guitar-phrase-fingering";

for (const phrase of corpus.phrases) {
  test(`MusicXML ${phrase.id}: complete phrase preserves every pitch, chord and rest`, () => {
    const plan = planGuitarPhrase(phrase.notes)!;
    assert.ok(plan);
    assert.equal(plan.notes.length, phrase.id === "P1" ? 10 : 7);
    assert.deepEqual(
      plan.notes.map((n) => [n.id, n.start, n.duration, n.string, n.fret]),
      phrase.notes.map((n) => [n.id, n.start, n.duration, n.string, n.fret]),
    );
    for (const note of plan.notes) {
      assert.equal(
        phrase.tuning[6 - note.string] + note.fret,
        phrase.notes.find((n) => n.id === note.id)!.midi,
      );
      assert.equal(note.fret === 0, note.finger === 0);
    }
    for (const state of plan.states) {
      const active = phrase.notes.filter(
        (n) => n.start <= state.at && n.start + n.duration > state.at,
      );
      assert.deepEqual(
        Object.keys(state.fingers).sort(),
        active.map((n) => n.id).sort(),
      );
      assert.equal(new Set(active.map((n) => n.string)).size, active.length);
    }
    assert.equal(plan.states.at(-1)!.until, 8);
    for (const rest of phrase.rests) {
      const state = plan.states.find((s) => s.at === rest.start)!;
      assert.ok(state);
      assert.deepEqual(state.fingers, {});
      assert.equal(state.until, rest.start + rest.duration);
    }
    if (phrase.id === "P1")
      assert.equal(
        Object.keys(plan.states.find((s) => s.at === 4)!.fingers).length,
        3,
      );
  });
  test(`MusicXML ${phrase.id}: time translation preserves decisions and cost`, () => {
    const base = planGuitarPhrase(phrase.notes)!,
      shifted = planGuitarPhrase(
        phrase.notes.map((n) => ({ ...n, start: n.start + 32 })),
      )!;
    assert.deepEqual(
      shifted.notes.map((n) => [n.finger, n.position]),
      base.notes.map((n) => [n.finger, n.position]),
    );
    assert.equal(shifted.cost, base.cost);
    assert.deepEqual(
      shifted.states.map((s) => ({ ...s, at: s.at - 32, until: s.until - 32 })),
      base.states,
    );
  });
  test(`MusicXML ${phrase.id}: tied segmentation does not invent a new hand change`, () => {
    const base = planGuitarPhrase(phrase.notes)!;
    const [first, ...rest] = phrase.notes;
    const split = planGuitarPhrase([
      { ...first, duration: first.duration / 2 },
      {
        ...first,
        id: first.id + "-tie",
        start: first.start + first.duration / 2,
        duration: first.duration / 2,
        tieFrom: first.id,
      },
      ...rest,
    ])!;
    assert.deepEqual(split.states, base.states);
    assert.equal(split.cost, base.cost);
    assert.equal(split.notes[0].finger, split.notes[1].finger);
  });
  test(`MusicXML ${phrase.id}: input order cannot change the complete hand path`, () => {
    const base = planGuitarPhrase(phrase.notes)!,
      reverse = planGuitarPhrase([...phrase.notes].reverse())!;
    assert.deepEqual(reverse.states, base.states);
    assert.equal(reverse.cost, base.cost);
    assert.deepEqual(reverse.notes.reverse(), base.notes);
  });
}
