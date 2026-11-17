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
    | "octave"
    | "mode"
    | "bpm"
    | "countIn"
    | "loopCountIn"
    | "arrangement"
    | "viewHands"
    | "hands"
    | "reattackTies"
    | "stanzas"
  >
> & { zoom?: number };
export type HymnOptionsSnapshot = Required<HymnOptionsChange> & {
  stanzaChoices: { number: number; label: string }[];
  searchOpen: boolean;
  unmetered: boolean;
  originalKey: string;
  noMatchingKey: boolean;
  availableKeys: HymnKey[];
  availableOctaves: number[];
  range: string;
  source: {
    referenceUrl: string | null;
    credits: string;
    url: string;
    label: string;
    description: string;
    help: string;
    transposition: string;
  };
};
/** The controller owns settings, including URL and range-driven changes. */
export const hymnOptionsState = createViewState<HymnOptionsSnapshot>;
export type HymnOptionsState = ReturnType<typeof hymnOptionsState>;
