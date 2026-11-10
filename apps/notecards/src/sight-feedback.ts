import type { TuneObject } from "abcjs";
export type PitchSpellings = Record<number, string>;
const chromatic = [
  "C",
  "C♯ / D♭",
  "D",
  "D♯ / E♭",
  "E",
  "F",
  "F♯ / G♭",
  "G",
  "G♯ / A♭",
  "A",
  "A♯ / B♭",
  "B",
];
export function pitchLabel(midi: number, spellings: PitchSpellings = {}) {
  return (
    spellings[midi] ??
    chromatic[midi % 12]
      .split(" / ")
      .map((n) => n + (Math.floor(midi / 12) - 1))
      .join(" / ")
  );
}
/** Pair sounding attacks with their written diatonic positions after abcjs resolves the key and bar accidentals. */
export function scoreSpellings(tune: TuneObject) {
  const result = new Map<number, PitchSpellings>();
  for (const line of tune.lines)
    for (const staff of line.staff || [])
      for (const voice of staff.voices || [])
        for (const item of voice) {
          if (item.el_type !== "note") continue;
          const attacks = [...(item.midiPitches || [])];
          const labels: PitchSpellings = {};
          for (const written of item.pitches || []) {
            if (written.endTie) continue;
            const sounding = attacks.shift();
            if (!sounding) continue;
            const degree = ((written.pitch % 7) + 7) % 7;
            const octave = 4 + Math.floor(written.pitch / 7);
            const natural = (octave + 1) * 12 + [0, 2, 4, 5, 7, 9, 11][degree];
            const accidental = sounding.pitch - natural;
            if (Math.abs(accidental) > 2) continue;
            labels[sounding.pitch] =
              "CDEFGAB"[degree] +
              (accidental < 0
                ? "♭".repeat(-accidental)
                : "♯".repeat(accidental)) +
              octave;
          }
          result.set(item.startChar, labels);
        }
  return result;
}
export function feedbackForNotes(
  played: number,
  expected: readonly number[],
  selected: readonly number[],
  result: "wrong" | "partial",
  spellings: PitchSpellings = {},
  held?: readonly number[],
) {
  const missing = expected.filter(
    (n) => !selected.includes(n) || (held && !held.includes(n)),
  );
  const names = (missing.length ? missing : expected).map((n) =>
    pitchLabel(n, spellings),
  );
  const list =
    names.length < 2
      ? names[0]
      : names.slice(0, -1).join(", ") + " and " + names.at(-1);
  const start = `You played ${pitchLabel(played, spellings)}; `;
  if (result === "partial") return start + `add ${list}.`;
  return (
    start +
    (expected.length === 1
      ? `play ${list}.`
      : `that note is extra. Still play ${list}.`)
  );
}
