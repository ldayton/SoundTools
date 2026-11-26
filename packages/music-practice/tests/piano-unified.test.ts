import test from "node:test";
import assert from "node:assert/strict";
import {
  planPianoPhrase,
  planPianoPhraseRanked,
  pianoPhraseContacts,
  type PianoPhraseNote,
} from "../src/piano-phrase-fingering";
import {
  planUnifiedPianoPhrase,
  analyzePianoContexts,
} from "../research/chirality/unified";
import { parncuttUniformWeights } from "../research/chirality/rules";
import { neuralPhysicalViolations } from "../test-fixtures/piano-neural-comparison";
const notes = (pitches: number[]): PianoPhraseNote[] =>
  pitches.map((midi, i) => ({
    id: String(i),
    hand: "right",
    midi,
    start: i,
    duration: 1,
    voice: "melody",
  }));
test("canonical contacts retain source IDs, exact ties, unisons and clock semantics", () => {
  const input = [
    { ...notes([60])[0], finger: 2 },
    {
      id: "alias",
      hand: "right" as const,
      midi: 60,
      start: 0,
      duration: 1,
      voice: "other",
    },
    {
      id: "tie",
      hand: "right" as const,
      midi: 60,
      start: 1,
      duration: 1,
      tieFrom: "0",
    },
  ];
  const before = JSON.stringify(input),
    result = pianoPhraseContacts(input);
  assert.equal(result.contacts.length, 1);
  assert.deepEqual([...result.contacts[0].noteIds].sort(), [
    "0",
    "alias",
    "tie",
  ]);
  assert.equal(result.contacts[0].end, 2);
  assert.equal(result.contacts[0].voice, undefined);
  assert.equal(JSON.stringify(input), before);
  result.contacts[0].noteIds.push("mutation");
  assert.equal(pianoPhraseContacts(input).contacts[0].noteIds.length, 3);
});
test("idioms derive from musical structure, preserving closed positions and chromatic runs", () => {
  for (const input of [
    notes([60, 62, 64, 65, 67, 65, 64, 62, 60]),
    notes([60, 61, 62, 63, 64, 65, 66, 67]),
  ]) {
    const ctx = analyzePianoContexts(input);
    assert.ok([...ctx.context.values()].every((c) => c.idiom !== "general"));
    assert.deepEqual(
      planUnifiedPianoPhrase(input, parncuttUniformWeights).plan,
      planPianoPhrase(input),
    );
  }
  const arpeggio = notes([60, 64, 67, 72, 76, 79]);
  assert.ok(
    [...analyzePianoContexts(arpeggio).context.values()].every(
      (c) => c.idiom === "general",
    ),
  );
  const renamed = arpeggio.map((n) => ({ ...n, id: "renamed:" + n.id }));
  assert.deepEqual(
    [...analyzePianoContexts(arpeggio).context.values()].map((c) => c.idiom),
    [...analyzePianoContexts(renamed).context.values()].map((c) => c.idiom),
  );
});
test("unified history objective keeps the exact optimum across different two-attack histories", () => {
  const input = notes([60, 62, 64]),
    objective = {
      local: () => 0,
      edge: () => 0,
      melodic: (h: any[], n: any) =>
        h.length === 2 &&
        h[0].finger === 5 &&
        h[1].finger === 4 &&
        n.finger === 3
          ? -1000
          : 0,
    };
  const selected = planPianoPhraseRanked(input, objective);
  assert.equal(selected.status, "complete");
  assert.deepEqual(
    selected.notes.map((n) => n.finger),
    [5, 4, 3],
  );
  let best = Infinity;
  for (let a = 1; a <= 5; a++)
    for (let b = 1; b <= 5; b++)
      for (let c = 1; c <= 5; c++) {
        const fixed = input.map((n, i) => ({ ...n, finger: [a, b, c][i] })),
          p = planPianoPhraseRanked(fixed, objective);
        if (p.status === "complete")
          best = Math.min(
            best,
            p.cost + (a === 5 && b === 4 && c === 3 ? -1000 : 0),
          );
      }
  assert.ok(Math.abs(selected.cost - 1000 - best) < 1e-7);
});
test("rest/voice/chord boundaries reset melodic context while held contacts stay occupied", () => {
  const input = [
    {
      id: "hold",
      hand: "right" as const,
      midi: 55,
      start: 0,
      duration: 5,
      voice: "bass",
    },
    {
      id: "a",
      hand: "right" as const,
      midi: 60,
      start: 1,
      duration: 1,
      voice: "melody",
    },
    {
      id: "b",
      hand: "right" as const,
      midi: 62,
      start: 3,
      duration: 1,
      voice: "melody",
    },
  ];
  const seen: number[] = [];
  planPianoPhraseRanked(input, {
    local: () => 0,
    edge: () => 0,
    melodic: (h, n) => {
      if (n.id === "b") seen.push(h.length);
      return 0;
    },
  });
  assert.ok(seen.length);
  assert.ok(seen.every((n) => n === 0));
  const chord = [
    ...notes([60, 64, 67]),
    {
      id: "chord",
      hand: "right" as const,
      midi: 72,
      start: 1,
      duration: 1,
      voice: "melody",
    },
  ];
  assert.equal(analyzePianoContexts(chord).context.get("1")?.idiom, "grip");
});
test("unified planning reserves held fingers, respects anchors and returns complete safe fallback", () => {
  const input = [
    ...notes([60, 64, 67, 72, 76, 79]),
    {
      id: "bass",
      hand: "left" as const,
      midi: 36,
      start: 0,
      duration: 6,
      finger: 5,
    },
  ];
  input[0].finger = 1;
  const before = JSON.stringify(input),
    result = planUnifiedPianoPhrase(input, parncuttUniformWeights);
  assert.equal(result.plan.status, "complete");
  assert.equal(result.plan.notes.find((n) => n.id === "0")?.finger, 1);
  assert.equal(result.plan.notes.find((n) => n.id === "bass")?.finger, 5);
  assert.equal(
    neuralPhysicalViolations(
      input,
      new Map(result.plan.notes.map((n) => [n.id, n.finger])),
    ).length,
    0,
  );
  assert.equal(JSON.stringify(input), before);
  const limited = planUnifiedPianoPhrase(input, parncuttUniformWeights, {
    maxTransitions: 150,
  });
  assert.ok(
    limited.decisions.right.startsWith("classic-fallback") ||
      limited.plan.hands.right.status === "unsupported",
  );
  const conflict = [
    ...input,
    { id: "collision", hand: "left" as const, midi: 60, start: 0, duration: 1 },
  ];
  assert.equal(
    planUnifiedPianoPhrase(conflict, parncuttUniformWeights).plan.status,
    "unsupported",
  );
});
