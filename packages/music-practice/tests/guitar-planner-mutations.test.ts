import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";
import {
  exhaustiveGuitarCost,
  verifyGuitarPlan,
} from "../test-fixtures/guitar-fingering-oracle";
import type {
  GuitarPhraseNote,
  GuitarFingeringProfile,
  planGuitarPhrase,
} from "../src/guitar-phrase-fingering";
const phraseSource = readFileSync(
  new URL("../src/guitar-phrase-fingering.ts", import.meta.url),
  "utf8",
);
const chordSource = readFileSync(
  new URL("../src/guitar-chord-fingering.ts", import.meta.url),
  "utf8",
);
const uri = (source: string) =>
  "data:text/javascript;base64," +
  Buffer.from(
    transformSync(source, { loader: "ts", format: "esm", target: "es2022" })
      .code,
  ).toString("base64");
/** Compile isolated copies in memory. The working tree and runtime API have no
 * mutation switches; syntax/import failures never count as killed mutants. */
async function load(
  phrase = phraseSource,
  chord = chordSource,
): Promise<typeof planGuitarPhrase> {
  const js = transformSync(phrase, {
    loader: "ts",
    format: "esm",
    target: "es2022",
  }).code;
  const path = '"./guitar-chord-fingering"';
  assert.ok(js.includes(path));
  return (
    await import(
      "data:text/javascript;base64," +
        Buffer.from(js.replace(path, JSON.stringify(uri(chord)))).toString(
          "base64",
        )
    )
  ).planGuitarPhrase;
}
function replaceOnce(source: string, from: string, to: string) {
  assert.equal(
    source.split(from).length,
    2,
    "mutation must match exactly one production site",
  );
  return source.replace(from, to);
}
const n = (
  id: string,
  start: number,
  string: number,
  fret: number,
  duration = 1,
): GuitarPhraseNote => ({ id, start, string, fret, duration });
const mutations: {
  name: string;
  target: "phrase" | "chord";
  from: string;
  to: string;
  notes: GuitarPhraseNote[];
  profile?: GuitarFingeringProfile;
  withoutLowerBound?: boolean;
}[] = [
  {
    name: "lost tied-contact identity",
    target: "phrase",
    from: "tie?.hold ?? note.id",
    to: "note.id",
    notes: [
      n("a", 0, 3, 2),
      { ...n("tie", 1, 3, 2), tieFrom: "a" },
      n("bass", 0, 5, 5, 2),
    ],
  },
  {
    name: "held finger reassigned without permission",
    target: "phrase",
    from: "if (!profile.allowSubstitutions) {",
    to: "if (false) {",
    notes: [n("held", 0, 1, 4, 2), n("low", 0, 2, 1), n("high", 1, 2, 8)],
  },
  {
    name: "barre crosses a sounding open string",
    target: "chord",
    from: "frets[index]! >= fret",
    to: "true",
    notes: [n("a", 0, 4, 2), n("b", 0, 2, 2), n("open", 0, 3, 0)],
    profile: { maxFingers: 1 },
  },
  {
    name: "last note lost during reconstruction",
    target: "phrase",
    from: "notes: input.map((note) => {",
    to: "notes: input.slice(0, -1).map((note) => {",
    notes: [n("unison-a", 0, 1, 7), n("unison-b", 0, 2, 12)],
  },
  {
    name: "worst predecessor chosen instead of best",
    withoutLowerBound: true,
    target: "phrase",
    from: "if (!best || cost < best.cost - 1e-9)",
    to: "if (!best || cost > best.cost + 1e-9)",
    notes: [n("a", 0, 1, 2), n("b", 1, 2, 4)],
  },
  {
    name: "same-string overlap accepted",
    target: "phrase",
    from: "if (frets[index] !== null) return null;",
    to: "if (false) return null;",
    notes: [n("a", 0, 2, 3), n("b", 0, 2, 8)],
  },
];
for (const m of mutations)
  test(`mutation is rejected: ${m.name}`, async () => {
    const oracle = exhaustiveGuitarCost(m.notes, m.profile);
    const check = (planner: typeof planGuitarPhrase) => {
      const plan = planner(m.notes, m.profile);
      if (oracle.cost === null) {
        assert.equal(plan, null);
        return;
      }
      verifyGuitarPlan(m.notes, plan, m.profile);
      assert.ok(
        Math.abs(plan!.cost - oracle.cost) < 1e-7,
        "global minimum must match independent exhaustive search",
      );
    };
    check(await load());
    let mutatedPhrase=m.target === "phrase"?replaceOnce(phraseSource,m.from,m.to):phraseSource;
    // The min-cost lower bound is inapplicable to the deliberately max-cost mutant.
    if(m.withoutLowerBound)mutatedPhrase=replaceOnce(mutatedPhrase,"if(best&&prev.cost+localTotal>best.cost+1e-9)break;","");
    const planner = await load(
      mutatedPhrase,
      m.target === "chord"
        ? replaceOnce(chordSource, m.from, m.to)
        : chordSource,
    );
    assert.throws(
      () => check(planner),
      assert.AssertionError,
      "a compiling mutant must fail an observable contract assertion",
    );
  });
