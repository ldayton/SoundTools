import abcjs, { type VoiceItemNote, type TuneObject } from "abcjs";

export type HymnLyricData = {
  stanzas: {
    number: number;
    label: string;
    // One entry per canonical melody note. Spaces within an entry request
    // repeated-pitch subdivisions; ~ is a word space; _ sustains the previous syllable.
    syllables: string[];
    endingBar?: number | null;
  }[];
  lyricSections: { start: number; end: number }[];
};
export type HymnLyricsSelection = {
  hymn: HymnLyricData;
  selected: readonly number[];
  offset: number;
  skipChordTies?: boolean;
};

export function validStanzas(
  input: unknown,
  count: number,
  fallback: readonly number[] = [1],
): number[] {
  const valid = (value: unknown): value is number =>
    Number.isInteger(value) && Number(value) >= 1 && Number(value) <= count;
  if (!Array.isArray(input)) return fallback.filter(valid);
  const result = [...new Set(input.filter(valid))].sort((a, b) => a - b);
  return input.length && !result.length ? fallback.filter(valid) : result;
}

/** Shared passages occupy one lyric row, independently of which stanza is first selected. */
export function hymnLyricRows({ hymn, selected }: HymnLyricsSelection) {
  const stanzas = validStanzas(selected, hymn.stanzas.length).map(
    (number) => hymn.stanzas[number - 1],
  );
  const rows = stanzas.map((stanza) => [...stanza.syllables]);
  for (const { start, end } of hymn.lyricSections) {
    const seen = new Set<string>();
    stanzas.forEach((stanza, index) => {
      const text = stanza.syllables
        .slice(start, end)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (seen.has(text)) rows[index].fill("*", start, end);
      else seen.add(text);
    });
  }
  return rows;
}

/** Split a held note for a syllabic translation without moving any bar or other voice. */
function subdivideLyricNote(raw: string, count: number, duration: number) {
  // Ignore annotations/decorations when locating the actual note or chord.
  const token = /"[^"\n]*"|![^!\n]*!|\+[^+\n]*\+|(\[[^\]\n]+\]|[=_^]*[A-Ga-g][,']*)(\d*(?:\/+\d*)?)/g;
  for (const match of raw.matchAll(token)) {
    if (!match[1]) continue;
    const length = match[2];
    const [numerator, denominator] = length.split("/");
    let n = Number(numerator || 1),
      d = length.includes("/") ? Number(denominator || 2) : 1;
    if (/\/\//.test(length)) throw Error("Unsupported syllabic note length");
    // Keep dotted notes on the beat: a dotted quarter becomes quarter +
    // eighth, and a dotted half becomes half + quarter, rather than syncopation.
    const weights = count === 2 && Number.isInteger(Math.log2(duration / 3))
      ? [2, 1] : Array(count).fill(1);
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    const gcd = (a: number, b: number): number => b ? gcd(b, a % b) : a;
    return raw.slice(0, match.index) + weights.map(weight => {
      const divisor = gcd(n * weight, d * total);
      const top = n * weight / divisor, bottom = d * total / divisor;
      return match[1] + (bottom === 1 ? String(top) : `${top}/${bottom}`);
    }).join(" ") +
      raw.slice(match.index! + match[0].length);
  }
  throw Error("Cannot subdivide this lyric note");
}

/** Add words and their syllabic rhythm before engraving measures their width. */
export function hymnLyricsAbc(
  abc: string,
  selection: HymnLyricsSelection,
): string {
  const rows = hymnLyricRows(selection);
  const hasMelismas = rows.some(row => row.some(token => token.split(/\s+/).includes("_")));
  const tune = abcjs.parseOnly(abc)[0];
  const notes = tune.lines
    .flatMap((line) => line.staff?.[0]?.voices?.[0] || [])
    .filter(
      (note): note is VoiceItemNote =>
        note.el_type === "note" && !!note.pitches?.length,
    );
  const byLine = new Map<number, { index: number; count: number }[]>();
  const edits = new Map<number, { start: number; end: number; text: string }[]>();
  const lines = abc.split("\n");
  let sourceOffset = 0;
  const starts = lines.map((line) => {
    const start = sourceOffset;
    sourceOffset += line.length + 1;
    return start;
  });
  let line = 0;
  let sourceIndex = 0;
  notes.forEach((note) => {
    while (line + 1 < starts.length && starts[line + 1] <= note.startChar!)
      line++;
    const indices = byLine.get(line) || [];
    const insertedTie =
      selection.skipChordTies &&
      note.pitches?.[0]?.endTie &&
      note.chord?.length;
    const index = insertedTie ? -1 : selection.offset + sourceIndex++;
    const count = Math.max(1, ...rows.map(row => (row[index] || "*").split(/\s+/).length));
    indices.push({ index, count });
    if (count > 1) {
      const start = note.startChar! - starts[line];
      const end = Math.min(note.endChar! - starts[line], lines[line].length);
      const changes = edits.get(line) || [];
      changes.push({start, end, text: subdivideLyricNote(lines[line].slice(start, end), count, note.duration)});
      edits.set(line, changes);
    }
    byLine.set(line, indices);
  });
  return lines
    .flatMap((text, index) => {
      if (/^w:/.test(text)) return [];
      const indices = byLine.get(index);
      if (!indices) return [text];
      for (const edit of (edits.get(index) || []).sort((a, b) => b.start - a.start))
        text = text.slice(0, edit.start) + edit.text + text.slice(edit.end);
      const lyrics = rows
        .map((row) => indices.flatMap(({ index, count }) => {
          const tokens = (row[index] || "*").split(/\s+/);
          return Array.from({ length: count }, (_, i) => {
            const token = tokens[i] || (tokens.at(-1) === "_" ? "_" : "*");
            // abcjs treats bare _ as a skip but does not retain its identity.
            // A literal marker keeps its row/position through reflow; the shared
            // renderer replaces it with an actual lyric extender after layout.
            return token === "_" ? "\\_" : token;
          });
        }))
        .filter((tokens) => hasMelismas || tokens.some((token) => token !== "*"));
      return [text, ...lyrics.map((tokens) => "w:" + tokens.join(" "))];
    })
    .join("\n");
}

/** Wrapping may leave a system containing only a shared refrain: remove its empty rows. */
export function compactHymnLyrics(tune: TuneObject) {
  for (const line of tune.lines) {
    const notes = (line.staff?.[0]?.voices?.[0] || []).filter(
      (note) => note.el_type === "note",
    );
    const active = new Set<number>();
    for (const note of notes)
      if (note.el_type === "note")
        note.lyric?.forEach((lyric: { syllable: string }, index: number) => {
          (lyric as typeof lyric & { hymnRow: number }).hymnRow = index;
          if (lyric.syllable.trim()) active.add(index);
        });
    for (const note of notes)
      if (note.el_type === "note" && note.lyric)
        note.lyric = note.lyric.filter((_: unknown, index: number) =>
          active.has(index),
        );
  }
}

/** A verse-specific ending affects music only when every selected stanza uses it. */
export function hymnEndingBar(
  hymn: HymnLyricData,
  selected: readonly number[] = [1],
): number | undefined {
  const stanzas = validStanzas(selected, hymn.stanzas.length).map(
    (number) => hymn.stanzas[number - 1],
  );
  if (!stanzas.length || stanzas.some((stanza) => !stanza.endingBar))
    return undefined;
  return Math.max(...stanzas.map((stanza) => stanza.endingBar!));
}
