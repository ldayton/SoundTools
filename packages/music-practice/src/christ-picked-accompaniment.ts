/** Capo-relative C-family grips, written in guitar's octave-treble notation.
 * Entries are bass, then strings 3–1; the open fourth string is always D.
 */
const grips: Record<string, readonly [string, string]> = {
  D: ["C", "Gce"], G: ["F", "Acf"], A: ["G,", "GBg"],
  "D/F#": ["E,", "Gce"], Bm: ["A,", "Ace"], Em: ["D", "Adf"],
  A7: ["G,", "GBf"], "D/A": ["G,", "Gce"],
};
type Change = {at: number; chord: string};
/** Four quarter-note plucks per chord, independent of the 3/4 bar grid.
 * A repeated label is a held chord. A change truncates the cycle; a barline
 * splits a sustained pluck with a tie, never a new attack or a cycle reset.
 */
export function christPickedBars(changes: readonly (readonly Change[])[], lengths: readonly number[]) {
  let elapsed = 0;
  const spans: {at: number; end: number; chord: string}[] = [];
  changes.forEach((bar, i) => {
    for (const change of bar) {
      const at = elapsed + change.at;
      if (spans.at(-1)?.chord === change.chord) continue;
      if (spans.length) spans.at(-1)!.end = at;
      spans.push({at, end: 0, chord: change.chord});
    }
    elapsed += lengths[i];
  });
  if (spans.length) spans.at(-1)!.end = elapsed;
  const events = spans.flatMap(span => {
    const grip = grips[span.chord];
    if (!grip && span.chord) throw Error(`Missing picked grip: ${span.chord}`);
    return Array.from({length: Math.ceil((span.end - span.at) / 16)}, (_, beat) => {
      const phase = beat % 4, at = span.at + beat * 16;
      return {at, end: Math.min(at + 16, span.end), chord: beat === 0 ? span.chord : "",
        pitches: !grip ? "z" : phase === 0 ? `[${grip[0]}${grip[1]}]` : phase === 2 ? `[${grip[1]}]` : "D"};
    });
  });
  elapsed = 0;
  const shapes: Record<string,string> = {D:"C",G:"F",A:"G","D/F#":"C/E",Bm:"Am",Em:"Dm",A7:"G7","D/A":"C/G"};
  return lengths.map(length => {
    const start = elapsed, end = start + length;
    elapsed = end;
    return events.filter(e => e.at < end && e.end > start).map(e => {
      const duration = Math.min(e.end, end) - Math.max(e.at, start);
      return `${e.chord && e.at >= start ? `"${shapes[e.chord]}"` : ""}${e.pitches}${duration}${e.end > end ? "-" : ""}`;
    }).join(" ");
  });
}
/** Alternate capo shapes keep their reviewed accompaniment. */
export function usesChristPicking(editionKey: string | undefined, transpose: number, capo?: number) {
  return editionKey === "in-christ-alone" && (capo === undefined || capo === ((2 + transpose) % 12 + 12) % 12);
}
