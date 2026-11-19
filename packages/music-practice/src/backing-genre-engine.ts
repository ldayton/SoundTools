import { warmBackingArrangement } from "./backing-warm-arrangement";
import { funkArrangement } from "./backing-funk";
/** One entry point: musical definition -> strategy -> approved ensemble playback. */
import { BACKING_GENRES } from "./backing-genres";
import { rootsArrangement } from "./backing-roots";
import { acousticArrangement } from "./backing-acoustic";
import { reggaeArrangement } from "./backing-reggae";
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
      plan = reggaeArrangement(mode, quality, cycle, tempo, tonic);
      break;
    case "syncopated-funk":
      plan = funkArrangement(mode, quality, cycle, tempo, tonic);
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
    case "roots-performance":
      if (style !== "blues" && style !== "rock")
        throw Error("Unsupported roots genre");
      plan = rootsArrangement(style, mode, quality, cycle, tempo, tonic);
      break;
  }

  return sharedBackingPocket(
    connectBackingGuitar(articulateDrums(plan), tempo),
    tempo,
  );
}
