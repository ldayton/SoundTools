/** Reviewed source-piano harmonies at 1/64-note offsets from the pickup.
 * Instrumental editions may deliberately use a simpler reharmonization.
 */
export const vocalHarmonyGuides: Readonly<Record<string, Readonly<Record<number, string>>>> = {
  // Respect the print's C-sharp/E-natural and F-sharp/A-natural spelling.
  "the-old-rugged-cross": {20:"C#dim7/Bb",68:"F#dim7/Eb",212:"C#dim7/Bb",260:"F#dim7/Eb",448:"C#dim7/Bb"},
  "fairest-lord-jesus": {176:"C7/Bb",672:"C7/G"},
  "in-the-sweet-by-and-by": {912:"F/C"},
  "are-you-washed-in-the-blood": {
    256: "Ab/Eb", 400: "Ab/Eb", 768: "Ab/Eb", 912: "Ab/Eb",
  },
  "blessed-assurance": {
    192: "A/E", 240: "A", 456: "Em/G", 480: "Em/G",
    792: "A/E", 816: "A", 1032: "Em/G", 1056: "Em/G",
  },
  "joy-to-the-world": {
    56: "Em/G", 64: "D/A", 160: "A", 416: "A",
    536: "Em/G", 544: "D/A",
  },
};
