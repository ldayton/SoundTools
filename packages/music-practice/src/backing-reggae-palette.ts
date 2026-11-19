import type { backingPack, BackingSample } from "./backing-track-model";

/** Reuse the recorded clean attacks, but isolate their tone and voice handling. */
export function reggaePalette(base: typeof backingPack): typeof backingPack {
  const samples = Object.fromEntries(
    Object.entries(base.samples)
      .filter(
        ([, s]) =>
          (s.part === "drums" &&
            s.velocity <= 80 &&
            [36, 37, 38, 42, 45, 46].includes(s.note)) ||
          (s.part === "percussion" && s.note === 70) ||
          (["bass", "guitar"].includes(s.part) &&
            !s.release &&
            (s.articulation ?? "normal") === "normal"),
      )
      .map(([id, s]) => [
        `reggae-${id}`,
        {
          ...s,
          instrument:
            s.part === "guitar"
              ? "reggae-guitar"
              : s.part === "bass"
                ? "reggae-bass"
                : s.instrument,
        },
      ]),
  );
  return {
    ...base,
    samples: samples as Record<string, BackingSample>,
    levels: {
      ...base.levels,
      drums: 0.48,
      percussion: 0.23,
      bass: 0.16,
      guitar: 0.18,
      keys: 0.62,
    },
  };
}
