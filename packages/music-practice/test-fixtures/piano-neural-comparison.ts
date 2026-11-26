/** Evaluation only. No neural runtime or model is imported by the application. */
import {
  planPianoPhrase,
  assemblePianoPhrase,
  type PianoPhraseNote,
  type PianoPhrasePlan,
  type PianoHandPlan,
} from "../src/piano-phrase-fingering";
export type NeuralContact = Omit<PianoPhraseNote, "tieFrom"> & {
  ids: string[];
};
export function neuralContacts(
  notes: readonly PianoPhraseNote[],
): NeuralContact[] {
  const contacts: NeuralContact[] = [],
    byId = new Map<string, NeuralContact>();
  for (const note of [...notes].sort(
    (a, b) => a.start - b.start || a.midi - b.midi || a.id.localeCompare(b.id),
  )) {
    if (byId.has(note.id)) throw Error("Duplicate note ID");
    const tie = note.tieFrom ? byId.get(note.tieFrom) : undefined;
    if (
      note.tieFrom &&
      (!tie ||
        tie.midi !== note.midi ||
        tie.hand !== note.hand ||
        Math.abs(tie.start + tie.duration - note.start) > 1e-8)
    )
      throw Error("Invalid tie contact");
    const contact =
      tie ??
      contacts.find(
        (c) =>
          c.hand === note.hand &&
          c.midi === note.midi &&
          Math.abs(c.start - note.start) < 1e-8,
      );
    if (contact) {
      if (
        note.finger !== undefined &&
        contact.finger !== undefined &&
        note.finger !== contact.finger
      )
        throw Error("Conflicting contact anchors");
      contact.duration =
        Math.max(contact.start + contact.duration, note.start + note.duration) -
        contact.start;
      contact.ids.push(note.id);
      if (note.finger !== undefined) contact.finger = note.finger;
      byId.set(note.id, contact);
    } else {
      const { tieFrom, ...rest } = note;
      const fresh = { ...rest, ids: [note.id] };
      contacts.push(fresh);
      byId.set(note.id, fresh);
    }
  }
  return contacts;
}
export type NeuralCandidate = { fingers: number[]; logProbability: number };
export type NeuralPrediction = {
  contacts: string[];
  candidates: NeuralCandidate[];
  elapsedMs: number;
};
export type NeuralHands = Partial<Record<"left" | "right", NeuralPrediction>>;
export function neuralAssignments(
  notes: readonly PianoPhraseNote[],
  hand: "left" | "right",
  prediction: NeuralPrediction,
  candidate: NeuralCandidate,
) {
  const contacts = neuralContacts(notes).filter((n) => n.hand === hand);
  if (!Number.isFinite(candidate.logProbability))
    throw Error("Invalid neural candidate score");
  if (
    prediction.contacts.length !== contacts.length ||
    candidate.fingers.length !== contacts.length ||
    contacts.some((n, i) => n.id !== prediction.contacts[i])
  )
    throw Error("Neural contact identity mismatch");
  const digits = new Map<string, number>();
  contacts.forEach((n, i) => {
    const f = candidate.fingers[i];
    if (
      !Number.isInteger(f) ||
      f < 1 ||
      f > 5 ||
      (n.finger !== undefined && n.finger !== f)
    )
      throw Error("Invalid neural digit or changed anchor");
    n.ids.forEach((id) => digits.set(id, f));
  });
  return digits;
}
export function rawNeuralPlan(
  notes: readonly PianoPhraseNote[],
  predictions: NeuralHands,
  bpm: number,
): PianoPhrasePlan {
  const baseline = planPianoPhrase(notes, { bpm });
  const hands = {} as Record<"left" | "right", PianoHandPlan>;
  for (const hand of ["left", "right"] as const) {
    const wanted = notes.filter((n) => n.hand === hand),
      p = predictions[hand];
    if (wanted.length && (!p || !p.candidates.length))
      throw Error("Missing neural hand");
    const fs = p
      ? neuralAssignments(notes, hand, p, p.candidates[0])
      : new Map<string, number>();
    // Shape adapter for the existing identity/sequence scorer. This does NOT
    // claim feasibility; fixed-input planning and independent checks score that.
    hands[hand] = {
      ...baseline.hands[hand],
      status: "complete",
      diagnostic: undefined,
      notes: wanted.map((n) => ({
        ...n,
        finger: fs.get(n.id)!,
        anchor: 0,
        shift: false,
        crossing: false,
        contactId: n.id,
      })),
      states: [],
    };
  }
  return assemblePianoPhrase(
    hands,
    notes.map((n) => n.id),
  );
}
export function constrainedNeuralPlan(
  notes: readonly PianoPhraseNote[],
  predictions: NeuralHands,
  bpm: number,
) {
  const baseline = planPianoPhrase(notes, { bpm }),
    hands = { ...baseline.hands };
  const selected: Record<string, number | null> = {};
  for (const hand of ["left", "right"] as const) {
    const p = predictions[hand];
    selected[hand] = null;
    if (notes.some((n) => n.hand === hand) && (!p || !p.candidates.length))
      throw Error("Missing neural hand");
    if (!p) continue;
    for (const [i, candidate] of p.candidates.entries()) {
      const fs = neuralAssignments(notes, hand, p, candidate);
      const fixed = notes.map((n) => ({
        ...n,
        ...(n.hand === hand ? { finger: fs.get(n.id) } : {}),
      }));
      const result = planPianoPhrase(fixed, { bpm });
      if (result.hands[hand].status === "complete") {
        hands[hand] = result.hands[hand];
        selected[hand] = i;
        break;
      }
    }
  }
  const plan = assemblePianoPhrase(
    hands,
    notes.map((n) => n.id),
  );
  // Keep source metadata intact for exact identity scoring.
  plan.notes = plan.notes.map((n) => ({
    ...n,
    ...notes.find((s) => s.id === n.id)!,
  }));
  return { plan, selected };
}
/** Independent basic safety audit; model-relative reach is measured separately. */
export function neuralPhysicalViolations(
  notes: readonly PianoPhraseNote[],
  digits: ReadonlyMap<string, number>,
) {
  const contacts = neuralContacts(notes),
    violations: { code: string; ids: string[] }[] = [];
  for (let i = 0; i < contacts.length; i++)
    for (let j = i + 1; j < contacts.length; j++) {
      const a = contacts[i],
        b = contacts[j];
      if (
        Math.min(a.start + a.duration, b.start + b.duration) -
          Math.max(a.start, b.start) <=
        1e-8
      )
        continue;
      const fa = digits.get(a.id),
        fb = digits.get(b.id);
      if (fa === undefined || fb === undefined) continue;
      if (a.hand !== b.hand && a.midi === b.midi)
        violations.push({ code: "cross_hand_key", ids: [a.id, b.id] });
      if (a.hand === b.hand && fa === fb && a.midi !== b.midi)
        violations.push({ code: "finger_double_booked", ids: [a.id, b.id] });
      if (
        a.hand === b.hand &&
        fa !== 1 &&
        fb !== 1 &&
        (a.midi - b.midi) * (fa - fb) * (a.hand === "right" ? 1 : -1) < 0
      )
        violations.push({ code: "nonthumb_order", ids: [a.id, b.id] });
    }
  return violations;
}
