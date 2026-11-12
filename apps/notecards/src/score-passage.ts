import type { PracticeEvent } from "./practice-score";

export type Passage = { start: number; end: number };
type Box = { left: number; right: number; top: number; bottom: number };
type Location = { line: number; x: number };
type ScoreLine = {
  svg: SVGSVGElement;
  staff: Box;
  band: Box;
  notes: { index: number; box: Box }[];
};

/** A musical span, not a rectangular lasso. Each system gets its own full-height band. */
export class ScorePassage {
  range?: Passage;
  selecting = false;
  private anchor?: number;
  private draft?: Passage;
  private pointer?: {
    id: number;
    index: number;
    origin: Location;
    x: number;
    y: number;
    lastX: number;
    lastY: number;
    moved: boolean;
  };
  private nodes = new Map<Element, number>();
  private lines: ScoreLine[] = [];
  private scrollFrame = 0;
  constructor(
    private paper: HTMLElement,
    private changed: () => void,
    private committed: () => void,
    private cancelled: () => void,
    private started: () => void,
  ) {
    paper.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || this.pointer) return;
      const index = this.hit(e.clientX, e.clientY, true);
      const origin = this.location(e.clientX, e.clientY);
      if (index === undefined || !origin) return;
      e.preventDefault();
      paper.parentElement!.dataset.pointerSelection = "";
      paper.parentElement!.focus({ preventScroll: true });
      paper.setPointerCapture(e.pointerId);
      this.pointer = {
        id: e.pointerId,
        index,
        origin,
        x: e.clientX,
        y: e.clientY,
        lastX: e.clientX,
        lastY: e.clientY,
        moved: false,
      };
    });
    paper.addEventListener("pointermove", (e) => {
      const p = this.pointer;
      // Vertical touch gestures remain native scrolling. Tap two ends, or drag horizontally.
      if (!p || p.id !== e.pointerId) return;
      p.lastX = e.clientX;
      p.lastY = e.clientY;
      if (
        !p.moved &&
        e.pointerType === "touch" &&
        Math.abs(e.clientY - p.y) > Math.abs(e.clientX - p.x)
      )
        return;
      if (!p.moved && Math.hypot(e.clientX - p.x, e.clientY - p.y) < 6) return;
      const starting = !p.moved;
      if (starting) {
        this.begin();
        p.moved = true;
        this.autoScroll();
      }
      this.paint(starting);
    });
    paper.addEventListener("pointerup", (e) => {
      const p = this.pointer;
      if (!p || p.id !== e.pointerId) return;
      this.stopPointer();
      if (p.moved) {
        this.preview(p.index, this.hit(e.clientX, e.clientY, true) ?? p.index);
        this.finish();
      } else this.choose(p.index);
    });
    paper.addEventListener("lostpointercapture", () => this.stopPointer());
    paper.addEventListener("pointercancel", () => {
      const dragging = this.pointer?.moved;
      this.stopPointer();
      if (dragging) {
        this.cancel();
        this.cancelled();
      }
    });
    paper.parentElement!.addEventListener("keydown", (e) => {
      delete paper.parentElement!.dataset.pointerSelection;
      if (e.key === "Escape" && this.selecting) {
        e.preventDefault();
        e.stopPropagation();
        this.cancel();
        this.cancelled();
        return;
      }
      if (e.key !== "Enter" && e.key !== " ") return;
      const index = this.nodes.get(e.target as Element);
      if (index !== undefined) {
        e.preventDefault();
        e.stopPropagation();
        this.choose(index);
      }
    });
  }
  bind(events: PracticeEvent[]) {
    this.nodes.clear();
    this.lines = [];
    const systems = new Map<SVGSVGElement, ScoreLine>();
    events.forEach((event, index) => {
      const ink = new Map<SVGSVGElement, Box[]>();
      for (const node of (event.elements || []).flat()) {
        if (!node) continue;
        this.nodes.set(node, index);
        node.setAttribute("data-passage-note", String(index));
        node.setAttribute("tabindex", "0");
        node.setAttribute("role", "button");
        node.setAttribute("aria-label", `Select note ${index + 1}`);
        const svg = node.closest("svg") as SVGSVGElement | null;
        if (!svg) continue;
        if (!systems.has(svg)) {
          const staff = this.union(
            [...svg.querySelectorAll<SVGGraphicsElement>(".abcjs-staff")].map(
              (n) => this.box(n, svg),
            ),
          );
          if (!staff) continue;
          systems.set(svg, { svg, staff, band: staff, notes: [] });
        }
        const boxes = ink.get(svg) || [];
        // Exclude lyric text, but include noteheads, stems, accidentals and ledger lines.
        for (const path of node.querySelectorAll<SVGGraphicsElement>("path"))
          boxes.push(this.box(path, svg));
        ink.set(svg, boxes);
      }
      for (const [svg, boxes] of ink) {
        const box = this.union(boxes);
        if (box) systems.get(svg)?.notes.push({ index, box });
      }
    });
    this.lines = [...systems.values()];
    // Measure the complete line once per engraving, never from the moving selection.
    for (const line of this.lines)
      line.band = this.union([line.staff, ...line.notes.map((n) => n.box)])!;
    this.paint();
  }
  private begin() {
    if (!this.selecting) this.started();
    this.selecting = true;
    this.draft = undefined;
  }
  cancel() {
    this.draft = undefined;
    this.selecting = false;
    this.anchor = undefined;
    this.stopPointer();
    this.paint();
  }
  clear() {
    this.cancel();
    this.range = undefined;
    this.paint();
  }
  private choose(index: number) {
    if (this.anchor === undefined) {
      this.begin();
      this.anchor = index;
      this.preview(index, index);
    } else {
      this.preview(this.anchor, index);
      this.finish();
    }
  }
  private preview(a: number, b: number) {
    const start = Math.min(a, b),
      end = Math.max(a, b);
    if (this.draft?.start === start && this.draft.end === end) return;
    this.draft = { start, end };
    this.paint();
  }
  private finish() {
    this.range = this.draft;
    this.draft = undefined;
    this.selecting = false;
    this.anchor = undefined;
    this.paint();
    this.committed();
  }
  private stopPointer() {
    this.pointer = undefined;
    cancelAnimationFrame(this.scrollFrame);
    this.scrollFrame = 0;
  }
  private autoScroll() {
    const p = this.pointer;
    if (!p?.moved) return;
    const viewport = this.paper.parentElement!,
      b = viewport.getBoundingClientRect();
    const delta = p.lastY < b.top + 32 ? -8 : p.lastY > b.bottom - 32 ? 8 : 0;
    if (delta) {
      viewport.scrollTop += delta;
      this.paint(false);
    }
    this.scrollFrame = requestAnimationFrame(() => this.autoScroll());
  }
  private location(x: number, y: number): Location | undefined {
    let nearest: Location | undefined,
      distance = Infinity;
    this.lines.forEach((line, index) => {
      const matrix = line.svg.getScreenCTM();
      if (!matrix || !line.notes.length) return;
      const point = new DOMPoint(x, y).matrixTransform(matrix.inverse());
      const d = Math.max(
        line.band.top - point.y,
        0,
        point.y - line.band.bottom,
      );
      if (d < distance) {
        distance = d;
        nearest = {
          line: index,
          x: Math.max(
            line.notes[0].box.left - 6,
            Math.min(line.staff.right, point.x),
          ),
        };
      }
    });
    return nearest;
  }
  private hit(x: number, y: number, outside = false) {
    const target = document
      .elementFromPoint(x, y)
      ?.closest("[data-passage-note]");
    if (target && this.nodes.has(target)) return this.nodes.get(target);
    let nearest: number | undefined,
      distance = Infinity;
    for (const line of this.lines) {
      const matrix = line.svg.getScreenCTM();
      if (!matrix) continue;
      const point = new DOMPoint(x, y).matrixTransform(matrix.inverse());
      for (const { index, box } of line.notes) {
        const d = Math.hypot(
          Math.max(box.left - point.x, 0, point.x - box.right),
          Math.max(box.top - point.y, 0, point.y - box.bottom),
        );
        if (d < distance) {
          distance = d;
          nearest = index;
        }
      }
    }
    return outside || distance <= 70 ? nearest : undefined;
  }
  private box(node: SVGGraphicsElement, svg: SVGSVGElement): Box {
    const b = node.getBoundingClientRect(),
      inverse = svg.getScreenCTM()!.inverse();
    const a = new DOMPoint(b.left, b.top).matrixTransform(inverse),
      z = new DOMPoint(b.right, b.bottom).matrixTransform(inverse);
    return { left: a.x, right: z.x, top: a.y, bottom: z.y };
  }
  private union(boxes: Box[]): Box | undefined {
    return boxes.length
      ? {
          left: Math.min(...boxes.map((b) => b.left)),
          right: Math.max(...boxes.map((b) => b.right)),
          top: Math.min(...boxes.map((b) => b.top)),
          bottom: Math.max(...boxes.map((b) => b.bottom)),
        }
      : undefined;
  }
  private paint(notify = true) {
    this.paper.querySelectorAll(".passage-shade").forEach((n) => n.remove());
    this.paper.classList.toggle("passage-selecting", this.selecting);
    const range = this.draft || this.range;
    const pointer = this.pointer?.moved ? this.pointer : undefined;
    const moving = pointer && this.location(pointer.lastX, pointer.lastY);
    const ends =
      pointer && moving
        ? [pointer.origin, moving].sort((a, b) => a.line - b.line || a.x - b.x)
        : undefined;
    if (range || ends)
      for (const [lineIndex, line] of this.lines.entries()) {
        let left: number, right: number;
        if (ends) {
          const [from, to] = ends;
          if (
            lineIndex < from.line ||
            lineIndex > to.line ||
            !line.notes.length
          )
            continue;
          left = lineIndex === from.line ? from.x : line.notes[0].box.left - 6;
          right = lineIndex === to.line ? to.x : line.staff.right;
        } else {
          const selected = line.notes.filter(
            (n) => n.index >= range!.start && n.index <= range!.end,
          );
          const ink = this.union(selected.map((n) => n.box));
          if (!ink) continue;
          const first = selected[0],
            last = selected.at(-1)!;
          const before = [...line.notes]
              .reverse()
              .find((n) => n.index < first.index),
            after = line.notes.find((n) => n.index > last.index);
          left = before
            ? Math.min(ink.left - 3, (before.box.right + ink.left) / 2)
            : ink.left - 6;
          right = after
            ? Math.max(ink.right + 3, (ink.right + after.box.left) / 2)
            : line.staff.right;
        }
        const top = line.band.top - 6,
          bottom = line.band.bottom + 6;
        const rect = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "rect",
        );
        rect.setAttribute("class", "passage-shade");
        rect.setAttribute("aria-hidden", "true");
        for (const [k, v] of Object.entries({
          x: left,
          y: top,
          width: Math.max(1, right - left),
          height: bottom - top,
        }))
          rect.setAttribute(k, String(v));
        line.svg.append(rect);
      }
    if (notify) this.changed();
  }
}
