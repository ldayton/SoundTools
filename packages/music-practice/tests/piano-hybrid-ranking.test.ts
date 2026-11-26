import test from "node:test";
import assert from "node:assert/strict";
import {
  hybridCandidateSet,
  hybridNeuralPlan,
  hybridObjective,
  hybridAcceptance,
  pianoMovementComplexity,
  type HybridHands,
  type HybridMetrics,
} from "../test-fixtures/piano-hybrid-ranking";
import {
  planPianoPhrase,
  type PianoPhraseNote,
} from "../src/piano-phrase-fingering";
import { neuralContacts } from "../test-fixtures/piano-neural-comparison";

test("guarded ranking refuses added moves or equal-complexity renumbering regardless of likelihood", () => {
  const added = candidates(melody, [5, 1, 5, 1], 0, -1000);
  const guarded = hybridNeuralPlan(
    melody,
    added,
    60,
    0,
    "reduce-movement-complexity",
  );
  assert.equal(guarded.decisions.right!.selected, "classic");
  assert.equal(
    guarded.decisions.right!.candidates.find((c) => c.id === "beam-0")!.status,
    "movement-regression",
  );
  const stable = melody.slice(0, 2),
    equal = candidates(stable, [2, 3], 0, -1000);
  const previous = hybridNeuralPlan(
    stable,
    equal,
    60,
    0,
    "preserve-movement-complexity",
  );
  assert.equal(previous.decisions.right!.selected, "beam-0");
  const strict = hybridNeuralPlan(stable, equal, 60, 0);
  assert.equal(strict.decisions.right!.selected, "classic");
  assert.equal(
    strict.decisions.right!.candidates.find((c) => c.id === "beam-0")!.status,
    "no-simplification",
  );
});
test("strict guard still selects a candidate that reduces crossings without adding moves", () => {
  const notes = [60, 62, 64, 65, 67, 69].map((midi, i) => ({
    ...melody[0],
    id: `a${i}`,
    midi,
    start: i,
  }));
  const p = candidates(notes, [2, 3, 4, 5, 1, 2], 0, -1000);
  const baseline = planPianoPhrase(notes, { bpm: 60 });
  assert.deepEqual(pianoMovementComplexity(baseline.hands.right), {
    relocations: 1,
    crossings: 1,
    repeatChanges: 0,
  });
  const result = hybridNeuralPlan(
    notes,
    p,
    60,
    0.1,
    "reduce-movement-complexity",
  );
  assert.equal(result.decisions.right!.selected, "beam-0");
  assert.deepEqual(pianoMovementComplexity(result.plan.hands.right), {
    relocations: 1,
    crossings: 0,
    repeatChanges: 0,
  });
  const renamed = notes.map((n) => ({ ...n, id: "renamed-" + n.id }));
  const translated = hybridNeuralPlan(
    renamed,
    candidates(renamed, [2, 3, 4, 5, 1, 2], 0, -1000),
    60,
    0.1,
    "reduce-movement-complexity",
  );
  assert.deepEqual(
    translated.plan.notes.map((n) => n.finger),
    result.plan.notes.map((n) => n.finger),
  );
});
test("complexity counts crossings and repeat changes independently of relocations", () => {
  const hand = structuredClone(
    planPianoPhrase(melody, { bpm: 60 }).hands.right,
  );
  hand.states[0].events = [
    { at: 0, kind: "move", noteIds: [] },
    { at: 0, kind: "thumb_under", noteIds: [] },
    { at: 0, kind: "finger_over", noteIds: [] },
    { at: 0, kind: "repeat_change", noteIds: [] },
    { at: 0, kind: "substitution", noteIds: [] },
  ];
  assert.deepEqual(pianoMovementComplexity(hand), {
    relocations: 1,
    crossings: 2,
    repeatChanges: 1,
  });
});
const melody: PianoPhraseNote[] = [60, 62, 64, 65].map((midi, i) => ({
  id: `n${i}`,
  hand: "right",
  midi,
  start: i,
  duration: 1,
}));
function candidates(
  notes: readonly PianoPhraseNote[],
  fingers: number[],
  neuralLogProbability = -0.1,
  classicLogProbability = -1,
): HybridHands {
  const contacts = neuralContacts(notes).filter((n) => n.hand === "right");
  const result = hybridCandidateSet(
    notes,
    {
      right: {
        contacts: contacts.map((n) => n.id),
        candidates: [{ fingers, logProbability: neuralLogProbability }],
        elapsedMs: 0,
      },
    },
    60,
  );
  for (const c of result.right!.candidates)
    if (c.source === "classic") c.logProbability = classicLogProbability;
  return result;
}
test("hybrid ranking trades real physical cost against likelihood and retains classic", () => {
  const p = candidates(melody, [5, 1, 5, 1]);
  const neural = hybridNeuralPlan(melody, p, 60, 0, "unrestricted"),
    physical = hybridNeuralPlan(melody, p, 60, 100, "unrestricted");
  assert.equal(neural.decisions.right!.selected, "beam-0");
  assert.deepEqual(
    neural.plan.notes.map((n) => n.finger),
    [5, 1, 5, 1],
  );
  assert.equal(physical.decisions.right!.selected, "classic");
  assert.deepEqual(
    physical.plan.notes,
    planPianoPhrase(melody, { bpm: 60 }).notes,
  );
  const audits = neural.decisions.right!.candidates;
  assert.ok(
    audits.find((c) => c.id === "beam-0")!.physicalCost! >
      audits.find((c) => c.id === "classic")!.physicalCost!,
  );
  assert.equal(hybridObjective(-8, 20, 4, 0.1), 2.5);
});
test("exhaustive two-contact shortlist ranking agrees with an independent objective oracle", () => {
  const notes = melody.slice(0, 2),
    p = candidates(notes, [1, 2], -1, -5);
  const options = [
    [1, 2],
    [2, 3],
    [3, 4],
    [4, 5],
    [5, 1],
    [1, 5],
  ];
  p.right!.candidates = p
    .right!.candidates.filter((c) => c.source === "classic")
    .concat(
      options.map((fingers, i) => ({
        id: `beam-${i}`,
        source: "neural" as const,
        fingers,
        logProbability: -1 - i * 0.2,
      })),
    );
  const seen = new Set<string>();
  const expected = p
    .right!.candidates.flatMap((c) => {
      if (seen.has(c.fingers.join())) return [];
      seen.add(c.fingers.join());
      const fixed = planPianoPhrase(
        notes.map((n, i) => ({ ...n, finger: c.fingers[i] })),
        { bpm: 60 },
      );
      return fixed.status === "complete"
        ? [{ id: c.id, objective: (-c.logProbability + 0.1 * fixed.cost) / 2 }]
        : [];
    })
    .sort((a, b) => a.objective - b.objective);
  const actual = hybridNeuralPlan(notes, p, 60, 0.1, "unrestricted");
  assert.equal(actual.decisions.right!.selected, expected[0].id);
});
test("duplicates and exact objective ties retain classic independently of input ordering", () => {
  const baseline = planPianoPhrase(melody, { bpm: 60 }),
    digits = baseline.notes.map((n) => n.finger);
  const p = candidates(melody, digits, -1, -1);
  p.right!.candidates.reverse();
  const result = hybridNeuralPlan(melody, p, 60, 0.1);
  assert.equal(result.decisions.right!.selected, "classic");
  assert.equal(
    result.decisions.right!.candidates.find((c) => c.id === "beam-0")!.status,
    "duplicate",
  );
  const tie = candidates(melody, [5, 1, 5, 1], -1, -1);
  assert.equal(
    hybridNeuralPlan(melody, tie, 60, 0).decisions.right!.selected,
    "classic",
  );
});
test("physical conflicts lose even with overwhelmingly favorable neural likelihood", () => {
  const held: PianoPhraseNote[] = [
    { ...melody[0], duration: 2 },
    { ...melody[1], midi: 64 },
  ];
  const p = candidates(held, [1, 1], 0, -1000),
    result = hybridNeuralPlan(held, p, 60, 0.1);
  assert.equal(result.decisions.right!.selected, "classic");
  assert.equal(
    result.decisions.right!.candidates.find((c) => c.id === "beam-0")!.status,
    "physical-conflict",
  );
  assert.equal(result.plan.notes.length, 2);
});
test("ties, unisons, source anchors and note metadata survive whole-hand ranking", () => {
  const notes: PianoPhraseNote[] = [
    { ...melody[0], finger: 2, voice: "inner", phraseStart: true },
    { ...melody[0], id: "unison", duration: 0.5, finger: 2 },
    {
      ...melody[0],
      id: "tie",
      start: 1,
      duration: 1,
      tieFrom: "n0",
      finger: 2,
      notatedDuration: 2,
    },
  ];
  const p = candidates(notes, [2], -1, -1),
    snapshot = JSON.stringify({ notes, p });
  const result = hybridNeuralPlan(notes, p, 60, 0.1);
  assert.equal(result.plan.notes.length, 3);
  assert.ok(result.plan.notes.every((n) => n.finger === 2));
  for (const source of notes) {
    const actual = result.plan.notes.find((n) => n.id === source.id)!;
    for (const key of Object.keys(source) as (keyof PianoPhraseNote)[])
      assert.equal(actual[key], source[key]);
  }
  assert.equal(JSON.stringify({ notes, p }), snapshot);
  const bad = structuredClone(p);
  bad.right!.candidates[0].fingers = [1];
  assert.throws(() => hybridNeuralPlan(notes, bad, 60, 0.1));
});
test("cross-hand key conflicts remain explicitly unsupported", () => {
  const notes: PianoPhraseNote[] = [
    { ...melody[0] },
    { ...melody[0], id: "left", hand: "left" },
  ];
  const pred = {
    right: {
      contacts: ["n0"],
      candidates: [
        {
          id: "beam-0",
          source: "neural" as const,
          fingers: [1],
          logProbability: 0,
        },
      ],
    },
    left: {
      contacts: ["left"],
      candidates: [
        {
          id: "beam-0",
          source: "neural" as const,
          fingers: [5],
          logProbability: 0,
        },
      ],
    },
  };
  const result = hybridNeuralPlan(notes, pred, 60, 0.1);
  assert.equal(result.plan.status, "unsupported");
  assert.equal(result.plan.notes.length, 0);
  assert.equal(result.decisions.right!.selected, null);
  assert.equal(result.decisions.left!.selected, null);
});
test("an unsupported hand never removes the supported opposite hand", () => {
  const notes: PianoPhraseNote[] = [
    ...Array.from({ length: 6 }, (_, i) => ({
      ...melody[0],
      id: `r${i}`,
      midi: 60 + i,
    })),
    { ...melody[0], id: "left", hand: "left", midi: 48 },
  ];
  const result = hybridCandidateSet(
    notes,
    {
      right: {
        contacts: notes.slice(0, 6).map((n) => n.id),
        candidates: [{ fingers: [1, 2, 3, 4, 5, 5], logProbability: -1 }],
        elapsedMs: 0,
      },
      left: {
        contacts: ["left"],
        candidates: [{ fingers: [5], logProbability: -1 }],
        elapsedMs: 0,
      },
    },
    60,
  );
  for (const candidate of result.left!.candidates)
    candidate.logProbability = -1;
  const ranked = hybridNeuralPlan(notes, result, 60, 0.1);
  assert.equal(ranked.plan.status, "partial");
  assert.equal(ranked.plan.hands.right.diagnostic!.code, "too_many_keys");
  assert.equal(ranked.plan.hands.left.status, "complete");
  assert.deepEqual(
    ranked.plan.notes.map((n) => n.id),
    ["left"],
  );
});
test("a physically ordered chord must also pass the planner's reach constraints", () => {
  const notes: PianoPhraseNote[] = [
    melody[0],
    { ...melody[0], id: "upper", midi: 67 },
  ];
  const result = hybridNeuralPlan(
    notes,
    candidates(notes, [4, 5], 0, -1000),
    60,
    0.1,
  );
  assert.equal(result.decisions.right!.selected, "classic");
  assert.equal(
    result.decisions.right!.candidates.find((c) => c.id === "beam-0")!.status,
    "unsupported",
  );
});
test("invalid or unscored likelihoods, identities and missing classic candidates fail closed", () => {
  const p = candidates(melody, [5, 1, 5, 1]);
  for (const value of [NaN, Infinity, 0.1]) {
    const bad = structuredClone(p);
    bad.right!.candidates[0].logProbability = value;
    assert.throws(() => hybridNeuralPlan(melody, bad, 60, 0.1));
  }
  const changed = structuredClone(p);
  changed.right!.candidates[0].fingers = [5, 1, 5, 1];
  assert.throws(() => hybridNeuralPlan(melody, changed, 60, 0.1));
  const missing = structuredClone(p);
  missing.right!.candidates.shift();
  assert.throws(() => hybridNeuralPlan(melody, missing, 60, 0.1));
  const identities = structuredClone(p);
  identities.right!.contacts.reverse();
  assert.throws(() => hybridNeuralPlan(melody, identities, 60, 0.1));
  assert.throws(() => hybridNeuralPlan(melody, {}, 60, 0.1));
  assert.throws(() => hybridObjective(0, 0, 0, 0.1));
  assert.throws(() => hybridObjective(0, 0, 1, -1));
});
test("automated promotion cannot hide printed, family, sequence or safety regressions", () => {
  const baseline: HybridMetrics = {
    matches: 100,
    printedMatches: 60,
    covered: 150,
    feasibleHands: 10,
    completeCases: 2,
    completeHands: 3,
    matchedTransitions: 50,
    basicViolations: 0,
    familyMatches: { scales: 60, chords: 40 },
  };
  const passing = {
    ...baseline,
    matches: 101,
    familyMatches: { scales: 61, chords: 40 },
  };
  assert.ok(hybridAcceptance(baseline, passing).every((g) => g.passed));
  for (const key of [
    "printedMatches",
    "covered",
    "feasibleHands",
    "completeCases",
    "completeHands",
    "matchedTransitions",
  ] as const)
    assert.ok(
      hybridAcceptance(baseline, { ...passing, [key]: baseline[key] - 1 }).some(
        (g) => !g.passed && g.id === key,
      ),
    );
  assert.ok(
    hybridAcceptance(baseline, {
      ...passing,
      familyMatches: { scales: 70, chords: 39 },
    }).some((g) => !g.passed && g.id === "family:chords"),
  );
  assert.ok(
    hybridAcceptance(baseline, { ...passing, basicViolations: 1 }).some(
      (g) => !g.passed && g.id === "basicViolations",
    ),
  );
  assert.ok(
    hybridAcceptance(baseline, baseline).some(
      (g) => !g.passed && g.id === "matches",
    ),
  );
});
