import test from "node:test";
import assert from "node:assert/strict";
import {
  pianoSignedSpan,
  pianoGestureFeatures,
  pianoGestureCost,
  type PianoAttackMemory,
} from "../src/piano-ergonomics";
import { planPianoPhrase } from "../src/piano-phrase-fingering";
import {
  loadPianoPlanner,
  pianoPlannerSources,
} from "../test-fixtures/piano-planner-loader";
const attacks = (
  midis = [64, 67, 72],
  fingers = [2, 3, 1],
): PianoAttackMemory[] =>
  midis.map((midi, i) => ({
    id: String(i),
    midi,
    finger: fingers[i],
    start: i,
    end: i + 1,
    voice: "melody",
  }));
const features = (a: PianoAttackMemory[]) =>
  pianoGestureFeatures(a[0], a[1], a[2], "right");
test("signed reference spans preserve thumb overlap and mirror both hands", () => {
  assert.deepEqual(pianoSignedSpan(1, 3, "right"), {
    comfortable: [-2, 10],
    practical: [-4, 12],
  });
  assert.deepEqual(pianoSignedSpan(3, 1, "right"), {
    comfortable: [-10, 2],
    practical: [-12, 4],
  });
  assert.deepEqual(pianoSignedSpan(1, 3, "left"), {
    comfortable: [-10, 2],
    practical: [-12, 4],
  });
  assert.deepEqual(pianoSignedSpan(2, 5, "right"), {
    comfortable: [2, 8],
    practical: [2, 10],
  });
  assert.deepEqual(pianoSignedSpan(4, 4, "left"), {
    comfortable: [0, 0],
    practical: [0, 0],
  });
});
test("complete gesture has independent numeric goldens, mirrored and reversed", () => {
  const a = attacks();
  assert.deepEqual(features(a), {
    positionChanges: 1,
    positionSize: 5,
    completedPivot: 1,
    unstablePivot: 0,
  });
  assert.equal(pianoGestureCost(a[0], a[1], a[2], "right"), -1.75);
  const mirrored = a.map((n) => ({ ...n, midi: 128 - n.midi }));
  assert.deepEqual(
    pianoGestureFeatures(mirrored[0], mirrored[1], mirrored[2], "left"),
    features(a),
  );
  const reversed = [...a]
    .reverse()
    .map((n, i) => ({ ...n, start: i, end: i + 1 }));
  assert.deepEqual(features(reversed), features(a));
  const thumbMiddle = attacks([67, 72, 76], [3, 1, 2]);
  assert.deepEqual(features(thumbMiddle), {
    positionChanges: 2,
    positionSize: 10,
    completedPivot: 1,
    unstablePivot: 0,
  });
});
test("an isolated crossing, repeated pivot, reversal or interrupted voice earns no completed-pivot credit", () => {
  for (const a of [
    attacks([64, 67, 72], [3, 1, 3]),
    attacks([64, 67, 65]),
    attacks([64, 67, 72], [5, 2, 1]),
    attacks().map((n, i) => ({ ...n, voice: i === 1 ? "other" : n.voice })),
    attacks().map((n, i) => ({ ...n, start: n.start + (i === 2 ? 1 : 0) })),
    attacks().map((n, i) => ({ ...n, isolated: i !== 0 })),
  ])
    assert.equal(features(a).completedPivot, 0);
  assert.equal(features(attacks([64, 67, 72], [4, 3, 1])).unstablePivot, 1);
});
const notes = (
  midis = [64, 67, 72],
  fingers: (number | undefined)[] = [2, 3, 1],
) =>
  attacks(midis).map((n, i) => ({
    id: n.id,
    hand: "right" as const,
    midi: n.midi,
    start: n.start,
    duration: 1,
    voice: n.voice,
    finger: fingers[i],
  }));
test("gesture weight is explicit; cost is itemized and hard digits remain authoritative", () => {
  const n = notes();
  const baseline = planPianoPhrase(n, { model: "ergonomic" });
  assert.deepEqual(
    planPianoPhrase(n, { model: "ergonomic", weights: { gesture: 0 } }),
    baseline,
  );
  const candidate = planPianoPhrase(n, {
    model: "ergonomic",
    weights: { gesture: 1 },
  });
  assert.equal(candidate.status, "complete");
  assert.equal(candidate.costs.gesture, -1.75);
  assert.equal(candidate.cost, baseline.cost - 1.75);
  assert.deepEqual(
    candidate.notes.map((n) => n.finger),
    [2, 3, 1],
  );
  for (const ns of [
    n.map((n, i) => ({ ...n, phraseStart: i === 2 })),
    n.map((n, i) => ({ ...n, voice: String(i) })),
    n.map((n, i) => ({ ...n, start: i * 2 })),
  ]) {
    const p = planPianoPhrase(ns, {
      model: "ergonomic",
      weights: { gesture: 1 },
    });
    assert.equal(p.status, "complete");
    assert.equal(p.costs.gesture, 0);
  }
});
test("compiling mutation of completed gesture is caught by its numeric witness", async () => {
  const token = "4 * f.completedPivot";
  assert.equal(pianoPlannerSources.ergonomics.split(token).length, 2);
  const mutant = await loadPianoPlanner({
    ...pianoPlannerSources,
    ergonomics: pianoPlannerSources.ergonomics.replace(
      token,
      "0 * f.completedPivot",
    ),
  });
  const p = mutant(notes(), { model: "ergonomic", weights: { gesture: 1 } });
  assert.notEqual(p.costs.gesture, -1.75);
});

import { exhaustiveErgonomicCost } from "../test-fixtures/piano-ergonomic-oracle";
for (const hand of ["left", "right"] as const)
  for (const midis of [
    [64, 67, 72],
    [72, 67, 64],
    [61, 65, 68],
    [60, 64, 67, 72],
  ])
    test(`independent exhaustive gesture optimum ${hand} ${midis}`, () => {
      const ns = midis.map((midi, i) => ({
        id: String(i),
        midi,
        hand,
        start: i * 0.25,
        duration: 0.25,
      }));
      const p = planPianoPhrase(ns, {
        model: "ergonomic",
        bpm: 60,
        weights: { gesture: 1 },
      });
      const expected = exhaustiveErgonomicCost(midis, hand, [], 1);
      assert.equal(p.status, "complete");
      assert.ok(expected.paths > 0);
      assert.ok(
        Math.abs(p.cost - expected.cost) < 1e-8,
        `${p.cost} vs ${expected.cost}`,
      );
      assert.ok(
        Math.abs(
          p.cost -
            p.hands[hand].states.reduce(
              (s, f) => s + Object.values(f.costs).reduce((a, b) => a + b, 0),
              0,
            ),
        ) < 1e-8,
      );
    });

test("held contacts never receive a monophonic gesture credit", () => {
  const ns = [
    {
      id: "held",
      hand: "right" as const,
      midi: 55,
      start: 0,
      duration: 4,
      finger: 1,
      voice: "bass",
    },
    ...[60, 64, 62].map((midi, i) => ({
      id: String(i),
      hand: "right" as const,
      midi,
      start: i,
      duration: 1,
      finger: i + 2,
      voice: "melody",
    })),
  ];
  const p = planPianoPhrase(ns, {
    model: "ergonomic",
    weights: { gesture: 1 },
  });
  assert.equal(p.status, "complete");
  assert.equal(p.costs.gesture, 0);
  assert.ok(p.hands.right.states.every((s) => s.fingers.held === 1));
  assert.equal(
    planPianoPhrase(notes(), {
      model: "ergonomic",
      weights: { gesture: 1 },
      maxTransitions: 1,
    }).hands.right.diagnostic?.code,
    "search_limit",
  );
});

import {
  scorePianoBenchmarkCase,
  type PianoBenchmarkCase,
} from "../test-fixtures/piano-benchmark";
test("sequence agreement counts complete annotated hands and cannot bridge missing labels or phrase breaks", () => {
  const ns = notes([60, 64, 67, 72], [1, 2, 3, 1]);
  const c: PianoBenchmarkCase = {
    id: "sequence",
    family: "synthetic",
    partition: "development",
    source: "ours",
    bpm: 60,
    notes: ns,
    labels: ns.map((n) => ({ id: n.id, finger: n.finger!, kind: "printed" })),
  };
  const p = planPianoPhrase(ns, { model: "ergonomic" });
  assert.equal(p.status, "complete");
  assert.deepEqual(scorePianoBenchmarkCase(c, p).sequence, {
    eligibleCases: 1,
    completeCases: 1,
    eligibleHands: 1,
    completeHands: 1,
    eligibleTransitions: 3,
    matchedTransitions: 3,
  });
  p.notes[2].finger = 4;
  assert.deepEqual(scorePianoBenchmarkCase(c, p).sequence, {
    eligibleCases: 1,
    completeCases: 0,
    eligibleHands: 1,
    completeHands: 0,
    eligibleTransitions: 3,
    matchedTransitions: 1,
  });
  c.notes[2].phraseStart = true;
  assert.equal(scorePianoBenchmarkCase(c, p).sequence.eligibleTransitions, 2);
  c.labels[2].kind = "flagged";
  assert.deepEqual(scorePianoBenchmarkCase(c, p).sequence, {
    eligibleCases: 1,
    completeCases: 1,
    eligibleHands: 1,
    completeHands: 1,
    eligibleTransitions: 1,
    matchedTransitions: 1,
  });
});

import { mkdtempSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
test("evaluation refuses validation after candidate sources change", () => {
  const dir = mkdtempSync(join(tmpdir(), "piano-gesture-freeze-"));
  try {
    const frozen = join(dir, "development.json"),
      output = join(dir, "validation.json");
    writeFileSync(
      frozen,
      JSON.stringify({
        stage: "development",
        sources: { core: "stale" },
        selectedWeight: 1,
        diagnosticWeight: 1,
      }),
    );
    const p = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        new URL("../scripts/evaluate-piano-gestures.ts", import.meta.url)
          .pathname,
        "validation",
        output,
        frozen,
      ],
      { encoding: "utf8" },
    );
    assert.notEqual(p.status, 0);
    assert.match(p.stderr, /Candidate changed after calibration/);
    assert.equal(existsSync(output), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
