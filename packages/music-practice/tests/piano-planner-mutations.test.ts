import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";
import type { FingerNote, planPianoFingering } from "../src/piano-fingering";
import {
  exhaustivePianoCost,
  scorePianoReference,
  type PianoHand,
} from "../test-fixtures/piano-fingering-oracle";
const source = readFileSync(
  new URL("../src/piano-fingering.ts", import.meta.url),
  "utf8",
);
async function load(text: string): Promise<typeof planPianoFingering> {
  const js = transformSync(text, {
    loader: "ts",
    format: "esm",
    target: "es2022",
  }).code;
  return (
    await import(
      "data:text/javascript;base64," + Buffer.from(js).toString("base64")
    )
  ).planPianoFingering;
}
const n = (midi: number, finger?: number): FingerNote => ({
  midi,
  duration: 0.25,
  ...(finger ? { finger } : {}),
});
const mutants: {
  name: string;
  changes: [string, string][];
  notes: FingerNote[];
  hand: PianoHand;
}[] = [
  {
    name: "ignores fixed fingers",
    changes: [
      ["note.finger ?? 1", "1"],
      ["note.finger ?? 5", "5"],
    ],
    notes: [n(60, 5)],
    hand: "right",
  },
  {
    name: "loses tied finger continuity",
    changes: [
      [
        "if (note.tied && (finger !== previous.finger || distance !== 0))",
        "if (false)",
      ],
    ],
    notes: [n(60, 1), { ...n(60, 5), tied: true }],
    hand: "right",
  },
  {
    name: "uses right hand direction for left hand",
    changes: [['const sign = hand === "right" ? 1 : -1;', "const sign = 1;"]],
    notes: [n(48), n(50), n(52)],
    hand: "left",
  },
  {
    name: "chooses the worst predecessor",
    changes: [["if (total < cost) {", "if (!best || total > cost) {"]],
    notes: [n(60), n(64), n(62)],
    hand: "right",
  },
  {
    name: "drops a note during reconstruction",
    changes: [["return result;", "return result.slice(1);"]],
    notes: [n(60), n(62)],
    hand: "right",
  },
  {
    name: "allows a tie to change pitch",
    changes: [["note.midi !== notes[index - 1].midi", "false"]],
    notes: [n(60), { ...n(61), tied: true }],
    hand: "right",
  },
];
for (const m of mutants)
  test(`piano mutation rejected: ${m.name}`, async () => {
    const reference = exhaustivePianoCost(m.notes, m.hand);
    const check = (planner: typeof planPianoFingering) => {
      if (reference.cost === null) {
        assert.throws(() => planner(m.notes, m.hand));
        return;
      }
      const result = planner(m.notes, m.hand),
        cost = scorePianoReference(m.notes, result, m.hand);
      assert.ok(Math.abs(cost - reference.cost) < 1e-8);
    };
    check(await load(source));
    let changed = source;
    for (const [from, to] of m.changes) {
      assert.equal(changed.split(from).length, 2, "unique mutation site");
      changed = changed.replace(from, to);
    }
    const planner = await load(changed);
    assert.throws(
      () => check(planner),
      assert.AssertionError,
      "only observable assertion failures count as kills",
    );
  });
