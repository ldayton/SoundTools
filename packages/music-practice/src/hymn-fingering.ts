import type { AbsoluteElement, TuneObject } from "abcjs";
import { scoreSpellings, pitchLabel } from "./sight-feedback";
import { planPianoFingering, type FingerNote } from "./piano-fingering";
const ns = "http://www.w3.org/2000/svg";
type Entry = { note: FingerNote; absolute?: AbsoluteElement; label: string };
type PianoVoice = {
  hand: "right" | "left";
  notes: Entry[];
  rest: boolean;
  invalid: boolean;
  hasPitches: boolean;
  last?: number;
};
/** Generated suggestions are safe only for one monophonic voice per hand.
 * Editorial edition fingerings use a separate renderer and are preserved. */
export function pianoFingeringVoices(tune: TuneObject) {
  const spellings = scoreSpellings(tune),
    voices = new Map<string, PianoVoice>();
  for (const line of tune.lines)
    for (const [si, staff] of (line.staff || []).entries())
      for (const [vi, voice] of (staff.voices || []).entries()) {
        const id = `${si}:${vi}`;
        const part: PianoVoice = voices.get(id) || {
          hand: staff.clef?.type === "bass" ? "left" : "right",
          notes: [],
          rest: false,
          invalid: false,
          hasPitches: false,
        };
        voices.set(id, part);
        for (const item of voice) {
          if (item.el_type !== "note") continue;
          if (!item.pitches?.length) {
            part.rest = true;
            continue;
          }
          part.hasPitches = true;
          if (item.pitches.length !== 1) {
            part.invalid = true;
            continue;
          }
          const tied = !!item.pitches[0].endTie;
          const midi =
            item.midiPitches?.[0]?.pitch ?? (tied ? part.last : undefined);
          const absolute = (item as typeof item & { abselem?: AbsoluteElement })
            .abselem;
          if (midi === undefined) {
            part.invalid = true;
            continue;
          }
          part.notes.push({
            note: {
              midi,
              duration: item.duration,
              restBefore: part.rest,
              // A selected passage can start on a continuation: its prior
              // contact is outside this phrase and cannot constrain the search.
              tied: tied && part.notes.length > 0,
            },
            absolute,
            label: pitchLabel(midi, spellings.get(item.startChar)),
          });
          part.last = midi;
          part.rest = false;
        }
      }
  const counts = { right: 0, left: 0 };
  for (const part of voices.values()) if (part.hasPitches) counts[part.hand]++;
  return [...voices.values()].filter(
    (part) => part.notes.length && !part.invalid && counts[part.hand] === 1,
  );
}
/** Add annotations after engraving without changing timing or ABC identities. */
export function drawHymnFingerings(tune: TuneObject) {
  for (const part of pianoFingeringVoices(tune)) {
    const fingers = planPianoFingering(
      part.notes.map((n) => n.note),
      part.hand,
    );
    part.notes.forEach(({ note, absolute, label: noteName }, i) => {
      // Tied continuations retain their finger; do not repeat the annotation.
      if (note.tied || !absolute) return;
      const group =
        absolute.elemset.find((e) => e.classList.contains("abcjs-note")) ||
        absolute.elemset[0];
      const head = (group?.querySelector<SVGGraphicsElement>(
        ".abcjs-notehead",
      ) || group) as SVGGraphicsElement | undefined;
      const svg = group?.ownerSVGElement;
      if (!head || !svg) return;
      const transform = head.getScreenCTM(),
        screen = svg.getScreenCTM();
      if (!transform || !screen) return;
      const matrix = screen.inverse().multiply(transform),
        box = (head as SVGGraphicsElement).getBBox();
      const center = new DOMPoint(
        box.x + box.width / 2,
        part.hand === "right" ? box.y : box.y + box.height,
      ).matrixTransform(matrix);
      const view = svg.viewBox.baseVal;
      const x =
          center.x + (fingers[i].shift ? (part.hand === "right" ? -8 : 8) : 0),
        y = Math.max(
          view.y + 7,
          Math.min(
            view.y + view.height - 7,
            center.y + (part.hand === "right" ? -9 : 11),
          ),
        );
      const f = fingers[i],
        mark = document.createElementNS(ns, "g");
      mark.classList.add("hymn-fingering");
      if (f.shift) mark.classList.add("hymn-finger-shift");
      mark.dataset.hand = part.hand;
      mark.dataset.midi = String(note.midi);
      mark.dataset.finger = String(f.finger);
      mark.dataset.anchor = String(f.anchor);
      const movement = f.shift
        ? f.crossing
          ? "cross " + (f.finger === 1 ? "thumb under" : "finger over")
          : "move " + (f.anchor > fingers[i - 1].anchor ? "up" : "down")
        : "finger";
      const label = `${part.hand === "right" ? "RH" : "LH"}: ${movement}; finger ${f.finger} on ${noteName}`;
      mark.setAttribute("role", "img");
      mark.setAttribute("aria-label", label);
      mark.style.pointerEvents = "auto";
      const title = document.createElementNS(ns, "title");
      title.textContent = label;
      mark.append(title);
      if (f.shift) {
        const circle = document.createElementNS(ns, "circle");
        circle.setAttribute("cx", String(x));
        circle.setAttribute("cy", String(y));
        circle.setAttribute("r", "6.25");
        circle.setAttribute("fill", "white");
        circle.setAttribute("stroke", "currentColor");
        circle.setAttribute("stroke-width", "0.85");
        mark.append(circle);
      }
      const text = document.createElementNS(ns, "text");
      text.setAttribute("x", String(x));
      text.setAttribute("y", String(y));
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("dominant-baseline", "central");
      text.setAttribute("font-size", "9");
      text.setAttribute("font-family", "sans-serif");
      text.setAttribute("fill", "currentColor");
      if (!f.shift) {
        text.setAttribute("paint-order", "stroke");
        text.setAttribute("stroke", "white");
        text.setAttribute("stroke-width", "2");
        text.setAttribute("stroke-linejoin", "round");
      }
      text.textContent = String(f.finger);
      mark.append(text);
      svg.append(mark);
    });
  }
}
