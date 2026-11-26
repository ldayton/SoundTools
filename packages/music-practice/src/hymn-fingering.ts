import type { TuneObject } from "abcjs";
import {
  planPianoScore,
  type PianoScoreOptions,
} from "./piano-score-fingering";
const ns = "http://www.w3.org/2000/svg";
/** Whole-hand generated annotations. Editorial edition rendering is separate. */
export function drawHymnFingerings(
  tune: TuneObject,
  options: PianoScoreOptions = {},
) {
  const { plan, entries, planned } = planPianoScore(tune, options),
    seen = new Set<string>();
  const rows = new Map<
    SVGElement,
    {
      entry: (typeof entries)[number];
      finger: NonNullable<ReturnType<typeof planned.get>>;
      head: SVGGraphicsElement;
      svg: SVGSVGElement;
      x: number;
      y: number;
    }[]
  >();
  for (const entry of entries) {
    const finger = planned.get(entry.id),
      absolute = entry.absolute;
    if (!finger || !absolute || entry.tieFrom || entry.authoredFinger) continue;
    const unique = `${entry.hand}:${finger.contactId}:${entry.start}`;
    if (seen.has(unique)) continue;
    seen.add(unique);
    const group =
      absolute.elemset.find((e) => e.classList.contains("abcjs-note")) ||
      absolute.elemset[0];
    const heads =
        group?.querySelectorAll<SVGGraphicsElement>(".abcjs-notehead"),
      head = (heads?.[entry.pitchIndex] || group) as
        SVGGraphicsElement | undefined,
      svg = group?.ownerSVGElement;
    if (!head || !svg) continue;
    const screen = svg.getScreenCTM(),
      transform = head.getScreenCTM();
    if (!screen || !transform) continue;
    const matrix = screen.inverse().multiply(transform),
      box = head.getBBox();
    const center = new DOMPoint(
        box.x + box.width / 2,
        box.y + box.height / 2,
      ).matrixTransform(matrix),
      chord = (entry.note.pitches?.length || 0) > 1;
    const list = rows.get(group!) ?? [];
    list.push({
      entry,
      finger,
      head,
      svg,
      x: chord
        ? new DOMPoint(box.x, box.y).matrixTransform(matrix).x - 10
        : center.x + (finger.shift ? (entry.hand === "right" ? -8 : 8) : 0),
      y: chord ? center.y : center.y + (entry.hand === "right" ? -12 : 14),
    });
    rows.set(group!, list);
  }
  for (const list of rows.values()) {
    list.sort((a, b) => a.y - b.y);
    let previous = -Infinity;
    const chord = (list[0].entry.note.pitches?.length || 0) > 1,
      minX = Math.min(...list.map((r) => r.x));
    for (const row of list) {
      if (chord) {
        row.x = minX;
        row.y = Math.max(row.y, previous + 12);
        previous = row.y;
      }
    }
    const rawView = list[0].svg.viewBox.baseVal,
      view = rawView.height
        ? rawView
        : {
            x: 0,
            y: 0,
            width: list[0].svg.width.baseVal.value,
            height: list[0].svg.height.baseVal.value,
          },
      overflow = Math.max(0, list.at(-1)!.y - (view.y + view.height - 8));
    for (const { entry, finger, svg, x, y } of list) {
      const mark = document.createElementNS(ns, "g");
      mark.classList.add("hymn-fingering");
      if (finger.shift) mark.classList.add("hymn-finger-shift");
      Object.assign(mark.dataset, {
        hand: entry.hand,
        midi: String(entry.midi),
        finger: String(finger.finger),
        anchor: String(finger.anchor),
        noteId: entry.id,
        contactId: finger.contactId,
        beat: String(entry.start),
      });
      const movement = finger.shift
        ? finger.crossing
          ? "cross " + (finger.finger === 1 ? "thumb under" : "finger over")
          : "move hand"
        : "finger";
      const label = `${entry.hand === "right" ? "RH" : "LH"}: ${movement}; finger ${finger.finger} on ${entry.label}`;
      mark.setAttribute("role", "img");
      mark.setAttribute("aria-label", label);
      mark.style.pointerEvents = "auto";
      const title = document.createElementNS(ns, "title");
      title.textContent = label;
      mark.append(title);
      const markX = Math.max(view.x + 7, x),
        markY = Math.max(
          view.y + 8,
          Math.min(view.y + view.height - 8, y - overflow),
        );
      if (finger.shift) {
        const circle = document.createElementNS(ns, "circle");
        for (const [key, value] of Object.entries({
          cx: markX,
          cy: markY,
          r: 6.25,
          fill: "white",
          stroke: "currentColor",
          "stroke-width": 0.85,
        }))
          circle.setAttribute(key, String(value));
        mark.append(circle);
      }
      const text = document.createElementNS(ns, "text");
      for (const [key, value] of Object.entries({
        x: markX,
        y: markY,
        "text-anchor": "middle",
        "dominant-baseline": "central",
        "font-size": 9,
        "font-family": "sans-serif",
        fill: "currentColor",
      }))
        text.setAttribute(key, String(value));
      if (!finger.shift) {
        text.setAttribute("paint-order", "stroke");
        text.setAttribute("stroke", "white");
        text.setAttribute("stroke-width", "2");
        text.setAttribute("stroke-linejoin", "round");
      }
      text.textContent = String(finger.finger);
      mark.append(text);
      svg.append(mark);
    }
  }
  // Substitution is opt-in. If used by a caller, return and expose its timing
  // explicitly rather than silently replacing the finger of a held key.
  for (const hand of ["right", "left"] as const)
    for (const state of plan.hands[hand].states)
      for (const event of state.events.filter(
        (e) => e.kind === "substitution",
      )) {
        const entry = entries.find((e) => event.noteIds.includes(e.id)),
          group = entry?.absolute?.elemset[0],
          svg = group?.ownerSVGElement;
        if (!entry || !svg || !group) continue;
        const mark = document.createElementNS(ns, "text"),
          box = (group as SVGGraphicsElement).getBBox();
        mark.classList.add("piano-finger-substitution");
        mark.dataset.beat = String(event.at);
        const screen = svg.getScreenCTM(),
          transform = (group as SVGGraphicsElement).getScreenCTM();
        if (!screen || !transform) continue;
        const point = new DOMPoint(box.x, box.y - 18).matrixTransform(
          screen.inverse().multiply(transform),
        );
        mark.setAttribute("x", String(point.x));
        mark.setAttribute("y", String(point.y));
        mark.setAttribute("font-size", "9");
        mark.setAttribute(
          "aria-label",
          `${hand === "right" ? "RH" : "LH"}: at beat ${event.at + 1}, substitute finger ${event.from} with ${event.to}`,
        );
        mark.textContent = `${event.from}→${event.to}`;
        svg.append(mark);
      }
  return plan;
}
