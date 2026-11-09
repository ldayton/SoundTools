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
const scale = [0, 2, 4, 5, 7];
export function makePattern(
  settings: PatternSettings,
  random = Math.random,
  previous: number[] = [],
) {
  const key =
    PATTERN_KEYS.find((k) => k.id === settings.key) || PATTERN_KEYS[0];
  const max =
    settings.level === "leaps" ? 4 : settings.level === "skips" ? 2 : 1;
  let indexes: number[] = [];
  for (let attempt = 0; attempt < 12; attempt++) {
    indexes = [Math.min(4, Math.floor(random() * 5))];
    for (let i = 1; i < 4; i++) {
      const last = indexes.at(-1)!;
      const choices = [0, 1, 2, 3, 4].filter((n) => Math.abs(n - last) <= max);
      indexes.push(
        choices[
          Math.min(choices.length - 1, Math.floor(random() * choices.length))
        ],
      );
    }
    if (
      indexes.some((n, i) => n !== indexes[0]) &&
      indexes
        .map((n) => key.midi + scale[n] - (settings.hand === "left" ? 12 : 0))
        .join() !== previous.join()
    )
      break;
    if (attempt === 11)
      indexes = [
        [0, 1, 2, 3],
        [1, 2, 3, 4],
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
