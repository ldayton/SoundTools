/** Evaluation-only data contract. Reference digits never enter inference notes. */
import { readFileSync } from "node:fs";
import {
  planPianoPhrase,
  type PianoPhraseNote,
  type PianoPhrasePlan,
} from "../src/piano-phrase-fingering";
export type BenchmarkLabel = {
  id: string;
  finger?: number;
  kind: "printed" | "inferred" | "flagged" | "completed";
  raw?: string;
  reason?: string;
};
export type PianoBenchmarkCase = {
  id: string;
  family: string;
  partition: "development" | "validation";
  source: string;
  description?: string;
  bpm: number;
  notes: PianoPhraseNote[];
  labels: BenchmarkLabel[];
  evidence?: "printed" | "completed";
  alternatives?: BenchmarkLabel[][];
};
export function loadPianoBenchmark(
  source: "hanon" | "beringer" | "beringer-scales" = "hanon",
): PianoBenchmarkCase[] {
  return JSON.parse(
    readFileSync(
      new URL(
        source === "hanon"
          ? "./piano-benchmark.json"
          : source === "beringer"
            ? "./piano-beringer.json"
            : "./piano-beringer-scales.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ).cases;
}
export function scorePianoBenchmarkCase(
  c: PianoBenchmarkCase,
  plan: PianoPhrasePlan,
) {
  const expected = new Map(c.notes.map((n) => [n.id, n]));
  const seen = new Set<string>();
  for (const n of plan.notes) {
    const source = expected.get(n.id);
    if (
      !source ||
      seen.has(n.id) ||
      n.midi !== source.midi ||
      n.hand !== source.hand ||
      n.start !== source.start ||
      n.duration !== source.duration ||
      !Number.isInteger(n.finger) ||
      n.finger < 1 ||
      n.finger > 5
    )
      throw Error("Invalid benchmark prediction identity");
    seen.add(n.id);
  }
  for (const hand of ["right", "left"] as const) {
    const wanted = c.notes.filter((n) => n.hand === hand);
    if (
      plan.hands[hand].status === "complete" &&
      wanted.some((n) => !seen.has(n.id))
    )
      throw Error("Incomplete complete-hand prediction");
    if (
      plan.hands[hand].status === "unsupported" &&
      plan.notes.some((n) => n.hand === hand)
    )
      throw Error("Partial unsupported-hand prediction");
  }
  const predictions = new Map(plan.notes.map((n) => [n.id, n.finger]));
  const references = [c.labels, ...(c.alternatives ?? [])],
    kind = c.evidence ?? "printed";
  for (const labels of references)
    if (
      new Set(labels.map((l) => l.id)).size !== labels.length ||
      labels.some(
        (l) =>
          !expected.has(l.id) ||
          (l.finger !== undefined &&
            (!Number.isInteger(l.finger) || l.finger < 1 || l.finger > 5)),
      )
    )
      throw Error("Invalid benchmark labels");
  const correct = (labels: BenchmarkLabel[]) =>
    labels.filter(
      (l) =>
        l.kind === kind &&
        l.finger !== undefined &&
        predictions.get(l.id) === l.finger,
    ).length;
  const chosen = references.reduce(
    (best, labels) => (correct(labels) > correct(best) ? labels : best),
    references[0],
  );
  const eligible = chosen.filter(
    (l) => l.kind === kind && l.finger !== undefined,
  );
  const covered = eligible.filter((l) => predictions.has(l.id)),
    matches = covered.filter((l) => predictions.get(l.id) === l.finger);
  const expectedDigits = new Map(eligible.map((l) => [l.id, l.finger]));
  const sequence = {
    eligibleCases: +(eligible.length > 0),
    completeCases: +(eligible.length > 0 && matches.length === eligible.length),
    eligibleHands: 0,
    completeHands: 0,
    eligibleTransitions: 0,
    matchedTransitions: 0,
  };
  for (const hand of ["left", "right"] as const) {
    const ls = eligible.filter((l) => expected.get(l.id)!.hand === hand);
    if (ls.length) {
      sequence.eligibleHands++;
      if (ls.every((l) => predictions.get(l.id) === l.finger))
        sequence.completeHands++;
    }
  }
  const streams = new Map<string, PianoPhraseNote[]>();
  for (const note of c.notes) {
    const key = JSON.stringify([note.hand, note.voice]);
    const stream = streams.get(key) ?? [];
    stream.push(note);
    streams.set(key, stream);
  }
  for (const stream of streams.values()) {
    stream.sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
    for (let i = 1; i < stream.length; i++) {
      const a = stream[i - 1],
        b = stream[i];
      // Only adjacent, contiguous, unambiguous labelled attacks: no sparse-label
      // bridges, simultaneous chord ordering, ties, rests or phrase boundaries.
      if (
        b.phraseStart ||
        b.tieFrom ||
        !expectedDigits.has(a.id) ||
        !expectedDigits.has(b.id) ||
        Math.abs(a.start + a.duration - b.start) > 1e-8 ||
        (i > 1 && stream[i - 2].start === a.start) ||
        (i + 1 < stream.length && stream[i + 1].start === b.start)
      )
        continue;
      sequence.eligibleTransitions++;
      if (
        predictions.get(a.id) === expectedDigits.get(a.id) &&
        predictions.get(b.id) === expectedDigits.get(b.id)
      )
        sequence.matchedTransitions++;
    }
  }
  return {
    id: c.id,
    family: c.family,
    partition: c.partition,
    referenceKind: kind,
    referenceCount: references.length,
    sequence,
    totalNotes: c.notes.length,
    predictedNotes: plan.notes.length,
    eligible: eligible.length,
    covered: covered.length,
    matches: matches.length,
    inferred: c.labels.filter((l) => l.kind === "inferred").length,
    flagged: c.labels.filter((l) => l.kind === "flagged").length,
    diagnostics: Object.values(plan.hands).flatMap((h) =>
      h.diagnostic ? [h.diagnostic] : [],
    ),
    mismatches: eligible
      .filter((l) => predictions.get(l.id) !== l.finger)
      .map((l) => ({
        id: l.id,
        expected: l.finger,
        predicted: predictions.get(l.id) ?? null,
      })),
  };
}
export function evaluatePianoBenchmark(
  cases: readonly PianoBenchmarkCase[],
  planner = planPianoPhrase,
) {
  const rows = cases.map((c) =>
    scorePianoBenchmarkCase(c, planner(c.notes, { bpm: c.bpm })),
  );
  const summary = (rs: typeof rows) => {
    const sum = (
      k:
        | "totalNotes"
        | "predictedNotes"
        | "eligible"
        | "covered"
        | "matches"
        | "flagged"
        | "inferred",
    ) => rs.reduce((s, r) => s + r[k], 0);
    return {
      sequence: Object.fromEntries(
        Object.keys(
          rows[0]?.sequence ?? {
            eligibleCases: 0,
            completeCases: 0,
            eligibleHands: 0,
            completeHands: 0,
            eligibleTransitions: 0,
            matchedTransitions: 0,
          },
        ).map((k) => [
          k,
          rs.reduce((s, r) => s + r.sequence[k as keyof typeof r.sequence], 0),
        ]),
      ),
      cases: rs.length,
      macroAgreement: rs.filter((r) => r.eligible).length
        ? rs
            .filter((r) => r.eligible)
            .reduce((s, r) => s + r.matches / r.eligible, 0) /
          rs.filter((r) => r.eligible).length
        : null,
      totalNotes: sum("totalNotes"),
      predictedNotes: sum("predictedNotes"),
      eligible: sum("eligible"),
      covered: sum("covered"),
      matches: sum("matches"),
      flagged: sum("flagged"),
      inferred: sum("inferred"),
      coverage: sum("eligible") ? sum("covered") / sum("eligible") : null,
      agreementSupported: sum("covered")
        ? sum("matches") / sum("covered")
        : null,
      agreementAll: sum("eligible") ? sum("matches") / sum("eligible") : null,
    };
  };
  return {
    summary: summary(rows),
    families: Object.fromEntries(
      [...new Set(cases.map((c) => c.family))].map((f) => [
        f,
        summary(rows.filter((r) => r.family === f)),
      ]),
    ),
    rows,
  };
}

/** Diagnostics only: constrained references NEVER replace unconstrained output. */
export function comparePianoReference(
  c: PianoBenchmarkCase,
  planner = planPianoPhrase,
) {
  const selected = planner(c.notes, { bpm: c.bpm }),
    kind = c.evidence ?? "printed";
  const targets = [c.labels, ...(c.alternatives ?? [])].map((labels) => {
    const fixed = new Map(
      labels
        .filter((l) => l.kind === kind && l.finger !== undefined)
        .map((l) => [l.id, l.finger]),
    );
    return planner(
      c.notes.map((n) => ({
        ...n,
        ...(fixed.has(n.id) ? { finger: fixed.get(n.id) } : {}),
      })),
      { bpm: c.bpm },
    );
  });
  return {
    id: c.id,
    family: c.family,
    referenceKind: kind,
    hands: Object.fromEntries(
      (["right", "left"] as const).map((hand) => {
        const inference = selected.hands[hand],
          valid = targets
            .map((t) => t.hands[hand])
            .filter((h) => h.status === "complete"),
          best = valid.sort((a, b) => a.cost - b.cost)[0];
        return [
          hand,
          {
            classification:
              inference.status !== "complete"
                ? "inference-unsupported"
                : !best
                  ? "reference-unrepresentable"
                  : Math.abs(best.cost - inference.cost) < 1e-7
                    ? "tied-optimum"
                    : "preference-disagreement",
            selected:
              inference.status === "complete"
                ? { cost: inference.cost, costs: inference.costs }
                : inference.diagnostic,
            reference: best
              ? { cost: best.cost, costs: best.costs }
              : targets.map((t) => t.hands[hand].diagnostic),
            costGap:
              best && inference.status === "complete"
                ? best.cost - inference.cost
                : null,
          },
        ];
      }),
    ),
  };
}
