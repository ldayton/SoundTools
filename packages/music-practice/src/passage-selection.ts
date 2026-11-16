export type Passage = { start: number; end: number; wholeBars?: boolean };
const same = (a: Passage | undefined, b: Passage | undefined) =>
  a?.start === b?.start &&
  a?.end === b?.end &&
  !!a?.wholeBars === !!b?.wholeBars;

/** Selection history contains musical indexes, never engraving coordinates. */
export class PassageSelection {
  range?: Passage;
  cursor = 0;
  private history: (Passage | undefined)[] = [];
  constructor(private length = 0) {}
  bind(length: number) {
    this.length = length;
    this.cursor = this.clamp(this.cursor);
    if (this.range && this.range.end >= length) this.reset();
  }
  clamp(index: number) {
    return Math.max(0, Math.min(Math.max(0, this.length - 1), index));
  }
  select(a: number, b: number, wholeBars = false) {
    const start = this.clamp(Math.min(a, b)),
      end = this.clamp(Math.max(a, b));
    return this.commit({
      start,
      end,
      ...(wholeBars ? { wholeBars: true } : {}),
    });
  }
  clear() {
    return this.commit(undefined);
  }
  private commit(next: Passage | undefined) {
    if (same(this.range, next)) return false;
    this.history.push(this.range && { ...this.range });
    if (this.history.length > 50) this.history.shift();
    this.range = next;
    return true;
  }
  undo() {
    if (!this.history.length) return false;
    this.range = this.history.pop();
    return true;
  }
  reset() {
    this.range = undefined;
    this.cursor = 0;
    this.history = [];
  }
}

export type ScorePosition = { bar: number; beat: number };
/** Bar zero is the pickup; complete bars begin at one. Beats use the meter's counted pulse. */
export function scorePosition(
  time: number,
  barLength: number,
  pickup: number,
  pulse: number,
): ScorePosition {
  const epsilon = 1e-6;
  if (pickup > epsilon && time < pickup - epsilon)
    return { bar: 0, beat: 1 + (barLength - pickup + time) / pulse };
  const elapsed = Math.max(0, time - pickup);
  const bar = Math.floor((elapsed + epsilon) / barLength);
  return { bar: bar + 1, beat: 1 + (elapsed - bar * barLength) / pulse };
}
const beatText = (beat: number) => {
  const rounded = Math.round(beat * 100) / 100;
  const whole = Math.floor(rounded),
    fraction = rounded - whole;
  return fraction === 0.5
    ? `${whole}½`
    : fraction === 0.25
      ? `${whole}¼`
      : fraction === 0.75
        ? `${whole}¾`
        : String(rounded);
};
export const positionLabel = (point: ScorePosition) =>
  `${point.bar ? `Bar ${point.bar}` : "Pickup"}, beat ${beatText(point.beat)}`;
export function barPassage(
  points: readonly (ScorePosition | undefined)[],
  index: number,
): Passage {
  const bar = points[index]?.bar;
  if (bar === undefined) return { start: index, end: index };
  let start = index,
    end = index;
  while (start > 0 && points[start - 1]?.bar === bar) start--;
  while (end + 1 < points.length && points[end + 1]?.bar === bar) end++;
  return { start, end, wholeBars: true };
}
export function passageLabel(
  points: readonly (ScorePosition | undefined)[],
  range: Passage,
) {
  const first = points[range.start],
    last = points[range.end];
  if (!first || !last) return "Selected passage";
  const whole =
    range.wholeBars ||
    ((first.bar === 0 || Math.abs(first.beat - 1) < 1e-6) &&
      barPassage(points, range.start).start === range.start &&
      barPassage(points, range.end).end === range.end);
  if (whole)
    return first.bar === last.bar
      ? first.bar
        ? `Bar ${first.bar}`
        : "Pickup"
      : first.bar === 0
        ? `Pickup–bar ${last.bar}`
        : `Bars ${first.bar}–${last.bar}`;
  return first.bar === last.bar
    ? `${first.bar ? `Bar ${first.bar}` : "Pickup"}, ${range.start === range.end ? "beat" : "beats"} ${beatText(first.beat)}${range.start === range.end ? "" : `–${beatText(last.beat)}`}`
    : `${positionLabel(first)} – ${positionLabel(last).toLowerCase()}`;
}

/** Written-bar boundaries include initial rests, rather than starting at its first attack. */
export function scoreBarSpan(time: number, barLength: number, pickup: number) {
  if (pickup > 1e-6 && time < pickup - 1e-6) return { start: 0, end: pickup };
  const start =
    pickup +
    Math.floor((Math.max(0, time - pickup) + 1e-6) / barLength) * barLength;
  return { start, end: start + barLength };
}
