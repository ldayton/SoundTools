// Equal-tempered MIDI pitches are independent of their written musical names.
export const SHARPS = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const FLATS = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];
// Stable, familiar names for pitch selection. F♯/G♭ is the six-accidental tie.
export const PITCH_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
const MAJOR_SCALES = [
  ['C', 'D', 'E', 'F', 'G', 'A', 'B'],
  ['D♭', 'E♭', 'F', 'G♭', 'A♭', 'B♭', 'C'],
  ['D', 'E', 'F♯', 'G', 'A', 'B', 'C♯'],
  ['E♭', 'F', 'G', 'A♭', 'B♭', 'C', 'D'],
  ['E', 'F♯', 'G♯', 'A', 'B', 'C♯', 'D♯'],
  ['F', 'G', 'A', 'B♭', 'C', 'D', 'E'],
  ['F♯', 'G♯', 'A♯', 'B', 'C♯', 'D♯', 'E♯'],
  ['G', 'A', 'B', 'C', 'D', 'E', 'F♯'],
  ['A♭', 'B♭', 'C', 'D♭', 'E♭', 'F', 'G'],
  ['A', 'B', 'C♯', 'D', 'E', 'F♯', 'G♯'],
  ['B♭', 'C', 'D', 'E♭', 'F', 'G', 'A'],
  ['B', 'C♯', 'D♯', 'E', 'F♯', 'G♯', 'A♯'],
];
const NATURALS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const pitchClass = (midi: number) => ((midi % 12) + 12) % 12;
const SCALE_NAMES = MAJOR_SCALES.map((scale, tonic) => {
  const names = [...(scale.some((name) => name.includes('♭')) ? FLATS : SHARPS)];
  for (const [degree, interval] of [0, 2, 4, 5, 7, 9, 11].entries())
    names[(tonic + interval) % 12] = scale[degree];
  return names;
});

function withOctave(midi: number, spelling: string): string {
  const accidental = spelling.includes('♯') ? 1 : spelling.includes('♭') ? -1 : 0;
  // Derive the written octave from the letter, including enharmonic boundaries.
  const octave = (midi - NATURALS[spelling[0]] - accidental) / 12 - 1;
  return `${spelling}${octave}`;
}

/** Without a tonic: stable selector name. With a tonic: a major-key spelling. */
export function noteName(midi: number, tonic?: number): string {
  const names = tonic === undefined ? PITCH_NAMES : SCALE_NAMES[pitchClass(tonic)];
  return withOctave(midi, names[pitchClass(midi)]);
}

/** The other common black-key name, without adding theoretical E♯/C♭ to selectors. */
export function noteAlternative(midi: number): string | null {
  const pc = pitchClass(midi);
  if (SHARPS[pc] === FLATS[pc]) return null;
  const primary = PITCH_NAMES[pc];
  return withOctave(midi, primary === SHARPS[pc] ? FLATS[pc] : SHARPS[pc]);
}

export function noteChoiceLabel(midi: number): string {
  return withOctave(midi, SHARPS[pitchClass(midi)]);
}

export function parseNote(value: string): number | null {
  const match = /^\s*([a-g])([#♯b♭]?)([1-7])\s*$/i.exec(value);
  if (!match) return null;
  const pitches: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const pitch = pitches[match[1].toUpperCase()];
  const accidental = ['#', '♯'].includes(match[2]) ? 1 : ['b', '♭'].includes(match[2]) ? -1 : 0;
  const midi = (Number(match[3]) + 1) * 12 + pitch + accidental;
  return midi >= 24 && midi <= 96 ? midi : null;
}
