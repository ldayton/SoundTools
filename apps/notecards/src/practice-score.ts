import abcjs, { type NoteTimingEvent, type TuneObject } from "abcjs";
import { scoreSpellings, type PitchSpellings } from "./sight-feedback";
export type PracticeEvent = NoteTimingEvent & { spellings?: PitchSpellings };
export function drawPracticeScore(
  paper: HTMLElement,
  abc: string,
  width: number,
  musicScale = 1,
): PracticeEvent[] {
  const tune = abcjs.renderAbc(paper, "%%vocalfont sans-serif 12\n" + abc, {
    add_classes: true,
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
    staffwidth: Math.max(240, width / musicScale - 28),
    // Balance all systems instead of stranding a final bar on its own line.
    wrap: { minSpacing: 2, maxSpacing: 2.6, preferredMeasuresPerLine: 0 },
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
  tune.setUpAudio({});
  tune.setTiming(60, 0);
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
  const spellings = scoreSpellings(tune);
  return tune.noteTimings
    .filter((e) => e.type === "event" && e.midiPitches?.length)
    .map((e) => ({
      ...e,
      spellings: Object.assign(
        {},
        ...(e.startCharArray || [e.startChar!]).map(
          (start) => spellings.get(start) || {},
        ),
      ),
    }));
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
export function eventSteps(events: NoteTimingEvent[]) {
  return events.map((e) => ({
    pitches: [...new Set(e.midiPitches!.map((p) => p.pitch))],
  }));
}
export function keyboardRange(events: NoteTimingEvent[]): [number, number] {
  const pitches = events.flatMap((e) => e.midiPitches!.map((p) => p.pitch));
  return [
    Math.floor(Math.min(...pitches) / 12) * 12,
    Math.ceil((Math.max(...pitches) + 1) / 12) * 12 - 1,
  ];
}
