import abcjs from "abcjs";
import type { HymnHands } from "./hymn-arrangements";
/** Keep whole-score voices until the requested part can be selected without losing its form. */
export function selectEditionVoice(abc: string, hands: HymnHands) {
  if (hands === "both") return abc;
  const names = [...abc.matchAll(/^V:\s*(\S+)/gm)].map((m) => m[1]);
  const selected = names[hands === "right" ? 0 : 1];
  let keepLyrics = true;
  return abc
    .split("\n")
    .filter((line) => {
      const voice = line.match(/^\s*(?:V:|\[V:)\s*([^\s\]]+)/)?.[1];
      if (voice) { keepLyrics = voice === selected; return keepLyrics; }
      return !/^w:/.test(line) || keepLyrics;
    })
    .map((line) =>
      /^%%(?:staves|score)/.test(line) ? `%%score ${selected}` : line,
    )
    .join("\n");
}
/** Instrument notation is independent of the tune's register and practice part. */
export function engraveEdition(
  abc: string,
  guitar: boolean,
  notation: "written" | "sounding",
  hands: HymnHands,
) {
  if (!guitar)
    return abc.replace(
      /^%%score (.*)$/m,
      (_, group: string) => `%%score {${group.replace(/[(){}]/g, "")}}`,
    );
  if (notation === "sounding") {
    abc = abcjs.strTranspose(abc, abcjs.parseOnly(abc), 12);
    abc = abc.replace(
      /^%%(?:staves|score).*$/m,
      (line) =>
        "%%score (" + (line.match(/(?:S\d|v\d)/g) || []).join(" ") + ")",
    );
    let voice = 0;
    abc = abc.replace(
      /^V:.*$/gm,
      (line) =>
        line + ` stems=${hands === "left" || voice++ > 0 ? "down" : "up"}`,
    );
  }
  return abc.replace(/clef=(?:treble(?!-8)|bass)\b/g, "clef=treble-8");
}

/** Standard Roman position marks, independent of which positions a song happens to use. */
export function isGuitarPositionMark(text: string) {
  return /^(?=[IVX]+$)X{0,3}(IX|IV|V?I{0,3})$/.test(text.trim());
}
/** Keep capo instructions explicit without repeating an existing part heading. */
export function editionTempoLabel(
  edition: { capo: number; tempo: number },
  parts: readonly string[] = [],
) {
  const capo = `Capo ${edition.capo}`;
  return `${edition.capo > 0 && !parts.includes(capo) ? `${capo} · ` : ""}♩ = ${edition.tempo}`;
}

export function capoAudio(
  audio: import("abcjs").AudioTracks,
  capo = 0,
): import("abcjs").AudioTracks {
  if (!capo) return audio;
  return {
    ...audio,
    tracks: audio.tracks.map((track) =>
      track.map((event) =>
        event.cmd === "note" ? { ...event, pitch: event.pitch + capo } : event,
      ),
    ),
  };
}
