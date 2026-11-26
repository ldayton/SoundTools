// SPDX-License-Identifier: AGPL-3.0-or-later
// Port of Chirality's weighted Parncutt Viterbi objective. No model weights bundled.
import {
  assertPianoHand,
  assertPianoNote,
  type PianoHand,
} from "../../src/piano-hand-model";
import {
  parncuttRuleKeys,
  parncuttZeroFeatures,
  parncuttUniformWeights,
  parncuttDot,
  addParncuttFeatures,
  parncuttNoteFeatures,
  parncuttPairFeatures,
  parncuttTripleFeatures,
  parncuttNativeTransition,
  type ParncuttFeatures,
  type ParncuttWeights,
  type PianoDigit,
  type ParncuttAttack,
} from "./rules";

export const parncuttNativeGatePenalty = 100_000_000;
export type ParncuttInputNote = Readonly<{
  id: string;
  midi: number;
  finger?: PianoDigit;
}>;
export type ParncuttStatistics = {
  notes: number;
  transitions: number;
  peakStates: number;
};
export type ParncuttDecodeResult =
  | {
      status: "complete";
      fingers: PianoDigit[];
      features: ParncuttFeatures;
      ruleCost: number;
      gateViolations: number;
      cost: number;
      searchCost: number;
      statistics: ParncuttStatistics;
    }
  | {
      status: "unsupported";
      reason: "search_limit";
      fingers: [];
      statistics: ParncuttStatistics;
    };
export type ParncuttSearchOptions = Readonly<{
  maxNotes?: number;
  maxTransitions?: number;
}>;

export function validateParncuttWeights(weights: ParncuttWeights) {
  if (
    !weights ||
    typeof weights !== "object" ||
    Object.keys(weights).length !== parncuttRuleKeys.length ||
    parncuttRuleKeys.some(
      (k) =>
        !Object.hasOwn(weights, k) ||
        !Number.isFinite(weights[k]) ||
        weights[k] < 0 ||
        weights[k] > 10_000,
    )
  )
    throw Error(
      "Invalid Parncutt weights: require exactly twelve finite costs in [0, 10000]",
    );
}
function validateInput(
  notes: readonly ParncuttInputNote[],
  hand: PianoHand,
  weights: ParncuttWeights,
) {
  assertPianoHand(hand);
  validateParncuttWeights(weights);
  const ids = new Set<string>();
  for (const n of notes) {
    assertPianoNote({ midi: n.midi, duration: 1, finger: n.finger });
    if (typeof n.id !== "string" || !n.id.length || ids.has(n.id))
      throw Error("Invalid Parncutt note identity");
    ids.add(n.id);
  }
}
/** Evaluate a complete native sequence independently of the dynamic program. */
export function evaluateParncuttPath(
  notes: readonly ParncuttInputNote[],
  fingers: readonly PianoDigit[],
  hand: PianoHand,
  weights: ParncuttWeights = parncuttUniformWeights,
) {
  validateInput(notes, hand, weights);
  if (fingers.length !== notes.length) throw Error("Incomplete Parncutt path");
  const features = parncuttZeroFeatures();
  let gateViolations = 0;
  const attack = (i: number): ParncuttAttack => ({
    midi: notes[i].midi,
    finger: fingers[i],
  });
  for (let i = 0; i < notes.length; i++) {
    assertPianoNote({ midi: notes[i].midi, duration: 1, finger: fingers[i] });
    if (notes[i].finger !== undefined && notes[i].finger !== fingers[i])
      throw Error("Changed authored Parncutt finger");
    addParncuttFeatures(
      features,
      parncuttNoteFeatures(
        notes[i].midi,
        fingers[i],
        notes[i - 1]?.midi,
        notes[i + 1]?.midi,
      ),
    );
    if (i) {
      addParncuttFeatures(
        features,
        parncuttPairFeatures(attack(i - 1), attack(i), hand),
      );
      gateViolations += +!parncuttNativeTransition(
        attack(i - 1),
        attack(i),
        hand,
      );
    }
    if (i > 1)
      addParncuttFeatures(
        features,
        parncuttTripleFeatures(attack(i - 2), attack(i - 1), attack(i), hand),
      );
  }
  const ruleCost = parncuttDot(features, weights);
  return {
    features,
    ruleCost,
    gateViolations,
    cost: ruleCost + gateViolations * parncuttNativeGatePenalty,
  };
}

/** Exact native sequence objective, not a held-key feasibility guarantee.
 * 25 rolling states, at most 125 edges per attack, 25*n byte backpointers.
 * Strict first-minimum tie order follows upstream; no epsilon or beam pruning.
 * Inputs/weights are never changed. Explicit search limits return no partial path.
 */
export function decodeParncuttSequence(
  notes: readonly ParncuttInputNote[],
  hand: PianoHand,
  weights: ParncuttWeights = parncuttUniformWeights,
  options: ParncuttSearchOptions = {},
): ParncuttDecodeResult {
  assertPianoHand(hand);
  validateParncuttWeights(weights);
  const maxNotes = options.maxNotes ?? 4000,
    maxTransitions = options.maxTransitions ?? 500_000;
  if (
    !Number.isSafeInteger(maxNotes) ||
    maxNotes < 1 ||
    maxNotes > 4000 ||
    !Number.isSafeInteger(maxTransitions) ||
    maxTransitions < 1 ||
    maxTransitions > 500_000
  )
    throw Error("Invalid Parncutt search limit");
  const statistics: ParncuttStatistics = {
    notes: notes.length,
    transitions: 0,
    peakStates: 0,
  };
  const unsupported = (): ParncuttDecodeResult => ({
    status: "unsupported",
    reason: "search_limit",
    fingers: [],
    statistics,
  });
  if (notes.length > maxNotes) return unsupported();
  validateInput(notes, hand, weights);
  const allowed = (i: number, digit: number) =>
    notes[i].finger === undefined || notes[i].finger === digit;
  const at = (i: number, f: number): ParncuttAttack => ({
    midi: notes[i].midi,
    finger: (f + 1) as PianoDigit,
  });
  const noteCosts = notes.map((n, i) =>
    Float64Array.from({ length: 5 }, (_, f) =>
      allowed(i, f + 1)
        ? parncuttDot(
            parncuttNoteFeatures(
              n.midi,
              (f + 1) as PianoDigit,
              notes[i - 1]?.midi,
              notes[i + 1]?.midi,
            ),
            weights,
          )
        : Infinity,
    ),
  );
  if (notes.length < 2) {
    let finger = 0;
    if (notes.length)
      for (let f = 1; f < 5; f++)
        if (noteCosts[0][f] < noteCosts[0][finger]) finger = f;
    const fingers = notes.length ? [(finger + 1) as PianoDigit] : [];
    statistics.peakStates = notes.length ? 5 : 0;
    const evaluation = evaluateParncuttPath(notes, fingers, hand, weights);
    return {
      status: "complete",
      fingers,
      ...evaluation,
      searchCost: evaluation.cost,
      statistics,
    };
  }
  const pairCosts = (i: number) =>
    Float64Array.from({ length: 25 }, (_, index) => {
      const a = at(i - 1, Math.floor(index / 5)),
        b = at(i, index % 5);
      return (
        parncuttDot(parncuttPairFeatures(a, b, hand), weights) +
        (parncuttNativeTransition(a, b, hand) ? 0 : parncuttNativeGatePenalty)
      );
    });
  let costs = new Float64Array(25).fill(Infinity);
  const seed = pairCosts(1),
    backs = new Uint8Array(notes.length * 25);
  for (let prev = 0; prev < 5; prev++)
    for (let curr = 0; curr < 5; curr++) {
      if (++statistics.transitions > maxTransitions) return unsupported();
      costs[prev * 5 + curr] =
        noteCosts[0][prev] + noteCosts[1][curr] + seed[prev * 5 + curr];
    }
  statistics.peakStates = 25;
  for (let i = 2; i < notes.length; i++) {
    const next = new Float64Array(25).fill(Infinity),
      pair = pairCosts(i);
    for (let prev = 0; prev < 5; prev++)
      for (let curr = 0; curr < 5; curr++) {
        const index = prev * 5 + curr;
        for (let older = 0; older < 5; older++) {
          if (++statistics.transitions > maxTransitions) return unsupported();
          const triple = parncuttDot(
            parncuttTripleFeatures(
              at(i - 2, older),
              at(i - 1, prev),
              at(i, curr),
              hand,
            ),
            weights,
          );
          const candidate =
            costs[older * 5 + prev] + triple + pair[index] + noteCosts[i][curr];
          if (candidate < next[index]) {
            next[index] = candidate;
            backs[i * 25 + index] = older;
          }
        }
      }
    costs = next;
  }
  let best = 0;
  for (let i = 1; i < 25; i++) if (costs[i] < costs[best]) best = i;
  const fingers: PianoDigit[] = Array(notes.length);
  fingers[notes.length - 2] = (Math.floor(best / 5) + 1) as PianoDigit;
  fingers[notes.length - 1] = ((best % 5) + 1) as PianoDigit;
  for (let i = notes.length - 1; i >= 2; i--)
    fingers[i - 2] = (backs[
      i * 25 + (fingers[i - 1] - 1) * 5 + fingers[i] - 1
    ] + 1) as PianoDigit;
  return {
    status: "complete",
    fingers,
    ...evaluateParncuttPath(notes, fingers, hand, weights),
    searchCost: costs[best],
    statistics,
  };
}
