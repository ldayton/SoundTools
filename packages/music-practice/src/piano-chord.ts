/** A compact, playable triad voicing; slash basses are the lowest chord tone. */
export function pianoChord(name: string) {
  const normalized = name.replaceAll("♯", "#").replaceAll("♭", "b");
  const match = /^([A-G])([#b]?)(m?)(?:\/([A-G])([#b]?))?$/.exec(normalized);
  if (!match) return undefined;
  const pitchClass = (letter: string, accidental: string) =>
    (({ C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 })[letter]! +
      (accidental === "#" ? 1 : accidental === "b" ? -1 : 0) +
      12) %
    12;
  const root = 48 + pitchClass(match[1], match[2]);
  let notes = [root, root + (match[3] ? 3 : 4), root + 7];
  if (match[4]) {
    const bass = pitchClass(match[4], match[5]);
    const index = notes.findIndex((note) => note % 12 === bass);
    if (index < 0)
      notes = [
        48 + bass,
        ...notes.map((note) => (note <= 48 + bass ? note + 12 : note)),
      ];
    else
      notes = [
        ...notes.slice(index),
        ...notes.slice(0, index).map((note) => note + 12),
      ];
  }
  notes.sort((a, b) => a - b);
  // Spell chord thirds and fifths by letter, including key-appropriate accidentals.
  const letters = "CDEFGAB";
  const rootIndex = letters.indexOf(match[1]);
  const tones = [0, 2, 4].map((step, index) => ({
    letter: letters[(rootIndex + step) % 7],
    pitch: (root + [0, match[3] ? 3 : 4, 7][index]) % 12,
  }));
  const labels = notes.map((note) => {
    const tone = tones.find((tone) => tone.pitch === note % 12);
    const letter = tone?.letter ?? match[4];
    const natural = pitchClass(letter, "");
    const difference = ((note % 12) - natural + 12) % 12;
    const offset = difference > 6 ? difference - 12 : difference;
    const accidental = offset > 0 ? "♯".repeat(offset) : "♭".repeat(-offset);
    const octave = Math.floor((note - offset - natural) / 12) - 1;
    return `${letter}${accidental}${octave}`;
  });
  return { notes, labels };
}
