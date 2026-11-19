import electricPiano from "./assets/backing-soul-folk/manifest.json";
import type { backingPack, BackingSample } from "./backing-track-model";

/** Native attacks, dynamics and alternate takes; no new downloads. Distinct IDs
 * prevent one genre's shortened buffers from replacing another's long voices. */
export function pocketPalette(
  style: "funk" | "soul",
  base: typeof backingPack,
): typeof backingPack {
  const samples: Record<string, BackingSample> = {};
  for (const [id, sample] of Object.entries(base.samples)) {
    const s = { ...sample },
      articulation = s.articulation ?? "normal";
    if (
      (s.part === "drums" &&
        s.velocity <= 80 &&
        [36, 37, 38, 42, 45, 46].includes(s.note)) ||
      (s.part === "percussion" && [54, 70].includes(s.note))
    ) {
      samples[`${style}-${id}`] = s;
    } else if (
      s.part === "bass" &&
      !s.release &&
      (style === "funk" || articulation === "normal")
    ) {
      samples[`${style}-${id}`] = {
        ...s,
        instrument: style === "funk" ? "funk-bass" : "soul-bass",
      };
    } else if (s.part === "guitar" && !s.release && articulation === "normal") {
      samples[`${style}-${id}`] = {
        ...s,
        instrument: style === "funk" ? "funk-guitar" : "soul-guitar",
      };
    } else if (
      style === "funk" &&
      s.part === "guitar" &&
      !s.release &&
      articulation === "muted"
    ) {
      samples[`${style}-${id}`] = { ...s, instrument: "funk-scratch" };
    }
  }
  if (style === "soul")
    for (const [id, s] of Object.entries(electricPiano.samples))
      if (s.part === "keys" && s.velocity === 40)
        samples[`soul-${id}`] = {
          ...s,
          instrument: "soul-keys",
        } as BackingSample;
  return {
    ...base,
    samples,
    levels: {
      ...base.levels,
      drums: style === "funk" ? 0.54 : 0.44,
      percussion: style === "funk" ? 0.22 : 0.2,
      bass: style === "funk" ? 0.15 : 0.13,
      guitar: style === "funk" ? 0.23 : 0.32,
      keys: style === "funk" ? 0 : 0.33,
    },
  };
}
