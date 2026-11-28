import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import {
  planGuitarPhrase,
  type GuitarPhraseNote,
  type GuitarFingeringProfile,
} from "../src/guitar-phrase-fingering";
import {
  exhaustiveGuitarCost,
  verifyGuitarPlan,
  verifyKnownHand,
} from "../test-fixtures/guitar-fingering-oracle";
import {
  generatedGuitarPhrase,
  minimizeGuitarFailure,
} from "../test-fixtures/guitar-fingering-generated";
const n = (
  id: string,
  start: number,
  string: number,
  fret: number,
  duration = 1,
): GuitarPhraseNote => ({ id, start, string, fret, duration });
const cases: {
  name: string;
  notes: GuitarPhraseNote[];
  profile?: GuitarFingeringProfile;
}[] = [
  {
    name: "three attacks",
    notes: [n("a", 0, 1, 2), n("b", 1, 2, 4), n("c", 2, 1, 3)],
  },
  {
    name: "held bass and changing melody",
    notes: [n("bass", 0, 5, 5, 2), n("a", 0, 3, 2), n("b", 1, 4, 4)],
  },
  {
    name: "tie through another attack",
    notes: [
      n("a", 0, 3, 2),
      { ...n("tie", 1, 3, 2), tieFrom: "a" },
      n("bass", 0, 5, 5, 2),
      n("other", 1, 2, 3),
    ],
  },
  {
    name: "barre expands",
    notes: [n("a", 0, 4, 2, 2), n("b", 0, 2, 2, 2), n("middle", 1, 3, 2)],
  },
  {
    name: "future open string splits initial grip",
    notes: [n("a", 0, 4, 2, 2), n("b", 0, 2, 2, 2), n("open", 1, 3, 0)],
  },
  {
    name: "rest allows a shift",
    notes: [n("a", 0, 1, 2, 0.5), n("b", 2, 1, 14, 0.5)],
  },
  {
    name: "impossible one-finger open-string barrier",
    notes: [n("a", 0, 4, 2), n("b", 0, 2, 2), n("open", 0, 3, 0)],
    profile: { maxFingers: 1 },
  },
  {
    name: "held finger cannot be substituted by default",
    notes: [n("held", 0, 1, 4, 2), n("low", 0, 2, 1), n("high", 1, 2, 8)],
  },
  {
    name: "explicit held substitution",
    notes: [n("held", 0, 1, 4, 2), n("low", 0, 2, 1), n("high", 1, 2, 8)],
    profile: { allowSubstitutions: true },
  },
  {
    name: "capo and fast transitions",
    notes: [n("a", 0, 2, 5), n("b", 1, 1, 7)],
    profile: { capo: 4, bpm: 240 },
  },
];
for (const c of cases)
  test(`exhaustive oracle: ${c.name}`, () => {
    const reference = exhaustiveGuitarCost(c.notes, c.profile),
      plan = planGuitarPhrase(c.notes, c.profile);
    if (reference.cost === null) {
      assert.equal(plan, null);
      return;
    }
    assert.ok(reference.paths > 0);
    verifyGuitarPlan(c.notes, plan, c.profile);
    assert.ok(
      Math.abs(plan!.cost - reference.cost) < 1e-7,
      `${plan!.cost} != exhaustive ${reference.cost}`,
    );
  });
for (let seed = 1; seed <= 64; seed++)
  test(`known-playable generated phrase seed ${seed}`, () => {
    const c = generatedGuitarPhrase(seed);
    verifyKnownHand(c.notes, c.witness, c.profile);
    const original = structuredClone(c.notes);
    for (const note of c.notes) Object.freeze(note);
    Object.freeze(c.notes);
    const failure = (notes: GuitarPhraseNote[]) => {
      try {
        verifyGuitarPlan(notes, planGuitarPhrase(notes, c.profile), c.profile);
        return undefined;
      } catch (error) {
        return error as Error;
      }
    };
    const error = failure(c.notes);
    if (error) {
      const minimized = minimizeGuitarFailure(
        c.notes,
        (notes) => !!failure(notes),
      );
      const directory = new URL(
        "../../../work/guitar-fingering-failures/",
        import.meta.url,
      );
      mkdirSync(directory, { recursive: true });
      const artifact = new URL(`seed-${seed}.json`, directory);
      writeFileSync(
        artifact,
        JSON.stringify(
          {
            ...c,
            notes: minimized,
            originalNotes: original,
            failure: String(error),
          },
          null,
          2,
        ) + "\n",
      );
      assert.fail(
        `Seed ${seed}: ${error.stack}\nMinimized replay fixture: ${artifact.pathname}`,
      );
    }
    assert.deepEqual(c.notes, original);
  });
test("the failure minimizer keeps tie chains together and retains a failing witness", () => {
  const input = [
    n("unrelated", 0, 6, 0),
    n("target", 1, 1, 3),
    { ...n("continuation", 2, 1, 3), tieFrom: "target" },
    n("last", 3, 2, 0),
  ];
  const minimized = minimizeGuitarFailure(input, (notes) =>
    notes.some((n) => n.id === "target"),
  );
  assert.deepEqual(
    minimized.map((n) => n.id),
    ["target", "continuation"],
  );
});

test("all 64 three-attack phrases over frets 0..3 match exhaustive path enumeration", () => {
  for (let a = 0; a < 4; a++)
    for (let b = 0; b < 4; b++)
      for (let c = 0; c < 4; c++) {
        const notes = [n("a", 0, 1, a), n("b", 1, 2, b), n("c", 2, 1, c)];
        const reference = exhaustiveGuitarCost(notes),
          plan = planGuitarPhrase(notes)!;
        verifyGuitarPlan(notes, plan);
        assert.ok(
          reference.cost !== null &&
            Math.abs(plan.cost - reference.cost) < 1e-7,
          `fret sequence ${a},${b},${c}: ${plan.cost} != ${reference.cost}`,
        );
      }
});
test("oracle enumerates all 24 cubed open-string paths, including non-optimal ones", () => {
  const result = exhaustiveGuitarCost([
    n("a", 0, 1, 0),
    n("b", 1, 2, 0),
    n("c", 2, 3, 0),
  ]);
  assert.equal(result.paths, 24 ** 3);
  assert.ok(Math.abs(result.cost! - 0.045) < 1e-12);
});
test("the fixed seed corpus covers different positions, capos, ties, barres and budgets", () => {
  const cases = Array.from({ length: 64 }, (_, i) =>
    generatedGuitarPhrase(i + 1),
  );
  assert.ok(new Set(cases.map((c) => c.witness.position)).size >= 12);
  assert.equal(new Set(cases.map((c) => c.profile.capo)).size, 5);
  assert.deepEqual(
    [...new Set(cases.map((c) => c.profile.allowBarres))].sort(),
    [false, true],
  );
  assert.deepEqual(
    [...new Set(cases.map((c) => c.profile.maxFingers))].sort(),
    [3, 4],
  );
  assert.ok(cases.some((c) => c.notes.some((n) => n.tieFrom)));
  for (const id of ["__proto__", "constructor", "toString"])
    assert.ok(cases.some((c) => c.notes.some((n) => n.id === id)));
});
