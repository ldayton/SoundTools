import {anchorScoreInk} from './score-layout/vertical';
import type { AbsoluteElement, TuneObject } from "abcjs";

type Lyric = { syllable: string; divider?: string; hymnRow?: number };
type Anchor = { span: SVGGraphicsElement; text: string; hyphen: boolean };
type Segment = { svg: SVGSVGElement; x1: number; x2: number; y: number; anchor: Anchor; row: number; owner:SVGGraphicsElement };
const namespace = "http://www.w3.org/2000/svg";

/** Convert glyph bounds into the owning SVG's coordinates, including staff zoom. */
function bounds(span: SVGGraphicsElement) {
  const svg = span.ownerSVGElement;
  const root = svg?.getScreenCTM();
  if (!svg || !root || !span.isConnected) return undefined;
  // WebKit's local tspan bbox/CTM combination can miss preceding blank-row
  // offsets. Measure the painted row in screen space, then return to SVG space.
  const transform = root.inverse(), b = span.getBoundingClientRect();
  const from = new DOMPoint(b.left, b.top).matrixTransform(transform);
  const to = new DOMPoint(b.right, b.bottom).matrixTransform(transform);
  return {svg, left: from.x, right: to.x, top: from.y, bottom: to.y};
}

/** Capture lyric identity before tab/chord views move the SVG text nodes.
 * Paint after those transforms, so extenders follow the same visible rows. */
export function prepareHymnMelismas(tune: TuneObject) {
  const entries: ({span: SVGGraphicsElement; lyric: Lyric; index: number} | null)[] = [];
  for (const line of tune.lines) {
    for (const item of line.staff?.[0]?.voices?.[0] || []) {
      if (item.el_type !== "note") continue;
      if (item.rest) { entries.push(null); continue; }
      const absolute = (item as typeof item & {abselem?: AbsoluteElement}).abselem;
      const group = absolute?.elemset[0] as SVGGraphicsElement | undefined;
      const spans = group?.querySelector(".abcjs-lyric")?.querySelectorAll<SVGGraphicsElement>("tspan");
      if (!spans) continue;
      (item.lyric as Lyric[] | undefined)?.forEach((lyric, index) => {
        if (spans[index]) entries.push({span: spans[index], lyric, index});
      });
    }
  }
  return () => {
    const anchors = new Map<number, Anchor>(), segments: Segment[] = [];
    for (const entry of entries) {
      if (!entry) { anchors.clear(); continue; }
      const {span, lyric, index} = entry;
      const syllable = lyric.syllable.replace(/\u2002/g, "").trim();
      const row = lyric.hymnRow ?? index;
      if (syllable !== "_") {
        if (syllable) anchors.set(row, {span, text: syllable, hyphen: lyric.divider === "-"});
        continue;
      }
      const end = bounds(span), anchor = anchors.get(row);
      const start = anchor && bounds(anchor.span);
      // An empty middle tspan can stop advancing SVG's relative dy. Retain
      // a non-inking character so the following stanza stays on its own row.
      span.textContent = "\u00a0";
      if (!end || !start || !anchor) continue;
      const segment = segments.find(s => s.anchor === anchor && s.svg === end.svg);
      const x2 = (end.left + end.right) / 2 + 3;
      if (segment) { segment.x2 = x2; continue; }
      const continuing = start.svg !== end.svg;
      const reference = continuing ? end : start;
      segments.push({ svg: end.svg,
        x1: continuing ? (end.left + end.right) / 2 - 6 : start.right + 3,
        x2,
        y: anchor.hyphen ? (reference.top + reference.bottom) / 2 : reference.bottom + 1,
        anchor, row, owner:span,
      });
    }
    for (const segment of segments) {
      if (segment.x2 <= segment.x1 + 1) continue;
      const group = document.createElementNS(namespace, "g");
      group.classList.add("hymn-lyric-extender");
      group.setAttribute("data-syllable", segment.anchor.text);
      group.setAttribute("data-stanza-row", String(segment.row));
      group.setAttribute("data-kind", segment.anchor.hyphen ? "hyphen" : "word");
      const step = segment.anchor.hyphen ? 10 : segment.x2 - segment.x1;
      for (let x = segment.x1; x < segment.x2; x += step) {
        const ink = document.createElementNS(namespace, "rect");
        for (const [key, value] of Object.entries({x, y: segment.y,
          width: Math.min(segment.anchor.hyphen ? 3 : step, segment.x2-x), height: 0.75}))
          ink.setAttribute(key, String(value));
        ink.setAttribute("fill", "currentColor");
        group.append(ink);
      }
      anchorScoreInk(group,segment.owner);segment.svg.append(group);
    }
  };
}
