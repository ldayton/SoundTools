// SPDX-License-Identifier: AGPL-3.0-or-later
// Unified research policy: classic physical graph, contextual Parncutt preference.
import {
  planPianoPhrase,
  planPianoPhraseRanked,
  pianoPhraseContacts,
  pianoSameTime,
  assemblePianoPhrase,
  type PianoPhraseNote,
  type PianoPhraseProfile,
  type PianoRankingFrame,
  type PianoHand,
} from "../../src/piano-phrase-fingering";
import { pianoBlackKey, pianoKeyPosition } from "../../src/piano-hand-model";
import { validateParncuttWeights } from "./decode";
import {
  parncuttNoteFeatures,
  parncuttPairFeatures,
  parncuttTripleFeatures,
  parncuttDot,
  type ParncuttWeights,
  type PianoDigit,
} from "./rules";
type Contact = ReturnType<typeof pianoPhraseContacts>["contacts"][number];
export type PianoIdiom = "grip" | "general" | "closed-position" | "chromatic";
export type PianoContactContext = {
  idiom: PianoIdiom;
  previous?: string;
  next?: string;
};
export const unifiedPianoPolicyVersion = "unified-v3";

/** Only input structure enters recognition. No source names, reference digits,
 * learned predictions, or editorial exercise labels enter these preferences. */
export function analyzePianoContexts(notes: readonly PianoPhraseNote[]) {
  const { contacts, diagnostics } = pianoPhraseContacts(notes),
    context = new Map<string, PianoContactContext>();
  const groups = new Map<string, Contact[]>();
  for (const c of contacts) {
    context.set(c.id, { idiom: "grip" });
    const simultaneous = contacts.filter(
      (d) => d.hand === c.hand && pianoSameTime(d.start, c.start),
    );
    const overlapping = contacts.some(
      (d) =>
        d.hand === c.hand &&
        d.id !== c.id &&
        d.start <= c.start &&
        d.end > c.start,
    );
    if (simultaneous.length !== 1 || (c.voice === undefined && overlapping))
      continue;
    const k = JSON.stringify([c.hand, c.voice]),
      g = groups.get(k) ?? [];
    g.push(c);
    groups.set(k, g);
  }
  const chunks: Contact[][] = [];
  for (const g of groups.values()) {
    g.sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
    let chunk: Contact[] = [];
    for (const c of g) {
      const p = chunk.at(-1);
      if (p && (c.phraseStart || !pianoSameTime(p.end, c.start))) {
        chunks.push(chunk);
        chunk = [];
      }
      chunk.push(c);
    }
    if (chunk.length) chunks.push(chunk);
  }
  for (const chunk of chunks) {
    const pitches = chunk.map((c) => c.midi),
      keys = pitches.map(pianoKeyPosition);
    const closed =
      new Set(pitches).size <= 5 &&
      Math.max(...pitches) - Math.min(...pitches) <= 9 &&
      Math.max(...keys) - Math.min(...keys) <= 5;
    chunk.forEach((c, i) =>
      context.set(c.id, {
        idiom: closed ? "closed-position" : "general",
        previous: chunk[i - 1]?.id,
        next: chunk[i + 1]?.id,
      }),
    );
    // A stream may change hand position several times. Recognize local closed
    // regions too: at least four attacks on at most five distinct keys within a major sixth, including
    // stretched positions that skip an intermediate key. Sliding
    // windows are input-only; difference marks avoid quadratic range painting.
    if (!closed) {
      const counts = new Map<number, number>(),
        marks = new Int32Array(chunk.length + 1);
      let end = 0;
      const fits = (midi: number) => {
        const ps = [...counts.keys(), midi],
          ks = ps.map(pianoKeyPosition);
        return (
          new Set(ps).size <= 5 &&
          Math.max(...ps) - Math.min(...ps) <= 9 &&
          Math.max(...ks) - Math.min(...ks) <= 5
        );
      };
      for (let begin = 0; begin < chunk.length; begin++) {
        while (end < chunk.length && fits(chunk[end].midi)) {
          const m = chunk[end++].midi;
          counts.set(m, (counts.get(m) ?? 0) + 1);
        }
        // Repeated/oscillating fingers are still a compact hand position.
        // Four attacks provide context without requiring four distinct keys.
        if (end - begin >= 4) {
          marks[begin]++;
          marks[end]--;
        }
        const m = chunk[begin].midi,
          n = counts.get(m)! - 1;
        if (n) counts.set(m, n);
        else counts.delete(m);
      }
      let active = 0;
      for (let i = 0; i < chunk.length; i++) {
        active += marks[i];
        if (active) context.get(chunk[i].id)!.idiom = "closed-position";
      }
    }
    let start = 0,
      dir = 0;
    const finish = (end: number) => {
      if (end - start + 1 >= 6)
        for (let i = start; i <= end; i++)
          context.get(chunk[i].id)!.idiom = "chromatic";
    };
    for (let i = 1; i < chunk.length; i++) {
      const d = chunk[i].midi - chunk[i - 1].midi;
      if (Math.abs(d) !== 1) {
        finish(i - 1);
        start = i;
        dir = 0;
      } else if (dir && Math.sign(d) !== dir) {
        finish(i - 1);
        start = i - 1;
        dir = Math.sign(d);
      } else dir = Math.sign(d);
    }
    finish(chunk.length - 1);
  }
  return { contacts, context, diagnostics };
}

/** One exact search on the production physical graph. Raw native chord ordering
 * and its finite "unplayable" gate are not used. Profile geometry remains classic.
 * The existing classic output is retained on explicit search/representation failure.
 */
export function planUnifiedPianoPhrase(
  notes: readonly PianoPhraseNote[],
  weights: ParncuttWeights,
  profile: PianoPhraseProfile = {},
) {
  validateParncuttWeights(weights);
  if (profile.model === "ergonomic" || profile.weights)
    throw Error(
      "Unified policy owns preference weights and uses classic geometry",
    );
  const baseline = planPianoPhrase(notes, profile);
  if (notes.length > 8000)
    return {
      plan: baseline,
      version: unifiedPianoPolicyVersion,
      decisions: { right: "global-limit", left: "global-limit" },
      contexts: [],
    };
  const analysis = analyzePianoContexts(notes),
    byId = new Map(analysis.contacts.map((c) => [c.id, c]));
  // The sequence model has no calibrated chord-to-line transition. Restrict its
  // preferences to monophonic physical phrases separated by real hand silence.
  // A chord in another phrase must not disable an otherwise eligible passage.
  const polyphonicHands = new Set<PianoHand>();
  const unscored = new Set<string>();
  for (const hand of ["right", "left"] as const) {
    let phrase: typeof analysis.contacts = [],
      end = -Infinity,
      polyphonic = false;
    const finish = () => {
      if (polyphonic) {
        polyphonicHands.add(hand);
        for (const c of phrase) unscored.add(c.id);
      }
    };
    for (const c of analysis.contacts
      .filter((c) => c.hand === hand)
      .sort((a, b) => a.start - b.start || a.id.localeCompare(b.id))) {
      if (c.start > end && !pianoSameTime(c.start, end)) {
        finish();
        phrase = [];
        end = -Infinity;
        polyphonic = false;
      }
      if (c.start < end && !pianoSameTime(c.start, end)) polyphonic = true;
      phrase.push(c);
      end = Math.max(end, c.end);
    }
    finish();
  }
  const general = (id: string) =>
    analysis.context.get(id)?.idiom === "general" && !unscored.has(id);
  const eligiblePair = (a: string, b: string) =>
    general(a) && general(b) && analysis.context.get(b)?.previous === a;
  const localCache = new WeakMap<object, number>(),
    edgeCache = new WeakMap<object, WeakMap<object, number>>();
  const preferredHands = new Set<PianoHand>(
    analysis.contacts.filter((c) => general(c.id)).map((c) => c.hand),
  );
  if (!preferredHands.size)
    return {
      plan: baseline,
      version: unifiedPianoPolicyVersion,
      decisions: Object.fromEntries(
        (["right", "left"] as const).map((hand) => [
          hand,
          polyphonicHands.has(hand)
            ? "classic-polyphonic-scope"
            : "protected-context",
        ]),
      ),
      contexts: [...analysis.context],
    };
  // Recognized idioms supply generated constraints from the complete classic
  // plan. Keeping only their costs allowed neighboring general passages to
  // change their digits. These are internal search constraints, never source
  // anchors: provenance and the caller's notes remain unchanged.
  const classicDigits = new Map(baseline.notes.map((n) => [n.id, n.finger]));
  const occurrenceRoots = new Map(
    analysis.contacts.flatMap((c) =>
      c.noteIds.map((id) => [id, c.id] as const),
    ),
  );
  const constrained = notes.map((n) => {
    const root = occurrenceRoots.get(n.id);
    const finger = classicDigits.get(n.id);
    return root &&
      !general(root) &&
      finger !== undefined &&
      n.finger === undefined
      ? { ...n, finger }
      : n;
  });
  const ranked = planPianoPhraseRanked(
    constrained,
    {
      local(frame) {
        if (localCache.has(frame.fingers))
          return localCache.get(frame.fingers)!;
        let adjustment = 0;
        for (const c of frame.active)
          if (general(c.id)) {
            const finger = frame.fingers[c.id] as PianoDigit;
            // Classic posture retains spatial strain; Parncutt alone owns melodic
            // key-color and weak-digit preference, once per attack rather than per hold.
            adjustment -=
              ((pianoBlackKey(c.midi)
                ? finger === 1
                  ? 1.8
                  : finger === 5
                    ? 0.4
                    : 0
                : 0) +
                (finger === 4 ? 0.15 : 0)) *
              (frame.postureScale ?? 1);
            if (pianoSameTime(c.start, frame.at)) {
              const ctx = analysis.context.get(c.id)!;
              const prev =
                ctx.previous && general(ctx.previous)
                  ? byId.get(ctx.previous)?.midi
                  : undefined;
              const next =
                ctx.next && general(ctx.next)
                  ? byId.get(ctx.next)?.midi
                  : undefined;
              adjustment += parncuttDot(
                parncuttNoteFeatures(c.midi, finger, prev, next),
                weights,
              );
            }
          }
        localCache.set(frame.fingers, adjustment);
        return adjustment;
      },
      edge(a, b) {
        let cache = edgeCache.get(a.fingers);
        if (!cache) {
          cache = new WeakMap();
          edgeCache.set(a.fingers, cache);
        }
        if (cache.has(b.fingers)) return cache.get(b.fingers)!;
        const fresh = b.active.filter((c) => pianoSameTime(c.start, b.at));
        let adjustment = 0;
        if (fresh.length === 1) {
          const c = fresh[0],
            previous = analysis.context.get(c.id)?.previous;
          if (
            previous &&
            eligiblePair(previous, c.id) &&
            a.active.some((c) => c.id === previous)
          )
            adjustment = -0.9 * b.costs.movement - b.costs.crossing;
        }
        cache.set(b.fingers, adjustment);
        return adjustment;
      },
      melodic(history, attack, hand) {
        const current = {
            midi: attack.midi,
            finger: attack.finger as PianoDigit,
          },
          b = history.at(-1),
          a = history.at(-2);
        let value = 0;
        if (b && eligiblePair(b.id, attack.id)) {
          value += parncuttDot(
            parncuttPairFeatures(
              { midi: b.midi, finger: b.finger as PianoDigit },
              current,
              hand,
            ),
            weights,
          );
          if (a && eligiblePair(a.id, b.id))
            value += parncuttDot(
              parncuttTripleFeatures(
                { midi: a.midi, finger: a.finger as PianoDigit },
                { midi: b.midi, finger: b.finger as PianoDigit },
                current,
                hand,
              ),
              weights,
            );
        }
        return value;
      },
    },
    profile,
  );
  const hands = { ...baseline.hands },
    decisions: Record<string, string> = {};
  for (const hand of ["right", "left"] as const) {
    if (!preferredHands.has(hand)) {
      decisions[hand] = polyphonicHands.has(hand)
        ? "classic-polyphonic-scope"
        : "protected-context";
      continue;
    }
    if (ranked.hands[hand].status === "complete") {
      hands[hand] = ranked.hands[hand];
      decisions[hand] = "unified";
    } else
      decisions[hand] =
        "classic-fallback:" +
        (ranked.hands[hand].diagnostic?.code ?? "unsupported");
  }
  return {
    plan: assemblePianoPhrase(
      hands,
      notes.map((n) => n.id),
    ),
    version: unifiedPianoPolicyVersion,
    decisions,
    contexts: [...analysis.context],
  };
}
