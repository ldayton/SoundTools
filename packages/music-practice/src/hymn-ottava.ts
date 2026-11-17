import type {
  AbsoluteElement,
  TuneObject,
  VoiceItem,
  VoiceItemNote,
} from "abcjs";

type Staff = NonNullable<TuneObject["lines"][number]["staff"]>[number];
type Mark = {
  staff: Staff;
  first: VoiceItemNote;
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
      let first: VoiceItemNote | undefined;
      for (const voice of staff.voices || [])
        for (const item of voice) {
          if (item.el_type !== "note") continue;
          first ??= item;
          for (const pitch of [
            ...(item.pitches || []),
            ...(item.gracenotes || []),
          ])
            if (Number.isFinite(pitch.verticalPos))
              pitch.verticalPos += octaves * 7;
        }
      if (first) {
        const label = octaves === 1 ? "8vb" : "15mb";
        // Let the engraver reserve space between the music and lyrics first.
        first.chord = [
          ...(first.chord || []),
          { name: label, position: "below" },
        ];
        marks.push({ staff, first, octaves, label });
      }
    });
  applied.set(tune, marks);
  return marks;
}

const absolute = (item: VoiceItem) =>
  (item as VoiceItem & { abselem?: AbsoluteElement }).abselem;

/** Finish ottava brackets outside note groups, so selection hitboxes stay precise. */
export function drawHymnOttava(marks: Mark[]) {
  const ns = "http://www.w3.org/2000/svg";
  for (const { staff, first, label, octaves } of marks) {
    const note = absolute(first);
    const text = note?.elemset
      .flatMap((element) =>
        Array.from(
          element.querySelectorAll<SVGTextElement>(".abcjs-annotation"),
        ),
      )
      .find((element) => element.textContent === label);
    if (!text) continue;
    const parent = text.closest(".abcjs-note,.abcjs-rest")
      ?.parentElement as SVGGraphicsElement | null;
    if (!parent || !parent.getCTM() || !text.getCTM()) continue;
    const transform = parent.getCTM()!.inverse().multiply(text.getCTM()!);
    const box = text.getBBox();
    const start = new DOMPoint(
      box.x + box.width + 5,
      box.y + box.height / 2,
    ).matrixTransform(transform);
    const end =
      Math.max(
        ...(staff.voices || []).flat().map((item) => {
          const element = absolute(item);
          return element ? element.x + element.w : 0;
        }),
      ) - 2;
    const group = document.createElementNS(ns, "g");
    group.setAttribute("class", "hymn-ottava");
    group.setAttribute("data-octaves-below", String(octaves));
    group.setAttribute("pointer-events", "none");
    group.setAttribute(
      "aria-label",
      `Play ${octaves === 1 ? "one octave" : "two octaves"} below written notes`,
    );
    text.setAttribute(
      "transform",
      `matrix(${transform.a} ${transform.b} ${transform.c} ${transform.d} ${transform.e} ${transform.f})`,
    );
    group.append(text);
    if (end > start.x) {
      const line = document.createElementNS(ns, "path");
      line.setAttribute("d", `M${start.x} ${start.y}H${end}`);
      line.setAttribute("stroke-dasharray", "3 3");
      const hook = document.createElementNS(ns, "path");
      hook.setAttribute("d", `M${end} ${start.y}v-5`);
      for (const path of [line, hook]) {
        path.setAttribute("fill", "none");
        path.setAttribute("stroke", "currentColor");
        path.setAttribute("stroke-width", "0.7");
        group.append(path);
      }
    }
    parent.append(group);
  }
}
