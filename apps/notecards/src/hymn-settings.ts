import type { CountInBars } from "./hymn-count-in";
import { isHymnKey, type HymnKey } from "./hymn-transpose";
import hymns from "./hymns.json";
import {
  ARRANGEMENTS,
  type Arrangement,
  type HymnHands,
} from "./hymn-arrangements";
import { object, choice } from "./exercise-settings";
export function optionalHymnNote(
  value: unknown,
  fallback: number | null = null,
): number | null {
  return value === null
    ? null
    : typeof value === "number" &&
        Number.isInteger(value) &&
        value >= 21 &&
        value <= 108
      ? value
      : fallback;
}
export type HymnSettings = {
  hymn: string;
  mode?: "wait" | "playback";
  bpm?: number;
  countIn?: CountInBars;
  key?: HymnKey;
  low?: number | null;
  high?: number | null;
  arrangement: Arrangement;
  hands?: HymnHands;
  viewHands?: HymnHands;
  sectionBars: 0 | 2 | 4;
  section: number;
  position: number;
};
export function mergeHymnSettings(
  base: HymnSettings,
  input: unknown,
): HymnSettings {
  const s = object(input);
  const legacy = !("arrangement" in s) && ("hymn" in s || "chords" in s);
  const viewHands = choice(
    s.viewHands,
    ["right", "left", "both"] as const,
    base.viewHands || "both",
  );
  const hands =
    viewHands === "both"
      ? choice(
          s.hands,
          ["right", "left", "both"] as const,
          base.hands || "both",
        )
      : viewHands;
  return {
    ...("low" in s || "low" in base
      ? { low: optionalHymnNote(s.low, base.low ?? null) }
      : {}),
    ...("high" in s || "high" in base
      ? { high: optionalHymnNote(s.high, base.high ?? null) }
      : {}),
    ...("countIn" in s || "countIn" in base
      ? {
          countIn: [0, 0.5, 1, 2].includes(s.countIn as number)
            ? (s.countIn as CountInBars)
            : base.countIn || 0,
        }
      : {}),
    viewHands,
    hands,
    mode: choice(s.mode, ["wait", "playback"] as const, base.mode || "wait"),
    bpm:
      Number.isInteger(s.bpm) &&
      Number(s.bpm) >= 40 &&
      Number(s.bpm) <= 200 &&
      Number(s.bpm) % 5 === 0
        ? Number(s.bpm)
        : base.bpm || 80,
    ...(isHymnKey(s.key) ? { key: s.key } : base.key ? { key: base.key } : {}),
    hymn: hymns.some((h) => h.id === s.hymn) ? (s.hymn as string) : base.hymn,
    arrangement: choice(
      s.arrangement,
      ARRANGEMENTS.map((a) => a.id),
      legacy ? (s.chords === true ? "original" : "melody") : base.arrangement,
    ),
    sectionBars: [0, 2, 4].includes(s.sectionBars as number)
      ? (s.sectionBars as 0 | 2 | 4)
      : legacy
        ? 0
        : base.sectionBars,
    section:
      Number.isSafeInteger(s.section) && (s.section as number) >= 0
        ? (s.section as number)
        : base.section,
    position:
      Number.isSafeInteger(s.position) && (s.position as number) >= 0
        ? (s.position as number)
        : base.position,
  };
}
export function hymnSettingsFromQuery(
  base: HymnSettings,
  query: URLSearchParams,
) {
  const overrides: Record<string, unknown> = {};
  for (const bound of ["low", "high"] as const)
    if (query.has(bound))
      overrides[bound] =
        query.get(bound) === "none" ? null : Number(query.get(bound));
  if (query.has("view")) overrides.viewHands = query.get("view");
  if (query.has("hands")) overrides.hands = query.get("hands");
  if (query.has("countIn")) overrides.countIn = Number(query.get("countIn"));
  if (query.has("mode")) overrides.mode = query.get("mode");
  if (query.has("tempo")) overrides.bpm = Number(query.get("tempo"));
  if (query.has("key")) overrides.key = query.get("key");
  if (query.has("arrangement"))
    overrides.arrangement = query.get("arrangement");
  if (["0", "2", "4"].includes(query.get("bars") || ""))
    overrides.sectionBars = Number(query.get("bars"));
  if (/^[1-9]\d{0,3}$/.test(query.get("section") || ""))
    overrides.section = Number(query.get("section")) - 1;
  return mergeHymnSettings(base, overrides);
}
