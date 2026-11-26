/** Offline artifact adapter only. No external source or learned weights shipped. */
import type { PianoPhraseNote } from "../src/piano-phrase-fingering";
import {
  neuralContacts,
  neuralAssignments,
  type NeuralHands,
} from "./piano-neural-comparison";
export type ChiralityMode = "uniform" | "published";
export type ChiralityHand = {
  contacts: string[];
  predictions: Record<
    ChiralityMode,
    {
      fingers: number[];
      featureMs: number;
      decodeMs: number;
      nativeGateViolations: number;
      ruleFeatures: Record<string, number>;
    }
  >;
};
export function chiralityCandidateHands(
  notes: readonly PianoPhraseNote[],
  artifact: Partial<Record<"right" | "left", ChiralityHand>>,
  mode: ChiralityMode,
): NeuralHands {
  if (notes.some((n) => n.finger !== undefined))
    throw Error("Native Chirality comparison does not support source anchors");
  const contacts = neuralContacts(notes),
    result: NeuralHands = {};
  for (const hand of ["right", "left"] as const) {
    const expected = contacts.filter((c) => c.hand === hand),
      row = artifact[hand];
    if (!expected.length) {
      if (row) throw Error("Unexpected external hand");
      continue;
    }
    if (!row || !row.predictions[mode]) throw Error("Missing external hand");
    const p = row.predictions[mode];
    if (
      !Number.isFinite(p.featureMs) ||
      p.featureMs < 0 ||
      !Number.isFinite(p.decodeMs) ||
      p.decodeMs < 0 ||
      !Number.isInteger(p.nativeGateViolations) ||
      p.nativeGateViolations < 0 ||
      Object.values(p.ruleFeatures).some((v) => !Number.isFinite(v))
    )
      throw Error("Invalid Chirality diagnostics");
    result[hand] = {
      contacts: [...row.contacts],
      elapsedMs: p.featureMs + p.decodeMs,
      candidates: [{ fingers: [...p.fingers], logProbability: 0 }],
    };
    // Existing identity, cardinality and legal-digit checks; zero is just an
    // unused shortlist score, never reported as a model log probability.
    neuralAssignments(notes, hand, result[hand]!, result[hand]!.candidates[0]);
  }
  return result;
}
