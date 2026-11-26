import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";
import { solvePianoMemoryPath } from "../src/piano-hand-model";
function check(solve: typeof solvePianoMemoryPath) {
  const result = solve(
    [[0, 1], [2], [3]],
    (n) => (n === 1 ? 1 : 0),
    (n) => n,
    (a, b, m) => ({ memory: m, cost: b === 3 && m === 0 ? 10 : 0 }),
    String,
  );
  assert.equal(result.status, "complete");
  assert.deepEqual(result.path, [1, 2, 3]);
  assert.equal(result.cost, 1);
}
test("histories with the same current grip retain different future costs", () =>
  check(solvePianoMemoryPath));
test("exact memory search matches independent enumeration for 32 seeded lattices", () => {
  for (let seed = 1; seed <= 32; seed++) {
    const layers = [
      [0, 1, 2],
      [0, 1],
      [0, 1, 2],
      [0, 1],
    ];
    let best = Infinity;
    const edge = (a: number, b: number, m: number, i: number) =>
      (a * 7 + b * 3 + m * seed + i) % 11;
    for (const a of layers[0])
      for (const b of layers[1])
        for (const c of layers[2])
          for (const d of layers[3])
            best = Math.min(
              best,
              a +
                b +
                c +
                d +
                edge(a, b, a, 1) +
                edge(b, c, a, 2) +
                edge(c, d, b, 3),
            );
    const result = solvePianoMemoryPath(
      layers,
      (v) => v,
      (v) => v,
      (a, b, m, i) => ({ cost: edge(a, b, m, i), memory: a }),
      String,
    );
    assert.equal(result.cost, best);
  }
  assert.equal(
    solvePianoMemoryPath(
      [[1], [2]],
      () => 0,
      (v) => v,
      (_a, b) => ({ cost: 0, memory: b }),
      String,
      1,
    ).status,
    "complete",
  );
  assert.equal(
    solvePianoMemoryPath(
      [
        [1, 2],
        [3, 4],
      ],
      () => 0,
      (v) => v,
      (_a, b) => ({ cost: 0, memory: b }),
      String,
      1,
    ).status,
    "limit",
  );
});
test("expanded memory states have an independent deterministic cap", () => {
  const result = solvePianoMemoryPath(
    [
      [1, 2],
      [3, 4],
    ],
    () => 0,
    (v) => v,
    (_a, b) => ({ cost: 0, memory: b }),
    String,
    100,
    2,
  );
  assert.equal(result.status, "limit");
  assert.equal(result.states, 3);
});
test("compiling mutation which merges different memories is rejected", async () => {
  const source = readFileSync(
    new URL("../src/piano-hand-model.ts", import.meta.url),
    "utf8",
  );
  assert.equal(source.split("key(step.memory)").length, 2);
  const js = transformSync(source.replace("key(step.memory)", '""'), {
    loader: "ts",
    format: "esm",
    target: "es2022",
  }).code;
  const mutant = (
    await import(
      "data:text/javascript;base64," + Buffer.from(js).toString("base64")
    )
  ).solvePianoMemoryPath;
  assert.throws(() => check(mutant), assert.AssertionError);
});
