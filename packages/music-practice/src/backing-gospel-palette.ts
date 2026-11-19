import piano from "./assets/backing-gospel/manifest.json";
import type { backingPack, BackingSample } from "./backing-track-model";

export function gospelPalette(base: typeof backingPack): typeof backingPack {
  const samples = Object.fromEntries(
    Object.entries(base.samples).filter(
      ([, s]) =>
        (s.part === "drums" && [36, 37, 38, 42, 45].includes(s.note)) ||
        (s.part === "percussion" && s.note === 54) ||
        (s.part === "bass" &&
          s.note >= 28 &&
          s.note <= 55 &&
          (s.articulation ?? "normal") === "normal"),
    ),
  );
  return {
    ...base,
    samples: { ...samples, ...piano.samples } as Record<string, BackingSample>,
    levels: {
      ...base.levels,
      drums: 0.48,
      percussion: 0.3,
      bass: 0.09,
      keys: 0.48,
    },
  };
}
