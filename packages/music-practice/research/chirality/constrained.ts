// SPDX-License-Identifier: AGPL-3.0-or-later
// Offline/browser-compatible research adapter; no application imports this module.
import {
  planPianoPhrase,
  assemblePianoPhrase,
  type PianoPhraseNote,
  type PianoPhraseProfile,
  type PianoHand,
  type PianoDiagnostic,
} from "../../src/piano-phrase-fingering";
import { neuralContacts } from "../../test-fixtures/piano-neural-comparison";
import {
  decodeParncuttSequence,
  validateParncuttWeights,
  type ParncuttDecodeResult,
  type ParncuttSearchOptions,
} from "./decode";
import type { ParncuttWeights, PianoDigit } from "./rules";
export type ParncuttHandSelection = {
  source: "native" | "classic";
  reason: "empty" | "search-limit" | "physical-rejected" | "accepted";
  native?: ParncuttDecodeResult;
  physicalDiagnostic?: PianoDiagnostic;
};
/** Each native hand must have a realizable full-source path. The source score,
 * hidden voices, ties and durations stay in every physical check. Source anchors
 * are hard decoder constraints. No reference labels or per-note splicing.
 * The existing contact normalizer is reused; it has no Node/browser dependency.
 */
export function planParncuttPhrase(
  input: readonly PianoPhraseNote[],
  weights: ParncuttWeights,
  profile: PianoPhraseProfile = {},
  search: ParncuttSearchOptions = {},
) {
  validateParncuttWeights(weights);
  const baseline = planPianoPhrase(input, profile),
    hands = { ...baseline.hands };
  if (input.length > 8000)
    return {
      plan: baseline,
      selections: {
        right: { source: "classic", reason: "search-limit" },
        left: { source: "classic", reason: "search-limit" },
      } as Record<PianoHand, ParncuttHandSelection>,
    };
  const contacts = neuralContacts(input),
    selections = {} as Record<PianoHand, ParncuttHandSelection>;
  for (const hand of ["right", "left"] as const) {
    const own = contacts.filter((c) => c.hand === hand);
    if (!own.length) {
      selections[hand] = { source: "classic", reason: "empty" };
      continue;
    }
    const native = decodeParncuttSequence(
      own.map((c) => ({
        id: c.id,
        midi: c.midi,
        finger: c.finger as PianoDigit | undefined,
      })),
      hand,
      weights,
      search,
    );
    if (native.status !== "complete") {
      selections[hand] = { source: "classic", reason: "search-limit", native };
      continue;
    }
    const fixed = new Map<string, number>();
    own.forEach((c, i) =>
      c.ids.forEach((id) => fixed.set(id, native.fingers[i])),
    );
    const candidate = planPianoPhrase(
      input.map((n) => ({
        ...n,
        ...(n.hand === hand ? { finger: fixed.get(n.id) } : {}),
      })),
      profile,
    );
    if (candidate.hands[hand].status !== "complete") {
      selections[hand] = {
        source: "classic",
        reason: "physical-rejected",
        native,
        physicalDiagnostic: candidate.hands[hand].diagnostic,
      };
      continue;
    }
    hands[hand] = candidate.hands[hand];
    selections[hand] = { source: "native", reason: "accepted", native };
  }
  const plan = assemblePianoPhrase(
    hands,
    input.map((n) => n.id),
  );
  // Fixed candidate constraints are not new source-authored fingering metadata.
  const source = new Map(input.map((n) => [n.id, n]));
  plan.notes = plan.notes.map((n) => ({
    ...n,
    ...source.get(n.id)!,
    finger: n.finger,
  }));
  return { plan, selections };
}
