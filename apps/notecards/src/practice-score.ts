import abcjs, { type NoteTimingEvent, type TuneObject } from "abcjs";
export function drawPracticeScore(
  paper: HTMLElement,
  abc: string,
  width: number,
): NoteTimingEvent[] {
  const tune = abcjs.renderAbc(paper, "%%vocalfont sans-serif 12\n" + abc, {
    add_classes: true,
    minPadding: 6,
    responsive: "resize",
    oneSvgPerLine: true,
    staffwidth: Math.max(240, width - 28),
    wrap: { minSpacing: 2, maxSpacing: 2.6, preferredMeasuresPerLine: 4 },
    paddingtop: 12,
    paddingbottom: 18,
    paddingleft: 12,
    paddingright: 12,
  })[0] as TuneObject & { noteTimings: NoteTimingEvent[] };
  if (!tune || tune.warnings?.length)
    throw Error("Practice notation could not be read");
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
  return tune.noteTimings.filter(
    (e) => e.type === "event" && e.midiPitches?.length,
  );
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
