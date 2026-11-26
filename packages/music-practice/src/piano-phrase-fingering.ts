import {
  assertPianoHand,
  assertPianoNote,
  pianoKeyPosition,
  pianoNoteCost,
  pianoSinglePoses,
  pianoTimedMotionCost,
  pianoMotion,
  solvePianoPath,
  solvePianoMemoryPath,
  type PianoHand,
} from "./piano-hand-model";
import {
  pianoFingerOffset,
  pianoErgonomicSingleCost,
  pianoPairPossible,
  pianoPairComfort,
  pianoContextCost,
  pianoKeyDepthCost,
  type PianoAttackMemory,
} from "./piano-ergonomics";
export type { PianoHand } from "./piano-hand-model";
/** Quarter-note beats; duration is physical/notated key hold, not audio decay. */
export type PianoPhraseNote = {
  id: string;
  hand: PianoHand;
  midi: number;
  start: number;
  duration: number;
  finger?: number;
  tieFrom?: string;
  voice?: string;
  phraseStart?: boolean;
  notatedDuration?: number;
};
export type PianoPhraseCosts = {
  posture: number;
  movement: number;
  repeat: number;
  crossing: number;
  substitution: number;
  comfort: number;
  context: number;
  preparation: number;
};
export type PianoMovement = {
  at: number;
  kind:
    "move" | "thumb_under" | "finger_over" | "substitution" | "repeat_change";
  noteIds: string[];
  from?: number;
  to?: number;
};
export type PlannedPianoNote = PianoPhraseNote & {
  finger: number;
  anchor: number;
  contactId: string;
  shift: boolean;
  crossing: boolean;
};
export type PianoHandFrame = {
  at: number;
  until: number;
  anchor: number;
  fingers: Readonly<Record<string, number>>;
  keys: {
    contactId: string;
    midi: number;
    finger: number;
    noteIds: string[];
  }[];
  costs: PianoPhraseCosts;
  events: PianoMovement[];
};
export type PianoDiagnostic = {
  hand: PianoHand;
  code:
    | "too_many_keys"
    | "reach"
    | "fixed_conflict"
    | "overlapping_restrike"
    | "hand_conflict"
    | "search_limit"
    | "unknown_pitch"
    | "ambiguous_fingering"
    | "unsupported_notation";
  at?: number;
};
export type PianoHandPlan = {
  status: "complete" | "unsupported";
  notes: PlannedPianoNote[];
  states: PianoHandFrame[];
  costs: PianoPhraseCosts;
  cost: number;
  diagnostic?: PianoDiagnostic;
  statistics: {
    frames: number;
    candidates: number;
    transitions: number;
    maxLayer: number;
    states?: number;
  };
};
export type PianoPhrasePlan = {
  status: "complete" | "partial" | "unsupported";
  hands: Record<PianoHand, PianoHandPlan>;
  notes: PlannedPianoNote[];
  costs: PianoPhraseCosts;
  cost: number;
};
export type PianoPhraseProfile = {
  /** Classic is production default. Ergonomic is an opt-in research candidate. */
  model?: "classic" | "ergonomic";
  bpm?: number;
  maxSpan?: number;
  allowSubstitutions?: boolean;
  weights?: Partial<PianoPhraseCosts>;
  maxNotes?: number;
  maxCandidates?: number;
  maxFrames?: number;
  maxTransitions?: number;
};
const zero = (): PianoPhraseCosts => ({
  posture: 0,
  movement: 0,
  repeat: 0,
  crossing: 0,
  substitution: 0,
  comfort: 0,
  context: 0,
  preparation: 0,
});
const add = (a: PianoPhraseCosts, b: PianoPhraseCosts): PianoPhraseCosts => ({
  posture: a.posture + b.posture,
  movement: a.movement + b.movement,
  repeat: a.repeat + b.repeat,
  crossing: a.crossing + b.crossing,
  substitution: a.substitution + b.substitution,
  comfort: a.comfort + b.comfort,
  context: a.context + b.context,
  preparation: a.preparation + b.preparation,
});
const total = (c: PianoPhraseCosts) =>
  Object.values(c).reduce((a, b) => a + b, 0);
const defaults: PianoPhraseCosts = {
  posture: 1,
  movement: 1,
  repeat: 1,
  crossing: 1,
  substitution: 18,
  comfort: 1,
  context: 1,
  preparation: 1,
};
const pairReach: Record<string, number> = {
  "1:2": 4,
  "1:3": 5,
  "1:4": 7,
  "1:5": 7,
  "2:3": 2,
  "2:4": 3,
  "2:5": 4,
  "3:4": 2,
  "3:5": 3,
  "4:5": 2,
};
export const pianoSameTime = (a: number, b: number) =>
  Math.abs(a - b) <=
  8 * Number.EPSILON * Math.max(Math.abs(a), Math.abs(b), Number.MIN_VALUE);
type Contact = {
  id: string;
  hand: PianoHand;
  midi: number;
  start: number;
  end: number;
  finger?: number;
  noteIds: string[];
  voice?: string;
  phraseStart?: boolean;
};
type Frame = { at: number; until: number; active: Contact[] };
type Pose = {
  anchor: number;
  fingers: Record<string, number>;
  crossed: [string, string][];
  posture: number;
  comfort?: number;
};
type Build = {
  contacts: Contact[];
  aliases: Map<string, string>;
  time: Map<number, number>;
  diagnostics: Partial<Record<PianoHand, PianoDiagnostic>>;
};
function validateProfile(profile: PianoPhraseProfile) {
  if (
    (profile.model !== undefined &&
      !["classic", "ergonomic"].includes(profile.model)) ||
    !Number.isFinite(profile.bpm ?? 120) ||
    (profile.bpm ?? 120) <= 0 ||
    !Number.isFinite(profile.maxSpan ?? 7) ||
    (profile.maxSpan ?? 7) <= 0 ||
    (profile.maxSpan ?? 7) > 14 ||
    (profile.allowSubstitutions !== undefined &&
      typeof profile.allowSubstitutions !== "boolean") ||
    Object.values(profile.weights ?? {}).some(
      (v) => !Number.isFinite(v) || v! < 0,
    )
  )
    throw Error("Invalid piano phrase profile");
  for (const [key, fallback] of [
    ["maxNotes", 4000],
    ["maxCandidates", 100000],
    ["maxFrames", 8000],
    ["maxTransitions", 2_000_000],
  ] as const) {
    const value = profile[key] ?? fallback;
    if (!Number.isSafeInteger(value) || value < 1 || value > fallback)
      throw Error("Invalid piano search bound");
  }
}
function validateNotes(input: readonly PianoPhraseNote[]) {
  const ids = new Map<string, PianoPhraseNote>(),
    outgoing = new Set<string>();
  for (const n of [...input].sort(
    (a, b) => a.start - b.start || String(a.id).localeCompare(String(b.id)),
  )) {
    assertPianoHand(n.hand);
    assertPianoNote(n);
    if (
      (n.voice !== undefined && (typeof n.voice !== "string" || !n.voice)) ||
      (n.phraseStart !== undefined && typeof n.phraseStart !== "boolean") ||
      (n.notatedDuration !== undefined &&
        (!Number.isFinite(n.notatedDuration) ||
          n.notatedDuration < n.duration)) ||
      typeof n.id !== "string" ||
      !n.id ||
      ids.has(n.id) ||
      !Number.isFinite(n.start) ||
      n.start < 0 ||
      !Number.isFinite(n.start + n.duration) ||
      n.start + n.duration <= n.start
    )
      throw Error("Invalid piano phrase identity or time");
    if (n.tieFrom !== undefined) {
      const prior = ids.get(n.tieFrom);
      if (
        !prior ||
        outgoing.has(n.tieFrom) ||
        prior.hand !== n.hand ||
        prior.midi !== n.midi ||
        !pianoSameTime(prior.start + prior.duration, n.start)
      )
        throw Error("Invalid piano phrase tie");
      outgoing.add(n.tieFrom);
    }
    ids.set(n.id, n);
  }
}
/** Canonicalize only floating-point clock noise; never collapse a note interval. */
function canonicalTimes(notes: readonly PianoPhraseNote[]) {
  const values = [
      ...new Set(notes.flatMap((n) => [n.start, n.start + n.duration])),
    ].sort((a, b) => a - b),
    time = new Map<number, number>();
  const minimum = notes.reduce((m, n) => Math.min(m, n.duration), Infinity);
  let anchor = values[0];
  for (const value of values) {
    if (!pianoSameTime(value, anchor) || value - anchor > minimum / 4)
      anchor = value;
    time.set(value, anchor);
  }
  return time;
}
function build(input: readonly PianoPhraseNote[]): Build {
  const time = canonicalTimes(input),
    roots = new Map<string, string>(),
    aliases = new Map<string, string>(),
    byRoot = new Map<string, Contact>(),
    diagnostics: Build["diagnostics"] = {};
  for (const n of [...input].sort(
    (a, b) => a.start - b.start || a.id.localeCompare(b.id),
  )) {
    const id = n.tieFrom ? roots.get(n.tieFrom)! : n.id;
    roots.set(n.id, id);
    const prior = byRoot.get(id);
    if (prior) {
      prior.end = Math.max(prior.end, time.get(n.start + n.duration)!);
      prior.noteIds.push(n.id);
      if (
        prior.finger !== undefined &&
        n.finger !== undefined &&
        prior.finger !== n.finger
      )
        diagnostics[n.hand] = {
          hand: n.hand,
          code: "fixed_conflict",
          at: n.start,
        };
      prior.finger ??= n.finger;
    } else
      byRoot.set(id, {
        id,
        hand: n.hand,
        midi: n.midi,
        start: time.get(n.start)!,
        end: time.get(n.start + n.duration)!,
        finger: n.finger,
        noteIds: [n.id],
        voice: n.voice,
        phraseStart: n.phraseStart,
      });
  }
  const groups = new Map<string, Contact>(),
    contacts: Contact[] = [];
  for (const c of byRoot.values()) {
    const key = `${c.hand}:${c.midi}:${c.start}`,
      same = groups.get(key);
    if (same) {
      same.end = Math.max(same.end, c.end);
      same.noteIds.push(...c.noteIds);
      if (same.voice !== c.voice) same.voice = undefined;
      if (
        same.finger !== undefined &&
        c.finger !== undefined &&
        same.finger !== c.finger
      )
        diagnostics[c.hand] = {
          hand: c.hand,
          code: "fixed_conflict",
          at: c.start,
        };
      same.finger ??= c.finger;
      same.phraseStart ||= c.phraseStart;
    } else {
      groups.set(key, c);
      contacts.push(c);
    }
  }
  for (const c of contacts) for (const id of c.noteIds) aliases.set(id, c.id);
  const previous = new Map<string, Contact>();
  for (const c of [...contacts].sort(
    (a, b) => a.start - b.start || a.id.localeCompare(b.id),
  )) {
    const own = `${c.hand}:${c.midi}`,
      other = `${c.hand === "right" ? "left" : "right"}:${c.midi}`,
      prior = previous.get(own),
      opposite = previous.get(other);
    if (prior && prior.end > c.start)
      diagnostics[c.hand] = {
        hand: c.hand,
        code: "overlapping_restrike",
        at: c.start,
      };
    if (opposite && opposite.end > c.start) {
      diagnostics[c.hand] = {
        hand: c.hand,
        code: "hand_conflict",
        at: c.start,
      };
      diagnostics[opposite.hand] = {
        hand: opposite.hand,
        code: "hand_conflict",
        at: c.start,
      };
    }
    if (!prior || prior.end < c.end) previous.set(own, c);
  }
  return { contacts, aliases, time, diagnostics };
}
function framesFor(contacts: Contact[], maximum: number): Frame[] | null {
  const events = new Map<number, { starts: Contact[]; ends: Contact[] }>();
  for (const c of contacts) {
    for (const [at, start] of [
      [c.start, true],
      [c.end, false],
    ] as const) {
      const e = events.get(at) ?? { starts: [], ends: [] };
      (start ? e.starts : e.ends).push(c);
      events.set(at, e);
    }
  }
  const times = [...events.keys()].sort((a, b) => a - b);
  if (times.length - 1 > maximum) return null;
  const active = new Map<string, Contact>(),
    frames: Frame[] = [];
  for (let i = 0; i < times.length - 1; i++) {
    const e = events.get(times[i])!;
    for (const c of e.ends) active.delete(c.id);
    for (const c of e.starts) active.set(c.id, c);
    frames.push({
      at: times[i],
      until: times[i + 1],
      active: [...active.values()].sort(
        (a, b) => a.midi - b.midi || a.id.localeCompare(b.id),
      ),
    });
    if (active.size > 5) return frames;
  }
  return frames;
}
function poses(
  frame: Frame,
  hand: PianoHand,
  profile: PianoPhraseProfile,
): Pose[] {
  const active = frame.active,
    result: Pose[] = [],
    sign = hand === "right" ? 1 : -1,
    span = profile.maxSpan ?? 7,
    ergo = profile.model === "ergonomic";
  if (active.length > 5) return [];
  if (!active.length)
    return Array.from({ length: 85 }, (_, i) => ({
      anchor: i - 5,
      fingers: {},
      crossed: [],
      posture: 0,
    }));
  if (
    pianoKeyPosition(active.at(-1)!.midi) - pianoKeyPosition(active[0].midi) >
    span
  )
    return [];
  if (active.length === 1) {
    const c = active[0];
    const choices = ergo
      ? Array.from({ length: 5 }, (_, i) => i + 1)
          .filter((f) => c.finger === undefined || f === c.finger)
          .flatMap((f) => {
            const ideal =
              pianoKeyPosition(c.midi) - sign * pianoFingerOffset(f);
            return Array.from(
              { length: 3 },
              (_, i) => Math.floor(ideal) - 1 + i,
            )
              .filter((anchor) => Math.abs(anchor - ideal) <= 1)
              .map((anchor) => ({ finger: f, anchor }));
          })
      : pianoSinglePoses(c.midi, c.finger, hand, 1);
    return choices.map((p) => ({
      anchor: p.anchor,
      fingers: { [c.id]: p.finger },
      crossed: [],
      posture: ergo
        ? pianoErgonomicSingleCost(c.midi, p.finger, p.anchor, hand)
        : pianoNoteCost(c.midi, p.finger, p.anchor, hand),
    }));
  }
  function visit(digits: number[]) {
    if (digits.length < active.length) {
      const i = digits.length,
        c = active[i];
      for (let f = c.finger ?? 1; f <= (c.finger ?? 5); f++) {
        if (digits.includes(f)) continue;
        let legal = true;
        for (let j = 0; j < i; j++) {
          const other = digits[j],
            distance =
              pianoKeyPosition(c.midi) - pianoKeyPosition(active[j].midi);
          if (other !== 1 && f !== 1 && (f - other) * sign <= 0) {
            legal = false;
            break;
          }
          const a = Math.min(f, other),
            b = Math.max(f, other);
          if (
            ergo
              ? !pianoPairPossible(active[j].midi, other, c.midi, f, span)
              : distance > (pairReach[`${a}:${b}`] * span) / 7
          ) {
            legal = false;
            break;
          }
          if (
            (f === 1 || other === 1) &&
            (f - other) * sign < 0 &&
            distance > 2
          ) {
            legal = false;
            break;
          }
        }
        if (legal) visit([...digits, f]);
      }
      return;
    }
    const ideals = active.map(
        (c, i) =>
          pianoKeyPosition(c.midi) -
          sign * (ergo ? pianoFingerOffset(digits[i]) : digits[i] - 1),
      ),
      crossed: Pose["crossed"] = [];
    const thumb = digits.indexOf(1);
    if (thumb >= 0)
      for (let i = 0; i < digits.length; i++)
        if (
          i !== thumb &&
          (pianoKeyPosition(active[i].midi) -
            pianoKeyPosition(active[thumb].midi)) *
            sign <
            0
        )
          crossed.push([active[thumb].id, active[i].id]);
    for (
      let anchor = Math.ceil(Math.max(...ideals) - 2);
      anchor <= Math.floor(Math.min(...ideals) + 2);
      anchor++
    )
      result.push({
        anchor,
        fingers: Object.fromEntries(active.map((c, i) => [c.id, digits[i]])),
        crossed,
        posture:
          active.reduce(
            (n, c, i) =>
              n +
              (ergo
                ? pianoErgonomicSingleCost(c.midi, digits[i], anchor, hand)
                : pianoNoteCost(c.midi, digits[i], anchor, hand)),
            0,
          ) +
          crossed.length * 2,
        comfort: ergo
          ? active.reduce(
              (sum, c, i) =>
                sum +
                active
                  .slice(i + 1)
                  .reduce(
                    (n, d, j) =>
                      n +
                      pianoPairComfort(
                        c.midi,
                        digits[i],
                        d.midi,
                        digits[i + j + 1],
                      ),
                    0,
                  ),
              0,
            )
          : 0,
      });
  }
  visit([]);
  return result;
}
function step(
  a: Frame,
  b: Frame,
  x: Pose,
  y: Pose,
  hand: PianoHand,
  p: PianoPhraseProfile,
  rolling = false,
) {
  const costs = zero(),
    events: PianoMovement[] = [],
    held = (id: string) => Object.hasOwn(x.fingers, id),
    w = { ...defaults, ...p.weights };
  for (const c of b.active)
    if (held(c.id) && x.fingers[c.id] !== y.fingers[c.id]) {
      if (!p.allowSubstitutions) return null;
      costs.substitution += w.substitution;
      events.push({
        at: b.at,
        kind: "substitution",
        noteIds: c.noteIds,
        from: x.fingers[c.id],
        to: y.fingers[c.id],
      });
    }
  for (const [thumb, other] of y.crossed) {
    if (!held(thumb) && !held(other)) return null;
    if (!x.crossed.some((pair) => pair[0] === thumb && pair[1] === other)) {
      costs.crossing += 2;
      events.push({
        at: b.at,
        kind: held(thumb) ? "finger_over" : "thumb_under",
        noteIds: b.active.find((c) => c.id === (held(thumb) ? other : thumb))!
          .noteIds,
      });
    }
  }
  if (!b.active.length) {
    if (x.anchor !== y.anchor) return null;
    return { costs, events };
  }
  const factor = 0.5 / Math.max(0.08, ((b.at - a.at) * 60) / (p.bpm ?? 120)),
    distance = Math.abs(x.anchor - y.anchor);
  if (
    a.active.length === 1 &&
    b.active.length === 1 &&
    a.active[0].id !== b.active[0].id
  ) {
    const old = a.active[0],
      next = b.active[0],
      from = { anchor: x.anchor, finger: x.fingers[old.id] },
      to = { anchor: y.anchor, finger: y.fingers[next.id] };
    const c = pianoTimedMotionCost(
      { midi: old.midi, duration: (old.end - old.start) / 4 },
      { midi: next.midi },
      from,
      to,
      hand,
      rolling,
    );
    if (!Number.isFinite(c.movement)) return null;
    costs.movement = c.movement;
    if (p.model === "ergonomic") {
      if (from.finger !== to.finger)
        costs.comfort +=
          0.25 * pianoPairComfort(old.midi, from.finger, next.midi, to.finger);
      costs.comfort += pianoKeyDepthCost(old, next, from.finger, to.finger);
    }
    costs.repeat = c.repeat;
    if (p.model === "ergonomic" && old.end < b.at && old.midi === next.midi)
      costs.repeat *= 0.3;
    costs.crossing += c.crossing;
    if (pianoMotion(old, next, from, to, hand, rolling).shift)
      events.push({ at: b.at, kind: "move", noteIds: next.noteIds });
    if (pianoMotion(old, next, from, to, hand, rolling).crossing)
      events.push({
        at: b.at,
        kind: to.finger === 1 ? "thumb_under" : "finger_over",
        noteIds: next.noteIds,
      });
  } else {
    costs.movement = distance
      ? (5 + distance * 1.8) * (a.active.length ? 1 : 0.3)
      : 0;
    for (const c of b.active) {
      const prior = a.active.find(
        (old) => old.id !== c.id && x.fingers[old.id] === y.fingers[c.id],
      );
      if (prior)
        costs.movement +=
          0.6 *
          Math.abs(pianoKeyPosition(c.midi) - pianoKeyPosition(prior.midi));
      const repeat = a.active.find(
        (old) => old.id !== c.id && old.midi === c.midi,
      );
      if (repeat && x.fingers[repeat.id] !== y.fingers[c.id]) costs.repeat += 4;
    }
  }
  if (costs.repeat)
    events.push({
      at: b.at,
      kind: "repeat_change",
      noteIds: b.active
        .filter((c) => c.start === b.at)
        .flatMap((c) => c.noteIds),
    });
  if (distance && !events.some((e) => e.kind === "move"))
    events.push({
      at: b.at,
      kind: "move",
      noteIds: b.active
        .filter((c) => c.start === b.at)
        .flatMap((c) => c.noteIds),
    });
  if (p.model === "ergonomic" && b.active.length > 1) {
    const occupied = new Set(Object.values(x.fingers));
    for (const c of b.active)
      if (c.start === b.at && !occupied.has(y.fingers[c.id]))
        costs.preparation +=
          0.08 *
          Math.abs(
            pianoKeyPosition(c.midi) -
              (x.anchor +
                (hand === "right" ? 1 : -1) *
                  pianoFingerOffset(y.fingers[c.id])),
          ) *
          factor;
  }
  costs.comfort *= w.comfort;
  costs.preparation *= w.preparation;
  costs.movement *= factor * w.movement;
  costs.repeat *= w.repeat;
  costs.crossing *= w.crossing;
  return { costs, events };
}
/** Long stepwise runs need smooth thumb passage; isolated changes, repeated
 * notes, chords and short five-finger gestures keep ordinary relocation costs. */
export function pianoRollingEdges(
  frames: readonly { active: readonly { id: string; midi: number }[] }[],
) {
  const result = new Set<number>();
  let start = 0,
    direction = 0;
  const finish = (end: number) => {
    if (end - start >= 6) for (let i = start + 1; i <= end; i++) result.add(i);
  };
  for (let i = 1; i < frames.length; i++) {
    const a = frames[i - 1].active,
      b = frames[i].active;
    const delta =
      a.length === 1 && b.length === 1 && a[0].id !== b[0].id
        ? b[0].midi - a[0].midi
        : 0;
    const sign = Math.sign(delta),
      distance =
        a.length === 1 && b.length === 1
          ? Math.abs(pianoKeyPosition(b[0].midi) - pianoKeyPosition(a[0].midi))
          : Infinity;
    if (!sign || Math.abs(delta) > 2 || distance > 2.1) {
      finish(i - 1);
      start = i;
      direction = 0;
    } else if (direction && sign !== direction) {
      finish(i - 1);
      start = i - 1;
      direction = sign;
    } else direction = sign;
  }
  finish(frames.length - 1);
  return result;
}
function planHand(
  hand: PianoHand,
  input: readonly PianoPhraseNote[],
  built: Build,
  p: PianoPhraseProfile,
): PianoHandPlan {
  const statistics = { frames: 0, candidates: 0, transitions: 0, maxLayer: 0 };
  const unsupported = (
    code: PianoDiagnostic["code"],
    at?: number,
  ): PianoHandPlan => ({
    status: "unsupported",
    notes: [],
    states: [],
    costs: zero(),
    cost: 0,
    diagnostic: { hand, code, at },
    statistics,
  });
  if (built.diagnostics[hand])
    return unsupported(
      built.diagnostics[hand]!.code,
      built.diagnostics[hand]!.at,
    );
  const notes = input.filter((n) => n.hand === hand);
  if (notes.length > (p.maxNotes ?? 4000)) return unsupported("search_limit");
  const frames = framesFor(
    built.contacts.filter((c) => c.hand === hand),
    p.maxFrames ?? 8000,
  );
  if (!frames) return unsupported("search_limit");
  statistics.frames = frames.length;
  const cache = new Map<string, { poses: Pose[]; ids: string[] }>(),
    layers: Pose[][] = [];
  for (const frame of frames) {
    if (frame.active.length > 5) return unsupported("too_many_keys", frame.at);
    const key = frame.active.map((c) => `${c.midi}:${c.finger ?? 0}`).join("/");
    // Cache geometry only. Contact identities differ at each attack and cannot be cached.
    let cached = cache.get(key);
    if (!cached) {
      cached = {
        poses: poses(frame, hand, p),
        ids: frame.active.map((c) => c.id),
      };
      cache.set(key, cached);
    }
    const remap = new Map(cached.ids.map((id, i) => [id, frame.active[i].id]));
    const layer = cached.poses.map((pose) => ({
      ...pose,
      fingers: Object.fromEntries(
        Object.entries(pose.fingers).map(([id, f]) => [remap.get(id)!, f]),
      ),
      crossed: pose.crossed.map(
        ([a, b]) => [remap.get(a)!, remap.get(b)!] as [string, string],
      ),
    }));
    if (!layer.length) return unsupported("reach", frame.at);
    statistics.candidates += layer.length;
    if (statistics.candidates > (p.maxCandidates ?? 100000))
      return unsupported("search_limit", frame.at);
    statistics.maxLayer = Math.max(statistics.maxLayer, layer.length);
    layers.push(layer);
  }
  const rollingEdges = pianoRollingEdges(frames);
  const freshByFrame = frames.map((f) =>
    f.active.filter((c) => c.start === f.at),
  );
  const edgeCache = frames.map(
    () => new WeakMap<Pose, WeakMap<Pose, ReturnType<typeof step>>>(),
  );
  const transitionAt = (a: Pose, b: Pose, i: number) => {
    if (p.model !== "ergonomic")
      return step(frames[i - 1], frames[i], a, b, hand, p, rollingEdges.has(i));
    let from = edgeCache[i].get(a);
    if (!from) {
      from = new WeakMap();
      edgeCache[i].set(a, from);
    }
    if (from.has(b)) return from.get(b)!;
    const value = step(
      frames[i - 1],
      frames[i],
      a,
      b,
      hand,
      p,
      rollingEdges.has(i),
    );
    from.set(b, value);
    return value;
  };
  const w = { ...defaults, ...p.weights };
  const local = (pose: Pose, i: number) =>
    i === 0 && pose.crossed.length
      ? Infinity
      : (pose.posture * w.posture + (pose.comfort ?? 0) * w.comfort) *
        Math.min(4, frames[i].until - frames[i].at);
  const classicSolve = () =>
    solvePianoPath(
      layers,
      local,
      (a, b, i) => {
        const value = transitionAt(a, b, i);
        return value ? total(value.costs) : Infinity;
      },
      p.maxTransitions ?? 2_000_000,
    );
  type Memory = PianoAttackMemory[];
  const advanceMemory = (memory: Memory, pose: Pose, i: number) => {
    const frame = frames[i],
      fresh = freshByFrame[i];
    if (!frame.active.length) return { memory: [] as Memory, cost: 0 };
    if (fresh.length > 1) return { memory: [] as Memory, cost: 0 };
    if (!fresh.length) return { memory, cost: 0 };
    const c = fresh[0];
    if (c.voice === undefined && frame.active.length > 1)
      return { memory: [] as Memory, cost: 0 };
    // A single moving attack can carry melodic history alongside held contacts.
    // Unknown/changing voice or an explicit phrase boundary starts a new context.
    const attack: PianoAttackMemory = {
      id: c.id,
      midi: c.midi,
      finger: pose.fingers[c.id],
      voice: c.voice,
      start: c.start,
      end: c.end,
    };
    const history =
      c.phraseStart || memory.at(-1)?.voice !== c.voice ? [] : memory;
    const cost =
      history.length === 2
        ? pianoContextCost(history[0], history[1], attack) * w.context
        : 0;
    return { memory: [...history, attack].slice(-2), cost };
  };
  const solved =
    p.model === "ergonomic"
      ? solvePianoMemoryPath(
          layers,
          local,
          (pose) => advanceMemory([], pose, 0).memory,
          (a, b, memory, i) => {
            const transition = transitionAt(a, b, i);
            if (!transition) return null;
            const next = advanceMemory(memory, b, i);
            return {
              memory: next.memory,
              cost: total(transition.costs) + next.cost,
            };
          },
          // Attack IDs, voices and phrase resets are fixed by this input layer;
          // only earlier digit choices vary between paths and enter future costs.
          (memory) => memory.map((a) => a.finger).join("/"),
          p.maxTransitions ?? 2_000_000,
          p.maxCandidates ?? 100000,
        )
      : classicSolve();
  statistics.transitions = solved.transitions;
  if (solved.states !== undefined)
    Object.assign(statistics, { states: solved.states });
  if (solved.status !== "complete")
    return unsupported(solved.status === "limit" ? "search_limit" : "reach");
  let costs = zero(),
    melodicMemory: Memory = [];
  const states: PianoHandFrame[] = solved.path.map((pose, i) => {
    const change = i
      ? step(
          frames[i - 1],
          frames[i],
          solved.path[i - 1],
          pose,
          hand,
          p,
          rollingEdges.has(i),
        )!
      : { costs: zero(), events: [] };
    const nextMemory =
      p.model === "ergonomic"
        ? advanceMemory(melodicMemory, pose, i)
        : { memory: [] as Memory, cost: 0 };
    melodicMemory = nextMemory.memory;
    const own = {
      ...change.costs,
      posture:
        pose.posture * w.posture * Math.min(4, frames[i].until - frames[i].at),
      comfort:
        change.costs.comfort +
        (pose.comfort ?? 0) *
          w.comfort *
          Math.min(4, frames[i].until - frames[i].at),
      context: p.model === "ergonomic" ? nextMemory.cost : 0,
    };
    costs = add(costs, own);
    return {
      at: frames[i].at,
      until: frames[i].until,
      anchor: pose.anchor,
      fingers: { ...pose.fingers },
      keys: frames[i].active.map((c) => ({
        contactId: c.id,
        midi: c.midi,
        finger: pose.fingers[c.id],
        noteIds: [...c.noteIds],
      })),
      costs: own,
      events: change.events,
    };
  });
  const planned = notes.map((n) => {
    const at = built.time.get(n.start)!,
      contactId = built.aliases.get(n.id)!,
      state = states.find((s) => s.at <= at && s.until > at)!;
    const movement =
      state.at === at && !n.tieFrom
        ? state.events.filter((e) => e.noteIds.includes(n.id))
        : [];
    return {
      ...n,
      contactId,
      finger: state.fingers[contactId],
      anchor: state.anchor,
      shift: movement.some(
        (e) => e.kind === "move" || e.kind === "repeat_change",
      ),
      crossing: movement.some(
        (e) => e.kind === "thumb_under" || e.kind === "finger_over",
      ),
    };
  });
  return {
    status: "complete",
    notes: planned,
    states,
    costs,
    cost: total(costs),
    statistics,
  };
}
export function unsupportedPianoHand(
  diagnostic: PianoDiagnostic,
): PianoHandPlan {
  return {
    status: "unsupported",
    notes: [],
    states: [],
    costs: zero(),
    cost: 0,
    diagnostic,
    statistics: { frames: 0, candidates: 0, transitions: 0, maxLayer: 0 },
  };
}
export function assemblePianoPhrase(
  hands: Record<PianoHand, PianoHandPlan>,
  order: readonly string[],
): PianoPhrasePlan {
  const { right, left } = hands,
    costs = add(right.costs, left.costs),
    all = [...right.notes, ...left.notes],
    byId = new Map(all.map((n) => [n.id, n]));
  return {
    status:
      right.status === "complete" && left.status === "complete"
        ? "complete"
        : all.length
          ? "partial"
          : "unsupported",
    hands,
    notes: order.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : [])),
    costs,
    cost: total(costs),
  };
}
export function planPianoPhrase(
  input: readonly PianoPhraseNote[],
  profile: PianoPhraseProfile = {},
): PianoPhrasePlan {
  validateProfile(profile);
  if (input.length > 8000)
    return assemblePianoPhrase(
      {
        right: unsupportedPianoHand({ hand: "right", code: "search_limit" }),
        left: unsupportedPianoHand({ hand: "left", code: "search_limit" }),
      },
      [],
    );
  validateNotes(input);
  const built = build(input),
    right = planHand("right", input, built, profile),
    left = planHand("left", input, built, profile),
    hands = { right, left };
  return assemblePianoPhrase(
    hands,
    input.map((n) => n.id),
  );
}
