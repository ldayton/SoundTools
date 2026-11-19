import { warmBackingArrangement } from "./backing-warm-arrangement";
import { grooveArrangement } from "./backing-groove-arrangement";
/** One entry point: musical definition -> strategy -> approved ensemble playback. */
import { BACKING_GENRES } from "./backing-genres";
import { plannedBackingArrangement } from "./backing-musical-plan";
import { acousticArrangement } from "./backing-acoustic";
import { gospelArrangement } from "./backing-gospel";
import type { BackingPattern } from "./backing-patterns";
import { articulateDrums } from "./backing-drum-articulation";
import { connectBackingGuitar } from "./backing-guitar-transitions";
import { sharedBackingPocket } from "./backing-shared-pocket";
import type { BackingStyle, BackingMode } from "./backing-track-model";
import type { BackingQuality } from "./backing-arrangement";
import type { BackingTake } from "./backing-plan-types";
export function genreBackingArrangement(
  style: BackingStyle,
  mode: BackingMode,
  quality: BackingQuality,
  cycle = 0,
  tempo = 90,
  tonic = 9,
  pattern?: BackingPattern,
): BackingTake {
  const definition = BACKING_GENRES[style];
  let plan: BackingTake;
  switch (definition.rhythm.strategy) {
    case "traditional-gospel":
      plan = gospelArrangement(mode, quality, cycle, tempo, tonic);
      break;
    case "two-step":
      plan = acousticArrangement(
        "country",
        mode,
        quality,
        cycle,
        tempo,
        tonic,
        pattern,
      );
      break;
    case "one-drop":
    case "syncopated-funk":
      if (style !== "reggae" && style !== "funk")
        throw Error("Unsupported generated genre");
      plan = grooveArrangement(style, mode, quality, cycle, tempo, tonic);
      break;
    case "soul-pocket":
    case "gentle-folk":
      if (style !== "soul" && style !== "folk")
        throw Error("Unsupported warm genre");
      plan =
        style === "folk"
          ? acousticArrangement(
              style,
              mode,
              quality,
              cycle,
              tempo,
              tonic,
              pattern,
            )
          : warmBackingArrangement(mode, quality, cycle, tempo, tonic);
      break;
    case "recorded-story":
      if (style !== "blues" && style !== "rock")
        throw Error("Country requires a generated groove strategy");
      plan = plannedBackingArrangement(
        style,
        mode,
        quality,
        cycle,
        tempo,
        tonic,
      );
      break;
  }

  return sharedBackingPocket(
    connectBackingGuitar(articulateDrums(plan), tempo),
    tempo,
  );
}
