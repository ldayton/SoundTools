import type { PracticeEvent } from "./practice-score";

export type Passage = { start: number; end: number };

/** Mouse users can drag or tap the two ends. Touch uses two taps so ordinary
 * vertical score scrolling remains available between them. */
export class ScorePassage {
  range?: Passage;
  selecting = false;
  private anchor?: number;
  private draft?: Passage;
  private pointer?: {
    id: number;
    index: number;
    x: number;
    y: number;
    moved: boolean;
  };
  private nodes = new Map<Element, number>();
  constructor(
    private paper: HTMLElement,
    private changed: () => void,
    private committed: () => void,
    private cancelled: () => void,
  ) {
    paper.addEventListener("pointerdown", (e) => {
      if (!this.selecting || e.button !== 0 || this.pointer) return;
      const index = this.hit(e.clientX, e.clientY);
      if (index === undefined) return;
      e.preventDefault();
      paper.setPointerCapture(e.pointerId);
      this.pointer = {
        id: e.pointerId,
        index,
        x: e.clientX,
        y: e.clientY,
        moved: false,
      };
    });
    paper.addEventListener("pointermove", (e) => {
      const p = this.pointer;
      if (!p || p.id !== e.pointerId || e.pointerType === "touch") return;
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < 6) return;
      p.moved = true;
      const index = this.hit(e.clientX, e.clientY);
      if (index !== undefined) this.preview(p.index, index);
      const viewport = paper.parentElement!;
      const box = viewport.getBoundingClientRect();
      if (e.clientY > box.bottom - 32) viewport.scrollTop += 12;
      if (e.clientY < box.top + 32) viewport.scrollTop -= 12;
    });
    paper.addEventListener("pointerup", (e) => {
      const p = this.pointer;
      if (!p || p.id !== e.pointerId) return;
      this.pointer = undefined;
      if (p.moved) {
        this.preview(p.index, this.hit(e.clientX, e.clientY) ?? p.index);
        this.finish();
      } else this.choose(p.index);
    });
    paper.addEventListener("lostpointercapture", () => {
      this.pointer = undefined;
    });
    paper.addEventListener("pointercancel", () => {
      this.pointer = undefined;
    });
    paper.addEventListener("keydown", (e) => {
      if (!this.selecting) return;
      if (e.key === "Escape") {
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
    events.forEach((event, i) => {
      for (const node of (event.elements || []).flat()) {
        if (!node) continue;
        this.nodes.set(node, i);
        node.setAttribute("data-passage-note", String(i));
      }
    });
    this.paint();
  }
  begin() {
    this.draft = undefined;
    this.selecting = true;
    this.anchor = undefined;
    this.paint();
  }
  cancel() {
    this.draft = undefined;
    this.selecting = false;
    this.anchor = undefined;
    this.pointer = undefined;
    this.paint();
  }
  clear() {
    this.cancel();
    this.range = undefined;
    this.paint();
  }
  private choose(index: number) {
    if (this.anchor === undefined) {
      this.anchor = index;
      this.preview(index, index);
    } else {
      this.preview(this.anchor, index);
      this.finish();
    }
  }
  private preview(a: number, b: number) {
    this.draft = { start: Math.min(a, b), end: Math.max(a, b) };
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
  private hit(x: number, y: number) {
    const target = document
      .elementFromPoint(x, y)
      ?.closest("[data-passage-note]");
    if (target && this.nodes.has(target)) return this.nodes.get(target);
    let nearest: number | undefined,
      distance = Infinity;
    for (const [node, i] of this.nodes) {
      const b = node.getBoundingClientRect();
      if (!b.width || !b.height) continue;
      const d = Math.hypot(
        Math.max(b.left - x, 0, x - b.right),
        Math.max(b.top - y, 0, y - b.bottom),
      );
      if (d < distance) {
        distance = d;
        nearest = i;
      }
    }
    return distance <= 70 ? nearest : undefined;
  }
  private paint() {
    this.paper.classList.toggle("passage-selecting", this.selecting);
    const range = this.draft || this.range;
    this.paper.classList.toggle("has-passage", !!range);
    for (const [node, i] of this.nodes) {
      node.classList.toggle(
        "passage-selected",
        !!range && i >= range.start && i <= range.end,
      );
      node.setAttribute("tabindex", this.selecting ? "0" : "-1");
      if (this.selecting) {
        node.setAttribute("role", "button");
        node.setAttribute("aria-label", `Select note ${i + 1}`);
      } else {
        node.removeAttribute("role");
        node.removeAttribute("aria-label");
      }
    }
    this.changed();
  }
}
