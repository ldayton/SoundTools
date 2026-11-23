/** Engraving units, before physical staff scaling. Bar indices include opening repeats. */
export type SystemMeasure = { width: number; duration: number; phraseEnd?: boolean; breakBefore?: boolean };
export const SYSTEM_MIN_SPACING = 1.1;
export const SYSTEM_TARGET_SPACING = 1.5;

/** Fit measured content, rather than choosing a bar count from screen breakpoints. */
export function planScoreSystems(
  measures: readonly SystemMeasure[],
  capacity: number,
  barDuration: number,
): number[] {
  if (!measures.length) return [];
  const n = measures.length, costs = Array(n + 1).fill(Infinity), next = Array(n).fill(n);
  costs[n] = 0;
  const boundaries = new Set<number>();
  measures.forEach((measure, index) => {
    if (!measure.breakBefore) return;
    // Opening repeats carry no duration and travel with the section after them.
    while (index > 0 && measures[index - 1].duration === 0) index--;
    if (index > 0) boundaries.add(index);
  });
  const minimum = (from: number, to: number) =>
    measures.slice(from, to).reduce((sum, measure) => sum + measure.width, 0) * SYSTEM_MIN_SPACING;
  const short = (index: number) => measures[index].duration > 0 && measures[index].duration < barDuration - 1e-6;
  const first = measures.findIndex(measure => measure.duration > 0);
  const allowed = (end: number) => {
    if (end === n) return true;
    if (measures[end - 1].duration === 0) return false;
    if (boundaries.has(end)) return true;
    // A pickup or final partial measure belongs with its neighbour when they fit.
    if (end === first + 1 && short(first) && minimum(first, end + 1) <= capacity) return false;
    if (end === n - 1 && short(n - 1) && minimum(end - 1, n) <= capacity) return false;
    return true;
  };
  for (let start = n - 1; start >= 0; start--) {
    let width = 0, sounding = 0;
    for (let end = start + 1; end <= n; end++) {
      if (end > start + 1 && boundaries.has(end - 1)) break;
      width += measures[end - 1].width;
      if (measures[end - 1].duration > 0) sounding++;
      const fits = width * SYSTEM_MIN_SPACING <= capacity;
      // An indivisible dense bar is still engravable; the renderer can fit it.
      if (!fits && sounding > 1) break;
      if (!allowed(end) || !Number.isFinite(costs[end])) continue;
      const fill = width * SYSTEM_TARGET_SPACING / Math.max(1, capacity);
      const ragged = Math.max(0, 1 - fill);
      const crowded = Math.max(0, fill - 1);
      const final = end === n;
      const orphan = final && start > 0 && sounding === 1 ? 1.5 : 0;
      const cost = 1 + ragged * ragged * (final ? 0.7 : 6)
        + crowded * crowded * 8 + orphan
        + (!final && measures[end - 1].phraseEnd ? -0.15 : 0) + costs[end];
      if (cost < costs[start]) { costs[start] = cost; next[start] = end; }
    }
  }
  const breaks: number[] = [];
  for (let at = 0; next[at] < n; at = next[at]) breaks.push(next[at] - 1);
  return breaks;
}
