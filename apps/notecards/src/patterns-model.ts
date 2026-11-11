import { object, choice } from "./exercise-settings";
export const PATTERN_KEYS = [
  { id: "C", midi: 60 },
  { id: "G", midi: 67 },
  { id: "F", midi: 65 },
  { id: "D", midi: 62 },
] as const;
export type PatternLevel = "steps" | "skips" | "leaps";
export type PatternSettings = {
  key: string;
  hand: "right" | "left";
  level: PatternLevel;
};
export const PATTERN_LENGTH = 8;
const scale = [0, 2, 4, 5, 7];
const maximumStep = (settings: PatternSettings) =>
  settings.level === "leaps" ? 4 : settings.level === "skips" ? 2 : 1;
function nextIndex(last: number, max: number, random: () => number) {
  const choices = [0, 1, 2, 3, 4].filter((n) => Math.abs(n - last) <= max);
  return choices[
    Math.min(choices.length - 1, Math.floor(random() * choices.length))
  ];
}
export function makePattern(
  settings: PatternSettings,
  random = Math.random,
  previous: number[] = [],
) {
  const key =
    PATTERN_KEYS.find((k) => k.id === settings.key) || PATTERN_KEYS[0];
  const max = maximumStep(settings);
  let indexes: number[] = [];
  for (let attempt = 0; attempt < 12; attempt++) {
    indexes = [Math.min(4, Math.floor(random() * 5))];
    for (let i = 1; i < PATTERN_LENGTH; i++)
      indexes.push(nextIndex(indexes.at(-1)!, max, random));
    if (
      indexes.some((n, i) => n !== indexes[0]) &&
      indexes
        .map((n) => key.midi + scale[n] - (settings.hand === "left" ? 12 : 0))
        .join() !== previous.join()
    )
      break;
    if (attempt === 11)
      indexes = [
        [0, 1, 2, 3, 4, 3, 2, 1],
        [1, 2, 3, 4, 3, 2, 1, 0],
      ].find(
        (xs) =>
          xs
            .map(
              (n) => key.midi + scale[n] - (settings.hand === "left" ? 12 : 0),
            )
            .join() !== previous.join(),
      )!;
  }
  return indexes.map(
    (n) => key.midi + scale[n] - (settings.hand === "left" ? 12 : 0),
  );
}

export function mergePatternSettings(
  base: PatternSettings,
  input: unknown,
): PatternSettings {
  const s = object(input);
  return {
    key: PATTERN_KEYS.some((k) => k.id === s.key)
      ? (s.key as string)
      : base.key,
    hand: choice(s.hand, ["right", "left"], base.hand),
    level: choice(s.level, ["steps", "skips", "leaps"], base.level),
  };
}

/** Extend older one-bar checkpoints without losing the notes already practised. */
export function restorePattern(
  raw: unknown,
  settings: PatternSettings,
  random = Math.random,
) {
  const saved = object(raw);
  if (
    ![1, 2].includes(Number(saved.version)) ||
    !Array.isArray(saved.notes) ||
    ![4, PATTERN_LENGTH].includes(saved.notes.length)
  )
    return;
  const base =
    (PATTERN_KEYS.find((k) => k.id === settings.key) || PATTERN_KEYS[0]).midi -
    (settings.hand === "left" ? 12 : 0);
  const notes = saved.notes as unknown[];
  const indexes = notes.map((n) =>
    typeof n === "number" ? scale.indexOf(n - base) : -1,
  );
  const max = maximumStep(settings);
  if (
    indexes.some(
      (n, i) => n < 0 || (i > 0 && Math.abs(n - indexes[i - 1]) > max),
    )
  )
    return;
  const position =
    Number.isSafeInteger(saved.position) &&
    Number(saved.position) >= 0 &&
    Number(saved.position) <= notes.length
      ? Number(saved.position)
      : 0;
  while (indexes.length < PATTERN_LENGTH)
    indexes.push(nextIndex(indexes.at(-1)!, max, random));
  return {
    notes: indexes.map((i) => base + scale[i]),
    position,
    paused: saved.paused === true,
  };
}
