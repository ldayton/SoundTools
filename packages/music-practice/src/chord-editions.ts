import {
  isFlyAway,
  flyFingers,
  flyGuitarPosition,
  flyLyricData,
  flyChanges,
} from "./ill-fly-away";
import {
  isChristAlone,
  christFingers,
  christGuitarPosition,
  christGuitarLyricData,
  christGuitarChordOffset,
} from "./in-christ-alone";
import {
  isAmazingGrace,
  graceFingers,
  graceGuitarPosition,
  graceLyricData,
  graceChordOffset,
} from "./amazing-grace";
export type ChordEditionId =
  "in-christ-alone" | "amazing-grace" | "ill-fly-away";
export function chordEdition(hymn: { id: string }) {
  if (isChristAlone(hymn))
    return {
      id: "in-christ-alone" as const,
      capo: 2,
      pickup: true,
      tempo: 70,
      shapes: "C, small F, G and Am",
      fingers: christFingers,
      position: christGuitarPosition,
      lyrics: christGuitarLyricData,
      chordOffset: christGuitarChordOffset,
    };
  if (isAmazingGrace(hymn))
    return {
      id: "amazing-grace" as const,
      capo: 0,
      pickup: true,
      tempo: 72,
      shapes: "G, C, D7 and Em",
      fingers: graceFingers,
      position: graceGuitarPosition,
      lyrics: graceLyricData,
      chordOffset: graceChordOffset,
    };
  if (isFlyAway(hymn))
    return {
      id: "ill-fly-away" as const,
      capo: 0,
      pickup: false,
      tempo: 80,
      shapes: "C, small F and G7",
      fingers: flyFingers,
      position: flyGuitarPosition,
      lyrics: flyLyricData,
      chordOffset: (bar: number) =>
        flyChanges.slice(0, bar).reduce((sum, b) => sum + b.length, 0),
    };
  return undefined;
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
