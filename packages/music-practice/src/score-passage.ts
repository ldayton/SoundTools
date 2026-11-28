import { RendererLifetime } from "./renderer-lifetime";
import type { PracticeEvent } from "./practice-score";

import {
  PassageSelection,
  barPassage,
  passageLabel,
  positionLabel,
  type Passage,
} from "./passage-selection";
export type { Passage } from "./passage-selection";
type Box = { left: number; right: number; top: number; bottom: number };
type Location = { line: number; x: number };
type ScoreLine = {
  svg: SVGSVGElement;
  staff: Box;
  band: Box;
  notes: { index: number; box: Box }[];
  measures: Map<number, { left: number; right: number }>;
};

/** A musical span, not a rectangular lasso. Each system gets its own full-height band. */
export class ScorePassage {
  private lifetime = new RendererLifetime();
  private selection = new PassageSelection();
  get range() {
    return this.selection.range;
  }
  selecting = false;
  private events: PracticeEvent[] = [];
  private keyboardAnchor?: number;
  private keyboardHead?: number;
  private keyboardSelecting = false;
  private paintedCursor = -1;
  private handles = new Map<"start" | "end", HTMLButtonElement>();
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
    side?: "start" | "end";
  };
  private nodes = new Map<Element, number>();
  private lines: ScoreLine[] = [];
  private scrollFrame = 0;
  private horizontallyScrollable = false;
  private get viewport() {
    return this.paper.closest<HTMLElement>(".sequence-score")!;
  }
  dispose() {
    if (this.lifetime.disposed) return;
    this.lifetime.dispose();
    this.stopPointer();
    this.nodes.clear();
    this.lines = [];
  }
  constructor(
    private paper: HTMLElement,
    private changed: () => void,
    private committed: () => void,
    private cancelled: () => void,
    private started: () => void,
    private seek: (index: number) => void,
  ) {
    for (const side of ["start", "end"] as const) {
      const handle = document.createElement("button");
      handle.type = "button";
      handle.className = `passage-handle passage-handle-${side}`;
      handle.dataset.passageHandle = side;
      handle.setAttribute("aria-label", `Selection ${side}`);
      handle.setAttribute("role", "slider");
      handle.setAttribute("aria-orientation", "horizontal");
      handle.title = `Drag selection ${side}; use arrow keys to adjust`;
      handle.hidden = true;
      this.handles.set(side, handle);
    }
    this.lifetime.listen(paper, "pointerdown", (e) => {
      if (e.button !== 0 || this.pointer) return;
      const side = (e.target as Element).closest<HTMLElement>(
        "[data-passage-handle]",
      )?.dataset.passageHandle as "start" | "end" | undefined;
      const opposite =
        side && this.range
          ? side === "start"
            ? this.range.end
            : this.range.start
          : undefined;
      const index = opposite ?? this.hit(e.clientX, e.clientY, true);
      const origin =
        side && opposite !== undefined
          ? this.boundary(opposite, side === "start" ? "end" : "start")
          : this.location(e.clientX, e.clientY);
      if (index === undefined || !origin) return;
      e.preventDefault();
      this.keyboardAnchor = this.keyboardHead = undefined;
      this.viewport.dataset.pointerSelection = "";
      (side ? this.handles.get(side)! : this.viewport).focus({
        preventScroll: true,
      });
      paper.setPointerCapture(e.pointerId);
      this.pointer = {
        id: e.pointerId,
        index,
        origin,
        x: e.clientX,
        y: e.clientY,
        lastX: e.clientX,
        lastY: e.clientY,
        moved: !!side,
        side,
      };
      if (side) {
        this.begin();
        this.autoScroll();
        this.paint();
      }
    });
    this.lifetime.listen(paper, "pointermove", (e) => {
      const p = this.pointer;
      if (!p || p.id !== e.pointerId) return;
      p.lastX = e.clientX;
      p.lastY = e.clientY;
      // Wide indivisible bars need native touch panning. Double-tap a bar
      // and drag its handles to select there; fitted scores keep drag selection.
      if(e.pointerType === "touch" && this.horizontallyScrollable && !p.side)return;
      // Vertical touch gestures remain native scrolling; horizontal drags select.
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
    this.lifetime.listen(paper, "pointerup", (e) => {
      const p = this.pointer;
      if (!p || p.id !== e.pointerId) return;
      this.stopPointer();
      if (p.moved) {
        const endpoint = this.hit(e.clientX, e.clientY, true) ?? p.index;
        this.draft = this.normalized(p.index, endpoint);
        const side =
          p.side &&
          (p.side === "start"
            ? endpoint > p.index
              ? "end"
              : "start"
            : endpoint < p.index
              ? "start"
              : "end");
        this.finish(side);
      } else this.seekAt(p.index);
    });
    this.lifetime.listen(paper, "pointercancel", (e) => {
      if (this.pointer?.id === e.pointerId) this.cancelGesture();
    });
    this.lifetime.listen(paper, "lostpointercapture", (e) => {
      if (this.pointer?.id === e.pointerId) this.cancelGesture();
    });
    this.lifetime.listen(window, "blur", () => this.cancelGesture());
    this.lifetime.listen(document, "visibilitychange", () => {
      if (document.hidden) this.cancelGesture();
    });
    this.lifetime.listen(paper, "dblclick", (e) => {
      if ((e.target as Element).closest("[data-passage-handle]")) return;
      const index = this.hit(e.clientX, e.clientY);
      if (index === undefined) return;
      e.preventDefault();
      this.begin();
      this.draft = barPassage(
        this.events.map((e) => e.scorePosition),
        index,
      );
      this.finish();
    });
    this.lifetime.listen(this.viewport, "keydown", (e) => this.keydown(e));
  }
  private seekAt(index: number) {
    this.keyboardAnchor = this.keyboardHead = undefined;
    this.selection.cursor = this.selection.clamp(index);
    this.seek(this.selection.cursor);
  }
  setPosition(index: number) {
    this.selection.cursor = this.selection.clamp(index);
    if (!this.keyboardSelecting)
      this.keyboardAnchor = this.keyboardHead = undefined;
    this.paintPosition();
  }
  restoreHandleFocus(side: string) {
    if (side !== "start" && side !== "end") return;
    const handle = this.handles.get(side);
    if (handle && !handle.hidden) handle.focus({ preventScroll: true });
  }
  private paintPosition() {
    if (this.paintedCursor === this.selection.cursor) return;
    this.paintedCursor = this.selection.cursor;
    for (const [node, note] of this.nodes) {
      if (note === this.selection.cursor)
        node.setAttribute("aria-current", "true");
      else node.removeAttribute("aria-current");
    }
  }
  get label() {
    return this.range
      ? passageLabel(
          this.events.map((e) => e.scorePosition),
          this.range,
        )
      : "";
  }
  private keydown(e: KeyboardEvent) {
    if (!this.events.length) return;
    const viewport = this.viewport;
    delete viewport.dataset.pointerSelection;
    if (e.key === "Escape" && this.selecting) {
      e.preventDefault();
      e.stopPropagation();
      this.cancel();
      this.cancelled();
      return;
    }
    if (
      (e.metaKey || e.ctrlKey) &&
      !e.shiftKey &&
      !e.altKey &&
      e.key.toLowerCase() === "z"
    ) {
      this.keyboardAnchor = this.keyboardHead = undefined;
      if (this.selecting) {
        this.cancel();
        this.cancelled();
      } else if (this.selection.undo()) {
        this.paint();
        this.committed();
        viewport.focus({ preventScroll: true });
      }
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    const side = (e.target as Element).closest<HTMLElement>(
      "[data-passage-handle]",
    )?.dataset.passageHandle as "start" | "end" | undefined;
    const delta = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
    if (
      (delta || e.key === "Home" || e.key === "End") &&
      !e.altKey &&
      !e.metaKey &&
      !e.ctrlKey
    ) {
      e.preventDefault();
      e.stopPropagation();
      if (side && this.range) {
        const old = this.range[side];
        const next =
          e.key === "Home"
            ? 0
            : e.key === "End"
              ? this.events.length - 1
              : old + delta;
        this.begin();
        this.draft =
          side === "start"
            ? {
                start: Math.min(this.selection.clamp(next), this.range.end),
                end: this.range.end,
              }
            : {
                start: this.range.start,
                end: Math.max(this.selection.clamp(next), this.range.start),
              };
        this.finish(side);
      } else if (e.shiftKey) {
        this.keyboardAnchor ??= this.selection.cursor;
        const next = this.selection.clamp(
          e.key === "Home"
            ? 0
            : e.key === "End"
              ? this.events.length - 1
              : (this.keyboardHead ?? this.selection.cursor) + delta,
        );
        this.keyboardSelecting = true;
        try {
          this.begin();
          this.draft = this.normalized(this.keyboardAnchor, next);
          this.finish();
        } finally {
          this.keyboardSelecting = false;
        }
        this.keyboardHead = next;
        this.selection.cursor = next;
      } else
        this.seekAt(
          e.key === "Home"
            ? 0
            : e.key === "End"
              ? this.events.length - 1
              : this.selection.cursor + delta,
        );
      return;
    }
    const index = this.nodes.get(e.target as Element);
    if (index !== undefined && ["Enter", " "].includes(e.key)) {
      e.preventDefault();
      e.stopPropagation();
      this.seekAt(index);
    }
  }
  bind(events: PracticeEvent[]) {
    if (this.pointer) this.cancelGesture();
    this.events = events;
    // Reflow owns its scroll frame. Passage handles must not disable access
    // to an indivisible bar wider than that frame. Legacy wrapped views keep
    // their existing margin policy.
    if(this.paper.dataset.scoreLayout !== "reflow")this.paper.style.overflow = "visible";
    this.horizontallyScrollable=this.paper.scrollWidth>this.paper.clientWidth+1;
    this.paper.style.touchAction=this.horizontallyScrollable?"pan-x pan-y":"";
    this.paintedCursor = -1;
    this.selection.bind(events.length);
    this.nodes.clear();
    this.lines = [];
    const systems = new Map<SVGSVGElement, ScoreLine>();
    events.forEach((event, index) => {
      const ink = new Map<SVGSVGElement, Box[]>();
      for (const node of (event.elements || []).flat()) {
        if (!node || node.closest(".guitar-chord-trigger")) continue;
        this.nodes.set(node, index);
        node.setAttribute("data-passage-note", String(index));
        node.setAttribute("tabindex", "-1");
        node.setAttribute("role", "button");
        node.setAttribute(
          "aria-label",
          event.scorePosition
            ? `Go to ${positionLabel(event.scorePosition).toLowerCase()}`
            : `Go to note ${index + 1}`,
        );
        if (event.scorePosition) {
          node.setAttribute("data-score-bar", String(event.scorePosition.bar));
          node.setAttribute(
            "data-score-beat",
            String(event.scorePosition.beat),
          );
        }
        const svg = node.closest("svg") as SVGSVGElement | null;
        if (!svg) continue;
        if (!systems.has(svg)) {
          const staff = this.union(
            [...svg.querySelectorAll<SVGGraphicsElement>(".abcjs-staff")].map(
              (n) => this.box(n, svg),
            ),
          );
          if (!staff) continue;
          systems.set(svg, {
            svg,
            staff,
            band: staff,
            notes: [],
            measures: new Map(),
          });
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
    for (const line of this.lines) {
      line.band = this.union([line.staff, ...line.notes.map((n) => n.box)])!;
      const bars = new Map<number, number>();
      for (const bar of line.svg.querySelectorAll<SVGGraphicsElement>(
        ".abcjs-bar",
      )) {
        const measure = /(?:^|\s)abcjs-mm(\d+)(?:\s|$)/.exec(
          bar.getAttribute("class") || "",
        );
        if (measure)
          bars.set(Number(measure[1]), this.box(bar, line.svg).right);
      }
      let left = line.staff.left;
      for (const [measure, right] of [...bars].sort((a, b) => a[0] - b[0])) {
        line.measures.set(measure, { left, right });
        left = right;
      }
    }
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
    this.keyboardAnchor = this.keyboardHead = undefined;
    this.stopPointer();
    this.paint();
  }
  clear() {
    this.cancel();
    this.selection.clear();
    this.paint();
  }
  reset() {
    this.cancel();
    this.selection.reset();
    this.paint();
  }
  private cancelGesture() {
    if (!this.pointer) return;
    const dragging = this.pointer.moved;
    this.cancel();
    if (dragging) this.cancelled();
  }
  private normalized(a: number, b: number): Passage {
    return {
      start: this.selection.clamp(Math.min(a, b)),
      end: this.selection.clamp(Math.max(a, b)),
    };
  }
  private finish(side?: "start" | "end") {
    const range = this.draft;
    if (
      side &&
      range &&
      this.range?.wholeBars &&
      range.start === this.range.start &&
      range.end === this.range.end
    )
      range.wholeBars = true;
    const changed =
      !!range && this.selection.select(range.start, range.end, range.wholeBars);
    this.draft = undefined;
    this.selecting = false;
    this.paint();
    if (changed) this.committed();
    else this.cancelled();
    if (side) this.handles.get(side)?.focus({ preventScroll: true });
  }
  private stopPointer() {
    const id = this.pointer?.id;
    this.pointer = undefined;
    if (id !== undefined && this.paper.hasPointerCapture(id))
      this.paper.releasePointerCapture(id);
    cancelAnimationFrame(this.scrollFrame);
    this.scrollFrame = 0;
  }
  private boundary(index: number, side: "start" | "end"): Location | undefined {
    for (const [i, line] of this.lines.entries()) {
      const note = line.notes.find((n) => n.index === index);
      if (!note) continue;
      const previous = [...line.notes].reverse().find((n) => n.index < index);
      const next = line.notes.find((n) => n.index > index);
      return {
        line: i,
        x:
          side === "start"
            ? previous
              ? Math.min(
                  note.box.left - 3,
                  (previous.box.right + note.box.left) / 2,
                )
              : note.box.left - 6
            : next
              ? Math.max(
                  note.box.right + 3,
                  (note.box.right + next.box.left) / 2,
                )
              : line.staff.right,
      };
    }
  }
  private autoScroll() {
    const p = this.pointer;
    if (!p?.moved) return;
    const viewport = this.viewport,
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
    for (const handle of this.handles.values())
      if (!this.paper.contains(handle)) this.paper.append(handle);
    const blocks: {
      line: ScoreLine;
      left: number;
      right: number;
      top: number;
      bottom: number;
    }[] = [];
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
          if (range!.wholeBars) {
            const firstMeasure = this.events[first.index].measureNumber;
            const lastMeasure = this.events[last.index].measureNumber;
            if (firstMeasure !== undefined)
              left = line.measures.get(firstMeasure)?.left ?? left;
            if (lastMeasure !== undefined)
              right = line.measures.get(lastMeasure)?.right ?? right;
          }
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
        blocks.push({ line, left, right, top, bottom });
      }
    if (!blocks.length)
      for (const handle of this.handles.values()) handle.hidden = true;
    if (blocks.length) {
      const paper = this.paper.getBoundingClientRect();
      for (const side of ["start", "end"] as const) {
        const block = side === "start" ? blocks[0] : blocks.at(-1)!;
        const matrix = block.line.svg.getScreenCTM();
        if (!matrix) continue;
        const a = new DOMPoint(
          side === "start" ? block.left : block.right,
          block.top,
        ).matrixTransform(matrix);
        const b = new DOMPoint(0, block.bottom).matrixTransform(matrix);
        const handle = this.handles.get(side)!;
        handle.hidden = false;
        handle.style.left = `${a.x - paper.left + this.paper.scrollLeft - 22}px`;
        handle.style.top = `${a.y - paper.top + this.paper.scrollTop - 12}px`;
        handle.style.height = `${Math.max(44, b.y - a.y + 24)}px`;
        const point = this.events[this.range?.[side] ?? 0]?.scorePosition;
        handle.setAttribute("aria-valuemin", "1");
        handle.setAttribute("aria-valuemax", String(this.events.length));
        handle.setAttribute(
          "aria-valuenow",
          String((this.range?.[side] ?? 0) + 1),
        );
        handle.setAttribute(
          "aria-valuetext",
          point ? positionLabel(point) : "Selected note",
        );
      }
    }
    this.paintPosition();
    if (notify) this.changed();
  }
}
