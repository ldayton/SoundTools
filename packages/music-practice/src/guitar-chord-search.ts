import { STRINGS } from "./guitar";
import {
  parseChordSymbol,
  parseChordSymbols,
  pitchClass,
  spellChordMidi,
  type ChordDefinition,
} from "./chord-symbol";
import {
  familiarGuitarShapes,
  type FamiliarShape,
} from "./guitar-chord-catalog";
import {
  findGuitarFingering,
  type GuitarFingering,
  type GuitarFrets,
} from "./guitar-chord-fingering";
export { parseChordSymbol, parseChordSymbols } from "./chord-symbol";
export type { ChordDefinition, ChordTone } from "./chord-symbol";
export {
  assessGuitarFingering,
  findGuitarFingering,
} from "./guitar-chord-fingering";
export type {
  Barre,
  GuitarFingering,
  GuitarFrets,
} from "./guitar-chord-fingering";

export type GuitarChordOptions = {
  /** Six sounding open-string MIDI notes, low-E-side to high-E-side. */
  tuning?: readonly number[];
  /** Bounds apply to fretted notes; open strings are controlled separately. */
  minFret?: number;
  maxFret?: number;
  maxFretSpan?: number;
  minStrings?: number;
  maxStrings?: number;
  maxFingers?: number;
  allowBarres?: boolean;
  allowOpenStrings?: boolean;
  requireOpenString?: boolean;
  /** Total muted strings BETWEEN the first and last played strings. */
  maxMutedGaps?: number;
  /** An explicit slash bass is always enforced, even when set to any. */
  bass?: "root" | "any";
  voicingPolicy?: "practical" | "complete";
  limit?: number;
  offset?: number;
};
type Options = Required<GuitarChordOptions>;
export type GuitarChordRank = {
  group: "familiar-beginner" | "other";
  cost: number;
  familiarity: FamiliarShape["familiarity"] | "generated";
  reasons: string[];
  features: {
    position: number;
    fretSpan: number;
    reachMm: number;
    fingerCount: number;
    barreStrings: number;
    mutedGaps: number;
    openStrings: number;
    soundingStrings: number;
  };
};
export type GuitarChordVoicing = {
  id: string;
  /** Low E side to high E side. Null means do not play; zero means open. */
  frets: (number | null)[];
  notes: {
    string: number;
    fret: number;
    midi: number;
    note: string;
    degree: string;
  }[];
  bassMidi: number;
  omittedDegrees: string[];
  fingering: GuitarFingering;
  rank: GuitarChordRank;
};
export const STANDARD_CHORD_TUNING: readonly number[] = Object.freeze(
  [...STRINGS].sort((a, b) => b.number - a.number).map((s) => s.midi),
);
function optionsFor(input: GuitarChordOptions): Options {
  const o: Options = {
    tuning: STANDARD_CHORD_TUNING,
    minFret: 0,
    maxFret: 12,
    maxFretSpan: 4,
    minStrings: 3,
    maxStrings: 6,
    maxFingers: 4,
    allowBarres: true,
    allowOpenStrings: true,
    requireOpenString: false,
    maxMutedGaps: 0,
    bass: "root",
    voicingPolicy: "practical",
    limit: 20,
    offset: 0,
    ...Object.fromEntries(
      Object.entries(input).filter(([, value]) => value !== undefined),
    ),
  };
  for (const [key, low, high] of [
    ["minFret", 0, 24],
    ["maxFret", 0, 24],
    ["maxFretSpan", 0, 5],
    ["minStrings", 2, 6],
    ["maxStrings", 2, 6],
    ["maxFingers", 0, 4],
    ["maxMutedGaps", 0, 4],
    ["limit", 1, 1000],
    ["offset", 0, 1000000],
  ] as const) {
    if (!Number.isInteger(o[key]) || o[key] < low || o[key] > high)
      throw new Error("Invalid chord search option: " + key);
  }
  if (
    (o.maxFret > 0 && o.minFret > o.maxFret) ||
    o.minStrings > o.maxStrings ||
    (o.requireOpenString && !o.allowOpenStrings)
  )
    throw new Error("Contradictory chord search constraints");
  for (const k of [
    "allowBarres",
    "allowOpenStrings",
    "requireOpenString",
  ] as const)
    if (typeof o[k] !== "boolean")
      throw new Error("Invalid chord search option: " + k);
  if (
    !["root", "any"].includes(o.bass) ||
    !["practical", "complete"].includes(o.voicingPolicy)
  )
    throw new Error("Invalid bass or voicing policy");
  if (
    !Array.isArray(o.tuning) ||
    o.tuning.length !== 6 ||
    o.tuning.some((n) => !Number.isInteger(n) || n < 0 || n + o.maxFret > 127)
  )
    throw new Error("Provide six valid open-string MIDI pitches");
  return { ...o, tuning: [...o.tuning] };
}
function tonePolicy(chord: ChordDefinition, policy: Options["voicingPolicy"]) {
  const extended = chord.tones.some((t) =>
    ["11P", "11A", "13M", "13m"].includes(t.interval),
  );
  return chord.tones.filter(
    (t) =>
      policy === "complete" ||
      !(
        (chord.tones.length >= 4 && t.interval === "5P") ||
        (extended && t.interval === "9M")
      ),
  );
}
function shapeKey(frets: GuitarFrets) {
  return frets.map((f) => (f === null ? "x" : f)).join(",");
}
function gaps(frets: GuitarFrets) {
  const first = frets.findIndex((f) => f !== null);
  let last = frets.length - 1;
  while (last >= 0 && frets[last] === null) last--;
  return frets.slice(first, last + 1).filter((f) => f === null).length;
}
function ranking(
  frets: GuitarFrets,
  fingering: GuitarFingering,
  familiar?: FamiliarShape,
): GuitarChordRank {
  const pressed = frets.filter((f): f is number => f !== null && f > 0);
  const position = pressed.length ? Math.min(...pressed) : 0;
  const fretSpan = pressed.length ? Math.max(...pressed) - position : 0;
  // Approximate contact separation on a 648 mm equal-tempered fretboard.
  const reachMm = pressed.length
    ? Math.round(
        648 * (2 ** (-position / 12) - 2 ** (-Math.max(...pressed) / 12)) * 10,
      ) / 10
    : 0;
  const soundingStrings = frets.filter((f) => f !== null).length,
    openStrings = frets.filter((f) => f === 0).length,
    mutedGaps = gaps(frets);
  const barreStrings = fingering.barres.reduce(
    (sum, b) => sum + b.fromString - b.toString + 1,
    0,
  );
  const beginner = !!familiar && familiar.familiarity !== "standard-movable";
  const bonus = familiar?.familiarity === "standard-movable" ? 36 : 0;
  const cost =
    Math.round(
      (fingering.effort +
        position * 2 +
        Math.max(0, position - 5) * 2 +
        fretSpan * 6 +
        reachMm / 8 +
        mutedGaps * 18 +
        (6 - soundingStrings) * 3 +
        fingering.barres.reduce(
          (s, b) => s + (b.fromString - b.toString >= 3 ? 8 / b.fret : 0),
          0,
        ) +
        (familiar?.preference ?? 0) * 8 -
        bonus) *
        100,
    ) / 100;
  const reasons: string[] = [];
  if (familiar) reasons.push(familiar.name);
  if (!fingering.barres.length) reasons.push("No barre");
  else
    reasons.push(
      fingering.barres.some((b) => b.fromString - b.toString >= 3)
        ? "Wide barre"
        : "Short barre",
    );
  if (openStrings)
    reasons.push(`${openStrings} open string${openStrings === 1 ? "" : "s"}`);
  if (mutedGaps)
    reasons.push(
      `${mutedGaps} internal muted string${mutedGaps === 1 ? "" : "s"}`,
    );
  if (fretSpan >= 3) reasons.push("Wider fret stretch");
  if (position >= 7) reasons.push("Higher neck position");
  return {
    group: beginner ? "familiar-beginner" : "other",
    cost,
    familiarity: familiar?.familiarity ?? "generated",
    reasons,
    features: {
      position,
      fretSpan,
      reachMm,
      fingerCount: fingering.fingerCount,
      barreStrings,
      mutedGaps,
      openStrings,
      soundingStrings,
    },
  };
}

/** No DOM/audio/persistence. Enumerates all candidates within the declared
 * bounds, validates fingerings, ranks globally, and only THEN paginates.
 */
export function searchGuitarChords(
  symbol: string,
  input: GuitarChordOptions = {},
) {
  const chord = parseChordSymbol(symbol),
    o = optionsFor(input);
  const required = tonePolicy(chord, o.voicingPolicy);
  const bass =
    chord.bass?.pitchClass ??
    (o.bass === "root" ? chord.root.pitchClass : null);
  const allowed = new Set(chord.tones.map((t) => t.pitchClass));
  if (chord.bass) allowed.add(chord.bass.pitchClass);
  const requiredMask =
    required.reduce((mask, t) => mask | (1 << t.pitchClass), 0) |
    (bass === null ? 0 : 1 << bass);
  const standard = o.tuning.every((n, i) => n === STANDARD_CHORD_TUNING[i]);
  const familiar = new Map<string, FamiliarShape>();
  if (standard)
    for (const s of familiarGuitarShapes(chord)) {
      const id = shapeKey(s.frets),
        previous = familiar.get(id);
      if (!previous || s.preference < previous.preference) familiar.set(id, s);
    }
  const choices = o.tuning.map((open) => [
    null,
    ...(o.allowOpenStrings && allowed.has(pitchClass(open)) ? [0] : []),
    ...Array.from(
      { length: Math.max(0, o.maxFret - Math.max(1, o.minFret) + 1) },
      (_, i) => Math.max(1, o.minFret) + i,
    ).filter((f) => allowed.has(pitchClass(open + f))),
  ]);
  // A suffix mask rules out branches that can no longer supply a required tone.
  const remaining = Array<number>(7).fill(0);
  const remainingBass = Array<number>(7).fill(Infinity);
  for (let i = 5; i >= 0; i--)
    remaining[i] =
      remaining[i + 1] |
      choices[i].reduce<number>(
        (mask, f) =>
          f === null ? mask : mask | (1 << pitchClass(o.tuning[i] + f)),
        0,
      );
  if (bass !== null)
    for (let i = 5; i >= 0; i--)
      remainingBass[i] = Math.min(
        remainingBass[i + 1],
        ...choices[i].flatMap((f) =>
          f !== null && pitchClass(o.tuning[i] + f) === bass
            ? [o.tuning[i] + f]
            : [],
        ),
      );
  const result: GuitarChordVoicing[] = [];
  const frets: (number | null)[] = Array(6).fill(null);
  function visit(
    string: number,
    mask: number,
    count: number,
    low: number,
    high: number,
    lowest: number,
    hasOpen: boolean,
  ) {
    if (
      count > o.maxStrings ||
      count + 6 - string < o.minStrings ||
      ((mask | remaining[string]) & requiredMask) !== requiredMask ||
      high - low > o.maxFretSpan
    )
      return;
    if (
      bass !== null &&
      Number.isFinite(lowest) &&
      pitchClass(lowest) !== bass &&
      remainingBass[string] >= lowest
    )
      return;
    if (string === 6) {
      if (
        count < o.minStrings ||
        (mask & requiredMask) !== requiredMask ||
        (bass !== null && pitchClass(lowest) !== bass) ||
        (o.requireOpenString && !hasOpen) ||
        gaps(frets) > o.maxMutedGaps
      )
        return;
      const known = familiar.get(shapeKey(frets));
      const fingering = findGuitarFingering(frets, o, known?.fingers);
      if (!fingering) return;
      const notes = frets.flatMap((fret, i) => {
        if (fret === null) return [];
        const midi = o.tuning[i] + fret,
          tone = chord.tones.find((t) => t.pitchClass === pitchClass(midi));
        return [
          {
            string: 6 - i,
            fret,
            midi,
            note: spellChordMidi(tone?.note ?? chord.bass!.note, midi),
            degree: tone?.degree ?? "bass",
          },
        ];
      });
      result.push({
        id: shapeKey(frets),
        frets: [...frets],
        notes,
        bassMidi: lowest,
        omittedDegrees: chord.tones
          .filter((t) => !(mask & (1 << t.pitchClass)))
          .map((t) => t.degree),
        fingering,
        rank: ranking(frets, fingering, known),
      });
      return;
    }
    for (const fret of choices[string]) {
      frets[string] = fret;
      const midi = fret === null ? Infinity : o.tuning[string] + fret;
      visit(
        string + 1,
        fret === null ? mask : mask | (1 << pitchClass(midi)),
        count + (fret === null ? 0 : 1),
        fret === null || fret === 0 ? low : Math.min(low, fret),
        fret === null || fret === 0 ? high : Math.max(high, fret),
        Math.min(lowest, midi),
        hasOpen || fret === 0,
      );
    }
    frets[string] = null;
  }
  visit(0, 0, 0, Infinity, -Infinity, Infinity, false);
  result.sort(
    (a, b) =>
      Number(a.rank.group !== "familiar-beginner") -
        Number(b.rank.group !== "familiar-beginner") ||
      a.rank.cost - b.rank.cost ||
      a.frets.reduce<number>(
        (s, f, i) => s || (f ?? -1) - (b.frets[i] ?? -1),
        0,
      ),
  );
  return {
    chord,
    total: result.length,
    offset: o.offset,
    limit: o.limit,
    voicings: result.slice(o.offset, o.offset + o.limit),
  };
}
