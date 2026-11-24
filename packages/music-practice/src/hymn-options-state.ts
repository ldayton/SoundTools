import { createViewState } from "./view-state";
import type { HymnSettings } from "./hymn-settings";
import type { HymnKey } from "./hymn-transpose";

export type HymnOptionsChange = Partial<
  Pick<
    HymnSettings,
    | "low"
    | "high"
    | "hymn"
    | "key"
    | "capo"
    | "octave"
    | "mode"
    | "bpm"
    | "countIn"
    | "loopCountIn"
    | "mutedStaves"
    | "hiddenStaves"
    | "showChordSymbols"
    | "arrangement"
    | "scoreDisplay"
    | "viewHands"
    | "hands"
    | "reattackTies"
    | "stanzas"
  >
> & { zoom?: number; fingerings?: boolean; staffSpacing?: number };
export type HymnOptionsSnapshot = Required<HymnOptionsChange> & {
  playbackStaves: {index:number; label:string; display?:"notation"|"tab"; playable?:boolean}[];
  chordSymbolsAvailable: boolean;
  favorites: Readonly<Record<string, boolean>>;
  stanzaChoices: { number: number; label: string }[];
  searchOpen: boolean;
  unmetered: boolean;
  originalKey: string;
  capoChoices: {fret:number;shapeKey:string;recommended:boolean;scoreSetting:boolean}[];
  effectiveCapo: number;
  guitarShapes: string;
  capoScoreSetting: boolean;
  noMatchingKey: boolean;
  availableKeys: HymnKey[];
  keyRanges: Partial<Record<HymnKey, string>>;
  availableOctaves: number[];
  range: string;
  source: {
    referenceUrl: string | null;
    referenceDetails: string | null;
    credits: string;
    url: string;
    label: string;
  };
};
/** The controller owns settings, including URL and range-driven changes. */
export const hymnOptionsState = createViewState<HymnOptionsSnapshot>;
export type HymnOptionsState = ReturnType<typeof hymnOptionsState>;
