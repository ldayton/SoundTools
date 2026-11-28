/** Independent exhaustive reference for released-note ergonomic preferences.
 * No production imports. Short phrases deliberately do not invoke long-run rules. */
export function exhaustiveErgonomicCost(
  midis: readonly number[],
  hand: "right" | "left",
  fixed: readonly (number | undefined)[] = [],
  gestureWeight = 0,
) {
  const sign = hand === "right" ? 1 : -1,
    key = (m: number) =>
      Math.floor(m / 12) * 7 +
      [0, 0.6, 1, 1.6, 2, 3, 3.6, 4, 4.6, 5, 5.6, 6][m % 12],
    black = (m: number) => [1, 3, 6, 8, 10].includes(m % 12);
  const ranges: Record<string, number[]> = {
    "1:2": [1, 5, 8],
    "1:3": [3, 7, 10],
    "1:4": [5, 9, 12],
    "1:5": [7, 10, 13],
    "2:3": [1, 2, 3],
    "2:4": [3, 4, 5],
    "2:5": [5, 6, 8],
    "3:4": [1, 2, 2],
    "3:5": [3, 4, 5],
    "4:5": [1, 2, 3],
  };
  const comfort = (a: number, x: number, b: number, y: number) => {
    if (x === y) return 0;
    const [lo, hi, c] = ranges[`${Math.min(x, y)}:${Math.max(x, y)}`],
      d = Math.abs(b - a),
      outside = d < lo ? lo - d : d > hi ? d - hi : 0;
    return 0.3 * outside * outside + Math.max(0, d - c) * 1.2;
  };
  const layers = midis.map((m, i) => {
    const result: { finger: number; anchor: number; cost: number }[] = [];
    for (let f = 1; f <= 5; f++) {
      if (fixed[i] !== undefined && fixed[i] !== f) continue;
      for (let anchor = -5; anchor <= 79; anchor++) {
        const d = Math.abs(key(m) - anchor - sign * (f - 1));
        if (d > 1) continue;
        result.push({
          finger: f,
          anchor,
          cost:
            (3 * d * d +
              (black(m) ? (f === 1 ? 1.8 : f === 5 ? 0.4 : 0) : 0) +
              (f === 4 ? 0.15 : 0)) *
            0.25,
        });
      }
    }
    return result;
  });
  type Pose = (typeof layers)[number][number];
  let best = Infinity,
    paths = 0;
  const visit = (i: number, path: Pose[], cost: number) => {
    if (i === midis.length) {
      paths++;
      best = Math.min(best, cost);
      return;
    }
    for (const p of layers[i]) {
      let edge = 0;
      if (i) {
        const a = path[i - 1],
          d = Math.abs(p.anchor - a.anchor),
          delta = midis[i] - midis[i - 1],
          cross = delta * (p.finger - a.finger) * sign < 0;
        if (cross && !d) continue;
        let movement = d ? 5 + 1.8 * d : 0,
          passing = 0,
          repeat = 0;
        if (cross && a.finger !== 1 && p.finger !== 1) movement += 8;
        if (delta && a.finger === p.finger) movement += 4;
        if (!delta && a.finger !== p.finger) repeat += 4;
        if (cross && (a.finger === 1 || p.finger === 1)) {
          const f = p.finger === 1 ? a.finger : p.finger;
          passing = f === 3 ? 0 : f === 4 ? 0.3 : 1;
        }
        edge =
          movement * 2 +
          repeat +
          passing +
          0.25 * comfort(midis[i - 1], a.finger, midis[i], p.finger) +
          (a.finger === 1 && black(midis[i - 1]) && !black(midis[i])
            ? 1.5
            : 0) +
          (p.finger === 1 && black(midis[i]) && !black(midis[i - 1]) ? 1.5 : 0);
        if (i >= 2) {
          const x = path[i - 2],
            digits = [x.finger, a.finger, p.finger];
          if (
            new Set(digits).size === 3 &&
            [3, 4, 5].every((f) => digits.includes(f))
          )
            edge += 0.6;
          if (midis[i - 2] === midis[i] && x.finger !== p.finger) edge += 1;
          if (x.finger !== p.finger && a.finger !== 1)
            edge += 0.3 * comfort(midis[i - 2], x.finger, midis[i], p.finger);
          if (gestureWeight) {
            const lo = Math.min(x.finger, p.finger),
              hi = Math.max(x.finger, p.finger);
            const upper =
              lo === hi
                ? [0, 0]
                : [
                    ranges[`${lo}:${hi}`][2],
                    (
                      {
                        "1:2": 10,
                        "1:3": 12,
                        "1:4": 14,
                        "1:5": 15,
                        "2:3": 5,
                        "2:4": 7,
                        "2:5": 10,
                        "3:4": 4,
                        "3:5": 7,
                        "4:5": 5,
                      } as Record<string, number>
                    )[`${lo}:${hi}`],
                  ];
            const lower =
              lo === hi
                ? [0, 0]
                : lo === 1
                  ? (
                      {
                        2: [-3, -5],
                        3: [-2, -4],
                        4: [-1, -3],
                        5: [1, -1],
                      } as Record<number, number[]>
                    )[hi]
                  : lo === 2 && hi === 5
                    ? [2, 2]
                    : [1, 1];
            const orientation = x.finger <= p.finger ? sign : -sign;
            const delta13 = (midis[i] - midis[i - 2]) * orientation;
            const size = Math.max(0, lower[0] - delta13, delta13 - upper[0]);
            const practical = Math.max(
              0,
              lower[1] - delta13,
              delta13 - upper[1],
            );
            const d1 = midis[i - 1] - midis[i - 2],
              d2 = midis[i] - midis[i - 1];
            const crosses =
              +(d1 * (a.finger - x.finger) * sign < 0) +
              +(d2 * (p.finger - a.finger) * sign < 0);
            const over =
              a.finger === 1
                ? d1 * (a.finger - x.finger) * sign < 0
                  ? x.finger
                  : p.finger
                : a.finger;
            const reward =
              d1 * d2 > 0 &&
              crosses === 1 &&
              digits.includes(1) &&
              over >= 2 &&
              over <= 4 &&
              new Set(digits).size === 3 &&
              Math.abs(d1) <= 5 &&
              Math.abs(d2) <= 5 &&
              Math.abs(d1 + d2) <= 9;
            const changes =
              size > 0
                ? a.finger === 1 && d1 * d2 > 0 && practical > 0
                  ? 2
                  : 1
                : 0;
            edge +=
              gestureWeight *
              (changes +
                0.25 * size -
                4 * +reward +
                4 * +(d1 * d2 > 0 && crosses === 2));
          }
        }
      }
      visit(i + 1, [...path, p], cost + p.cost + edge);
    }
  };
  visit(0, [], 0);
  return { cost: best, paths };
}
