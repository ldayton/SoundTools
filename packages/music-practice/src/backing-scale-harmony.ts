import type { BackingTake } from "./backing-plan-types";
import type { BackingEvent } from "./backing-track-model";
export type ScalePracticeQuality =
  | "major"
  | "minor"
  | "major-pentatonic"
  | "minor-pentatonic"
  | "major-blues"
  | "minor-blues";
const pc = (n: number) => ((n % 12) + 12) % 12;
export function practicePitchClasses(
  tonic: number,
  quality: ScalePracticeQuality,
) {
  const intervals =
    quality === "major"
      ? [0, 2, 4, 5, 7, 9, 11]
      : quality === "minor"
        ? [0, 2, 3, 5, 7, 8, 10]
        : quality.startsWith("major")
          ? [0, 2, 4, 7, 9, ...(quality.endsWith("blues") ? [3] : [])]
          : [0, 3, 5, 7, 10, ...(quality.endsWith("blues") ? [6] : [])];
  return intervals.map((n) => pc(n + tonic));
}
/** Tonic-pedal accompaniment. Blue notes belong to the student's passing line,
 * rather than sustained chords. No attacks, durations, sounds or gains change. */
export function scalePracticeHarmony(
  take: BackingTake,
  quality: ScalePracticeQuality,
): BackingTake {
  const tonic = take.plan.tonic,
    major = quality.startsWith("major");
  const tuning = [40, 45, 50, 55, 59, 64];
  const firstBass = new Set<number>();
  const events = take.events.map((event) => {
    if (event.part === "drums" || event.part === "percussion")
      return { ...event };
    const bar = Math.min(take.plan.bars.length - 1, Math.floor(event.beat / 4));
    const original = take.plan.bars[bar];
    const note =
      event.note + (event.absolute ? 0 : ((tonic - 9 + 18) % 12) - 6);
    const relative = pc(note - original.root);
    // Every eight-bar phrase opens and closes with an unambiguous tonic triad.
    const phase = bar % 8;
    const chord =
      phase === 4
        ? [0, major ? 4 : 3, 7, major ? 9 : 10]
        : phase === 6
          ? [0, major ? 2 : 5, 7]
          : [0, major ? 4 : 3, 7];
    let target =
      relative === 0
        ? 0
        : relative === 7
          ? 7
          : relative === 3 || relative === 4
            ? chord[1]
            : undefined;
    if (event.part === "bass") {
      if (!firstBass.has(bar)) {
        target = 0;
        firstBass.add(bar);
      } else target = relative === 7 ? 7 : 0;
    }
    const low =
      event.part === "bass"
        ? 28
        : event.part === "keys"
          ? 48
          : event.string !== undefined
            ? tuning[event.string]
            : 44;
    const high =
      event.part === "bass"
        ? 55
        : event.part === "keys"
          ? 79
          : event.string !== undefined
            ? Math.min(76, tuning[event.string] + 19)
            : 76;
    const candidates = Array.from(
      { length: high - low + 1 },
      (_, i) => i + low,
    ).filter((n) =>
      (target === undefined ? chord : [target]).some(
        (interval) => pc(n - tonic) === interval,
      ),
    );
    const nearest = candidates.sort(
      (a, b) => Math.abs(a - note) - Math.abs(b - note) || a - b,
    )[0];
    if (nearest === undefined)
      throw Error(
        `No playable tonic harmony for ${event.instrument ?? event.part}`,
      );
    return { ...event, note: nearest, absolute: true } satisfies BackingEvent;
  });
  return {
    ...take,
    events,
    plan: {
      ...take.plan,
      bars: take.plan.bars.map((bar) => ({
        ...bar,
        root: tonic,
        minor: !major,
      })),
    },
  };
}
