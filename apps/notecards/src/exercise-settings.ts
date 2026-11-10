import { KEYS, POSITIONS, type Settings } from "./model";
import { PIANO_POSITIONS } from "./piano-model";
import type { FlashcardMode } from "./exercises";
/** Shared flashcard data shape retained for the version-5 progress file. Live activities have their own settings. */
export type Profile = Settings & {
  strings: number[];
  minFret: number;
  maxFret: number;
  naturalsOnly?: boolean;
  pianoPrompt?: "staff" | "name";
  staffLayout?: "treble" | "bass" | "grand";
  overlapPractice?: "standard" | "both";
  octavePractice?: "off" | "practice";
  signaturePractice?: "major" | "minor" | "both";
};
export function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
export function choice<const T extends string>(
  value: unknown,
  options: readonly T[],
  fallback: NoInfer<T>,
): T {
  return options.includes(value as T) ? (value as T) : fallback;
}
export function defaultProfile(mode: FlashcardMode): Profile {
  return {
    low: mode === "piano" ? "C4" : "E3",
    high: mode === "piano" ? "B5" : "F4",
    key: "C",
    strings: mode === "name" ? [1, 2, 3, 4, 5, 6] : [6],
    minFret: 0,
    maxFret: 5,
    ...(mode === "piano"
      ? ({
          staffLayout: "grand",
          overlapPractice: "standard",
          octavePractice: "off",
        } as const)
      : {}),
  };
}
/** Invalid fields preserve the current preference; migrations choose the defaults before merging. */
export function mergeProfile(
  mode: FlashcardMode,
  base: Profile,
  input: unknown,
): Profile {
  const source = object(input),
    result = { ...base, strings: [...base.strings] };
  if (typeof source.key === "string" && KEYS.some((k) => k.id === source.key))
    result.key = source.key;
  if (mode === "piano") {
    if (source.pianoPrompt !== undefined)
      result.pianoPrompt = choice(
        source.pianoPrompt,
        ["staff", "name"],
        base.pianoPrompt || "staff",
      );
    result.staffLayout = choice(
      source.staffLayout,
      ["treble", "bass", "grand"],
      base.staffLayout || "grand",
    );
    result.overlapPractice = choice(
      source.overlapPractice,
      ["standard", "both"],
      base.overlapPractice || "standard",
    );
    result.octavePractice = choice(
      source.octavePractice,
      ["off", "practice"],
      base.octavePractice || "off",
    );
  }
  if (mode === "signature" && source.signaturePractice !== undefined)
    result.signaturePractice = choice(
      source.signaturePractice,
      ["major", "minor", "both"],
      base.signaturePractice || "major",
    );
  if (typeof source.naturalsOnly === "boolean")
    result.naturalsOnly = source.naturalsOnly;
  const positions = mode === "piano" ? PIANO_POSITIONS : POSITIONS;
  const low =
    typeof source.low === "string" && positions.includes(source.low)
      ? source.low
      : base.low;
  const high =
    typeof source.high === "string" && positions.includes(source.high)
      ? source.high
      : base.high;
  if (positions.indexOf(low) <= positions.indexOf(high)) {
    result.low = low;
    result.high = high;
  }
  if (Array.isArray(source.strings)) {
    const strings = [
      ...new Set(
        source.strings.filter(
          (n): n is number =>
            typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 6,
        ),
      ),
    ];
    if (strings.length) result.strings = strings;
  }
  if (
    typeof source.minFret === "number" &&
    typeof source.maxFret === "number" &&
    Number.isInteger(source.minFret) &&
    Number.isInteger(source.maxFret) &&
    source.minFret >= 0 &&
    source.maxFret <= 12 &&
    source.minFret <= source.maxFret
  ) {
    result.minFret = source.minFret;
    result.maxFret = source.maxFret;
  }
  return result;
}
export function profileFromQuery(
  mode: FlashcardMode,
  base: Profile,
  query: URLSearchParams,
) {
  const fields = {
    key: "key",
    low: "low",
    high: "high",
    show: "pianoPrompt",
    clef: "staffLayout",
  };
  const overrides: Record<string, unknown> = {};
  for (const [param, field] of Object.entries(fields))
    if (query.has(param)) overrides[field] = query.get(param);
  return mergeProfile(mode, base, overrides);
}
