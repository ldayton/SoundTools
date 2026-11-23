import {chordEdition} from "./chord-editions";
import { validStanzas } from "./hymn-lyrics";
import type { CountInBars } from "./hymn-count-in";
import { isHymnKey, type HymnKey } from "./hymn-transpose";
import hymns from "./hymns.json";
import {
  hasInstrumentEditions,
  hymnArrangements,
  type Arrangement,
  type HymnHands,
} from "./hymn-arrangements";
import { object, choice } from "./exercise-settings";
export const HYMN_NOTE_MIN = 36; // C2
export const HYMN_NOTE_MAX = 95; // B6
export function optionalHymnNote(
  value: unknown,
  fallback: number | null = null,
): number | null {
  return value === null
    ? null
    : typeof value === "number" &&
        Number.isInteger(value) &&
        value >= HYMN_NOTE_MIN &&
        value <= HYMN_NOTE_MAX
      ? value
      : fallback;
}
export type HymnSettings = {
  hymn: string;
  mode?: "wait" | "playback";
  bpm?: number;
  countIn?: CountInBars;
  loopCountIn?: boolean;
  key?: HymnKey;
  octave?: number;
  low?: number | null;
  high?: number | null;
  arrangement: Arrangement;
  scoreDisplay?: "notation" | "tab" | "both" | "chords";
  hands?: HymnHands;
  viewHands?: HymnHands;
  reattackTies?: boolean;
  stanzas?: number[];
  stanza?: number;
  sectionBars: 0 | 2 | 4;
  section: number;
  position: number;
};
export function mergeHymnSettings(
  base: HymnSettings,
  input: unknown,
): HymnSettings {
  const s = object(input);
  const hymn =
    hymns.find((h) => h.id === s.hymn) ||
    hymns.find((h) => h.id === base.hymn) ||
    hymns[0];
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
  const stanzas = validStanzas(
    s.stanzas,
    hymn.stanzas.length,
    base.stanzas || [1],
  );
  const stanza = stanzas.includes(s.stanza as number)
    ? Number(s.stanza)
    : stanzas.includes(base.stanza!)
      ? base.stanza!
      : stanzas[0] || 0;
  const available = hymnArrangements(hymn).map(a => a.id);
  const requested = s.arrangement ?? base.arrangement;
  const arrangement = hasInstrumentEditions(hymn)
    ? requested === "guitar-fingerstyle" || requested === "guitar-edition" || requested === "guitar" || requested === "guitar-chords"
      ? chordEdition(hymn) ? "guitar-edition" : "guitar-fingerstyle" : "piano"
    : undefined;
  return {
    scoreDisplay: choice(s.scoreDisplay, (chordEdition(hymn) ? ["notation", "tab", "both", "chords"] : ["notation", "tab", "both"]) as ("notation" | "tab" | "both" | "chords")[], base.scoreDisplay === "chords" && !chordEdition(hymn) ? "both" : base.scoreDisplay || "both"),
    stanzas,
    ...("stanza" in s || "stanza" in base ? { stanza } : {}),
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
    ...("loopCountIn" in s || "loopCountIn" in base
      ? {
          loopCountIn:
            typeof s.loopCountIn === "boolean"
              ? s.loopCountIn
              : base.loopCountIn || false,
        }
      : {}),
    viewHands: hasInstrumentEditions(hymn) ? "both" : viewHands,
    hands: hasInstrumentEditions(hymn)
      ? choice(s.hands, ["right", "left", "both"] as const, base.hands || "both")
      : hands,
    ...("reattackTies" in s || "reattackTies" in base
      ? {
          reattackTies:
            typeof s.reattackTies === "boolean"
              ? s.reattackTies
              : base.reattackTies || false,
        }
      : {}),
    mode: choice(s.mode, ["wait", "playback"] as const, base.mode || "wait"),
    bpm:
      Number.isInteger(s.bpm) && Number(s.bpm) >= 40 && Number(s.bpm) <= 200
        ? Number(s.bpm)
        : base.bpm || 80,
    ...(isHymnKey(s.key) ? { key: s.key } : base.key ? { key: base.key } : {}),
    ...(Number.isInteger(s.octave) && Math.abs(Number(s.octave)) <= 10
      ? { octave: Number(s.octave) }
      : base.octave !== undefined
        ? { octave: base.octave }
        : {}),
    hymn: hymns.some((h) => h.id === s.hymn) ? (s.hymn as string) : base.hymn,
    arrangement: arrangement ?? choice(
      s.arrangement,
      available,
      legacy
        ? s.chords === true
          ? "original"
          : "melody"
        : available.includes(base.arrangement)
          ? base.arrangement
          : available[0],
    ),
    sectionBars: 0,
    section: 0,
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
  if (query.has("stanzas"))
    overrides.stanzas =
      query.get("stanzas") === "none"
        ? []
        : query.get("stanzas")!.split(",").map(Number);
  if (query.has("ties"))
    overrides.reattackTies = query.get("ties") === "repeat";
  if (query.has("view")) overrides.viewHands = query.get("view");
  if (query.has("display")) overrides.scoreDisplay = query.get("display");
  if (query.has("hands")) overrides.hands = query.get("hands");
  if (query.has("loopCountIn"))
    overrides.loopCountIn = query.get("loopCountIn") === "1";
  if (query.has("countIn")) overrides.countIn = Number(query.get("countIn"));
  if (query.has("mode")) overrides.mode = query.get("mode");
  if (query.has("tempo")) overrides.bpm = Number(query.get("tempo"));
  if (query.has("key")) overrides.key = query.get("key");
  if (query.has("octave")) overrides.octave = Number(query.get("octave"));
  if (query.has("arrangement"))
    overrides.arrangement = query.get("arrangement");
  return mergeHymnSettings(base, overrides);
}

/** Right-sidebar settings belong to one hymn, with independent defaults. */
export function hymnPreferences(hymn: string, input: unknown = {}) {
  const entry = hymns.find((entry) => entry.id === hymn);
  const base: HymnSettings = {
    hymn,
    mode: "wait",
    bpm: chordEdition({id:hymn})?.tempo ?? 80,
    countIn: 0,
    loopCountIn: false,
    key: "original",
    low: null,
    high: null,
    arrangement:
      entry && "defaultArrangement" in entry && entry.defaultArrangement === "original"
        ? "original" : "melody",
    hands: "both",
    viewHands: "both",
    reattackTies: false,
    stanzas: [1],
    sectionBars: 0,
    section: 0,
    position: 0,
  };
  const raw = object(input);
  return {
    ...mergeHymnSettings(base, {
      ...(!("arrangement" in raw) && !("chords" in raw) ? { arrangement: base.arrangement } : {}),
      ...raw,
      hymn,
    }),
    zoom: validHymnZoom(raw.zoom) ? (raw.zoom as number) : 1,
  };
}

export function validHymnZoom(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0.5 &&
    value <= 2
  );
}
