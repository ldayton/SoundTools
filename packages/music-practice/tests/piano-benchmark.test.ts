import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import abcjs from "abcjs";
import {
  loadPianoBenchmark,
  scorePianoBenchmarkCase,
  type PianoBenchmarkCase,
} from "../test-fixtures/piano-benchmark";
import {
  planPianoPhrase,
  pianoRollingEdges,
} from "../src/piano-phrase-fingering";
import { pianoTimedMotionCost, pianoMotionCost } from "../src/piano-hand-model";
import { collectPianoScore } from "../src/piano-score-fingering";
import synthetic from "../test-fixtures/external/pydactyl/synthetic-cases.json";
const corpus = loadPianoBenchmark();
test("pinned permissive data has intact provenance and reproducible normalization", () => {
  for (const dir of ["dacapo", "pydactyl"]) {
    const base = new URL(`../test-fixtures/external/${dir}/`, import.meta.url),
      manifest = JSON.parse(
        readFileSync(new URL("manifest.json", base), "utf8"),
      );
    for (const entry of manifest.files)
      assert.equal(
        createHash("sha256")
          .update(readFileSync(new URL(entry.path, base)))
          .digest("hex"),
        entry.sha256,
      );
    assert.match(readFileSync(new URL("LICENSE", base), "utf8"), /MIT License/);
  }
  execFileSync("python3", [
    new URL("../scripts/import-piano-benchmark.py", import.meta.url).pathname,
    "--check",
  ]);
  execFileSync(
    "python3",
    [
      new URL("../scripts/test-piano-benchmark-import.py", import.meta.url)
        .pathname,
    ],
    { stdio: "pipe" },
  );
  assert.equal(corpus.length, 152);
  assert.equal(corpus.filter((c) => c.partition === "validation").length, 42);
  assert.equal(new Set(corpus.map((c) => c.id)).size, corpus.length);
  for (const c of corpus) {
    assert.ok(c.notes.every((n) => !Object.hasOwn(n, "finger")));
    assert.ok(
      c.labels.every((l) => l.kind !== "printed" || Number.isInteger(l.finger)),
    );
    assert.equal(new Set(c.notes.map((n) => n.id)).size, c.notes.length);
  }
});
test("agreement separates editorial evidence, inferred and flagged labels; abstention cannot improve all-label agreement", () => {
  const c: PianoBenchmarkCase = {
    id: "test",
    family: "synthetic",
    source: "synthetic",
    bpm: 60,
    partition: "development",
    notes: [
      { id: "a", hand: "right", midi: 60, start: 0, duration: 1 },
      { id: "b", hand: "right", midi: 62, start: 1, duration: 1 },
      { id: "c", hand: "right", midi: 64, start: 2, duration: 1 },
      { id: "d", hand: "right", midi: 65, start: 3, duration: 1 },
    ],
    labels: [
      { id: "a", finger: 1, kind: "printed" },
      { id: "b", finger: 2, kind: "printed" },
      { id: "c", finger: 3, kind: "inferred" },
      { id: "d", raw: "4-5", kind: "flagged" },
    ],
  };
  const p = planPianoPhrase(c.notes);
  p.notes[0].finger = 1;
  p.notes[1].finger = 4;
  const r = scorePianoBenchmarkCase(c, p);
  assert.deepEqual(
    [r.eligible, r.covered, r.matches, r.inferred, r.flagged],
    [2, 2, 1, 1, 1],
  );
  const absent = structuredClone(p);
  absent.hands.right.status = "unsupported";
  absent.notes = [];
  const a = scorePianoBenchmarkCase(c, absent);
  assert.deepEqual([a.eligible, a.covered, a.matches], [2, 0, 0]);
  const corrupt = structuredClone(p);
  corrupt.notes.pop();
  assert.throws(() => scorePianoBenchmarkCase(c, corrupt), /Incomplete/);
  corrupt.notes.push({ ...corrupt.notes[0] });
  assert.throws(() => scorePianoBenchmarkCase(c, corrupt), /identity/);
});
test("bounded development witnesses cover real notation families and preserve reference-independent planning", () => {
  for (const id of [
    "hanon-39-0",
    "hanon-40-36",
    "hanon-41-0",
    "hanon-study-1-0",
    "hanon-study-50-26",
    "czerny-op599-no11",
  ]) {
    const full = corpus.find((c) => c.id === id)!;
    const notes = full.notes.filter((n) => n.start < 4),
      ids = new Set(notes.map((n) => n.id));
    const c = {
      ...full,
      notes,
      labels: full.labels.filter((l) => ids.has(l.id)),
    };
    assert.equal(c.partition, "development");
    const p = planPianoPhrase(c.notes, { bpm: c.bpm }),
      r = scorePianoBenchmarkCase(c, p);
    assert.equal(r.predictedNotes, c.notes.length);
    assert.ok(r.eligible > 0);
    assert.deepEqual(
      planPianoPhrase([...c.notes].reverse(), { bpm: c.bpm }).notes.reverse(),
      p.notes,
    );
  }
});
test("rolling classification is mirrored, bounded to sustained stepwise gestures and independent of note IDs", () => {
  const frame = (midi: number, id = String(midi)) => ({
    active: [{ id, midi }],
  });
  const ascending = [60, 62, 64, 65, 67, 69, 71, 72].map((m) => frame(m));
  assert.deepEqual([...pianoRollingEdges(ascending)], [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(pianoRollingEdges([...ascending].reverse()).size, 7);
  assert.equal(pianoRollingEdges(ascending.slice(0, 5)).size, 0);
  assert.equal(
    pianoRollingEdges([60, 63, 66, 69, 72, 75, 78].map((m) => frame(m))).size,
    0,
  );
  assert.equal(
    pianoRollingEdges(
      [60, 60, 62, 62, 64, 64, 65, 65].map((m, i) => frame(m, String(i))),
    ).size,
    0,
  );
  assert.equal(
    pianoRollingEdges(ascending.map((f, i) => (i === 3 ? { active: [] } : f)))
      .size,
    0,
  );
  assert.equal(
    pianoRollingEdges(
      ascending.map((f) => ({
        active: [...f.active, { id: "bass", midi: 48 }],
      })),
    ).size,
    0,
  );
  for (const hand of ["right", "left"] as const) {
    const a = { midi: hand === "right" ? 64 : 65, duration: 0.0625 },
      b = { midi: hand === "right" ? 65 : 64 };
    const x = { finger: 3, anchor: hand === "right" ? 35 : 40 },
      y = { finger: 1, anchor: hand === "right" ? 38 : 37 };
    assert.ok(
      pianoTimedMotionCost(a, b, x, y, hand, true).movement <
        pianoMotionCost(a, b, x, y, hand).movement,
    );
    assert.deepEqual(
      pianoTimedMotionCost(a, b, x, y, hand),
      pianoMotionCost(a, b, x, y, hand),
    );
  }
});
for (const [id, abc] of Object.entries(synthetic))
  test(`MIT pydactyl literal input ${id} preserves separate alternative annotations`, () => {
    const t = abcjs.parseOnly(abc)[0];
    t.setUpAudio({ chordsOff: true });
    const notes = collectPianoScore(t).notes;
    const alternatives = [...abc.matchAll(/% abcD fingering \d+: (.+)/g)].map(
      (m) =>
        m[1].split("@").map((h) => [...h.replace(/[<>]/g, "")].map(Number)),
    );
    assert.equal(alternatives.length, 2);
    // These upstream toy alternatives are format/anchor witnesses, not expert goldens.
    for (const hand of ["right", "left"] as const) {
      const ns = notes.filter((n) => n.hand === hand);
      if (!ns.length) continue;
      const result = planPianoPhrase(ns);
      assert.equal(result.status, "complete");
      for (const alt of alternatives) {
        const digits = alt[hand === "right" ? 0 : 1];
        if (id === "ONE_BLACK_NOTE_PER_STAFF") {
          assert.equal(ns.length, 1);
          assert.equal(
            digits.length,
            2,
            "upstream toy annotation deliberately has two digits for one note; never treat as gold",
          );
          continue;
        }
        assert.equal(
          digits?.length,
          ns.length,
          "anchor alternative must cover each note",
        );
        const anchored = planPianoPhrase(
          ns.map((n, i) => ({ ...n, finger: digits[i] })),
        );
        assert.equal(anchored.status, "complete");
        assert.deepEqual(
          anchored.notes.map((n) => n.finger),
          digits,
        );
      }
    }
  });
