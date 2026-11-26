import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";
import { planPianoPhrase } from "../src/piano-phrase-fingering";
import { exhaustiveRollingCost } from "../test-fixtures/piano-rolling-oracle";
const midis = [60, 62, 64, 65, 67, 69, 71, 72],
  fixed = [1, 2, 3, undefined, undefined, 3, 4, 5];
const notes = midis.map((midi, i) => ({
  id: String(i),
  hand: "right" as const,
  midi,
  start: i * 0.25,
  duration: 0.25,
  ...(fixed[i] ? { finger: fixed[i] } : {}),
}));
function check(planner: typeof planPianoPhrase) {
  const oracle = exhaustiveRollingCost(midis, fixed),
    p = planner(notes, { bpm: 60 });
  assert.ok(oracle.paths > 0);
  assert.equal(p.status, "complete");
  assert.ok(
    Math.abs(p.cost - oracle.cost) < 1e-8,
    `${p.cost} vs ${oracle.cost}`,
  );
}
test("independent complete-path enumeration verifies contextual rolling optimum", () =>
  check(planPianoPhrase));
const source = readFileSync(
    new URL("../src/piano-phrase-fingering.ts", import.meta.url),
    "utf8",
  ),
  model = readFileSync(
    new URL("../src/piano-hand-model.ts", import.meta.url),
    "utf8",
  );
const uri = (s: string) =>
  "data:text/javascript;base64," +
  Buffer.from(
    transformSync(s, { loader: "ts", format: "esm", target: "es2022" }).code,
  ).toString("base64");
async function load(s: string, m: string): Promise<typeof planPianoPhrase> {
  const js = s.replaceAll('"./piano-hand-model"', JSON.stringify(uri(m)));
  return (await import(uri(js))).planPianoPhrase;
}
for (const mutant of [
  {
    name: "drops rolling context",
    target: "source",
    from: "if (end - start >= 6)",
    to: "if (false)",
  },
  {
    name: "restores relocation penalty for rolling thumb",
    target: "model",
    from: "rolling &&",
    to: "false &&",
  },
])
  test(`context mutation rejected: ${mutant.name}`, async () => {
    check(await load(source, model));
    const original = mutant.target === "source" ? source : model;
    assert.equal(original.split(mutant.from).length, 2);
    const changed = original.replace(mutant.from, mutant.to);
    const planner = await load(
      mutant.target === "source" ? changed : source,
      mutant.target === "model" ? changed : model,
    );
    assert.throws(() => check(planner), assert.AssertionError);
  });
