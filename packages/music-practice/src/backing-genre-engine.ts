import { isMaqam } from "./maqamat";
import { approvedBackingTake } from "./backing-approved";
import {
  scalePracticeHarmony,
  type ScalePracticeQuality,
} from "./backing-scale-harmony";
import { warmBackingArrangement } from "./backing-warm-arrangement";
import { funkArrangement } from "./backing-funk";
/** One entry point: musical definition -> strategy -> approved ensemble playback. */
import { BACKING_GENRES } from "./backing-genres";
import { rootsArrangement } from "./backing-roots";
import { acousticArrangement } from "./backing-acoustic";
import { reggaeArrangement } from "./backing-reggae";
import { gospelArrangement } from "./backing-gospel";
import { gospelPhraseTake } from "./backing-gospel-phrases";
import {
  rawFolkFingerstyleTake,
  folkFingerstyleScoreIssues,
} from "./backing-folk-phrases";
import { ensemblePhraseTake } from "./backing-ensemble-phrases";
import { backingPattern } from "./backing-patterns";
import type { BackingPattern } from "./backing-patterns";
import { articulateDrums } from "./backing-drum-articulation";
import { connectBackingGuitar } from "./backing-guitar-transitions";
import { sharedBackingPocket } from "./backing-shared-pocket";
import { levelBackingSections } from "./backing-dynamics";
import type { BackingStyle, BackingMode } from "./backing-track-model";
import type { BackingQuality } from "./backing-arrangement";
import type { BackingTake } from "./backing-plan-types";
export function rawGenreBackingArrangement(
  style: BackingStyle,
  mode: BackingMode,
  quality: BackingQuality,
  cycle = 0,
  tempo = 90,
  tonic = 9,
  pattern?: BackingPattern,
  scaleQuality?: ScalePracticeQuality,
  authored = true,
): BackingTake {
  const definition = BACKING_GENRES[style];
  let plan: BackingTake;
  let harmonyResolved = false;
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

  if (scaleQuality && authored && !isMaqam(scaleQuality)) {
    const resolved = scalePracticeHarmony(plan, scaleQuality);
    const selected = backingPattern(style, pattern);
    const scored =
      style === "gospel"
        ? gospelPhraseTake(resolved)
        : style === "folk" && selected === "fingerpicked"
          ? folkFingerstyleScoreIssues().length
            ? undefined
            : rawFolkFingerstyleTake(resolved)
          : ensemblePhraseTake(resolved, selected);
    if (scored) {
      plan = scored;
      harmonyResolved = true;
    }
  }
  const performed = sharedBackingPocket(
    connectBackingGuitar(articulateDrums(plan), tempo),
    tempo,
  );
  return scaleQuality && !harmonyResolved
    ? scalePracticeHarmony(performed, scaleQuality)
    : performed;
}

/** Keep the musical performance independently testable; leveling changes gain
 * alone, and the historical performance snapshots remain valid. */
export function genreBackingArrangement(
  ...args: Parameters<typeof rawGenreBackingArrangement>
): BackingTake {
  return levelBackingSections(rawGenreBackingArrangement(...args), args[6]);
}

/** Previous factory performance for reproducible A/B renders, never a UI mode. */
export function referenceGenreBackingArrangement(
  ...args: Parameters<typeof rawGenreBackingArrangement>
): BackingTake {
  return levelBackingSections(
    rawGenreBackingArrangement(
      args[0],
      args[1],
      args[2],
      args[3],
      args[4],
      args[5],
      args[6],
      args[7],
      false,
    ),
    args[6],
  );
}

/** Production score; reference arrangers remain independently auditable. */
export function approvedGenreBackingArrangement(
  ...args: Parameters<typeof rawGenreBackingArrangement>
): BackingTake {
  return levelBackingSections(
    approvedBackingTake(rawGenreBackingArrangement(...args), args[6], args[7]),
    args[6],
  );
}
