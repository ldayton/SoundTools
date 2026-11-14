import { STAFF_LINE_GAP, ABC_STAFF_LINE_GAP } from "./notation-metrics";
import abcjs, {
  type NoteTimingEvent,
  type TuneObject,
  type AudioTracks,
  type MidiPitch,
} from "abcjs";
import { scoreSpellings, type PitchSpellings } from "./sight-feedback";
export type PracticeEvent = NoteTimingEvent & {
  spellings?: PitchSpellings;
  sustainedPitches?: number[];
};
/** Recover tied continuations from each voice's original MIDI spelling, without changing engraving or playback. */
export function tiedContinuations(tune: TuneObject): Map<number, MidiPitch[]> {
  const result = new Map<number, MidiPitch[]>(),
    voices = new Map<string, Map<number, MidiPitch>>();
  for (const line of tune.lines)
    for (const [si, staff] of (line.staff || []).entries())
      for (const [vi, voice] of (staff.voices || []).entries()) {
        const key = `${si}:${vi}`,
          previous = voices.get(key) || new Map<number, MidiPitch>();
        voices.set(key, previous);
        for (const note of voice) {
          if (note.el_type !== "note") continue;
          const attacks = [...(note.midiPitches || [])],
            continuations: MidiPitch[] = [];
          for (const pitch of note.pitches || []) {
            const midi = pitch.endTie
              ? previous.get(pitch.pitch)
              : attacks.shift();
            if (!midi) continue;
            previous.set(pitch.pitch, midi);
            if (pitch.endTie) continuations.push(midi);
          }
          if (continuations.length && note.startChar !== undefined)
            result.set(note.startChar, continuations);
        }
      }
  return result;
}
export function drawPracticeScore(
  paper: HTMLElement,
  abc: string,
  width: number,
  options: {
    scale?: number;
    transpose?: number;
    compact?: boolean;
    rhythmGrid?: boolean;
    reattackTies?: boolean;
    playback?: (audio: AudioTracks) => void;
  } = {},
): PracticeEvent[] {
  const scale = (STAFF_LINE_GAP / ABC_STAFF_LINE_GAP) * (options.scale ?? 1);
  const transpose = options.transpose ?? 0;
  const tune = abcjs.renderAbc(paper, "%%vocalfont sans-serif 12\n" + abc, {
    add_classes: true,
    visualTranspose: transpose,
    // Reserve breathing room around lyrics before abcjs computes note positions.
    // Remove these measurement-only spaces from the SVG after engraving.
    afterParsing(tune) {
      for (const line of tune.lines)
        for (const staff of line.staff || [])
          for (const voice of staff.voices || [])
            for (const item of voice)
              if (item.el_type === "note")
                for (const lyric of item.lyric || [])
                  lyric.syllable =
                    "\u2002" + lyric.syllable.replace(/\u2002/g, "") + "\u2002";
      return tune;
    },
    responsive: "resize",
    oneSvgPerLine: true,
    staffwidth: Math.max(140, width / scale - 24),
    // Balance all systems instead of stranding a final bar on its own line.
    wrap: options.rhythmGrid
      ? undefined
      : { minSpacing: 2, maxSpacing: 2.6, preferredMeasuresPerLine: 0 },
    timeBasedLayout: options.rhythmGrid
      ? { minPadding: 8, minWidth: Math.max(100, width / scale - 24) }
      : undefined,
    paddingtop: 12,
    paddingbottom: 18,
    paddingleft: 12,
    paddingright: 12,
  })[0] as TuneObject & { noteTimings: NoteTimingEvent[] };
  if (!tune || tune.warnings?.length)
    throw Error("Practice notation could not be read");
  paper.querySelectorAll(".abcjs-lyric").forEach((lyric) => {
    const walker = document.createTreeWalker(lyric, NodeFilter.SHOW_TEXT);
    while (walker.nextNode())
      walker.currentNode.textContent = walker.currentNode.textContent!.replace(
        /\u2002/g,
        "",
      );
  });
  // abcjs keeps audio at source pitch unless both transpositions are specified.
  // Use the same shift so notation, spellings and MIDI grading agree.
  const audio = tune.setUpAudio({
    midiTranspose: transpose,
    ...(options.playback ? { qpm: 60, chordsOff: true } : {}),
  });
  options.playback?.(audio);
  // Playback uses quarter-note BPM, including compound meters.
  tune.setTiming(options.playback ? (60 * 0.25) / tune.getBeatLength() : 60, 0);
  paper
    .querySelectorAll(".abcjs-title,.abcjs-subtitle")
    .forEach((e) => e.remove());
  paper.querySelectorAll("svg").forEach((svg) => {
    if (!svg.querySelector(".abcjs-staff")) {
      const wrapper = svg.parentElement;
      svg.remove();
      if (wrapper !== paper && wrapper?.classList.contains("abcjs-container"))
        wrapper.remove();
    }
  });
  // Explicit physical size prevents short systems and responsive wrappers from
  // stretching staff lines and glyphs differently in each exercise.
  paper.querySelectorAll("svg").forEach((svg) => {
    if (options.compact) {
      const group = svg.querySelector<SVGGraphicsElement>(
        ".abcjs-staff-wrapper",
      );
      if (group) {
        const ink = group.getBBox();
        const box = svg.viewBox.baseVal;
        svg.setAttribute(
          "viewBox",
          `${box.x} ${box.y} ${Math.min(box.width, Math.ceil(ink.x + ink.width + 12))} ${box.height}`,
        );
      }
      svg.style.marginInline = "auto";
    }
    const box = svg.viewBox.baseVal;
    const fittedScale = Math.min(scale, width / box.width);
    svg.style.display = "block";
    svg.style.width = `${box.width * fittedScale}px`;
    svg.style.height = `${box.height * fittedScale}px`;
    svg.style.maxWidth = "100%";
  });
  const spellings = scoreSpellings(tune);
  const continuations = options.reattackTies
    ? tiedContinuations(tune)
    : new Map<number, MidiPitch[]>();
  const sounding = audio.tracks.flat().filter((n) => n.cmd === "note");
  return tune.noteTimings
    .filter((e) => e.type === "event")
    .map((e) => ({
      ...e,
      midiPitches: [
        ...(e.midiPitches || []),
        ...(e.startCharArray || [e.startChar!]).flatMap(
          (start) => continuations.get(start) || [],
        ),
      ],
      // Hymn timings use quarter-note seconds (qpm 60). Only notes still sounding
      // before this onset are recovery notes; releases exactly on it are excluded.
      sustainedPitches: options.playback
        ? [
            ...new Set(
              sounding
                .filter(
                  (n) =>
                    n.start * 4000 < e.milliseconds - 1 &&
                    (n.start + n.duration) * 4000 > e.milliseconds + 1,
                )
                .map((n) => n.pitch),
            ),
          ]
        : [],
      spellings: Object.assign(
        {},
        ...(e.startCharArray || [e.startChar!]).map(
          (start) => spellings.get(start) || {},
        ),
      ),
    }))
    .filter((e) => e.midiPitches.length);
}
export function highlightScore(
  paper: HTMLElement,
  event: NoteTimingEvent | undefined,
  viewport: HTMLElement,
  scroll = false,
) {
  paper
    .querySelectorAll(".sight-current")
    .forEach((e) => e.classList.remove("sight-current"));
  const elements = (event?.elements || []).flat().filter(Boolean);
  elements.forEach((e) => e.classList.add("sight-current"));
  if (scroll && elements[0]) {
    const note = (
      elements[0].closest("svg") || elements[0]
    ).getBoundingClientRect();
    const box = viewport.getBoundingClientRect();
    if (note.top < box.top || note.bottom > box.bottom)
      viewport.scrollTop += note.top - box.top - 12;
  }
}
export function eventSteps(events: PracticeEvent[], recoverSustains = false) {
  return events.map((e) => ({
    pitches: [...new Set(e.midiPitches!.map((p) => p.pitch))],
    ...(recoverSustains
      ? {
          retryPitches: [
            ...new Set([
              ...e.midiPitches!.map((p) => p.pitch),
              ...(e.sustainedPitches || []),
            ]),
          ],
        }
      : {}),
  }));
}
export function keyboardRange(events: NoteTimingEvent[]): [number, number] {
  const pitches = events.flatMap((e) => e.midiPitches!.map((p) => p.pitch));
  return [
    Math.floor(Math.min(...pitches) / 12) * 12,
    Math.ceil((Math.max(...pitches) + 1) / 12) * 12 - 1,
  ];
}
