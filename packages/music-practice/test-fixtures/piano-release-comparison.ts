/** Replay OUR released TypeScript only; no third-party fingering code executes. */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { transformSync } from "esbuild";
import {
  planPianoPhrase,
  unsupportedPianoHand,
  assemblePianoPhrase,
  type PianoHandPlan,
} from "../src/piano-phrase-fingering";
import {
  scorePianoBenchmarkCase,
  type PianoBenchmarkCase,
} from "./piano-benchmark";
export const pianoReleaseBaselineRevision =
  "0a593873044a2145e9b99254911d480aadd5ed20";
export async function releasedPianoPlanner() {
  const source = readFileSync(
    new URL("./piano-release-baseline.ts.txt", import.meta.url),
    "utf8",
  );
  const url =
    "data:text/javascript;base64," +
    Buffer.from(
      transformSync(source, { loader: "ts", format: "esm" }).code,
    ).toString("base64");
  return {
    plan: (await import(url)).planPianoFingering,
    sha256: createHash("sha256").update(source).digest("hex"),
  };
}
export async function comparePianoRelease(
  cases: readonly PianoBenchmarkCase[],
) {
  const { plan: old, sha256 } = await releasedPianoPlanner();
  const rows = [],
    excluded = [];
  for (const c of cases) {
    let mono = true;
    for (const hand of ["right", "left"]) {
      const ns = c.notes
        .filter((n) => n.hand === hand)
        .sort((a, b) => a.start - b.start);
      for (let i = 1; i < ns.length; i++)
        if (ns[i].start < ns[i - 1].start + ns[i - 1].duration - 1e-8)
          mono = false;
    }
    if (!mono) {
      excluded.push({
        id: c.id,
        reason:
          "Concurrent contacts cannot be represented by the released single-note API",
      });
      continue;
    }
    const hands = {} as Record<"right" | "left", PianoHandPlan>;
    for (const hand of ["right", "left"] as const) {
      const ns = c.notes
        .filter((n) => n.hand === hand)
        .sort((a, b) => a.start - b.start);
      const fs = old(
        ns.map((n, i) => ({
          midi: n.midi,
          duration: n.duration / 4,
          tied: !!n.tieFrom,
          restBefore:
            i > 0 && n.start > ns[i - 1].start + ns[i - 1].duration + 1e-8,
        })),
        hand,
      );
      hands[hand] = {
        ...unsupportedPianoHand({ hand, code: "reach" }),
        status: "complete",
        diagnostic: undefined,
        notes: ns.map((n, i) => ({ ...n, ...fs[i], contactId: n.id })),
      };
    }
    const baseline = scorePianoBenchmarkCase(
      c,
      assemblePianoPhrase(
        hands,
        c.notes.map((n) => n.id),
      ),
    );
    const current = scorePianoBenchmarkCase(
      c,
      planPianoPhrase(c.notes, { bpm: c.bpm }),
    );
    const collisions = c.notes
      .filter((a) =>
        c.notes.some(
          (b) =>
            a.hand !== b.hand &&
            a.midi === b.midi &&
            a.start < b.start + b.duration - 1e-8 &&
            b.start < a.start + a.duration - 1e-8,
        ),
      )
      .map((n) => n.id);
    rows.push({
      id: c.id,
      family: c.family,
      eligible: current.eligible,
      before: baseline.matches,
      after: current.matches,
      beforeCovered: baseline.covered,
      afterCovered: current.covered,
      diagnostics: current.diagnostics,
      collisionNotes: collisions,
    });
  }
  const sum = (rs: typeof rows) =>
    Object.fromEntries(
      (
        [
          "eligible",
          "before",
          "after",
          "beforeCovered",
          "afterCovered",
        ] as const
      ).map((k) => [k, rs.reduce((s, r) => s + r[k], 0)]),
    );
  return {
    baselineRevision: pianoReleaseBaselineRevision,
    baselineSha256: sha256,
    comparable: rows.length,
    excluded,
    summary: sum(rows),
    families: Object.fromEntries(
      [...new Set(rows.map((r) => r.family))].map((f) => [
        f,
        sum(rows.filter((r) => r.family === f)),
      ]),
    ),
    rows,
  };
}
