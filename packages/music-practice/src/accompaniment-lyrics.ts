import abcjs from "abcjs";
import type { HymnLyricData } from "./hymn-lyrics";
/** Group canonical verse syllables by written chord onset, retaining pickup and ties. */
export function accompanimentLyrics(
  hymn: HymnLyricData & { harmony: string },
  changes: number[],
  sharedEnding?: number,
): HymnLyricData {
  let time = 0;
  const melody = abcjs
    .parseOnly(hymn.harmony)[0]
    .lines.flatMap((line) => line.staff?.[0]?.voices?.[0] || [])
    .flatMap((note) => {
      if (note.el_type !== "note") return [];
      const start = time;
      time += note.duration;
      return note.pitches?.length ? [start] : [];
    });
  const groupFor = (start: number) =>
    Math.max(
      0,
      changes.reduce(
        (last, change, index) => (change <= start + 1e-7 ? index : last),
        -1,
      ),
    );
  return {
    stanzas: hymn.stanzas.map((stanza) => {
      const chunks = changes.map(() => [] as string[]);
      melody.forEach((start, index) => {
        const syllable = stanza.syllables[index];
        if (syllable && syllable !== "*" && syllable !== "_")
          chunks[groupFor(start)].push(...syllable.split(/\s+/));
      });
      return {
        ...stanza,
        syllables: chunks.map(
          (tokens) =>
            tokens.reduce(
              (text, token) =>
                text.endsWith("-")
                  ? text.slice(0, -1) + token
                  : text
                    ? text + "~" + token
                    : token,
              "",
            ) || "*",
        ),
      };
    }),
    lyricSections:
      sharedEnding === undefined
        ? []
        : [{ start: sharedEnding, end: changes.length }],
  };
}
