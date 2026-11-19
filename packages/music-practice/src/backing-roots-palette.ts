import type { backingPack, BackingSample } from "./backing-track-model";
/** Existing native recordings, scoped to the two roots bands and their gates. */
export function rootsPalette(
  style: "rock" | "blues",
  base: typeof backingPack,
): typeof backingPack {
  const samples: Record<string, BackingSample> = {};
  for (const [id, s] of Object.entries(base.samples)) {
    const articulation = s.articulation ?? "normal";
    if ((s.part === "drums" && s.velocity <= 112) || s.part === "percussion")
      samples[`${style}-${id}`] = { ...s };
    else if (
      s.part === "bass" &&
      !s.release &&
      ["normal", "muted"].includes(articulation)
    )
      samples[`${style}-${id}`] = {
        ...s,
        instrument: style === "rock" ? "rock-bass" : "blues-bass",
      };
    else if (
      s.part === "guitar" &&
      !s.release &&
      ["normal", "muted"].includes(articulation)
    ) {
      const instrument =
        style === "rock"
          ? articulation === "muted"
            ? "rock-muted"
            : "rock-guitar"
          : "blues-rhythm";
      if (style === "rock" || articulation === "muted")
        samples[`${style}-${id}`] = { ...s, instrument };
      if (style === "blues" && articulation === "normal")
        samples[`blues-lead-${id}`] = { ...s, instrument: "blues-lead" };
    }
  }
  return {
    ...base,
    samples,
    levels: {
      ...base.levels,
      drums: 0.5,
      percussion: 0.25,
      bass: 0.14,
      guitar: style === "rock" ? 0.27 : 0.28,
      keys: 0,
    },
  };
}
