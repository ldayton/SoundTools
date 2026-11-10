import {
  KEYS,
  name,
  type Card,
  type Letter,
  type Modifier,
  ROUND_LENGTHS,
  type RoundLength,
} from "./model";
export type TheoryKind = "scales" | "intervals";
export const TASKS = {
  scales: [
    ["name-degree", "Name the degree"],
    ["play-degree", "Play the degree"],
    ["build-scale", "Build the scale"],
  ],
  intervals: [
    ["name-interval", "Name the interval"],
    ["build-interval", "Build the interval"],
  ],
} as const;
export type TheoryTask = (typeof TASKS)[TheoryKind][number][0];
export type Quality =
  "major" | "minor" | "perfect" | "augmented" | "diminished";
export type TheorySettings = {
  keys: string[];
  mode: "major" | "minor";
  degrees: number[];
  intervals: number[];
  clef: "treble" | "bass";
  low: string;
  high: string;
  direction: "up" | "down" | "both";
  quality: "number" | "basic" | "all";
  accidentals: "naturals" | "simple";
  presentation: "successive" | "together";
  roundLength: RoundLength;
};
export type TheoryNote = Card & { midi: number };
export type TheoryQuestion = Card & {
  notes: TheoryNote[];
  key: string;
  keyName: string;
  degree?: number;
  interval?: number;
  quality?: Quality;
  direction: "up" | "down";
};
const LETTERS = "CDEFGAB";
const NATURAL = [0, 2, 4, 5, 7, 9, 11];
export const POSITIONS = Array.from(
  { length: 35 },
  (_, i) => LETTERS[i % 7] + (Math.floor(i / 7) + 2),
);
export const ordinal = (n: number) =>
  ["", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th"][n];
export function staffIndex(note: Pick<Card, "letter" | "octave">) {
  return note.octave * 7 + LETTERS.indexOf(note.letter);
}
export function noteAt(index: number, modifier = 0): TheoryNote {
  const octave = Math.floor(index / 7),
    letter = LETTERS[((index % 7) + 7) % 7] as Letter;
  return {
    id: `${letter}${octave}:${modifier}`,
    letter,
    octave,
    modifier: modifier as Modifier,
    midi: (octave + 1) * 12 + NATURAL[LETTERS.indexOf(letter)] + modifier,
  };
}
export function scaleNotes(
  keyId: string,
  mode: "major" | "minor",
  octave: number,
): TheoryNote[] {
  const key = KEYS.find((k) => k.id === keyId)!;
  const altered = (key.count < 0 ? "BEADGCF" : "FCGDAEB").slice(
    0,
    Math.abs(key.count),
  );
  const tonic = (LETTERS.indexOf(keyId[0]) + (mode === "minor" ? 5 : 0)) % 7;
  return Array.from({ length: 8 }, (_, i) => {
    const index = octave * 7 + tonic + i,
      letter = LETTERS[index % 7];
    return noteAt(index, altered.includes(letter) ? Math.sign(key.count) : 0);
  });
}
export function defaultTheorySettings(): TheorySettings {
  return {
    keys: ["C"],
    mode: "major",
    degrees: [1, 3, 5],
    intervals: [2, 3],
    clef: "treble",
    low: "C4",
    high: "C5",
    direction: "up",
    quality: "number",
    accidentals: "naturals",
    presentation: "successive",
    roundLength: 12,
  };
}
export function mergeTheorySettings(raw: unknown): TheorySettings {
  const d = defaultTheorySettings(),
    s = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const subset = <T>(value: unknown, values: readonly T[], fallback: T[]) => {
    const filtered = Array.isArray(value)
      ? [...new Set(value.filter((v): v is T => values.includes(v as T)))]
      : [];
    return filtered.length ? filtered : fallback;
  };
  d.keys = subset(
    s.keys,
    KEYS.map((k) => k.id),
    d.keys,
  );
  d.degrees = subset(s.degrees, [1, 2, 3, 4, 5, 6, 7], d.degrees).sort(
    (a, b) => a - b,
  );
  d.intervals = subset(s.intervals, [1, 2, 3, 4, 5, 6, 7, 8], d.intervals).sort(
    (a, b) => a - b,
  );
  if (s.mode === "minor") d.mode = "minor";
  if (s.clef === "bass") {
    d.clef = "bass";
    d.low = "C3";
    d.high = "C4";
  }
  if (
    POSITIONS.includes(String(s.low)) &&
    POSITIONS.includes(String(s.high)) &&
    POSITIONS.indexOf(String(s.low)) <= POSITIONS.indexOf(String(s.high))
  ) {
    d.low = String(s.low);
    d.high = String(s.high);
  }
  if (s.direction === "down" || s.direction === "both")
    d.direction = s.direction;
  if (s.quality === "basic" || s.quality === "all") d.quality = s.quality;
  if (s.accidentals === "simple") d.accidentals = s.accidentals;
  if (s.presentation === "together") d.presentation = "together";
  if (ROUND_LENGTHS.includes(s.roundLength as RoundLength))
    d.roundLength = s.roundLength as RoundLength;
  return d;
}
const BASE = [0, 0, 2, 4, 5, 7, 9, 11, 12];
const perfect = (size: number) => [1, 4, 5, 8].includes(size);
export function intervalTarget(
  root: TheoryNote,
  size: number,
  direction: "up" | "down",
  quality: Quality,
): TheoryNote | undefined {
  if (
    perfect(size) ? ["major", "minor"].includes(quality) : quality === "perfect"
  )
    return;
  const offset =
    quality === "minor"
      ? -1
      : quality === "augmented"
        ? 1
        : quality === "diminished"
          ? perfect(size)
            ? -1
            : -2
          : 0;
  const semitones = BASE[size] + offset;
  if (semitones < 0) return;
  const sign = direction === "up" ? 1 : -1;
  const natural = noteAt(staffIndex(root) + sign * (size - 1));
  const accidental = root.midi + sign * semitones - natural.midi;
  if (Math.abs(accidental) > 1) return; // No double accidentals in these introductory tasks.
  return noteAt(staffIndex(natural), accidental);
}
export function intervalQuality(
  a: TheoryNote,
  b: TheoryNote,
  size: number,
): Quality {
  const delta = Math.abs(b.midi - a.midi) - BASE[size];
  return delta === 0
    ? perfect(size)
      ? "perfect"
      : "major"
    : delta === 1
      ? "augmented"
      : delta === -1 && !perfect(size)
        ? "minor"
        : "diminished";
}
export function theoryPool(
  task: TheoryTask,
  s: TheorySettings,
): TheoryQuestion[] {
  const directions: ("up" | "down")[] =
    s.direction === "both" ? ["up", "down"] : [s.direction];
  if (task.includes("degree") || task === "build-scale") {
    return s.keys.flatMap((key) => {
      const notes = scaleNotes(
        key,
        s.mode,
        (s.clef === "treble" ? 4 : 3) +
          (key === "Cb" && s.mode === "major" ? 1 : 0),
      );
      const keyName = `${name(notes[0])} ${s.mode === "minor" ? "natural minor" : "major"}`;
      return task === "build-scale"
        ? directions.map((direction) => ({
            ...notes[0],
            id: `scale-${key}-${s.mode}-${direction}`,
            key,
            keyName,
            notes: direction === "up" ? notes : [...notes].reverse(),
            direction,
          }))
        : s.degrees.map((degree) => ({
            ...notes[degree - 1],
            id: `degree-${key}-${s.mode}-${degree}`,
            key,
            keyName,
            notes,
            degree,
            direction: "up" as const,
          }));
    });
  }
  const low = POSITIONS.indexOf(s.low),
    high = POSITIONS.indexOf(s.high);
  return POSITIONS.slice(low, high + 1).flatMap((p) => {
    const root = noteAt(Number(p[1]) * 7 + LETTERS.indexOf(p[0]));
    return s.intervals.flatMap((size) =>
      directions.flatMap((direction) => {
        const natural = noteAt(
          staffIndex(root) + (direction === "up" ? 1 : -1) * (size - 1),
        );
        const qualities: Quality[] =
          s.quality === "number"
            ? [intervalQuality(root, natural, size)]
            : [
                ...(perfect(size)
                  ? ["perfect" as const]
                  : ["major" as const, "minor" as const]),
                ...(s.quality === "all"
                  ? ["augmented" as const, "diminished" as const]
                  : []),
              ];
        return qualities.flatMap((quality) => {
          const target = intervalTarget(root, size, direction, quality);
          if (
            !target ||
            staffIndex(target) <
              staffIndex(
                noteAt(Number(s.low[1]) * 7 + LETTERS.indexOf(s.low[0])),
              ) ||
            staffIndex(target) >
              staffIndex(
                noteAt(Number(s.high[1]) * 7 + LETTERS.indexOf(s.high[0])),
              ) ||
            (s.accidentals === "naturals" && target.modifier !== 0)
          )
            return [];
          return [
            {
              ...target,
              id: `interval-${root.id}-${size}-${direction}-${quality}`,
              notes: [root, target],
              key: "C",
              keyName: "",
              interval: size,
              quality,
              direction,
            },
          ];
        });
      }),
    );
  });
}
export function questionAnswer(
  q: TheoryQuestion,
  task: TheoryTask,
  s: TheorySettings,
) {
  return task === "name-degree"
    ? String(q.degree)
    : task === "name-interval"
      ? `${s.quality === "number" ? "" : q.quality + " "}${ordinal(q.interval!)}`
      : task === "build-scale"
        ? q.notes.map(name).join("–")
        : name(q);
}
export function theoryExplanation(
  q: TheoryQuestion,
  task: TheoryTask,
  s: TheorySettings,
) {
  if (task.includes("degree"))
    return `${name(q)} is degree ${q.degree} in ${q.keyName}: ${q.notes.slice(0, q.degree).map(name).join("–")}.`;
  if (task === "build-scale")
    return `${q.keyName}: ${q.notes.map(name).join("–")}.`;
  const a = q.notes[0],
    b = q.notes[1],
    sign = q.direction === "up" ? 1 : -1;
  const letters = Array.from(
    { length: q.interval! },
    (_, i) => noteAt(staffIndex(a) + sign * i).letter,
  ).join("–");
  return `${name(a)}–${name(b)}: ${letters} counts ${q.interval} letter ${q.interval === 1 ? "name" : "names"}, so a ${ordinal(q.interval!)}.${s.quality !== "number" ? ` ${Math.abs(b.midi - a.midi)} semitones: ${q.quality} ${ordinal(q.interval!)}.` : ""}`;
}
