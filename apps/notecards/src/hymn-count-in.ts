export type CountInBars = 0 | 0.5 | 1 | 2;
export type HymnTiming = { meter: string; pickup: number };
/** Quarter-note units match the score transport; compound meters pulse in threes. */
export function countInPlan(
  timing: HymnTiming,
  bars: CountInBars,
  position = 0,
): {
  bars: CountInBars;
  duration: number;
  barLength: number;
  pulse: number;
  beats: number;
  from: number;
  clicks: { at: number; accent: boolean }[];
} {
  if (timing.meter === "none" && bars === 0)
    return countInPlan({ ...timing, meter: "4/4" }, bars, position);
  const match = /^(\d+)\/(\d+)$/.exec(timing.meter);
  if (!match || ![0, 0.5, 1, 2].includes(bars)) throw Error("Invalid count-in");
  const numerator = Number(match[1]),
    denominator = Number(match[2]);
  if (numerator < 1 || denominator < 1) throw Error("Invalid meter");
  const barLength = (numerator * 4) / denominator;
  const pulse =
    denominator === 8 && numerator > 3 && numerator % 3 === 0
      ? 1.5
      : 4 / denominator;
  const beats = Math.round(barLength / pulse);
  const duration = bars * barLength;
  // Preserve pickup/section/resume placement instead of calling every entry beat 1.
  const entry = (barLength - timing.pickup + position) % barLength;
  const from = entry - duration;
  const clicks: { at: number; accent: boolean }[] = [];
  for (let i = Math.ceil((from - 1e-8) / pulse); i * pulse < entry - 1e-8; i++)
    clicks.push({
      at: Math.max(0, i * pulse - from),
      accent: ((i % beats) + beats) % beats === 0,
    });
  return { bars, duration, barLength, pulse, beats, from, clicks };
}
