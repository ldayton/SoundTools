/** Data-only exercise metadata, shared by the browser and offline build. Factories live in exercises.ts. */
export const EXERCISES = [
  {
    mode: "piano",
    title: "Find piano keys",
    area: "Piano",
    icon: "piano",
    path: "/piano/keys",
    kind: "flashcard",
  },
  {
    mode: "patterns",
    title: "Interval patterns",
    area: "Piano",
    icon: "piano",
    path: "/piano/patterns",
    rootId: "patterns-practice",
    kind: "live",
  },
  {
    mode: "sight",
    title: "Hymns",
    area: "Piano",
    icon: "piano",
    path: "/piano/hymns",
    rootId: "sight-reading",
    kind: "live",
  },
  {
    mode: "staff",
    title: "Read staff notes",
    area: "Guitar",
    icon: "guitar",
    path: "/guitar/staff",
    kind: "flashcard",
  },
  {
    mode: "name",
    title: "Name fretboard notes",
    area: "Guitar",
    icon: "guitar",
    path: "/guitar/fretboard-notes",
    kind: "flashcard",
  },
  {
    mode: "find",
    title: "Find fretboard notes",
    area: "Guitar",
    icon: "guitar",
    path: "/guitar/find-notes",
    kind: "flashcard",
  },
  {
    mode: "staff-find",
    title: "Staff to fretboard",
    area: "Guitar",
    icon: "guitar",
    path: "/guitar/staff-to-fretboard",
    kind: "flashcard",
  },
  {
    mode: "tab",
    title: "Read tablature",
    area: "Guitar",
    icon: "guitar",
    path: "/guitar/tablature",
    kind: "flashcard",
  },
  {
    mode: "rhythm",
    title: "Rhythm reading",
    area: "Rhythm",
    icon: "rhythm",
    path: "/rhythm/reading",
    rootId: "rhythm-practice",
    kind: "live",
  },
  {
    mode: "scales",
    title: "Scales & degrees",
    area: "Music theory",
    icon: "theory",
    path: "/theory/scales",
    rootId: "scales-practice",
    kind: "live",
  },
  {
    mode: "intervals",
    title: "Intervals",
    area: "Music theory",
    icon: "theory",
    path: "/theory/intervals",
    rootId: "intervals-practice",
    kind: "live",
  },
  {
    mode: "signature",
    title: "Key signatures",
    area: "Music theory",
    icon: "theory",
    path: "/theory/key-signatures",
    kind: "flashcard",
  },
] as const;
export type Exercise = (typeof EXERCISES)[number];
export type Mode = Exercise["mode"];
export type LiveMode = Extract<Exercise, { kind: "live" }>["mode"];
export type FlashcardMode = Exclude<Mode, LiveMode>;
export const LIVE_EXERCISES = EXERCISES.filter((e) => e.kind === "live");
export const FLASHCARD_EXERCISES = EXERCISES.filter(
  (e) => e.kind === "flashcard",
);
export const AREAS = [...new Set(EXERCISES.map((e) => e.area))].map(
  (label) => ({
    label,
    icon: EXERCISES.find((e) => e.area === label)!.icon,
    items: EXERCISES.filter((e) => e.area === label),
  }),
);
export function exercise(mode: Mode) {
  return EXERCISES.find((e) => e.mode === mode)!;
}
export function isLiveMode(mode: string): mode is LiveMode {
  return LIVE_EXERCISES.some((e) => e.mode === mode);
}
export function isFlashcardMode(mode: string): mode is FlashcardMode {
  return FLASHCARD_EXERCISES.some((e) => e.mode === mode);
}

export const APP_ROUTE_ROOTS = [
  ...new Set(EXERCISES.map((e) => e.path.split("/")[1])),
  "settings",
];
