/** Original, offline-only latent structured ranker. No dataset/model code shipped. */
import {
  planPianoPhraseRanked,
  type PianoPhraseNote,
  type PianoPhrasePlan,
  type PianoRankingFrame,
} from "../src/piano-phrase-fingering";
import { pianoBlackKey } from "../src/piano-hand-model";
import { pianoPairComfort, pianoKeyDepthCost } from "../src/piano-ergonomics";

export type RankingWeights = Record<string, number>;
export type RankingMode = "scalar" | "structured";
export type RankingReference = ReadonlyMap<string, number>;
export const scalarFeatures = [
  "posture",
  "movement",
  "repeat",
  "crossing",
] as const;
export const initialRankingWeights = (): RankingWeights =>
  Object.fromEntries(scalarFeatures.map((k) => [k, 1]));
export const rankingDot = (a: RankingWeights, b: RankingWeights) =>
  Object.entries(a).reduce((s, [k, v]) => s + v * (b[k] ?? 0), 0);
const put = (v: RankingWeights, k: string, x = 1) => {
  if (!Number.isFinite(x)) throw Error("Nonfinite ranking feature: " + k);
  if (x) v[k] = (v[k] ?? 0) + x;
};
const merge = (a: RankingWeights, b: RankingWeights) => {
  for (const [k, v] of Object.entries(b)) put(a, k, v);
};

export function pianoRankingFeatures(
  input: readonly PianoPhraseNote[],
  mode: RankingMode,
) {
  // Context depends only on score input, not on reference labels/predictions.
  const context = new Map<
    string,
    { start: boolean; end: boolean; turn: boolean; run: boolean }
  >();
  const streams = new Map<string, PianoPhraseNote[]>();
  for (const n of input) {
    const key = JSON.stringify([n.hand, n.voice]);
    const stream = streams.get(key) ?? [];
    stream.push(n);
    streams.set(key, stream);
  }
  for (const stream of streams.values()) {
    stream.sort(
      (a, b) =>
        a.start - b.start || a.midi - b.midi || a.id.localeCompare(b.id),
    );
    for (let i = 0; i < stream.length; i++) {
      const n = stream[i],
        a = stream[i - 1],
        b = stream[i + 1];
      const start =
        !a || !!n.phraseStart || a.start + a.duration < n.start - 1e-8;
      const end =
        !b || !!b.phraseStart || n.start + n.duration < b.start - 1e-8;
      const unambiguous =
        (!a || a.start !== n.start) && (!b || b.start !== n.start);
      context.set(n.id, {
        start,
        end,
        turn:
          unambiguous &&
          !start &&
          !end &&
          (n.midi - a.midi) * (b.midi - n.midi) < 0,
        run:
          unambiguous &&
          !start &&
          !end &&
          (n.midi - a.midi) * (b.midi - n.midi) > 0 &&
          Math.abs(n.midi - a.midi) <= 2 &&
          Math.abs(b.midi - n.midi) <= 2,
      });
    }
  }
  const local = (f: PianoRankingFrame): RankingWeights => {
    const v: RankingWeights = {};
    put(v, "posture", f.costs.posture);
    if (mode === "scalar") return v;
    for (const c of f.active)
      if (c.start === f.at) {
        const digit = f.fingers[c.id],
          ctx = context.get(c.noteIds[0]);
        put(v, `key:${+pianoBlackKey(c.midi)}:${digit}`);
        if (ctx?.start) put(v, `start:${digit}`);
        if (ctx?.end) put(v, `end:${digit}`);
        if (ctx?.turn) put(v, `turn:${digit}`);
        if (ctx?.run) put(v, `run:${digit}`);
      }
    return v;
  };
  const edge = (a: PianoRankingFrame, b: PianoRankingFrame): RankingWeights => {
    const v: RankingWeights = {};
    for (const k of scalarFeatures.slice(1)) put(v, k, b.costs[k]);
    if (mode === "scalar") return v;
    // Only a uniquely moving melodic attack carries pair preferences. Held
    // accompaniment cannot be silently interpreted as the preceding melody.
    const fresh = b.active.filter((c) => c.start === b.at),
      prior = a.active.filter((c) => c.end <= b.at + 1e-8);
    if (fresh.length !== 1 || prior.length !== 1) return v;
    const x = prior[0],
      y = fresh[0];
    if (x.voice !== y.voice || y.phraseStart || x.end < b.at - 1e-8) return v;
    const from = a.fingers[x.id],
      to = b.fingers[y.id],
      d = y.midi - x.midi;
    const group = !d
      ? "repeat"
      : Math.abs(d) <= 2
        ? "step"
        : Math.abs(d) <= 5
          ? "third-fourth"
          : "leap";
    const ascending = d * (b.hand === "right" ? 1 : -1) >= 0;
    put(v, `pair:${group}:${ascending ? from : to}:${ascending ? to : from}`);
    // This is a soft comfort feature, not the ergonomic model's same-finger
    // impossibility sentinel. Released repositioning remains a legal path.
    if (from !== to)
      put(v, "pair-comfort", pianoPairComfort(x.midi, from, y.midi, to));
    put(v, "key-depth", pianoKeyDepthCost(x, y, from, to));
    return v;
  };
  return { local, edge };
}

export function rankPianoPhrase(
  notes: readonly PianoPhraseNote[],
  weights: RankingWeights,
  mode: RankingMode,
  options: {
    bpm?: number;
    compatible?: RankingReference;
    loss?: RankingReference;
    maxTransitions?: number;
  } = {},
) {
  if (Object.values(weights).some((v) => !Number.isFinite(v)))
    throw Error("Invalid ranking weight");
  if (scalarFeatures.some((k) => (weights[k] ?? 0) < 0))
    throw Error("Negative scalar cost");
  for (const reference of [options.compatible, options.loss])
    if (reference)
      for (const [id, digit] of reference)
        if (
          !notes.some((n) => n.id === id) ||
          !Number.isInteger(digit) ||
          digit < 1 ||
          digit > 5
        )
          throw Error("Invalid ranking reference");
  const features = pianoRankingFeatures(notes, mode),
    initial = initialRankingWeights();
  const residual = { ...weights };
  for (const [k, v] of Object.entries(initial))
    residual[k] = (residual[k] ?? 0) - v;
  return planPianoPhraseRanked(
    notes,
    {
      local(f) {
        let loss = 0;
        for (const c of f.active)
          if (c.start === f.at)
            for (const id of c.noteIds) {
              const finger = f.fingers[c.id],
                fixed = options.compatible?.get(id),
                gold = options.loss?.get(id);
              if (fixed !== undefined && fixed !== finger) return Infinity;
              if (gold !== undefined && gold !== finger) loss++;
            }
        return rankingDot(features.local(f), residual) - loss;
      },
      edge(a, b) {
        return rankingDot(features.edge(a, b), residual);
      },
    },
    { bpm: options.bpm, maxTransitions: options.maxTransitions },
  );
}

/** Identical raw features along a decoded path, including latent wrist poses. */
export function pianoPlanRankingFeatures(
  input: readonly PianoPhraseNote[],
  plan: PianoPhrasePlan,
  mode: RankingMode,
) {
  const features = pianoRankingFeatures(input, mode),
    vector: RankingWeights = {};
  for (const hand of ["right", "left"] as const) {
    const hp = plan.hands[hand];
    if (hp.status !== "complete") continue;
    const contacts = new Map<string, PianoRankingFrame["active"][number]>();
    for (const n of hp.notes) {
      const c = contacts.get(n.contactId);
      if (!c)
        contacts.set(n.contactId, {
          id: n.contactId,
          hand,
          midi: n.midi,
          start: n.start,
          end: n.start + n.duration,
          noteIds: [n.id],
          voice: n.voice,
          phraseStart: n.phraseStart,
        });
      else
        contacts.set(n.contactId, {
          ...c,
          end: Math.max(c.end, n.start + n.duration),
          noteIds: [...c.noteIds, n.id],
        });
    }
    const frames = hp.states.map((s) => ({
      hand,
      at: s.at,
      until: s.until,
      active: s.keys.map((k) => contacts.get(k.contactId)!),
      anchor: s.anchor,
      fingers: s.fingers,
      costs: s.costs,
    }));
    for (let i = 0; i < frames.length; i++) {
      merge(vector, features.local(frames[i]));
      if (i) merge(vector, features.edge(frames[i - 1], frames[i]));
    }
  }
  return vector;
}

export function updateRankingWeights(
  weights: RankingWeights,
  preferred: RankingWeights,
  rejected: RankingWeights,
  mode: RankingMode,
  rate: number,
  regularization: number,
  normalizer: number,
) {
  if (
    !Number.isFinite(rate) ||
    rate < 0 ||
    !Number.isFinite(regularization) ||
    regularization < 0 ||
    !Number.isFinite(normalizer) ||
    normalizer <= 0
  )
    throw Error("Invalid ranking update");
  const next: RankingWeights = {},
    initial = initialRankingWeights();
  for (const k of new Set([
    ...Object.keys(weights),
    ...Object.keys(preferred),
    ...Object.keys(rejected),
  ])) {
    if (
      mode === "scalar" &&
      !scalarFeatures.includes(k as (typeof scalarFeatures)[number])
    )
      continue;
    const scalar = Object.hasOwn(initial, k),
      base = initial[k] ?? 0;
    const value =
      (weights[k] ?? 0) -
      (rate * ((preferred[k] ?? 0) - (rejected[k] ?? 0))) / normalizer -
      rate * regularization * ((weights[k] ?? 0) - base);
    if (!Number.isFinite(value)) throw Error("Invalid ranking feature");
    next[k] = Math.max(scalar ? 0 : -4, Math.min(scalar ? 8 : 4, value));
  }
  return next;
}
