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
    | "mode"
    | "bpm"
    | "countIn"
    | "arrangement"
    | "viewHands"
    | "hands"
    | "reattackTies"
  >
> & { zoom?: number };
export type HymnOptionsSnapshot = Required<HymnOptionsChange> & {
  searchOpen: boolean;
  unmetered: boolean;
  originalKey: string;
  noMatchingKey: boolean;
  availableKeys: HymnKey[];
  range: string;
  source: {
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
