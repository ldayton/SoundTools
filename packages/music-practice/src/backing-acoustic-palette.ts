import recordings from "./assets/backing-folk-country/manifest.json";
import { backingPack, type BackingSample } from "./backing-track-model";

/** Keep each genre's working set small; URL imports never download the audio. */
export function acousticPalette(style: "folk" | "country") {
  return {
    ...backingPack,
    samples: Object.fromEntries(
      Object.entries(recordings.samples).filter(
        ([, s]) => style === "country" || s.instrument !== "electric-twang",
      ),
    ) as Record<string, BackingSample>,
    levels: { ...backingPack.levels, drums: 0.38, bass: 0.14, guitar: 0.32 },
  };
}
