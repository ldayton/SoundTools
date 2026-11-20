import { swingAudio } from "./hymn-swing";
import abcjs, { type AudioTracks } from "abcjs";
import { hymnEndingBar, validStanzas } from "./hymn-lyrics";
import {
  arrangeHymn,
  isGuitarArrangement,
  type Arrangement,
  type HymnHands,
} from "./hymn-arrangements";

/** Build one continuous stream so tied notes survive display-section boundaries. */
export function hymnPlaybackScore(options: {
  hymn: Parameters<typeof arrangeHymn>[0];
  arrangement: Arrangement;
  sectionBars: number;
  section: number;
  hands: HymnHands;
  totalBars: number;
  sections: number;
  abc: string;
  audio: AudioTracks;
  transpose: number;
  endingBar?: number;
  stanzas?: readonly number[];
}) {
  const readAudio = (abc: string) =>
    swingAudio(abcjs.parseOnly(abc)[0].setUpAudio({
      qpm: 60,
      chordsOff: true,
      midiTranspose:
        options.transpose - (isGuitarArrangement(options.arrangement) ? 12 : 0),
    }), options.hymn.feel === "swing");
  const currentAudio = swingAudio(options.audio, options.hymn.feel === "swing");
  // Schedule the entire song on one audio clock. Restarting the transport at
  // stanza boundaries would add preparation/lead-in gaps and another count-in.
  if (options.stanzas && options.sectionBars === 0) {
    const selected = validStanzas(options.stanzas, options.hymn.stanzas.length);
    let offset = 0;
    const parts = (selected.length ? selected : [0]).map((number) => {
      const abc = arrangeHymn(
        options.hymn,
        options.arrangement,
        0,
        0,
        options.hands,
        number ? hymnEndingBar(options.hymn, [number]) : undefined,
        options.transpose,
      ).abc;
      const audio = readAudio(abc);
      const start = offset;
      offset += audio.totalDuration;
      return { audio, number, start: start * 4, end: offset * 4 };
    });
    const first = parts[0].audio;
    return {
      starts: [0],
      verses: parts.map(({ number, start, end }) => ({ number, start, end })),
      audio: {
        ...first,
        totalDuration: offset,
        tracks: first.tracks.map((_, index) =>
          parts.flatMap(({ audio, start }, pass) =>
            (audio.tracks[index] || []).flatMap<
              AudioTracks["tracks"][number][number]
            >((item) =>
              item.cmd === "note"
                ? [{ ...item, start: item.start + start / 4 }]
                : pass === 0
                  ? [item]
                  : [],
            ),
          ),
        ),
      } as AudioTracks,
      timing: {
        meter: options.hymn.meter,
        pickup: abcjs.parseOnly(options.abc)[0].getPickupLength() * 4,
      },
    };
  }
  const arrange = (bars: number, section: number) =>
    arrangeHymn(
      options.hymn,
      options.arrangement,
      bars,
      section,
      options.hands,
      options.endingBar,
      options.transpose,
    ).abc;
  let elapsed = 0;
  const starts = Array.from({ length: options.sections }, (_, section) => {
    const start = elapsed;
    const audio =
      section === options.section
        ? currentAudio
        : readAudio(arrange(options.sectionBars, section));
    elapsed += audio.totalDuration * 4;
    return start;
  });
  return {
    verses: [] as { number: number; start: number; end: number }[],
    starts,
    audio:
      options.sections === 1
        ? currentAudio
        : readAudio(arrange(options.totalBars, 0)),
    timing: {
      meter: options.hymn.meter,
      pickup: abcjs.parseOnly(options.abc)[0].getPickupLength() * 4,
    },
  };
}
