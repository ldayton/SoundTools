import { belongsToApp } from "./app-profile";
import { EXERCISES as CATALOG, type LiveMode } from "./exercise-catalog";
import type { LivePractice } from "./live-practice";
export {
  AREAS,
  APP_ROUTE_ROOTS,
  FLASHCARD_EXERCISES,
  exercise,
  isLiveMode,
  isFlashcardMode,
} from "./exercise-catalog";
export type { Mode, LiveMode, FlashcardMode } from "./exercise-catalog";
type Constructor = new (
  element: HTMLElement,
  changed: () => void,
) => LivePractice;
/** Browser-only factories. The exhaustive mapping is checked against the data-only catalog used by build tooling. */
const loaders = {
  "guitar-scales": () =>
    import("./scale-explorer").then((m) => m.ScaleExplorer),
  scales: () => import("./theory").then((m) => m.ScalesPractice),
  intervals: () => import("./theory").then((m) => m.IntervalsPractice),
  patterns: () => import("./patterns").then((m) => m.IntervalPatterns),
  sight: async () => {
    throw Error("Hymn practice belongs to SongAlong");
  },
  rhythm: () => import("./rhythm").then((m) => m.RhythmPractice),
} satisfies Record<LiveMode, () => Promise<Constructor>>;
export const EXERCISES = CATALOG.filter((e) => belongsToApp(e.mode)).map((e) =>
  e.kind === "live" ? { ...e, load: loaders[e.mode] } : e,
);
export const LIVE_EXERCISES = EXERCISES.filter((e) => e.kind === "live");
