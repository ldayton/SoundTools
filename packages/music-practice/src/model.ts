export type Letter = "C" | "D" | "E" | "F" | "G" | "A" | "B";
export type Modifier = -1 | 0 | 1;
export type Card = {
  id: string;
  letter: Letter;
  octave: number;
  modifier: Modifier;
};
export type Stats = Record<string, { attempts: number; correct: number }>;
export type Settings = { low: string; high: string; key: string };
const naturals: Record<Letter, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};
export const SESSION_SIZE = 12;
export const ROUND_LENGTHS = [12, 24, 36, 48] as const;
export type RoundLength = (typeof ROUND_LENGTHS)[number];
export const symbol = (modifier: Modifier) =>
  modifier === 1 ? "♯" : modifier === -1 ? "♭" : "";
export const name = (card: Pick<Card, "letter" | "modifier">) =>
  card.letter + symbol(card.modifier);
export function matches(card: Card, letter: Letter, modifier: Modifier) {
  const pc = (n: number) => (n + 12) % 12;
  return (
    pc(naturals[card.letter] + card.modifier) ===
    pc(naturals[letter] + modifier)
  );
}
// Guitar sounds one octave below written treble: its bottom line is E3; the lower limit is E2.
export const POSITIONS = [
  "E2",
  "F2",
  "G2",
  "A2",
  "B2",
  "C3",
  "D3",
  "E3",
  "F3",
  "G3",
  "A3",
  "B3",
  "C4",
  "D4",
  "E4",
  "F4",
  "G4",
  "A4",
];
export const KEYS = [
  { id: "C", label: "C major", count: 0 },
  { id: "G", label: "G major · 1 sharp", count: 1 },
  { id: "D", label: "D major · 2 sharps", count: 2 },
  { id: "A", label: "A major · 3 sharps", count: 3 },
  { id: "E", label: "E major · 4 sharps", count: 4 },
  { id: "B", label: "B major · 5 sharps", count: 5 },
  { id: "F#", label: "F♯ major · 6 sharps", count: 6 },
  { id: "C#", label: "C♯ major · 7 sharps", count: 7 },
  { id: "F", label: "F major · 1 flat", count: -1 },
  { id: "Bb", label: "B♭ major · 2 flats", count: -2 },
  { id: "Eb", label: "E♭ major · 3 flats", count: -3 },
  { id: "Ab", label: "A♭ major · 4 flats", count: -4 },
  { id: "Db", label: "D♭ major · 5 flats", count: -5 },
  { id: "Gb", label: "G♭ major · 6 flats", count: -6 },
  { id: "Cb", label: "C♭ major · 7 flats", count: -7 },
];
export function deck(settings: Settings, positions = POSITIONS): Card[] {
  const low = positions.indexOf(settings.low),
    high = positions.indexOf(settings.high);
  const key = KEYS.find((k) => k.id === settings.key);
  if (low < 0 || high < low || !key) throw Error("Invalid note range or key");
  const altered = (key.count < 0 ? "BEADGCF" : "FCGDAEB").slice(
    0,
    Math.abs(key.count),
  );
  return positions.slice(low, high + 1).map((position) => {
    const letter = position[0] as Letter,
      octave = Number(position[1]);
    const modifier: Modifier = altered.includes(letter)
      ? key.count < 0
        ? -1
        : 1
      : 0;
    return { id: position + ":" + modifier, letter, octave, modifier };
  });
}
export function readProgress(raw: string | null): {
  stats: Stats;
  settings: Settings;
} {
  const defaults = {
    stats: {} as Stats,
    settings: { low: "E3", high: "F4", key: "C" },
  };
  try {
    const data = JSON.parse(raw || "null");
    if (![1, 2].includes(data?.version)) return defaults;
    // Keep the same visual cards when migrating written octaves to guitar pitches.
    const lowerOctave = (value: string) =>
      value.replace(
        /^([A-G])([3-5])/,
        (_, letter, octave) => letter + (Number(octave) - 1),
      );
    if (data.version === 1) {
      for (const field of ["low", "high"])
        if (typeof data.settings?.[field] === "string")
          data.settings[field] = lowerOctave(data.settings[field]);
      data.stats = Object.fromEntries(
        Object.entries(data.stats || {}).map(([key, value]) => [
          lowerOctave(key),
          value,
        ]),
      );
    }
    const stats: Stats = {};
    for (const [key, s] of Object.entries(data.stats || {}) as [string, any][])
      if (
        /^[A-G][234]:-?[01]$/.test(key) &&
        Number.isSafeInteger(s?.attempts) &&
        Number.isSafeInteger(s?.correct) &&
        s.attempts > 0 &&
        s.correct >= 0 &&
        s.correct <= s.attempts
      )
        stats[key] = { attempts: s.attempts, correct: s.correct };
    const legacy = data.settings?.ledger === true;
    const low = POSITIONS.includes(data.settings?.low)
      ? data.settings.low
      : legacy
        ? "C3"
        : "E3";
    const high = POSITIONS.includes(data.settings?.high)
      ? data.settings.high
      : legacy
        ? "A4"
        : "F4";
    return {
      stats,
      settings: {
        low: POSITIONS.indexOf(low) <= POSITIONS.indexOf(high) ? low : "E3",
        high: POSITIONS.indexOf(low) <= POSITIONS.indexOf(high) ? high : "F4",
        key: KEYS.some((k) => k.id === data.settings?.key)
          ? data.settings.key
          : "C",
      },
    };
  } catch {
    return defaults;
  }
}
