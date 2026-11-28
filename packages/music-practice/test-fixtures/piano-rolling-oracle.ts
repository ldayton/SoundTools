/** Independent exhaustive reference for eight released, ascending stepwise notes.
 * It shares no candidate, geometry, cost or classification functions with production. */
export function exhaustiveRollingCost(
  midis: readonly number[],
  fixed: readonly (number | undefined)[],
) {
  const key = (m: number) =>
    Math.floor(m / 12) * 7 +
    [0, 0.6, 1, 1.6, 2, 3, 3.6, 4, 4.6, 5, 5.6, 6][m % 12];
  const layers = midis.map((m, i) => {
    const out: { finger: number; anchor: number; cost: number }[] = [];
    for (let finger = 1; finger <= 5; finger++) {
      if (fixed[i] !== undefined && fixed[i] !== finger) continue;
      for (let anchor = -5; anchor <= 79; anchor++) {
        const d = Math.abs(key(m) - anchor - (finger - 1));
        if (d > 0.61) continue;
        out.push({
          finger,
          anchor,
          cost:
            d * d * 3 +
            ([1, 3, 6, 8, 10].includes(m % 12)
              ? finger === 1
                ? 1.8
                : finger === 5
                  ? 0.4
                  : 0
              : 0) +
            (finger === 4 ? 0.15 : 0),
        });
      }
    }
    return out;
  });
  let best = Infinity,
    paths = 0;
  const visit = (
    i: number,
    prior: (typeof layers)[number][number] | undefined,
    cost: number,
  ) => {
    if (cost >= best) return;
    if (i === midis.length) {
      best = cost;
      paths++;
      return;
    }
    for (const next of layers[i]) {
      let edge = 0;
      if (prior) {
        const delta = midis[i] - midis[i - 1],
          d = Math.abs(next.anchor - prior.anchor),
          cross = delta * (next.finger - prior.finger) < 0;
        if (cross && !d) continue;
        let move = d ? 5 + 1.8 * d : 0,
          passing = 0;
        if (cross && prior.finger !== 1 && next.finger !== 1) move += 8;
        if (delta && next.finger === prior.finger) move += 4;
        if (cross && (prior.finger === 1 || next.finger === 1)) {
          const over = next.finger === 1 ? prior.finger : next.finger;
          passing = over === 3 ? 0 : over === 4 ? 0.3 : 1;
          if (d <= 7 && Math.abs(key(midis[i]) - key(midis[i - 1])) <= 2.1) {
            if (over === 5) passing += 8;
            else move = 0.5 + 0.35 * d;
          }
        }
        edge = move + passing;
      }
      visit(i + 1, next, cost + next.cost + edge);
    }
  };
  visit(0, undefined, 0);
  return { cost: best, paths };
}
