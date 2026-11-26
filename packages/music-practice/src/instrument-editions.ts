import { blessedEdition, silentEdition, joyEdition, standardPosition, standardFingers } from "./standard-hymn-editions";
import { washedEdition } from "./are-you-washed-in-the-blood";
import { sweetEdition, sweetPosition, sweetFingers } from "./in-the-sweet-by-and-by";
import { fairestEdition, fairestPosition, fairestFingers } from "./fairest-lord-jesus";
import { ruggedEdition, ruggedPosition, ruggedFingers } from "./the-old-rugged-cross";
import { canonicalHymnId, hymnForEdition } from "./hymn-identity";
import {
  teacherInstrumentAbc,
  teacherFingers,
  teacherGuitarPosition,
  teacherChordLyrics,
  teacherChordOffset,
} from "./in-christ-alone";
import type { Hymn, HymnHands } from "./hymn-arrangements";
import type { BeginnerInstrument } from "./beginner-score";
import { bluesPianoAbc, bluesLandmarks } from "./fingerstyle-blues";
import { hymnLyricsAbc } from "./hymn-lyrics";
import { instrumentHymnAbc, type InstrumentHymn } from "./instrument-hymn";
import { jesusEdition, jesusFingers, jesusPosition, jesusInstrumentAbc } from "./jesus-loves-me";
import {
  faithfulEdition,
  faithfulFingers,
  faithfulPosition,
} from "./o-come-all-ye-faithful";
import {
  flyEditionAbc,
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


type BuildContext = {
  hymn: Hymn;
  instrument: BeginnerInstrument;
  hands: HymnHands;
  melody: () => string;
};
export type InstrumentEdition = {
  id: string;
  editionKey: string;
  original?: boolean;
  vocal?: boolean;
  chordLyrics?: (hymn: Hymn) => import("./hymn-lyrics").HymnLyricData;
  chordLyricOffset?: (hymn: Hymn, bar: number) => number;
  guitarArrangement: "guitar-edition" | "guitar-fingerstyle";
  guitarNotation: "written" | "sounding";
  guitarKey?: string;
  /** Polyphonic source editions select a single part after slicing the complete score. */
  selectWholeVoices?: boolean;
  build: (context: BuildContext) => string;
  landmarks?: (abc: string, from: number, guitar: boolean) => string;
};
export type ChordEditionId = string;
export type ChordEditionKey =
  | "the-old-rugged-cross"
  | "fairest-lord-jesus"
  | "in-the-sweet-by-and-by"
  | "are-you-washed-in-the-blood"
  | "blessed-assurance"
  | "silent-night"
  | "joy-to-the-world"
  | "in-christ-alone"
  | "amazing-grace"
  | "ill-fly-away"
  | "jesus-loves-me"
  | "o-come-all-ye-faithful";
export type ChordEdition = InstrumentEdition & {
  id: ChordEditionId;
  guitarArrangement: "guitar-edition";
  capo: number;
  pickup: boolean;
  tempo: number;
  shapes: string;
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
  "id" | "editionKey" | "guide" | "guitarArrangement" | "guitarNotation"
>;
const buildFrom = (config: InstrumentHymn) => (context: BuildContext) =>
  instrumentHymnAbc(
    context.melody(),
    config,
    context.instrument,
    context.instrument === "guitar" ? context.hands : "both",
  );
// Musical choices live in the song modules; shared consumers use these capabilities.
const recipes: Record<ChordEditionKey, Recipe> = {
  "the-old-rugged-cross": {
    original:true,vocal:true,capo:3,tempo:80,pickup:true,
    shapes:"G, C, D, D7, A, diminished passing chords and reviewed inversions",guitarKey:ruggedEdition.guitarKey,
    fingers:ruggedFingers,position:ruggedPosition,build:buildFrom(ruggedEdition),
  },
  "fairest-lord-jesus": {
    original:true, vocal:true, capo:3, tempo:80, pickup:false,
    shapes:"C, Am, Dm, F, G, G7, A7 and reviewed inversions", guitarKey:fairestEdition.guitarKey,
    fingers:fairestFingers,position:fairestPosition,build:buildFrom(fairestEdition),
  },
  "in-the-sweet-by-and-by": {
    original:true, vocal:true, capo:3, tempo:80, pickup:true,
    shapes:"D, G, A, A7, Em/G and D/A", guitarKey:sweetEdition.guitarKey,
    fingers:sweetFingers, position:sweetPosition, build:buildFrom(sweetEdition),
  },
  "are-you-washed-in-the-blood": {
    original:true, vocal:true, capo:1, tempo:80, pickup:true,
    shapes:"G, C, D, D7, G/B, D/F♯, A7/E, D/A and D7/F♯", guitarKey:washedEdition.guitarKey,
    fingers:standardFingers(1,"are-you-washed-in-the-blood",washedEdition),
    position:standardPosition, build:buildFrom(washedEdition),
  },
  "blessed-assurance": {
    original:true, vocal:true, capo:2, tempo:80, pickup:true,
    shapes:"C, F, G7, D7, C/E and Am", guitarKey:blessedEdition.guitarKey,
    fingers:standardFingers(2,"blessed-assurance"), position:standardPosition, build:buildFrom(blessedEdition),
  },
  "silent-night": {
    original:true, vocal:true, capo:1, tempo:80, pickup:false,
    shapes:"A, D and E7", guitarKey:silentEdition.guitarKey,
    fingers:standardFingers(1,"silent-night"), position:standardPosition, build:buildFrom(silentEdition),
  },
  "joy-to-the-world": {
    original:true, vocal:true, capo:2, tempo:80, pickup:false,
    shapes:"C, F and G7", guitarKey:joyEdition.guitarKey,
    fingers:standardFingers(2,"joy-to-the-world"), position:standardPosition, build:buildFrom(joyEdition),
  },
  "in-christ-alone": {
    original: true,
    chordLyrics: teacherChordLyrics,
    chordLyricOffset: (hymn, bar) => teacherChordOffset(hymn.harmony, bar),
    capo: 2,
    pickup: true,
    tempo: 80,
    shapes: "C, small F, G, C/E, Am, Dm and G7",
    guitarKey: "C",
    fingers: teacherFingers,
    position: teacherGuitarPosition,
    build: ({ hymn, instrument, hands }) => {
      const abc = teacherInstrumentAbc(
        hymn, instrument, instrument === "guitar" ? hands : "both",
      );
      return instrument === "guitar" && hands === "left"
        ? hymnLyricsAbc(abc, {
            hymn: teacherChordLyrics(hymn), selected: [1], offset: 0,
          })
        : abc;
    },
  },
  "amazing-grace": {
    original: true, vocal: true,
    capo: 0,
    pickup: true,
    tempo: 72,
    shapes: "G, C, D7 and Em",
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
    original: true, vocal: true,
    capo: 0,
    pickup: false,
    tempo: 80,
    shapes: "C, small F and G7",
    strumPattern: true,
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
    original: true, vocal: true,
    capo: 3,
    pickup: false,
    tempo: 72,
    shapes: "C, small F and G7",
    guitarKey: jesusEdition.guitarKey,
    fingers: jesusFingers,
    position: jesusPosition,
    build: ({melody, instrument, hands}) => jesusInstrumentAbc(melody(), instrument, instrument === "guitar" ? hands : "both"),
  },
  "o-come-all-ye-faithful": {
    original: true, vocal: true,
    capo: 0,
    pickup: true,
    tempo: 72,
    shapes: "G, C, D, D7, Em, Am, A7 and small Bm",
    guitarKey: faithfulEdition.guitarKey,
    fingers: faithfulFingers,
    position: faithfulPosition,
    build: buildFrom(faithfulEdition),
  },
};
const chordEditions = new Map(
  Object.entries(recipes).map(([key, recipe]) => [
    hymnForEdition(key).id,
    {
      ...recipe,
      id: hymnForEdition(key).id,
      editionKey: key,
      guitarArrangement: "guitar-edition" as const,
      guitarNotation: "written" as const,
    },
  ]),
);
const blues: InstrumentEdition = {
  id: hymnForEdition("the-1st-fingerstyle-blues").id,
  editionKey: "the-1st-fingerstyle-blues",
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
  return chordEditions.get(canonicalHymnId(hymn.id));
}
export function instrumentEdition(hymn: {
  id: string;
}): InstrumentEdition | undefined {
  return instrumentEditions.get(canonicalHymnId(hymn.id));
}
export const instrumentEditionIds = Object.freeze([
  ...instrumentEditions.keys(),
]);
