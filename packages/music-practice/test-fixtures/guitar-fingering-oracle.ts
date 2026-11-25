/** Test-only specification model. No production candidate, feasibility, frame or
 * scoring helpers are called. Exhaustive DFS deliberately does not use DP. */
import assert from "node:assert/strict";
import type {
  GuitarPhraseNote,
  GuitarPhrasePlan,
  GuitarFingeringProfile,
} from "../src/guitar-phrase-fingering";
type Contact = GuitarPhraseNote & { end: number };
type Frame = { at: number; until: number; active: Contact[] };
type Pose = {
  position: number;
  digits: number[];
  barres: {
    finger: number;
    fret: number;
    fromString: number;
    toString: number;
  }[];
  cost: number;
};
const spans: Record<string, number> = {
  "1:2": 3,
  "1:3": 4,
  "1:4": 5,
  "2:3": 2,
  "2:4": 3,
  "3:4": 2,
};
const settings = (p: GuitarFingeringProfile) => ({
  stretch: 8,
  barre: 3,
  position: 0.015,
  movement: 0.12,
  shift: 1.5,
  substitution: 18,
  ...p.weights,
});
export function referenceFrames(notes: readonly GuitarPhraseNote[]) {
  const roots = new Map<string, string>(),
    contacts = new Map<string, Contact>();
  for (const n of [...notes].sort(
    (a, b) => a.start - b.start || a.id.localeCompare(b.id),
  )) {
    const root = n.tieFrom ? roots.get(n.tieFrom)! : n.id;
    assert.ok(root, "oracle needs a valid tie predecessor");
    roots.set(n.id, root);
    const c = contacts.get(root);
    if (c) c.end = Math.max(c.end, n.start + n.duration);
    else contacts.set(root, { ...n, id: root, end: n.start + n.duration });
  }
  const all = [...contacts.values()],
    boundaries = [...new Set(all.flatMap((n) => [n.start, n.end]))].sort(
      (a, b) => a - b,
    );
  const frames: Frame[] = boundaries.slice(1).map((until, i) => ({
    at: boundaries[i],
    until,
    active: all.filter(
      (n) => n.start <= boundaries[i] && n.end > boundaries[i],
    ),
  }));
  return { roots, frames };
}
function grip(
  frame: Frame,
  digits: number[],
  position: number,
  p: GuitarFingeringProfile,
): Pose | null {
  if (
    !Number.isInteger(position) ||
    position < 1 ||
    position > 24 ||
    new Set(frame.active.map((n) => n.string)).size !== frame.active.length
  )
    return null;
  const groups = new Map<number, Contact[]>();
  let effort = 0;
  const w = settings(p),
    length = p.scaleLength ?? 650,
    capo = p.capo ?? 0;
  for (const [i, n] of frame.active.entries()) {
    const f = digits[i];
    if (n.fret === 0) {
      if (f !== 0) return null;
      continue;
    }
    if (!Number.isInteger(f) || f < 1 || f > 4) return null;
    const extension = n.fret - position - f + 1;
    if (Math.abs(extension) > 1) return null;
    effort +=
      (extension *
        extension *
        w.stretch *
        length *
        (2 ** (-(position + capo - 1) / 12) - 2 ** (-(position + capo) / 12))) /
      30;
    groups.set(f, [...(groups.get(f) || []), n]);
  }
  if (groups.size > (p.maxFingers ?? 4)) return null;
  const barres: Pose["barres"] = [];
  for (const [finger, ns] of groups) {
    if (ns.some((n) => n.fret !== ns[0].fret)) return null;
    if (ns.length > 1) {
      if (p.allowBarres === false) return null;
      const low = Math.min(...ns.map((n) => n.string)),
        high = Math.max(...ns.map((n) => n.string));
      if (
        frame.active.some(
          (n) => n.string >= low && n.string <= high && n.fret < ns[0].fret,
        )
      )
        return null;
      barres.push({
        finger,
        fret: ns[0].fret,
        fromString: high,
        toString: low,
      });
      effort += w.barre * (1 + (high - low) / 3);
    }
  }
  const fingers = [...groups.keys()].sort();
  for (let i = 0; i < fingers.length; i++)
    for (let j = i + 1; j < fingers.length; j++) {
      const a = fingers[i],
        b = fingers[j],
        distance = groups.get(b)![0].fret - groups.get(a)![0].fret;
      if (distance < 0 || distance > spans[`${a}:${b}`]) return null;
    }
  barres.sort((a, b) => a.finger - b.finger);
  return {
    position,
    digits,
    barres,
    cost:
      (effort + position * w.position) * Math.min(4, frame.until - frame.at),
  };
}
function transitions(
  a: Frame,
  b: Frame,
  x: Pose,
  y: Pose,
  p: GuitarFingeringProfile,
) {
  const w = settings(p);
  let penalty = 0;
  for (const [i, n] of b.active.entries()) {
    const held = a.active.findIndex((old) => old.id === n.id);
    if (held >= 0 && x.digits[held] !== y.digits[i]) {
      if (!p.allowSubstitutions) return Infinity;
      penalty += w.substitution;
    }
    const repeat = a.active.findIndex(
      (old) =>
        old.id !== n.id && old.string === n.string && old.fret === n.fret,
    );
    if (repeat >= 0 && x.digits[repeat] !== y.digits[i])
      penalty += w.substitution;
  }
  const dt = Math.max(0.08, ((b.at - a.at) * 60) / (p.bpm ?? 120));
  penalty += (Math.abs(y.position - x.position) * w.shift) / dt;
  for (let f = 1; f <= 4; f++) {
    const old = a.active[x.digits.indexOf(f)],
      next = b.active[y.digits.indexOf(f)];
    if (old && next && old.id !== next.id)
      penalty +=
        (w.movement *
          ((p.scaleLength ?? 650) *
            Math.abs(
              2 ** (-(old.fret + (p.capo ?? 0)) / 12) -
                2 ** (-(next.fret + (p.capo ?? 0)) / 12),
            ) +
            6 * Math.abs(old.string - next.string))) /
        dt;
  }
  return penalty;
}
/** Every assignment/position, including legal barres; no production pruning. */
function enumerate(frame: Frame, p: GuitarFingeringProfile) {
  const result: Pose[] = [];
  function assign(digits: number[]) {
    if (digits.length === frame.active.length) {
      for (let position = 1; position <= 24; position++) {
        const pose = grip(frame, digits, position, p);
        if (pose) result.push(pose);
      }
      return;
    }
    const choices = frame.active[digits.length].fret ? [1, 2, 3, 4] : [0];
    for (const f of choices) assign([...digits, f]);
  }
  assign([]);
  return result;
}
export function exhaustiveGuitarCost(
  notes: readonly GuitarPhraseNote[],
  p: GuitarFingeringProfile = {},
) {
  const { frames } = referenceFrames(notes),
    choices = frames.map((f) => enumerate(f, p));
  let best = Infinity,
    paths = 0;
  function walk(i: number, previous: Pose | undefined, cost: number) {
    if (i === frames.length) {
      paths++;
      best = Math.min(best, cost);
      return;
    }
    for (const next of choices[i]) {
      const edge = previous
        ? transitions(frames[i - 1], frames[i], previous, next, p)
        : 0;
      if (Number.isFinite(edge)) walk(i + 1, next, cost + next.cost + edge);
    }
  }
  walk(0, undefined, 0);
  return { cost: Number.isFinite(best) ? best : null, paths };
}
export function verifyGuitarPlan(
  notes: readonly GuitarPhraseNote[],
  plan: GuitarPhrasePlan | null,
  p: GuitarFingeringProfile = {},
) {
  assert.ok(plan, "a known playable witness must produce a complete plan");
  assert.deepEqual(
    plan.notes.map((n) => [
      n.id,
      n.start,
      n.duration,
      n.string,
      n.fret,
      n.tieFrom,
    ]),
    notes.map((n) => [n.id, n.start, n.duration, n.string, n.fret, n.tieFrom]),
  );
  const { roots, frames } = referenceFrames(notes);
  assert.equal(plan.states.length, frames.length);
  let cost = 0,
    previous: Pose | undefined;
  for (const [i, frame] of frames.entries()) {
    const state: GuitarPhrasePlan["states"][number] = plan.states[i];
    assert.deepEqual([state.at, state.until], [frame.at, frame.until]);
    assert.deepEqual(
      Object.keys(state.fingers).sort(),
      frame.active.map((n) => n.id).sort(),
    );
    const pose = grip(
      frame,
      frame.active.map((n) => state.fingers[n.id]),
      state.position,
      p,
    );
    assert.ok(pose, "independent physical hand constraints");
    assert.deepEqual(state.barres, pose.barres);
    const edge = previous
      ? transitions(frames[i - 1], frame, previous, pose, p)
      : 0;
    assert.ok(
      Number.isFinite(edge),
      "held contacts cannot silently change fingers",
    );
    cost += pose.cost + edge;
    previous = pose;
    assert.ok(
      Object.values(state.costs).every((c) => Number.isFinite(c) && c >= 0),
    );
  }
  assert.ok(
    Math.abs(cost - plan.cost) < 1e-7,
    `independent cost ${cost} != ${plan.cost}`,
  );
  assert.ok(
    Math.abs(Object.values(plan.costs).reduce((a, b) => a + b, 0) - plan.cost) <
      1e-7,
  );
  assert.ok(
    Math.abs(
      plan.states.reduce(
        (n, s) => n + Object.values(s.costs).reduce((a, b) => a + b, 0),
        0,
      ) - plan.cost,
    ) < 1e-7,
  );
  for (const n of plan.notes) {
    const state: GuitarPhrasePlan["states"][number] = plan.states.find(
      (s) => s.at <= n.start && s.until > n.start,
    )!;
    assert.equal(n.finger, state.fingers[roots.get(n.id)!]);
    assert.equal(n.position, state.position);
  }
}
export function verifyKnownHand(
  notes: readonly GuitarPhraseNote[],
  witness: { position: number; fingers: Record<string, number> },
  p: GuitarFingeringProfile = {},
) {
  const { frames } = referenceFrames(notes);
  for (const frame of frames)
    assert.ok(
      grip(
        frame,
        frame.active.map((n) => witness.fingers[n.id]),
        witness.position,
        p,
      ),
      "generated witness itself must satisfy independent hand constraints",
    );
}
