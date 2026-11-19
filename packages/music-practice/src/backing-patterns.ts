import type { BackingGenreId } from "./backing-genres";

export type BackingPattern =
  "standard" | "fingerpicked" | "strummed" | "two-step";

const patterns = {
  folk: [
    { value: "fingerpicked", label: "Fingerpicked" },
    { value: "strummed", label: "Strummed" },
  ],
  country: [{ value: "two-step", label: "Two-step" }],
} as const;

export function backingPatterns(style: BackingGenreId) {
  return style === "folk" || style === "country" ? patterns[style] : [];
}

/** Old settings and a pattern from another genre resolve to that genre's default. */
export function backingPattern(
  style: BackingGenreId,
  value: unknown,
): BackingPattern {
  const choices = backingPatterns(style);
  return (
    choices.find((choice) => choice.value === value)?.value ??
    choices[0]?.value ??
    "standard"
  );
}
