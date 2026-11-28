/** Shared, original piano geometry, motion and exact path search.
 * Reach preferences are conservative model parameters, not anatomical promises. */
export type PianoHand = "right" | "left";
export type PianoPose = { finger: number; anchor: number };
const whitePosition = [0, 0.6, 1, 1.6, 2, 3, 3.6, 4, 4.6, 5, 5.6, 6];
export const pianoKeyPosition = (midi: number) =>
  Math.floor(midi / 12) * 7 + whitePosition[((midi % 12) + 12) % 12];
export const pianoBlackKey = (midi: number) =>
  [1, 3, 6, 8, 10].includes(((midi % 12) + 12) % 12);
export function assertPianoHand(hand: unknown): asserts hand is PianoHand {
  if (hand !== "right" && hand !== "left") throw Error("Invalid piano hand");
}
export function assertPianoNote(note: {
  midi: number;
  duration: number;
  finger?: number;
  restBefore?: boolean;
  tied?: boolean;
}) {
  if (
    !Number.isInteger(note.midi) ||
    note.midi < 0 ||
    note.midi > 127 ||
    !Number.isFinite(note.duration) ||
    note.duration <= 0 ||
    (note.finger !== undefined &&
      (!Number.isInteger(note.finger) || note.finger < 1 || note.finger > 5)) ||
    (note.tied !== undefined && typeof note.tied !== "boolean") ||
    (note.restBefore !== undefined && typeof note.restBefore !== "boolean")
  )
    throw Error("Invalid piano fingering note");
}
export function pianoNoteCost(
  midi: number,
  finger: number,
  anchor: number,
  hand: PianoHand,
) {
  const stretch = Math.abs(
    pianoKeyPosition(midi) -
      (anchor + (hand === "right" ? 1 : -1) * (finger - 1)),
  );
  return (
    stretch * stretch * 3 +
    (pianoBlackKey(midi) ? (finger === 1 ? 1.8 : finger === 5 ? 0.4 : 0) : 0) +
    (finger === 4 ? 0.15 : 0)
  );
}
export function pianoSinglePoses(
  midi: number,
  fixed: number | undefined,
  hand: PianoHand,
  deviation = 0.61,
) {
  const result: PianoPose[] = [],
    x = pianoKeyPosition(midi),
    sign = hand === "right" ? 1 : -1;
  for (let finger = fixed ?? 1; finger <= (fixed ?? 5); finger++) {
    const ideal = x - sign * (finger - 1);
    for (
      let anchor = Math.ceil(ideal - deviation);
      anchor <= Math.floor(ideal + deviation);
      anchor++
    )
      if (Math.abs(x - (anchor + sign * (finger - 1))) <= deviation)
        result.push({ finger, anchor });
  }
  return result;
}
export function pianoMotionCost(
  a: { midi: number; duration: number },
  b: { midi: number; restBefore?: boolean },
  x: PianoPose,
  y: PianoPose,
  hand: PianoHand,
) {
  const distance = Math.abs(y.anchor - x.anchor),
    delta = b.midi - a.midi,
    crossed = delta * (y.finger - x.finger) * (hand === "right" ? 1 : -1) < 0;
  if (crossed && !distance)
    return { movement: Infinity, repeat: 0, crossing: 0 };
  const opportunity = b.restBefore ? 0.3 : a.duration >= 0.5 ? 0.65 : 1;
  let movement = distance ? (5 + distance * 1.8) * opportunity : 0,
    repeat = 0,
    crossing = 0;
  if (crossed && x.finger !== 1 && y.finger !== 1) movement += 8 * opportunity;
  if (delta && x.finger === y.finger) movement += 4 * opportunity;
  if (!delta && x.finger !== y.finger) repeat += 4;
  if (crossed && (x.finger === 1 || y.finger === 1)) {
    const over = y.finger === 1 ? x.finger : y.finger;
    crossing += over === 3 ? 0 : over === 4 ? 0.3 : 1;
  }
  return { movement, repeat, crossing };
}
/** A released-note thumb passage is a rolling gesture, not a full hand leap.
 * Keep the compatibility model unchanged for authored legacy melody tables. */
export function pianoTimedMotionCost(
  a: { midi: number; duration: number },
  b: { midi: number },
  x: PianoPose,
  y: PianoPose,
  hand: PianoHand,
  rolling = false,
) {
  const costs = pianoMotionCost(a, b, x, y, hand);
  const crossed =
    (b.midi - a.midi) * (y.finger - x.finger) * (hand === "right" ? 1 : -1) < 0;
  const over = y.finger === 1 ? x.finger : y.finger;
  if (
    rolling &&
    crossed &&
    (x.finger === 1 || y.finger === 1) &&
    Math.abs(pianoKeyPosition(b.midi) - pianoKeyPosition(a.midi)) <= 2.1 &&
    Math.abs(y.anchor - x.anchor) <= 7 &&
    Number.isFinite(costs.movement)
  ) {
    const opportunity = a.duration >= 0.5 ? 0.65 : 1;
    if (over === 5) costs.crossing += 8;
    else
      costs.movement =
        (0.5 + 0.35 * Math.abs(y.anchor - x.anchor)) * opportunity;
  }
  return costs;
}
export function pianoMotion(
  a: { midi: number },
  b: { midi: number },
  x: PianoPose | undefined,
  y: PianoPose,
  hand: PianoHand,
  rolling = false,
) {
  const shift =
    !!x &&
    (x.anchor !== y.anchor || (a.midi !== b.midi && x.finger === y.finger));
  const crossing =
    !!x &&
    shift &&
    Math.abs(y.anchor - x.anchor) <= (rolling ? 7 : 4) &&
    Math.abs(pianoKeyPosition(b.midi) - pianoKeyPosition(a.midi)) <=
      (rolling ? 2.1 : 1.6) &&
    (b.midi - a.midi) * (y.finger - x.finger) * (hand === "right" ? 1 : -1) <
      0 &&
    (y.finger === 1 || x.finger === 1);
  return { shift, crossing };
}
export type PianoPath<T> = {
  status: "complete" | "unsupported" | "limit";
  path: T[];
  cost: number;
  transitions: number;
  states?: number;
};
/** Exact DP: keep every state, stable ties, no beam pruning. */
export function solvePianoPath<T>(
  layers: readonly (readonly T[])[],
  local: (value: T, index: number) => number,
  edge: (a: T, b: T, index: number) => number,
  maxTransitions = 2_000_000,
): PianoPath<T> {
  type Node = { value: T; cost: number; previous: number };
  const history: Node[][] = [];
  let transitions = 0;
  for (const [i, choices] of layers.entries()) {
    const layer: Node[] = [];
    for (const value of choices) {
      const own = local(value, i);
      let best = Infinity,
        previous = -1;
      if (!i) {
        best = own;
      } else
        for (const [j, prior] of history[i - 1].entries()) {
          if (++transitions > maxTransitions)
            return { status: "limit", path: [], cost: 0, transitions };
          const cost = prior.cost + own + edge(prior.value, value, i);
          if (cost < best) {
            best = cost;
            previous = j;
          }
        }
      if (Number.isFinite(best)) layer.push({ value, cost: best, previous });
    }
    if (!layer.length)
      return { status: "unsupported", path: [], cost: 0, transitions };
    history.push(layer);
  }
  if (!history.length)
    return { status: "complete", path: [], cost: 0, transitions };
  let index = history
    .at(-1)!
    .reduce((best, n, i, all) => (n.cost < all[best].cost ? i : best), 0);
  const cost = history.at(-1)![index].cost,
    path: T[] = Array(history.length);
  for (let i = history.length - 1; i >= 0; i--) {
    const node = history[i][index];
    path[i] = node.value;
    index = node.previous;
  }
  return { status: "complete", path, cost, transitions };
}

/** Exact search with sufficient history. Only identical current candidate AND
 * future-relevant memory may merge. No beam, cost-only history merging or retries. */
export function solvePianoMemoryPath<T, M>(
  layers: readonly (readonly T[])[],
  local: (value: T, index: number) => number,
  initial: (value: T) => M,
  advance: (
    a: T,
    b: T,
    memory: M,
    index: number,
  ) => { cost: number; memory: M } | null,
  key: (memory: M) => string,
  maxTransitions = 2_000_000,
  maxStates = 100_000,
): PianoPath<T> {
  type Node = { value: T; memory: M; cost: number; previous: number };
  const history: Node[][] = [];
  let transitions = 0,
    states = 0;
  for (const [i, choices] of layers.entries()) {
    const layer: Node[] = [],
      byKey = new Map<string, number>();
    for (const [choice, value] of choices.entries()) {
      const own = local(value, i);
      if (!Number.isFinite(own)) continue;
      if (!i) {
        if (++states > maxStates)
          return { status: "limit", path: [], cost: 0, transitions, states };
        layer.push({ value, memory: initial(value), cost: own, previous: -1 });
        continue;
      }
      for (const [previous, prior] of history[i - 1].entries()) {
        if (++transitions > maxTransitions)
          return { status: "limit", path: [], cost: 0, transitions };
        const step = advance(prior.value, value, prior.memory, i);
        if (!step) continue;
        const cost = prior.cost + own + step.cost;
        if (!Number.isFinite(cost)) continue;
        const signature = choice + ":" + key(step.memory),
          known = byKey.get(signature);
        if (known === undefined) {
          byKey.set(signature, layer.length);
          if (++states > maxStates)
            return { status: "limit", path: [], cost: 0, transitions, states };
          layer.push({ value, memory: step.memory, cost, previous });
        } else if (cost < layer[known].cost)
          layer[known] = { value, memory: step.memory, cost, previous };
      }
    }
    if (!layer.length)
      return { status: "unsupported", path: [], cost: 0, transitions };
    history.push(layer);
  }
  if (!history.length)
    return { status: "complete", path: [], cost: 0, transitions };
  let index = history
    .at(-1)!
    .reduce((best, n, i, all) => (n.cost < all[best].cost ? i : best), 0);
  const cost = history.at(-1)![index].cost,
    path: T[] = Array(history.length);
  for (let i = history.length - 1; i >= 0; i--) {
    const node = history[i][index];
    path[i] = node.value;
    index = node.previous;
  }
  return { status: "complete", path, cost, transitions, states };
}
