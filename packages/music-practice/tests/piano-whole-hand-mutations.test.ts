import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";
import type {
  planPianoPhrase,
  PianoPhraseNote,
} from "../src/piano-phrase-fingering";
const source = readFileSync(
  new URL("../src/piano-phrase-fingering.ts", import.meta.url),
  "utf8",
);
const model = readFileSync(
  new URL("../src/piano-hand-model.ts", import.meta.url),
  "utf8",
);
const uri = (s: string) =>
  "data:text/javascript;base64," +
  Buffer.from(
    transformSync(s, { loader: "ts", format: "esm", target: "es2022" }).code,
  ).toString("base64");
async function load(s: string): Promise<typeof planPianoPhrase> {
  return (
    await import(
      uri(s.replaceAll('"./piano-hand-model"', JSON.stringify(uri(model))))
    )
  ).planPianoPhrase;
}
const n = (
  id: string,
  midi: number,
  start = 0,
  duration = 1,
  finger?: number,
): PianoPhraseNote => ({ id, hand: "right", midi, start, duration, finger });
const cases: {
  name: string;
  from: string;
  to: string;
  check: (p: typeof planPianoPhrase) => void;
}[] = [
  {
    name: "silently substitutes held key",
    from: "if (!p.allowSubstitutions) return null;",
    to: "if (false) return null;",
    check: (p) => {
      const ns = [
        ...[60, 62, 64, 65].map((m, i) => n(`ch${i}`, m, 0, 1, i + 1)),
        n("held", 67, 0, 3),
        n("high", 79, 1, 1, 5),
      ];
      assert.equal(p(ns).status, "unsupported");
    },
  },
  {
    name: "permits initial crossed chord",
    from: "i === 0 && pose.crossed.length",
    to: "false",
    check: (p) =>
      assert.equal(
        p([n("low", 64, 0, 1, 3), n("thumb", 65, 0, 1, 1)]).status,
        "unsupported",
      ),
  },
  {
    name: "allows overlapping restrike",
    from: "if (prior && prior.end > c.start)",
    to: "if (false)",
    check: (p) =>
      assert.equal(p([n("a", 60, 0, 2), n("b", 60, 1)]).status, "unsupported"),
  },
  {
    name: "loses same-key unison identity",
    from: "same.noteIds.push(...c.noteIds);",
    to: ";",
    check: (p) => {
      const ns = [n("a", 60), n("b", 60)];
      const r = p(ns);
      assert.equal(r.notes.length, 2);
      assert.equal(r.notes[0].contactId, r.notes[1].contactId);
      assert.deepEqual(r.hands.right.states[0].keys[0].noteIds, ["a", "b"]);
    },
  },
  {
    name: "ignores transition resource cap",
    from: "p.maxTransitions ?? 2_000_000,",
    to: "2_000_000,",
    check: (p) =>
      assert.equal(
        p([n("a", 60), n("b", 62, 1)], { maxTransitions: 1 }).hands.right
          .diagnostic?.code,
        "search_limit",
      ),
  },
  {
    name: "drops reconstructed note",
    from: "const planned = notes.map((n) => {",
    to: "const planned = notes.slice(1).map((n) => {",
    check: (p) => assert.equal(p([n("a", 60), n("b", 64, 1)]).notes.length, 2),
  },
  {
    name: "discards fixed tied contact",
    from: "prior.finger ??= n.finger;",
    to: ";",
    check: (p) => {
      const r = p([n("a", 60), { ...n("b", 60, 1, 1, 5), tieFrom: "a" }]);
      assert.deepEqual(
        r.notes.map((n) => n.finger),
        [5, 5],
      );
    },
  },
];
for (const c of cases)
  test(`whole-hand mutation rejected: ${c.name}`, async () => {
    c.check(await load(source));
    assert.equal(source.split(c.from).length, 2, "unique mutation site");
    const mutated = await load(source.replace(c.from, c.to));
    assert.throws(
      () => c.check(mutated),
      assert.AssertionError,
      "compilation/import failures are not kills",
    );
  });
