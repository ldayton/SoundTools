/** Evaluation-only diagnostics. Reference constraints never replace inference. */
import {
  planPianoPhrase,
  type PianoPhraseCosts,
  type PianoHandPlan,
} from "../src/piano-phrase-fingering";
import {
  scorePianoBenchmarkCase,
  type PianoBenchmarkCase,
} from "./piano-benchmark";

const tolerance = 1e-7;
export function comparePianoCostFeatures(
  selected: PianoPhraseCosts,
  reference: PianoPhraseCosts,
) {
  const delta = Object.fromEntries(
    (Object.keys(selected) as (keyof PianoPhraseCosts)[]).map((key) => [
      key,
      reference[key] - selected[key],
    ]),
  ) as PianoPhraseCosts;
  if (Object.values(delta).some((value) => !Number.isFinite(value)))
    throw Error("Invalid cost feature vector");
  const values = Object.values(delta),
    positive = values.some((v) => v > tolerance),
    negative = values.some((v) => v < -tolerance);
  return {
    delta,
    classification:
      positive && negative
        ? "tradeoff"
        : positive
          ? "dominated-reference-completion"
          : negative
            ? "reference-dominates-selected"
            : "indistinguishable-completions",
  };
}

export function auditPianoCosts(
  c: PianoBenchmarkCase,
  planner = planPianoPhrase,
) {
  const selected = planner(c.notes, { bpm: c.bpm }),
    score = scorePianoBenchmarkCase(c, selected),
    kind = c.evidence ?? "printed";
  const references = [c.labels, ...(c.alternatives ?? [])],
    digits = new Map(selected.notes.map((n) => [n.id, n.finger]));
  const matches = (labels: typeof c.labels) =>
    labels.filter(
      (l) =>
        l.kind === kind &&
        l.finger !== undefined &&
        digits.get(l.id) === l.finger,
    ).length;
  const scoringReference = references.reduce(
    (best, labels) => (matches(labels) > matches(best) ? labels : best),
    references[0],
  );
  const alternatives = references.map((labels, index) => {
    const fixed = new Map(
      labels
        .filter((l) => l.kind === kind && l.finger !== undefined)
        .map((l) => [l.id, l.finger!]),
    );
    const conflicts = new Set(
      c.notes
        .filter(
          (n) =>
            n.finger !== undefined &&
            fixed.has(n.id) &&
            n.finger !== fixed.get(n.id),
        )
        .map((n) => n.hand),
    );
    const plan = planner(
      c.notes.map((n) => ({
        ...n,
        ...(fixed.has(n.id) && n.finger === undefined
          ? { finger: fixed.get(n.id) }
          : {}),
      })),
      { bpm: c.bpm },
    );
    return { index, labels, plan, conflicts };
  });
  return (["left", "right"] as const).map((hand) => {
    const ids = new Set(
        c.notes.filter((n) => n.hand === hand).map((n) => n.id),
      ),
      annotated = scoringReference.filter(
        (l) => l.kind === kind && l.finger !== undefined && ids.has(l.id),
      );
    const mismatches = score.mismatches.filter((l) => ids.has(l.id)),
      inference = selected.hands[hand];
    const targets = alternatives.filter((a) =>
      a.labels.some(
        (l) => l.kind === kind && l.finger !== undefined && ids.has(l.id),
      ),
    );
    const valid = targets
      .filter(
        (a) =>
          !a.conflicts.has(hand) && a.plan.hands[hand].status === "complete",
      )
      .sort(
        (a, b) =>
          a.plan.hands[hand].cost - b.plan.hands[hand].cost ||
          a.index - b.index,
      );
    const best = valid[0],
      reference = best?.plan.hands[hand];
    const gap =
      reference && inference.status === "complete"
        ? reference.cost - inference.cost
        : null;
    const features =
      reference && inference.status === "complete"
        ? comparePianoCostFeatures(inference.costs, reference.costs)
        : null;
    const classification = !annotated.length
      ? "no-reference"
      : inference.status !== "complete"
        ? "inference-unsupported"
        : !reference
          ? "reference-unrepresentable"
          : gap! < -tolerance
            ? "search-inconsistency"
            : !mismatches.length
              ? "matches-reference"
              : Math.abs(gap!) <= tolerance
                ? "tied-optimum"
                : "preference-disagreement";
    const costs = (plan: PianoHandPlan) =>
      plan.status === "complete"
        ? { cost: plan.cost, costs: plan.costs }
        : null;
    return {
      hand,
      classification,
      evidence: kind,
      eligible: annotated.length,
      matches: annotated.length - mismatches.length,
      mismatches: mismatches.length,
      mismatchedIds: mismatches.map((n) => n.id),
      scoringReferenceIndex: references.indexOf(scoringReference),
      referenceAlternativeIndex: best?.index ?? null,
      costGap: gap,
      selected: costs(inference),
      reference: reference ? costs(reference) : null,
      featureComparison: features,
      diagnostics: {
        selected: inference.diagnostic ?? null,
        references: targets
          .filter(
            (a) =>
              a.conflicts.has(hand) || a.plan.hands[hand].status !== "complete",
          )
          .map((a) => ({
            alternative: a.index,
            ...(a.conflicts.has(hand)
              ? { code: "source-anchor-conflict" }
              : { ...a.plan.hands[hand].diagnostic }),
          })),
      },
    };
  });
}

export type PianoCostAuditRow = ReturnType<typeof auditPianoCosts>[number];
export function summarizePianoCostAudit(rows: readonly PianoCostAuditRow[]) {
  const annotated = rows.filter((r) => r.eligible),
    disagreements = annotated.filter((r) => r.mismatches),
    sum = (
      rs: readonly PianoCostAuditRow[],
      key: "eligible" | "matches" | "mismatches",
    ) => rs.reduce((s, r) => s + r[key], 0);
  return {
    hands: rows.length,
    annotatedHands: annotated.length,
    disagreeingHands: disagreements.length,
    eligible: sum(annotated, "eligible"),
    matches: sum(annotated, "matches"),
    mismatches: sum(annotated, "mismatches"),
    classifications: Object.fromEntries(
      [
        "matches-reference",
        "inference-unsupported",
        "reference-unrepresentable",
        "tied-optimum",
        "preference-disagreement",
        "search-inconsistency",
      ].map((key) => {
        const selected = annotated.filter((r) => r.classification === key);
        return [
          key,
          { hands: selected.length, mismatches: sum(selected, "mismatches") },
        ];
      }),
    ),
    featureComparisons: Object.fromEntries(
      [
        "tradeoff",
        "dominated-reference-completion",
        "indistinguishable-completions",
        "reference-dominates-selected",
      ].map((key) => {
        const selected = disagreements.filter(
          (r) => r.featureComparison?.classification === key,
        );
        return [
          key,
          { hands: selected.length, mismatches: sum(selected, "mismatches") },
        ];
      }),
    ),
  };
}
