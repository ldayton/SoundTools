import { isBlack } from "./piano-model";
const whites = Array.from({ length: 60 }, (_, i) => 36 + i).filter(
  (n) => !isBlack(n),
);
/** Layout depends on space and the configured range, never on the current answer. */
export function visiblePianoLayout(
  width: number,
  low: number,
  high: number,
  named: boolean,
  phone: boolean,
) {
  const center = Math.max(36, Math.min(95, (low + high) / 2));
  let rows: [number, number][], whiteWidth: number;
  if (named) {
    whiteWidth = 32;
    rows = [[60, 71]];
  } else if (phone) {
    const octave = Math.max(
      2,
      Math.min(5, Math.round((center - 71.5) / 12) + 4),
    );
    const start = (octave + 1) * 12;
    rows = [
      [start, start + 11],
      [start + 12, start + 23],
    ];
    whiteWidth = 32;
  } else {
    const count = Math.max(7, Math.min(35, Math.floor(width / 32)));
    const middle = whites.reduce(
      (best, n, i) =>
        Math.abs(n - center) < Math.abs(whites[best] - center) ? i : best,
      0,
    );
    const start = Math.max(
      0,
      Math.min(whites.length - count, middle - Math.floor((count - 1) / 2)),
    );
    rows = [[whites[start], whites[start + count - 1]]];
    whiteWidth = 32;
  }
  return {
    low: rows[0][0],
    high: rows.at(-1)![1],
    rows,
    whiteWidth,
    whiteCount: rows.reduce(
      (sum, [a, b]) => sum + whites.filter((n) => n >= a && n <= b).length,
      0,
    ),
  };
}
