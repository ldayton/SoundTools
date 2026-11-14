/** Rebuild the bundled library from the checked-in ABC sources and their credits. */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import abcjs from "abcjs";
const root = fileURLToPath(
  new URL("../../../apps/songalong/", import.meta.url),
);
const curated = JSON.parse(
  readFileSync(root + "hymns/catalogue.json", "utf8"),
) as {
  id: string;
  title: string;
  file: string;
  folder: string;
  aliases?: string[];
  source?: "tab-music";
  sourceUrl?: string;
}[];
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
  } else if (!/^C: copyright: public domain\./im.test(source))
    throw Error("Uncleared score: " + entry.id);
  let firstLyric = true;
  const clean =
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
          if (!firstLyric) return [];
          firstLyric = false;
          return [line.replace(/^w:\s*\d+\.~/, "w: ")];
        }
        if (/^(X:|T:|M:|L:|K:|V:|%%staves)/.test(line))
          return [line.replace(/\s+%.*$/, "")];
        return [];
      })
      .join("\n") + "\n";
  const parsed = abcjs.parseOnly(clean)[0];
  if (parsed.warnings?.length)
    throw Error(entry.id + ": " + parsed.warnings.join("; "));
  const key = clean.match(/^K:\s*(\S+)/m)![1];
  const meter = clean.match(/^M:\s*(\S+)/m)![1];
  const melodyLines: string[] = [
    `X:1`,
    `T:${entry.title}`,
    `M:${meter}`,
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
    key,
    meter,
    credits: source
      .split("\n")
      .filter((l) => /^C: (Words:|Music:|copyright:)/.test(l))
      .map((l) => l.slice(3)),
    sourceUrl: entry.sourceUrl || "https://openhymnal.org/Abc/" + entry.file,
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
