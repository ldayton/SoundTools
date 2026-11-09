export type RhythmNote = { beats: number; rest?: boolean };
export type RhythmLevel = "pulse" | "long-short" | "eighths";
const tiles: Record<RhythmLevel, RhythmNote[][]> = {
  pulse: [[{ beats: 1 }, { beats: 1 }, { beats: 1 }, { beats: 1 }]],
  "long-short": [
    [{ beats: 2 }, { beats: 1 }, { beats: 1 }],
    [{ beats: 1 }, { beats: 2 }, { beats: 1 }],
    [{ beats: 1 }, { beats: 1 }, { beats: 2 }],
    [{ beats: 2 }, { beats: 2 }],
  ],
  eighths: [
    [{ beats: 0.5 }, { beats: 0.5 }, { beats: 1 }, { beats: 2 }],
    [{ beats: 1 }, { beats: 0.5 }, { beats: 0.5 }, { beats: 1 }, { beats: 1 }],
    [{ beats: 1 }, { beats: 1, rest: true }, { beats: 1 }, { beats: 1 }],
    [{ beats: 2 }, { beats: 0.5 }, { beats: 0.5 }, { beats: 1 }],
  ],
};
export function makeRhythm(level: RhythmLevel, random = Math.random) {
  return Array.from({ length: 4 }, () =>
    tiles[level][
      Math.min(
        tiles[level].length - 1,
        Math.floor(random() * tiles[level].length),
      )
    ].map((n) => ({ ...n })),
  );
}
export function rhythmOnsets(bars: RhythmNote[][]) {
  let beat = 0;
  const starts: number[] = [];
  for (const note of bars.flat()) {
    if (!note.rest) starts.push(beat);
    beat += note.beats;
  }
  return { starts, beats: beat };
}
export class RhythmAttempt {
  readonly times: number[];
  readonly tolerance: number;
  readonly hits = new Map<number, number>();
  extras = 0;
  constructor(
    starts: number[],
    readonly bpm: number,
    readonly start: number,
  ) {
    if (
      !Number.isFinite(bpm) ||
      bpm < 40 ||
      bpm > 200 ||
      !Number.isFinite(start)
    )
      throw Error("Invalid rhythm timing");
    this.times = starts.map((b) => start + (b * 60000) / bpm);
    this.tolerance = Math.min(200, Math.max(90, (60000 / bpm) * 0.23));
  }
  tap(now: number) {
    if (!Number.isFinite(now) || now < this.start - this.tolerance)
      return "ignored";
    let index = -1,
      distance = Infinity;
    this.times.forEach((t, i) => {
      if (!this.hits.has(i) && Math.abs(now - t) < distance) {
        distance = Math.abs(now - t);
        index = i;
      }
    });
    if (index >= 0 && distance <= this.tolerance) {
      this.hits.set(index, now - this.times[index]);
      return "hit";
    }
    this.extras++;
    return "extra";
  }
  get missed() {
    return this.times.length - this.hits.size;
  }
}
