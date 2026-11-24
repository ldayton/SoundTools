import abcjs, { type VoiceItemNote, type TuneObject } from "abcjs";

export type HymnLyricData = {
  stanzas: {
    number: number;
    label: string;
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

/** A printed tie can apply to a sustained syllable in one verse but separate
 * syllables in another. Adapt only the lead melody for the active stanza;
 * archived music, accompaniment and unconditional ties remain intact. */
export function hymnStanzaAbc(abc: string, hymn: HymnLyricData, stanza: number, offset = 0): string {
  const words = hymn.stanzas.find(s => s.number === stanza)?.syllables;
  if (!words) return abc;
  const split = new Set(words.flatMap((word, index) =>
    word && word !== "*" && hymn.stanzas.some(s => s.syllables[index] === "*") ? [index] : []));
  if (!split.size) return abc;
  const notes = abcjs.parseOnly(abc)[0].lines.flatMap(line => line.staff?.[0]?.voices?.[0] || [])
    .filter((note): note is VoiceItemNote => note.el_type === "note" && !!note.pitches?.length);
  const edits: {start: number; end: number; text: string}[] = [];
  notes.forEach((note, index) => {
    const previous = notes[index - 1];
    if (!split.has(offset + index) || note.pitches?.length !== 1 || !note.pitches[0].endTie ||
      previous?.pitches?.length !== 1 || !previous.pitches[0].startTie) return;
    const text = abc.slice(previous.startChar!, previous.endChar!).replace(
      /"[^"\n]*"|![^!]*!|([_^=]*[A-Ga-g][,']*(?:\d+(?:\/\d*)?|\/+\d*)?)-/g,
      (token, pitch: string | undefined) => pitch ?? token,
    );
    edits.push({start: previous.startChar!, end: previous.endChar!, text});
  });
  for (const edit of edits.reverse()) abc = abc.slice(0, edit.start) + edit.text + abc.slice(edit.end);
  return abc;
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

/** Add words before engraving measures their width. Music and source ABC stay untouched. */
export function hymnLyricsAbc(
  abc: string,
  selection: HymnLyricsSelection,
): string {
  const rows = hymnLyricRows(selection);
  const tune = abcjs.parseOnly(abc)[0];
  const notes = tune.lines
    .flatMap((line) => line.staff?.[0]?.voices?.[0] || [])
    .filter(
      (note): note is VoiceItemNote =>
        note.el_type === "note" && !!note.pitches?.length,
    );
  const byLine = new Map<number, number[]>();
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
    indices.push(insertedTie ? -1 : selection.offset + sourceIndex++);
    byLine.set(line, indices);
  });
  return lines
    .flatMap((text, index) => {
      if (/^w:/.test(text)) return [];
      const indices = byLine.get(index);
      if (!indices) return [text];
      const lyrics = rows
        .map((row) => indices.map((i) => row[i] || "*"))
        .filter((tokens) => tokens.some((token) => token !== "*"));
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
