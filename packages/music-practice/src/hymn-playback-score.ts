import abcjs, { type AudioTracks } from "abcjs";
import {
  arrangeHymn,
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
}) {
  const readAudio = (abc: string) =>
    abcjs.parseOnly(abc)[0].setUpAudio({
      qpm: 60,
      chordsOff: true,
      midiTranspose: options.transpose,
    });
  const arrange = (bars: number, section: number) =>
    arrangeHymn(options.hymn, options.arrangement, bars, section, options.hands)
      .abc;
  let elapsed = 0;
  const starts = Array.from({ length: options.sections }, (_, section) => {
    const start = elapsed;
    const audio =
      section === options.section
        ? options.audio
        : readAudio(arrange(options.sectionBars, section));
    elapsed += audio.totalDuration * 4;
    return start;
  });
  return {
    starts,
    audio:
      options.sections === 1
        ? options.audio
        : readAudio(arrange(options.totalBars, 0)),
    timing: {
      meter: options.hymn.meter,
      pickup: abcjs.parseOnly(options.abc)[0].getPickupLength() * 4,
    },
  };
}
