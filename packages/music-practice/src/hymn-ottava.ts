import type { AbsoluteElement, TuneObject } from "abcjs";

type Staff = NonNullable<TuneObject["lines"][number]["staff"]>[number];
type Mark = {
  staff: Staff;
  octaves: number;
  label: string;
};
const applied = new WeakMap<TuneObject, Mark[]>();

/** Keep sounding/diatonic pitches intact; only abcjs's engraving positions move. */
export function applyHymnOttava(tune: TuneObject): Mark[] {
  const existing = applied.get(tune);
  if (existing) return existing;
  const positions = new Map<number, number[]>();
  for (const line of tune.lines)
    line.staff?.forEach((staff, index) => {
      if (!["treble", "bass"].includes(staff.clef?.type || "")) return;
      const values = positions.get(index) ?? [];
      for (const voice of staff.voices || [])
        for (const item of voice) {
          if (item.el_type !== "note") continue;
          for (const pitch of [
            ...(item.pitches || []),
            ...(item.gracenotes || []),
          ])
            if (Number.isFinite(pitch.verticalPos))
              values.push(pitch.verticalPos);
        }
      positions.set(index, values);
    });
  const shifts = new Map<number, number>();
  for (const [index, values] of positions) {
    // One ledger line is ordinary. Penalize further excursions on either side,
    // and prefer unmarked notation unless shifting clearly improves the part.
    const cost = (octaves: number) =>
      values.reduce((sum, pitch) => {
        const written = pitch + octaves * 7;
        return sum + Math.max(0, -written, written - 12) ** 2;
      }, 0) +
      values.length * octaves * 0.25;
    let best = 0;
    for (const octaves of [1, 2])
      if (cost(octaves) < cost(best)) best = octaves;
    shifts.set(index, best);
  }
  const marks: Mark[] = [];
  for (const line of tune.lines)
    line.staff?.forEach((staff, index) => {
      const octaves = shifts.get(index) || 0;
      if (!octaves) return;
      // abcjs reuses a clef object across wrapped systems. Give each its own
      // engraving reference so a later system cannot replace the first one's.
      if (staff.clef) staff.clef = { ...staff.clef };
      let hasNotes = false;
      for (const voice of staff.voices || [])
        for (const item of voice) {
          if (item.el_type !== "note") continue;
          hasNotes = true;
          for (const pitch of [
            ...(item.pitches || []),
            ...(item.gracenotes || []),
          ])
            if (Number.isFinite(pitch.verticalPos))
              pitch.verticalPos += octaves * 7;
        }
      if (hasNotes) {
        const label = octaves === 1 ? "8" : "15";
        marks.push({ staff, octaves, label });
      }
    });
  applied.set(tune, marks);
  return marks;
}

/** A small octave number belongs to the clef, never to a note or selection hitbox. */
export function drawHymnOttava(marks: Mark[]) {
  const ns = "http://www.w3.org/2000/svg";
  for (const { staff, label, octaves } of marks) {
    const absolute = (
      staff.clef as typeof staff.clef & { abselem?: AbsoluteElement }
    )?.abselem;
    const clef = absolute?.elemset.find((element) =>
      element.classList.contains("abcjs-clef"),
    );
    if (!clef || clef.querySelector(".hymn-ottava")) continue;
    const box = (clef as SVGGraphicsElement).getBBox();
    const group = document.createElementNS(ns, "g");
    group.setAttribute("class", "hymn-ottava");
    group.setAttribute("data-octaves-below", String(octaves));
    group.setAttribute("pointer-events", "none");
    group.setAttribute("role", "img");
    group.setAttribute(
      "aria-label",
      `Play ${octaves === 1 ? "one octave" : "two octaves"} below written notes`,
    );
    const text = document.createElementNS(ns, "text");
    text.setAttribute("x", String(box.x + box.width / 2));
    text.setAttribute("y", String(box.y + box.height + 11));
    text.setAttribute("font-family", "Georgia, serif");
    text.setAttribute("font-size", "12");
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("fill", "currentColor");
    text.textContent = label;
    group.append(text);
    clef.append(group);
  }
}

/** Font descent bounds vary by browser; keep the complete marking inside its system. */
export function fitHymnOttava(svg: SVGSVGElement) {
  const screen = svg.getScreenCTM();
  if (!screen) return;
  const inverse = screen.inverse();
  const box = svg.viewBox.baseVal;
  let bottom = box.y + box.height;
  for (const mark of svg.querySelectorAll<SVGGraphicsElement>(".hymn-ottava")) {
    const transform = mark.getScreenCTM();
    if (!transform) continue;
    const bounds = mark.getBBox();
    const matrix = inverse.multiply(transform);
    for (const x of [bounds.x, bounds.x + bounds.width])
      bottom = Math.max(
        bottom,
        new DOMPoint(x, bounds.y + bounds.height).matrixTransform(matrix).y + 1,
      );
  }
  if (bottom > box.y + box.height)
    svg.setAttribute(
      "viewBox",
      `${box.x} ${box.y} ${box.width} ${bottom - box.y}`,
    );
}
