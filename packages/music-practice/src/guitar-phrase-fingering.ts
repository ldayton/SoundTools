import {
  assessGuitarFingering,
  type FingeringLimits,
  type GuitarFingering,
  type GuitarFrets,
} from "./guitar-chord-fingering";

/** Times are quarter-note beats; frets are relative to capo; strings are 1=high E. */
export type GuitarPhraseNote = {
  id: string;
  start: number;
  duration: number;
  string: number;
  fret: number;
  tieFrom?: string;
};
export type FingeringCosts = {
  stretch: number;
  barre: number;
  position: number;
  movement: number;
  shift: number;
  substitution: number;
};
export type GuitarHandState = {
  at: number;
  until: number;
  position: number;
  fingers: Readonly<Record<string, number>>;
  barres: GuitarFingering["barres"];
  costs: FingeringCosts;
};
export type GuitarPhrasePlan = {
  notes: (GuitarPhraseNote & { finger: number; position: number })[];
  states: GuitarHandState[];
  costs: FingeringCosts;
  cost: number;
};
export type GuitarFingeringProfile = {
  bpm?: number;
  capo?: number;
  scaleLength?: number;
  maxFingers?: number;
  allowBarres?: boolean;
  allowSubstitutions?: boolean;
  weights?: Partial<FingeringCosts>;
};
const zero = (): FingeringCosts => ({
  stretch: 0,
  barre: 0,
  position: 0,
  movement: 0,
  shift: 0,
  substitution: 0,
});
const sum = (a: FingeringCosts, b: FingeringCosts): FingeringCosts =>
  Object.fromEntries(
    Object.keys(a).map((key) => [
      key,
      a[key as keyof FingeringCosts] + b[key as keyof FingeringCosts],
    ]),
  ) as FingeringCosts;
const total = (cost: FingeringCosts) =>
  Object.values(cost).reduce((a, b) => a + b, 0);
const epsilon = 1e-7;
const weights: FingeringCosts = {
  stretch: 8,
  barre: 3,
  position: 0.015,
  movement: 0.12,
  shift: 1.5,
  substitution: 18,
};
const fretLocation = (fret: number, length: number) =>
  length * (1 - 2 ** (-fret / 12));

/** Enumerate legal contacts, sharing exactly the same feasibility rules as chord search. */
export function guitarHandCandidates(
  frets: GuitarFrets,
  limits: FingeringLimits = { maxFingers: 4, allowBarres: true },
): GuitarFingering[] {
  if (
    frets.length !== 6 ||
    frets.some((f) => f !== null && (!Number.isInteger(f) || f < 0 || f > 24))
  )
    return [];
  const fingers: (number | null)[] = frets.map((f) => (f === null ? null : 0));
  const targets = frets.flatMap((f, i) => (f !== null && f > 0 ? [i] : [])),
    result: GuitarFingering[] = [];
  function visit(at: number) {
    if (at === targets.length) {
      const grip = assessGuitarFingering(frets, fingers, limits);
      if (grip) result.push(grip);
      return;
    }
    const index = targets[at],
      fret = frets[index]!;
    for (let finger = 1; finger <= 4; finger++) {
      if (
        targets
          .slice(0, at)
          .some(
            (i) =>
              (fingers[i] === finger && frets[i] !== fret) ||
              (frets[i] !== fret &&
                Math.sign(fret - frets[i]!) !==
                  Math.sign(finger - fingers[i]!)),
          )
      )
        continue;
      fingers[index] = finger;
      visit(at + 1);
    }
    fingers[index] = 0;
  }
  visit(0);
  return result;
}

/** Independent, explainable grip score. Hard feasibility is checked before scoring. */
export function scoreGuitarHand(
  frets: GuitarFrets,
  fingers: readonly (number | null)[],
  position: number,
  profile: GuitarFingeringProfile = {},
): FingeringCosts | null {
  const grip = assessGuitarFingering(frets, fingers, {
    maxFingers: profile.maxFingers ?? 4,
    allowBarres: profile.allowBarres ?? true,
  });
  if (!grip || !Number.isInteger(position) || position < 1 || position > 24)
    return null;
  const w = { ...weights, ...profile.weights },
    capo = profile.capo ?? 0,
    length = profile.scaleLength ?? 650,
    cost = zero();
  for (let i = 0; i < 6; i++)
    if (frets[i]) {
      const expected = position + fingers[i]! - 1,
        extension = Math.abs(frets[i]! - expected);
      if (extension > 1) return null;
      const width =
        fretLocation(position + capo, length) -
        fretLocation(position + capo - 1, length);
      cost.stretch += (w.stretch * extension ** 2 * width) / 30;
    }
  cost.barre = grip.barres.reduce(
    (n, b) => n + w.barre * (1 + (b.fromString - b.toString) / 3),
    0,
  );
  cost.position = position * w.position;
  return cost;
}

type Contact = GuitarPhraseNote & { hold: string };
type Candidate = {
  position: number;
  fingers: Record<string, number>;
  barres: GuitarFingering["barres"];
  local: FingeringCosts;
};
type Node = {
  candidate: Candidate;
  costs: FingeringCosts;
  cost: number;
  previous: number;
  step: FingeringCosts;
};

/** Exact shortest path through complete hand states at every attack/release.
 * No music is rewritten; a physically unsupported fixed-tab passage returns null.
 */
export function planGuitarPhrase(
  input: readonly GuitarPhraseNote[],
  profile: GuitarFingeringProfile = {},
): GuitarPhrasePlan | null {
  const bpm = profile.bpm ?? 120,
    capo = profile.capo ?? 0,
    length = profile.scaleLength ?? 650;
  if (
    !Number.isFinite(bpm) ||
    bpm <= 0 ||
    !Number.isInteger(capo) ||
    capo < 0 ||
    capo > 24 ||
    !Number.isFinite(length) ||
    length <= 0 ||
    (profile.maxFingers !== undefined &&
      (!Number.isInteger(profile.maxFingers) ||
        profile.maxFingers < 0 ||
        profile.maxFingers > 4)) ||
    Object.values(profile.weights ?? {}).some(
      (w) => !Number.isFinite(w) || w! < 0,
    )
  )
    throw Error("Invalid guitar fingering profile");
  const ids = new Map<string, Contact>(),
    notes: Contact[] = [],
    tied = new Set<string>();
  for (const note of [...input].sort(
    (a, b) => a.start - b.start || a.id.localeCompare(b.id),
  )) {
    if (
      !note.id ||
      ids.has(note.id) ||
      !Number.isFinite(note.start) ||
      note.start < 0 ||
      !Number.isFinite(note.duration) ||
      note.duration <= 0 ||
      !Number.isInteger(note.string) ||
      note.string < 1 ||
      note.string > 6 ||
      !Number.isInteger(note.fret) ||
      note.fret < 0 ||
      note.fret + capo > 24
    )
      throw Error("Invalid guitar phrase note");
    const tie = note.tieFrom ? ids.get(note.tieFrom) : undefined;
    if (
      note.tieFrom &&
      (tied.has(note.tieFrom) ||
        !tie ||
        tie.string !== note.string ||
        tie.fret !== note.fret ||
        Math.abs(tie.start + tie.duration - note.start) > epsilon)
    )
      throw Error("Invalid guitar tie");
    if (note.tieFrom) tied.add(note.tieFrom);
    const contact = { ...note, hold: tie?.hold ?? note.id };
    ids.set(note.id, contact);
    notes.push(contact);
  }
  if (!notes.length) return { notes: [], states: [], costs: zero(), cost: 0 };
  // Merge tied segments into one sounding contact; return every original note identity below.
  const held = new Map<string, Contact>();
  for (const note of notes) {
    const first = held.get(note.hold);
    if (first)
      first.duration =
        Math.max(first.start + first.duration, note.start + note.duration) -
        first.start;
    else held.set(note.hold, { ...note });
  }
  const contacts = [...held.values()],
    times = [
      ...new Set(contacts.flatMap((n) => [n.start, n.start + n.duration])),
    ].sort((a, b) => a - b);
  const frames = times.slice(0, -1).map((at, index) => ({
    at,
    until: times[index + 1],
    active: contacts.filter(
      (n) => n.start <= at + epsilon && n.start + n.duration > at + epsilon,
    ),
  }));
  const cache = new Map<
      string,
      { grip: GuitarFingering; position: number; local: FingeringCosts }[]
    >(),
    layers: Node[][] = [],
    w = { ...weights, ...profile.weights };
  for (let frameIndex = 0; frameIndex < frames.length; frameIndex++) {
    const frame = frames[frameIndex],
      frets: (number | null)[] = Array(6).fill(null);
    for (const note of frame.active) {
      const index = 6 - note.string;
      if (frets[index] !== null) return null;
      frets[index] = note.fret;
    }
    const key = frets.join("/");
    let poses = cache.get(key);
    if (!poses) {
      poses = [];
      for (const grip of guitarHandCandidates(frets, {
        maxFingers: profile.maxFingers ?? 4,
        allowBarres: profile.allowBarres ?? true,
      }))
        for (let position = 1; position <= 24; position++) {
          const local = scoreGuitarHand(frets, grip.fingers, position, profile);
          if (local) poses.push({ grip, position, local });
        }
      cache.set(key, poses);
    }
    const layer: Node[] = [];
    for (const pose of poses) {
      const fingers = Object.fromEntries(
        frame.active.map((n) => [n.hold, pose.grip.fingers[6 - n.string]!]),
      );
      const local = { ...pose.local };
      // Holding a difficult grip longer matters. Empty/open-string frames carry hand position.
      const duration = Math.min(4, frame.until - frame.at);
      local.stretch *= duration;
      local.barre *= duration;
      local.position *= duration;
      const candidate = {
        position: pose.position,
        fingers,
        barres: pose.grip.barres,
        local,
      };
      let best: Node | undefined;
      if (!frameIndex)
        best = {
          candidate,
          costs: local,
          cost: total(local),
          previous: -1,
          step: local,
        };
      else
        for (const [previousIndex, prev] of layers[frameIndex - 1].entries()) {
          const before = frames[frameIndex - 1],
            transition = zero();
          let valid = true;
          for (const note of frame.active) {
            const prior = Object.hasOwn(prev.candidate.fingers, note.hold)
              ? prev.candidate.fingers[note.hold]
              : undefined;
            if (prior !== undefined && prior !== fingers[note.hold]) {
              if (!profile.allowSubstitutions) {
                valid = false;
                break;
              }
              transition.substitution += w.substitution;
            }
          }
          if (!valid) continue;
          for (const note of frame.active) {
            const repeated = before.active.find(
              (n) =>
                n.hold !== note.hold &&
                n.string === note.string &&
                n.fret === note.fret,
            );
            if (
              repeated &&
              prev.candidate.fingers[repeated.hold] !== fingers[note.hold]
            )
              transition.substitution += w.substitution;
          }
          const seconds = Math.max(0.08, ((frame.at - before.at) * 60) / bpm);
          transition.shift =
            (Math.abs(candidate.position - prev.candidate.position) * w.shift) /
            seconds;
          // Measure movement of actual fingers, retaining useful contacts across chord changes.
          for (let finger = 1; finger <= 4; finger++) {
            const from = before.active.find(
                (n) => prev.candidate.fingers[n.hold] === finger,
              ),
              to = frame.active.find((n) => fingers[n.hold] === finger);
            if (from && to && from.hold !== to.hold) {
              const mm = Math.abs(
                fretLocation(from.fret + capo, length) -
                  fretLocation(to.fret + capo, length),
              );
              transition.movement +=
                (w.movement * (mm + Math.abs(from.string - to.string) * 6)) /
                seconds;
            }
          }
          const costs = sum(sum(prev.costs, local), transition),
            cost = total(costs);
          if (!best || cost < best.cost - 1e-9)
            best = {
              candidate,
              costs,
              cost,
              previous: previousIndex,
              step: sum(local, transition),
            };
        }
      if (best) layer.push(best);
    }
    if (!layer.length) return null;
    layers.push(layer);
  }
  let best = layers
    .at(-1)!
    .reduce(
      (index, node, i, all) => (node.cost < all[index].cost - 1e-9 ? i : index),
      0,
    );
  const states: GuitarHandState[] = Array(frames.length);
  const result = layers.at(-1)![best];
  for (let index = frames.length - 1; index >= 0; index--) {
    const node = layers[index][best];
    states[index] = {
      at: frames[index].at,
      until: frames[index].until,
      position: node.candidate.position,
      fingers: { ...node.candidate.fingers },
      barres: node.candidate.barres,
      costs: node.step,
    };
    best = node.previous;
  }
  return {
    notes: input.map((note) => {
      const hold = ids.get(note.id)!.hold,
        state = states.find(
          (s) => s.at <= note.start + epsilon && s.until > note.start + epsilon,
        )!;
      return { ...note, finger: state.fingers[hold], position: state.position };
    }),
    states,
    costs: result.costs,
    cost: result.cost,
  };
}
