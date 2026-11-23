/** Rebuild the bundled library from the checked-in ABC sources and their credits. */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import abcjs from "abcjs";
import { createHymnIdentityIndex } from "../src/hymn-identifiers";
const root = fileURLToPath(
  new URL("../../../apps/songalong/", import.meta.url),
);
const curated = JSON.parse(
  readFileSync(root + "hymns/catalogue.json", "utf8"),
) as {
  id: string;
  slug: string;
  legacyIds?: string[];
  editionKey?: string;
  title: string;
  file: string;
  folder: string;
  aliases?: string[];
  feel?: "swing";
  source?: "tab-music" | "user-supplied" | "user-supplied-score";
  sourceDetails?: string;
  defaultArrangement?: "original";
  accompanimentInstrument?: "organ";
  vocalTracks?: number[];
  sourceUrl?: string;
  referenceUrl?: string;
  referenceDetails?: string;
}[];
createHymnIdentityIndex(curated);
type LyricOverride = {
  shared?: number[][];
  stanzas: { label: string; syllables: string; endingBar?: number }[];
};
const lyricOverrides = JSON.parse(
  readFileSync(root + "hymns/lyrics.json", "utf8"),
) as Record<string, LyricOverride>;
function cleanSource(source: string, allLyrics = false) {
  let firstLyric = true;
  return (
    source
      .split("\n")
      .flatMap((line) => {
        if (/^\[V:/.test(line)) {
          firstLyric = true;
          return [
            line
              .replace(/\[Q:[^\]]+\]/g, "")
              .replace(/!(sintro|eintro)!/g, "")
              .replace(/!ferm!/g, "!fermata!")
              .replace(/!\(\)!/g, "")
              .replace(/\('/g, "(")
              .replace(/\.-/g, "-")
              .replace(/\.\(/g, "("),
          ];
        }
        if (/^w:/.test(line)) {
          if (!firstLyric && !allLyrics) return [];
          firstLyric = false;
          return [line.replace(/^w:\s*\d+\.\s*~?/, "w: ")];
        }
        if (/^(X:|T:|M:|L:|K:|V:|Q:|%%staves)/.test(line))
          return [line.replace(/\s+%.*$/, "")];
        return [];
      })
      .join("\n") + "\n"
  );
}
function stanzaData(source: string, id: string) {
  const tune = abcjs.parseOnly(cleanSource(source, true))[0];
  if (tune.warnings?.length) throw Error(id + ": " + tune.warnings.join("; "));
  const parts = tune.lines.flatMap((line) => {
    const notes = (line.staff?.[0]?.voices?.[0] || []).filter(
      (n) => n.el_type === "note" && n.pitches?.length,
    );
    return notes.length ? [notes] : [];
  });
  const count = Math.max(
    1,
    ...parts
      .flat()
      .map((n) => (n.el_type === "note" ? n.lyric?.length || 0 : 0)),
  );
  const token = (lyric?: { syllable: string; divider: string }) =>
    lyric?.syllable
      ? lyric.syllable.replace(/ /g, "~") + (lyric.divider === "-" ? "-" : "")
      : "*";
  const rows = Array.from({ length: count }, (_, index) =>
    parts.flatMap((notes) => {
      const lines = Math.max(
        0,
        ...notes.map((n) => (n.el_type === "note" ? n.lyric?.length || 0 : 0)),
      );
      return notes.map((n) =>
        n.el_type === "note" ? token(n.lyric?.[lines === 1 ? 0 : index]) : "*",
      );
    }),
  );
  let offset = 0;
  const lyricSections = parts.map((notes) => {
    const start = offset;
    offset += notes.length;
    return { start, end: offset };
  });
  const override = lyricOverrides[id];
  const plain = (tokens: string[]) =>
    tokens
      .filter((t) => t !== "*")
      .join(" ")
      .replace(/-\s+/g, "")
      .replace(/~/g, " ");
  const stanzas = override
    ? override.stanzas.map((stanza) => ({
        label: stanza.label,
        endingBar: stanza.endingBar ?? null,
        syllables: stanza.syllables.split(/\s+/),
      }))
    : rows.map((syllables) => ({
        endingBar: null,
        label:
          plain(syllables).split(/\s+/).slice(0, 8).join(" ") || "Instrumental",
        syllables,
      }));
  for (const stanza of stanzas)
    if (stanza.syllables.length !== offset)
      throw Error(
        `${id}: stanza '${stanza.label}' has ${stanza.syllables.length} syllables/slots, expected ${offset}`,
      );
  const seen = new Set<string>();
  return {
    stanzas: stanzas
      .filter((s) => {
        const text = plain(s.syllables)
          .toLowerCase()
          .replace(/[^\p{L}\p{N}]+/gu, "");
        if (seen.has(text)) return false;
        seen.add(text);
        return true;
      })
      .map((stanza, index) => ({ ...stanza, number: index + 1 })),
    lyricSections: [
      ...lyricSections,
      ...(override?.shared || []).map(([start, end]) => ({ start, end })),
    ],
  };
}
const library = curated.map((entry) => {
  const bytes = readFileSync(root + "hymns/source/" + entry.file);
  let source: string;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    source = new TextDecoder("windows-1252").decode(bytes);
  }
  if (entry.source === "tab-music") {
    if (
      !entry.sourceUrl?.startsWith(
        "https://github.com/ldayton/tab-music/blob/",
      ) ||
      !/^% Adapted from ldayton\/tab-music at [a-f0-9]{40}$/m.test(source) ||
      !/^C: copyright: Rights remain with /m.test(source)
    )
      throw Error("Missing tab-music provenance: " + entry.id);
  } else if (entry.source === "user-supplied") {
    if (
      !entry.sourceUrl?.startsWith("https://") ||
      !/^% Transcribed from user-supplied score and tablature\.$/m.test(
        source,
      ) ||
      !/^C: copyright: Rights remain with /m.test(source)
    )
      throw Error("Missing user-supplied provenance: " + entry.id);
  } else if (entry.source === "user-supplied-score") {
    if (
      !entry.sourceDetails?.trim() ||
      !/^% Transcribed from user-supplied printed score\.$/m.test(source) ||
      !/^C: copyright: Rights remain with /m.test(source)
    )
      throw Error("Missing printed-score provenance: " + entry.id);
  } else if (!/^C: copyright: public domain\./im.test(source))
    throw Error("Uncleared score: " + entry.id);
  const clean = cleanSource(source);
  const parsed = abcjs.parseOnly(clean)[0];
  if (parsed.warnings?.length)
    throw Error(entry.id + ": " + parsed.warnings.join("; "));
  const key = clean.match(/^K:\s*(\S+)/m)![1];
  const meter = clean.match(/^M:\s*(\S+)/m)![1];
  const melodyLines: string[] = [
    `X:1`,
    `T:${entry.title}`,
    `M:${meter}`,
    ...(entry.feel === "swing" ? ['Q:"Swing"'] : []),
    "L:1/64",
    `K:${key}`,
  ];
  for (const line of parsed.lines) {
    const voice = line.staff?.[0]?.voices?.[0];
    if (!voice) continue;
    let beaming = false;
    const music: string[] = [],
      lyrics: string[] = [];
    for (const item of voice) {
      if (item.el_type === "bar") {
        const bars: Record<string, string> = {
          bar_thin: "|",
          bar_thin_thin: "||",
          bar_thin_thick: "|]",
          bar_left_repeat: "|:",
          bar_right_repeat: ":|",
          bar_dbl_repeat: ":|:",
        };
        if (!bars[item.type] || item.startEnding)
          throw Error("Unsupported bar in " + entry.id);
        music.push(bars[item.type]);
      } else if (item.el_type === "note") {
        const note = item as typeof item & {
          pitches?: {
            name: string;
            pitch: number;
            startTie?: object;
            startSlur?: unknown[];
            endSlur?: unknown[];
          }[];
          startBeam?: boolean;
          endBeam?: boolean;
          decoration?: string[];
          lyric?: { syllable: string; divider: string }[];
        };

        if (note.startTriplet) throw Error("Unsupported tuplet in " + entry.id);
        const duration = note.duration * 64;
        if (!Number.isInteger(duration))
          throw Error("Unsupported duration in " + entry.id);
        const top = note.pitches?.reduce((a, b) => (a.pitch > b.pitch ? a : b));
        const token =
          "(".repeat(top?.startSlur?.length || 0) +
          (note.decoration || []).map((d) => `!${d}!`).join("") +
          (top ? top.name.match(/^[\^_=]*[A-Ga-g][',]*/)?.[0] : "z") +
          String(duration) +
          (top?.startTie ? "-" : "") +
          ")".repeat(top?.endSlur?.length || 0);
        if (beaming) music[music.length - 1] += token;
        else music.push(token);
        beaming = (beaming || !!note.startBeam) && !note.endBeam;
        if (top) {
          const lyric = note.lyric?.[0];
          lyrics.push(
            lyric?.syllable
              ? lyric.syllable.replace(/ /g, "~") +
                  (lyric.divider === "-" ? "-" : "")
              : "*",
          );
        }
      } else if (!["tempo", "stem", "scale"].includes(item.el_type)) {
        throw Error(
          "Unsupported melody item in " + entry.id + ": " + item.el_type,
        );
      }
    }
    melodyLines.push(music.join(" "), "w: " + lyrics.join(" "));
  }
  const melody = melodyLines.join("\n") + "\n";
  const check = abcjs.parseOnly(melody)[0];
  if (check.warnings?.length)
    throw Error(entry.id + ": " + check.warnings.join("; "));
  return {
    ...entry,
    ...stanzaData(source, entry.id),
    key,
    meter,
    credits: source
      .split("\n")
      .filter((l) => /^C: (Words:|Music:|Tabledited by |copyright:)/.test(l))
      .map((l) => l.slice(3)),
    sourceUrl:
      entry.sourceUrl ||
      (entry.source === "user-supplied-score"
        ? ""
        : "https://openhymnal.org/Abc/" + entry.file),
    melody,
    harmony: clean,
  };
});
writeFileSync(
  fileURLToPath(new URL("../src/hymns.json", import.meta.url)),
  JSON.stringify(library, null, 2) + "\n",
);
console.log(
  `Imported ${library.length} hymns with source credits and aligned lyrics.`,
);
