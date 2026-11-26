/** Isolated research ranking. No references or neural runtime enter the app. */
import {
  assemblePianoPhrase,
  planPianoPhrase,
  type PianoHand,
  type PianoPhraseNote,
  type PianoHandPlan,
} from "../src/piano-phrase-fingering";
import {
  neuralAssignments,
  neuralContacts,
  neuralPhysicalViolations,
  type NeuralCandidate,
  type NeuralHands,
} from "./piano-neural-comparison";

export type HybridCandidate = NeuralCandidate & {
  id: string;
  source: "classic" | "neural";
};
export type HybridHands = Partial<
  Record<
    PianoHand,
    {
      contacts: string[];
      candidates: HybridCandidate[];
    }
  >
>;

/** Label-free candidate preparation; classic likelihood is computed later. */
export function hybridCandidateSet(
  notes: readonly PianoPhraseNote[],
  predictions: NeuralHands,
  bpm: number,
): HybridHands {
  const baseline = planPianoPhrase(notes, { bpm }),
    result: HybridHands = {};
  for (const hand of ["left", "right"] as const) {
    const contacts = neuralContacts(notes).filter((n) => n.hand === hand),
      p = predictions[hand];
    if (!contacts.length) {
      if (p) throw Error("Unexpected empty-hand prediction");
      continue;
    }
    if (!p || !p.candidates.length || p.candidates.length > 6)
      throw Error("Missing or oversized neural shortlist");
    for (const candidate of p.candidates)
      neuralAssignments(notes, hand, p, candidate);
    const classic = baseline.hands[hand],
      digits = new Map(classic.notes.map((n) => [n.id, n.finger]));
    result[hand] = {
      contacts: contacts.map((n) => n.id),
      candidates: [
        ...(classic.status === "complete"
          ? [
              {
                id: "classic",
                source: "classic" as const,
                fingers: contacts.map((n) => digits.get(n.id)!),
                // Deliberately invalid until scored with the real model. JSON
                // serializes this as null; it must never be used as a zero NLL.
                logProbability: Number.NaN,
              },
            ]
          : []),
        ...p.candidates.map((c, i) => ({
          ...c,
          id: `beam-${i}`,
          source: "neural" as const,
        })),
      ],
    };
  }
  return result;
}

export function hybridObjective(
  logProbability: number,
  physicalCost: number,
  contacts: number,
  physicalCostWeight: number,
) {
  if (
    !Number.isFinite(logProbability) ||
    logProbability > 0 ||
    !Number.isFinite(physicalCost) ||
    physicalCost < 0 ||
    !Number.isInteger(contacts) ||
    contacts <= 0 ||
    !Number.isFinite(physicalCostWeight) ||
    physicalCostWeight < 0
  )
    throw Error("Invalid hybrid objective input");
  return (-logProbability + physicalCostWeight * physicalCost) / contacts;
}

type CandidateAudit = {
  id: string;
  source: HybridCandidate["source"];
  logProbability: number;
  status:
    | "feasible"
    | "duplicate"
    | "unsupported"
    | "physical-conflict"
    | "movement-regression"
    | "no-simplification"
    | "baseline-unsupported";
  duplicateOf?: string;
  physicalCost?: number;
  costs?: ReturnType<typeof planPianoPhrase>["costs"];
  objective?: number;
  complexity?: ReturnType<typeof pianoMovementComplexity>;
};

export function pianoMovementComplexity(hand: PianoHandPlan) {
  const events = hand.states.flatMap((state) => state.events);
  return {
    relocations: events.filter((event) => event.kind === "move").length,
    crossings: events.filter(
      (event) => event.kind === "thumb_under" || event.kind === "finger_over",
    ).length,
    repeatChanges: events.filter((event) => event.kind === "repeat_change")
      .length,
  };
}
export type HybridPolicy =
  | "unrestricted"
  | "preserve-movement-complexity"
  | "reduce-movement-complexity";

/** Rank complete hands, preserving source diagnostics, anchors and tie contacts. */
export function hybridNeuralPlan(
  notes: readonly PianoPhraseNote[],
  predictions: HybridHands,
  bpm: number,
  physicalCostWeight: number,
  policy: HybridPolicy = "reduce-movement-complexity",
) {
  // Validate policy even for empty or unsupported input.
  hybridObjective(0, 0, 1, physicalCostWeight);
  if (
    ![
      "unrestricted",
      "preserve-movement-complexity",
      "reduce-movement-complexity",
    ].includes(policy)
  )
    throw Error("Unknown hybrid policy");
  const baseline = planPianoPhrase(notes, { bpm }),
    hands = { ...baseline.hands };
  const decisions: Partial<
    Record<PianoHand, { selected: string | null; candidates: CandidateAudit[] }>
  > = {};
  const originals = new Map(notes.map((n) => [n.id, n]));
  for (const hand of ["left", "right"] as const) {
    const contacts = neuralContacts(notes).filter((n) => n.hand === hand),
      p = predictions[hand];
    if (!contacts.length) {
      if (p) throw Error("Unexpected empty-hand prediction");
      continue;
    }
    if (!p || !p.candidates.length || p.candidates.length > 7)
      throw Error("Missing or oversized hybrid shortlist");
    if (new Set(p.candidates.map((c) => c.id)).size !== p.candidates.length)
      throw Error("Duplicate hybrid candidate ID");
    const classic = baseline.hands[hand],
      classicCandidates = p.candidates.filter((c) => c.source === "classic");
    if (classicCandidates.length !== +(classic.status === "complete"))
      throw Error("Missing or unexpected classic candidate");
    const expected = new Map(classic.notes.map((n) => [n.id, n.finger]));
    const ordered = [...p.candidates].sort(
      (a, b) =>
        +(b.source === "classic") - +(a.source === "classic") ||
        a.id.localeCompare(b.id),
    );
    const decision = {
      selected: null as string | null,
      candidates: [] as CandidateAudit[],
    };
    decisions[hand] = decision;
    const seen = new Map<string, string>();
    let best = Infinity;
    for (const candidate of ordered) {
      if (!candidate.id || !["classic", "neural"].includes(candidate.source))
        throw Error("Invalid hybrid candidate source");
      hybridObjective(
        candidate.logProbability,
        0,
        contacts.length,
        physicalCostWeight,
      );
      const digits = neuralAssignments(
        notes,
        hand,
        { ...p, elapsedMs: 0 },
        candidate,
      );
      if (
        candidate.source === "classic" &&
        classic.notes.some((n) => digits.get(n.id) !== expected.get(n.id))
      )
        throw Error("Classic candidate changed");
      const audit: CandidateAudit = {
        id: candidate.id,
        source: candidate.source,
        logProbability: candidate.logProbability,
        status: "unsupported",
      };
      decision.candidates.push(audit);
      if (classic.status !== "complete") {
        audit.status = "baseline-unsupported";
        continue;
      }
      const signature = candidate.fingers.join(","),
        duplicate = seen.get(signature);
      if (duplicate) {
        audit.status = "duplicate";
        audit.duplicateOf = duplicate;
        continue;
      }
      seen.set(signature, candidate.id);
      const handNotes = notes.filter((n) => n.hand === hand);
      if (neuralPhysicalViolations(handNotes, digits).length) {
        audit.status = "physical-conflict";
        continue;
      }
      const planned =
        candidate.source === "classic"
          ? classic
          : planPianoPhrase(
              notes.map((n) =>
                n.hand === hand ? { ...n, finger: digits.get(n.id)! } : n,
              ),
              { bpm },
            ).hands[hand];
      if (planned.status !== "complete") continue;
      const objective = hybridObjective(
        candidate.logProbability,
        planned.cost,
        contacts.length,
        physicalCostWeight,
      );
      Object.assign(audit, {
        status: "feasible",
        physicalCost: planned.cost,
        costs: planned.costs,
        objective,
      });
      const complexity = pianoMovementComplexity(planned),
        prior = pianoMovementComplexity(classic);
      audit.complexity = complexity;
      const keys = Object.keys(prior) as (keyof typeof prior)[];
      if (
        policy !== "unrestricted" &&
        keys.some((key) => complexity[key] > prior[key])
      ) {
        audit.status = "movement-regression";
        continue;
      }
      if (
        policy === "reduce-movement-complexity" &&
        candidate.source !== "classic" &&
        !keys.some((key) => complexity[key] < prior[key])
      ) {
        audit.status = "no-simplification";
        continue;
      }
      if (objective < best) {
        best = objective;
        decision.selected = candidate.id;
        hands[hand] = {
          ...planned,
          notes: planned.notes.map((n) => ({
            ...n,
            ...originals.get(n.id)!,
            finger: n.finger,
          })),
        };
      }
    }
    if (classic.status === "complete" && decision.selected === null)
      throw Error("No admissible candidate including classic");
  }
  const plan = assemblePianoPhrase(
    hands,
    notes.map((n) => n.id),
  );
  if (
    neuralPhysicalViolations(
      notes,
      new Map(plan.notes.map((n) => [n.id, n.finger])),
    ).length
  )
    throw Error("Hybrid output failed independent physical audit");
  return { plan, decisions };
}

export type HybridMetrics = {
  matches: number;
  printedMatches: number;
  covered: number;
  feasibleHands: number;
  completeCases: number;
  completeHands: number;
  matchedTransitions: number;
  basicViolations: number;
  familyMatches: Record<string, number>;
};
export function hybridAcceptance(
  baseline: HybridMetrics,
  candidate: HybridMetrics,
) {
  const metrics = [
    "printedMatches",
    "covered",
    "feasibleHands",
    "completeCases",
    "completeHands",
    "matchedTransitions",
  ] as const;
  return [
    {
      id: "matches",
      passed: candidate.matches > baseline.matches,
      baseline: baseline.matches,
      candidate: candidate.matches,
    },
    ...metrics.map((id) => ({
      id,
      passed: candidate[id] >= baseline[id],
      baseline: baseline[id],
      candidate: candidate[id],
    })),
    {
      id: "basicViolations",
      passed: candidate.basicViolations === 0,
      baseline: baseline.basicViolations,
      candidate: candidate.basicViolations,
    },
    ...Object.entries(baseline.familyMatches).map(([family, count]) => ({
      id: "family:" + family,
      passed:
        family in candidate.familyMatches &&
        candidate.familyMatches[family] >= count,
      baseline: count,
      candidate: candidate.familyMatches[family] ?? null,
    })),
  ];
}
