/** Independent, deliberately small exhaustive reference. No production imports.
 * Scope: two-or-more-key frames, no rests/substitutions/crossed-thumb grips.
 * Other techniques have separately specified behavioral witnesses. */
export type OracleNote = {
  id: string;
  midi: number;
  start: number;
  duration: number;
  finger?: number;
};
const position = (m: number) =>
  Math.floor(m / 12) * 7 +
  [0, 0.6, 1, 1.6, 2, 3, 3.6, 4, 4.6, 5, 5.6, 6][m % 12];
const reaches = [
  [0],
  [0, 0, 4, 5, 6, 7],
  [0, 0, 0, 2, 3, 4],
  [0, 0, 0, 0, 2, 3],
  [0, 0, 0, 0, 0, 2],
];
type State = { anchor: number; digits: number[]; own: number };
export function exhaustiveWholeHand(
  notes: OracleNote[],
  hand: "right" | "left",
  bpm = 120,
) {
  const sign = hand === "right" ? 1 : -1,
    times = [
      ...new Set(notes.flatMap((n) => [n.start, n.start + n.duration])),
    ].sort((a, b) => a - b);
  const frames = times
    .slice(0, -1)
    .map((at, i) => ({
      at,
      until: times[i + 1],
      notes: notes
        .filter((n) => n.start <= at && n.start + n.duration > at)
        .sort((a, b) => a.midi - b.midi),
    }));
  const layers = frames.map((frame) => {
    const result: State[] = [];
    if (frame.notes.length < 2)
      throw Error("oracle requires polyphonic frames");
    const assign = (digits: number[]) => {
      if (digits.length < frame.notes.length) {
        for (let f = 1; f <= 5; f++) {
          const n = frame.notes[digits.length];
          if (digits.includes(f) || (n.finger !== undefined && n.finger !== f))
            continue;
          assign([...digits, f]);
        }
        return;
      }
      const p = frame.notes.map((n) => position(n.midi));
      if (p.at(-1)! - p[0] > 7) return;
      for (let i = 0; i < p.length; i++)
        for (let j = i + 1; j < p.length; j++) {
          if ((digits[j] - digits[i]) * sign <= 0) return; // no crossed-thumb scope
          if (
            p[j] - p[i] >
            reaches[Math.min(digits[i], digits[j])][
              Math.max(digits[i], digits[j])
            ]
          )
            return;
        }
      // Enumerate the full MIDI keyboard anchor range rather than production bounds.
      for (let anchor = -5; anchor <= 79; anchor++) {
        if (p.some((x, i) => Math.abs(x - anchor - sign * (digits[i] - 1)) > 2))
          continue;
        let cost = 0;
        for (let i = 0; i < p.length; i++) {
          const f = digits[i],
            black = [1, 3, 6, 8, 10].includes(frame.notes[i].midi % 12);
          cost +=
            3 * (p[i] - anchor - sign * (f - 1)) ** 2 +
            (black ? (f === 1 ? 1.8 : f === 5 ? 0.4 : 0) : 0) +
            (f === 4 ? 0.15 : 0);
        }
        result.push({
          anchor,
          digits,
          own: cost * Math.min(4, frame.until - frame.at),
        });
      }
    };
    assign([]);
    return result;
  });
  let best = Infinity,
    paths = 0;
  const walk = (i: number, prior: State | undefined, cost: number) => {
    if (i === frames.length) {
      paths++;
      best = Math.min(best, cost);
      return;
    }
    for (const s of layers[i]) {
      let edge = 0;
      if (prior) {
        const old = frames[i - 1],
          now = frames[i];
        let legal = true;
        for (let j = 0; j < now.notes.length; j++) {
          const k = old.notes.findIndex((n) => n.id === now.notes[j].id);
          if (k >= 0 && prior.digits[k] !== s.digits[j]) legal = false;
        }
        if (!legal) continue;
        const d = Math.abs(s.anchor - prior.anchor);
        let movement = d ? 5 + 1.8 * d : 0,
          repeat = 0;
        now.notes.forEach((n, j) => {
          const k = old.notes.findIndex(
            (o) =>
              o.id !== n.id &&
              prior.digits[old.notes.indexOf(o)] === s.digits[j],
          );
          if (k >= 0)
            movement +=
              0.6 * Math.abs(position(n.midi) - position(old.notes[k].midi));
          const r = old.notes.findIndex(
            (o) => o.id !== n.id && o.midi === n.midi,
          );
          if (r >= 0 && prior.digits[r] !== s.digits[j]) repeat += 4;
        });
        edge =
          (movement * 0.5) / Math.max(0.08, ((now.at - old.at) * 60) / bpm) +
          repeat;
      }
      walk(i + 1, s, cost + s.own + edge);
    }
  };
  walk(0, undefined, 0);
  return { cost: best, paths };
}
