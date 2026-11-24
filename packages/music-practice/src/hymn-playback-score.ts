import {capoAccompanimentAbc,type CapoChoice} from "./guitar-capo";
import { instrumentEdition } from "./instrument-editions";
import { abcPlaybackStaves, mutePlaybackStaves } from "./hymn-playback-staves";
import { chordEdition, capoAudio } from "./chord-editions";
import { swingAudio } from "./hymn-swing";
import { guitarSustainAudio, type GuitarSustainEvent } from "./guitar-sustain";
import abcjs, { type AudioTracks, type VoiceItem } from "abcjs";
import { hymnEndingBar, hymnStanzaAbc, hymnLyricsAbc, validStanzas } from "./hymn-lyrics";
import {
  arrangeHymn,
  hymnMelodyOffset,
  isGuitarArrangement,
  guitarMidiOffset,
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
  capoChoice?: CapoChoice;
  endingBar?: number;
  stanzas?: readonly number[];
  stanza?: number;
  mutedStaves?: readonly number[];
}) {
  const rhythmicLyrics = validStanzas(options.stanzas, options.hymn.stanzas.length)
    .some(number => options.hymn.stanzas[number - 1].syllables.some(token => /\s/.test(token)));
  const verseAbc = (score: ReturnType<typeof arrangeHymn>, stanza = options.stanza || 0) => {
    const offset = hymnMelodyOffset(options.hymn, score.from);
    const abc = options.hands === "left" ? score.abc : hymnStanzaAbc(score.abc, options.hymn, stanza, offset);
    return options.hands === "left" || !rhythmicLyrics ? abc : hymnLyricsAbc(abc, {
      hymn: options.hymn, selected: options.stanzas || [], offset,
    });
  };
  const voicesFor = (audio: AudioTracks, abc: string) => {
    const staves = abcPlaybackStaves(abc);
    const vocal =
      (options.arrangement === "original" || options.arrangement === "guitar-vocal") &&
      options.hands !== "left" &&
      ("vocalTracks" in options.hymn || instrumentEdition(options.hymn)?.vocal)
        ? new Set<number>("vocalTracks" in options.hymn ? options.hymn.vocalTracks || [] : [0])
        : new Set<number>();
    const voiced = {
      ...audio,
      tracks: audio.tracks.map((track, index) =>
        vocal.has(index)
          ? track.map((event) =>
              event.cmd === "note"
                ? { ...event, playbackInstrument: "choir" as const }
                : event,
            )
          : track,
      ),
    };
    const resonant = isGuitarArrangement(options.arrangement) ? guitarSustainAudio(voiced, abc, options.hymn.feel === "swing") : voiced;
    return mutePlaybackStaves(resonant, staves, options.mutedStaves || []);
  };
  const readAudio = (abc: string) => {
    const capoEdition = options.arrangement === "guitar-edition";
    if(capoEdition && options.hands === "left" && options.capoChoice)
      abc=capoAccompanimentAbc(abc,options.capoChoice,(chordEdition(options.hymn)?.capo || 0)+options.transpose-options.capoChoice.fret);
    const audio = swingAudio(
      abcjs.parseOnly(abc)[0].setUpAudio({
        qpm: 60,
        chordsOff: true,
        midiTranspose:
          capoEdition || options.arrangement === "guitar-vocal" ? 0 : options.transpose + guitarMidiOffset(options.arrangement),
      }),
      options.hymn.feel === "swing",
    );
    const voiced =
      capoEdition
        // abcjs's octave clef overrides midiTranspose. Shift the actual note
        // events by the same effective capo used by the visible score.
        ? capoAudio(audio, (chordEdition(options.hymn)?.capo || 0) + options.transpose)
        : audio;
    return voicesFor(voiced, abc);
  };
  const currentAudio = voicesFor(
    swingAudio(options.audio, options.hymn.feel === "swing"),
    options.abc,
  );
  // Schedule the entire song on one audio clock. Restarting the transport at
  // stanza boundaries would add preparation/lead-in gaps and another count-in.
  if (options.stanzas && options.sectionBars === 0) {
    const selected = validStanzas(options.stanzas, options.hymn.stanzas.length);
    let offset = 0;
    const parts = (selected.length ? selected : [0]).map((number) => {
      const abc = verseAbc(arrangeHymn(
        options.hymn,
        options.arrangement,
        0,
        0,
        options.hands,
        number ? hymnEndingBar(options.hymn, [number]) : undefined,
        options.transpose,
        options.capoChoice,
      ), number);
      // Stanza selection owns the verse count. A final implicit repeat is
      // a direction to return for the next verse, not to sing this verse twice.
      const tune=abcjs.parseOnly(abc)[0], edits:{start:number;end:number}[]=[];
      const voices=new Map<string,VoiceItem[]>();
      for(const line of tune.lines)for(const [si,staff] of (line.staff||[]).entries())for(const [vi,voice] of (staff.voices||[]).entries()){
        const id=`${si}:${vi}`;voices.set(id,[...(voices.get(id)||[]),...voice]);
      }
      for(const voice of voices.values()){
        const bars=voice.filter(n=>n.el_type==="bar"),last=bars.at(-1);
        if(last?.type==="bar_right_repeat" && !bars.some(n=>n.type==="bar_left_repeat" || n.type==="bar_dbl_repeat"))edits.push({start:last.startChar,end:last.endChar});
      }
      let pass=abc;
      for(const e of edits.sort((a,b)=>b.start-a.start))pass=pass.slice(0,e.start)+"|]"+pass.slice(e.end);
      const audio = readAudio(pass);
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
                ? [{ ...item, start: item.start + start / 4,
                    ...((item as GuitarSustainEvent).guitarRingUntil !== undefined ? {guitarRingUntil: (item as GuitarSustainEvent).guitarRingUntil! + start / 4} : {}) }]
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
    verseAbc(arrangeHymn(
      options.hymn,
      options.arrangement,
      bars,
      section,
      options.hands,
      options.endingBar,
      options.transpose,
      options.capoChoice,
    ));
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
