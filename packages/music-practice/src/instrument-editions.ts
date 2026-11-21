import type { Hymn, HymnHands } from "./hymn-arrangements";
import type { BeginnerInstrument } from "./beginner-score";
import { bluesPianoAbc, bluesLandmarks } from "./fingerstyle-blues";
import { editionGuides, type EditionGuide } from "./edition-guides";
import { hymnLyricsAbc } from "./hymn-lyrics";
import { instrumentHymnAbc, type InstrumentHymn,type HymnChange } from "./instrument-hymn";
import { jesusEdition, jesusFingers, jesusPosition } from "./jesus-loves-me";
import {
  faithfulEdition,
  faithfulFingers,
  faithfulPosition,
} from "./o-come-all-ye-faithful";
import {
  flyEditionAbc,
  flyChanges,
  flyLandmarks,
  flyFingers,
  flyGuitarPosition,
} from "./ill-fly-away";
import {
  gracePianoAbc,
  graceFingerstyleAbc,
  graceGuitarAbc,
  graceLyricData,
  graceLandmarks,
  graceFingers,
  graceGuitarPosition,
} from "./amazing-grace";
import {
  christPianoAbc,
  christFingerstyleAbc,
  christGuitarAbc,
  christGuitarLyricData,
  christLandmarks,
  christFingers,
  christGuitarPosition,
} from "./in-christ-alone";

type BuildContext = {
  hymn: Hymn;
  instrument: BeginnerInstrument;
  hands: HymnHands;
  melody: () => string;
};
export type InstrumentEdition = {
  id: string;
  guitarArrangement: "guitar-edition" | "guitar-fingerstyle";
  guitarNotation: "written" | "sounding";
  guitarKey?: string;
  /** Only for old teaching-score links; reviewed editions use build(). */
  legacyChanges?: HymnChange[][];
  /** Polyphonic source editions select a single part after slicing the complete score. */
  selectWholeVoices?: boolean;
  build: (context: BuildContext) => string;
  landmarks?: (abc: string, from: number, guitar: boolean) => string;
};
export type ChordEditionId =
  | "in-christ-alone"
  | "amazing-grace"
  | "ill-fly-away"
  | "jesus-loves-me"
  | "o-come-all-ye-faithful";
export type ChordEdition = InstrumentEdition & {
  id: ChordEditionId;
  guitarArrangement: "guitar-edition";
  guide: EditionGuide;
  capo: number;
  pickup: boolean;
  tempo: number;
  shapes: string;
  layout:
    | { mode: "balanced" | "fixed" }
    | { mode: "pickup-attached"; totalBars: number };
  strumPattern?: boolean;
  fingers: (
    instrument: BeginnerInstrument,
    bar: number,
    voice: number,
    pitches: number[],
    force?: boolean,
  ) => (number | null)[];
  position: (
    pitch: number,
    chord: boolean,
    transpose?: number,
  ) => { str: number; num: number } | undefined;
};
type Recipe = Omit<
  ChordEdition,
  "id" | "guide" | "guitarArrangement" | "guitarNotation"
>;
const buildFrom = (config: InstrumentHymn) => (context: BuildContext) =>
  instrumentHymnAbc(
    context.melody(),
    config,
    context.instrument,
    context.instrument === "guitar" ? context.hands : "both",
  );
// Musical choices live in the song modules; shared consumers use these capabilities.
const recipes: Record<ChordEditionId, Recipe> = {
  "in-christ-alone": {
    capo: 2,
    pickup: true,
    tempo: 70,
    shapes: "C, small F, G and Am",
    guitarKey: "C",
    layout: { mode: "balanced" },
    fingers: christFingers,
    position: christGuitarPosition,
    build: ({ hymn, instrument, hands }) =>
      instrument === "guitar"
        ? hands === "left"
          ? hymnLyricsAbc(christGuitarAbc, {
              hymn: christGuitarLyricData(hymn),
              selected: [1],
              offset: 0,
            })
          : christFingerstyleAbc(hymn, hands === "right")
        : christPianoAbc(hymn.harmony),
    landmarks: christLandmarks,
  },
  "amazing-grace": {
    capo: 0,
    pickup: true,
    tempo: 72,
    shapes: "G, C, D7 and Em",
    layout: { mode: "balanced" },
    fingers: graceFingers,
    position: graceGuitarPosition,
    build: ({ hymn, instrument, hands, melody }) =>
      instrument === "piano"
        ? gracePianoAbc(melody())
        : hands === "left"
          ? hymnLyricsAbc(graceGuitarAbc, {
              hymn: graceLyricData(hymn),
              selected: [1],
              offset: 0,
            })
          : graceFingerstyleAbc(melody(), hands === "right"),
    landmarks: graceLandmarks,
  },
  "ill-fly-away": {
    capo: 0,
    pickup: false,
    tempo: 80,
    shapes: "C, small F and G7",
    layout: { mode: "fixed" },
    strumPattern: true,
    legacyChanges: flyChanges,
    fingers: flyFingers,
    position: flyGuitarPosition,
    build: ({ melody, instrument, hands }) =>
      flyEditionAbc(
        melody(),
        instrument,
        instrument === "guitar" ? hands : "both",
      ),
    landmarks: flyLandmarks,
  },
  "jesus-loves-me": {
    capo: 3,
    pickup: false,
    tempo: 72,
    shapes: "C, small F and G7",
    guitarKey: jesusEdition.guitarKey,
    layout: { mode: "fixed" },
    fingers: jesusFingers,
    position: jesusPosition,
    build: buildFrom(jesusEdition),
  },
  "o-come-all-ye-faithful": {
    capo: 0,
    pickup: true,
    tempo: 72,
    shapes: "G, C, D, D7, Em, Am, A7 and small Bm",
    guitarKey: faithfulEdition.guitarKey,
    layout: {
      mode: "pickup-attached",
      totalBars: faithfulEdition.changes.length,
    },
    fingers: faithfulFingers,
    position: faithfulPosition,
    build: buildFrom(faithfulEdition),
  },
};
const chordEditions = new Map(
  Object.entries(recipes).map(([id, recipe]) => [
    id,
    {
      ...recipe,
      id: id as ChordEditionId,
      guide: editionGuides[id as ChordEditionId],
      guitarArrangement: "guitar-edition" as const,
      guitarNotation: "written" as const,
    },
  ]),
);
const blues: InstrumentEdition = {
  id: "the-1st-fingerstyle-blues",
  guitarArrangement: "guitar-fingerstyle",
  guitarNotation: "sounding",
  selectWholeVoices: true,
  build: ({ hymn, instrument }) =>
    instrument === "piano" ? bluesPianoAbc(hymn.harmony) : hymn.harmony,
  landmarks: bluesLandmarks,
};
const instrumentEditions = new Map<string, InstrumentEdition>([
  ...chordEditions,
  [blues.id, blues],
]);
export function chordEdition(hymn: { id: string }): ChordEdition | undefined {
  return chordEditions.get(hymn.id);
}
export function instrumentEdition(hymn: {
  id: string;
}): InstrumentEdition | undefined {
  return instrumentEditions.get(hymn.id);
}
export const instrumentEditionIds = Object.freeze([
  ...instrumentEditions.keys(),
]);
