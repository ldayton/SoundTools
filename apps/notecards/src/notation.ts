import {
  Renderer,
  Stave,
  StaveNote,
  TabStave,
  TabNote,
  Formatter,
  BarlineType,
  VexFlow,
} from "vexflow/bravura";
import type { Card } from "./model";
import type { GuitarCard } from "./guitar";
export { VexFlow };
export function drawNotation(
  element: HTMLDivElement,
  card: Card,
  key: string,
  tab = false,
  guitar = true,
) {
  element.replaceChildren();
  const renderer = new Renderer(element, Renderer.Backends.SVG);
  renderer.resize(600, tab ? 300 : 325);
  const context = renderer.getContext();
  context.setFillStyle("#302d55").setStrokeStyle("#302d55");
  if (tab) {
    const guitar = card as GuitarCard;
    const stave = new TabStave(14, -8, 244);
    stave
      .addTabGlyph()
      .setBegBarType(BarlineType.NONE)
      .setEndBarType(BarlineType.NONE)
      .setContext(context)
      .draw();
    const note = new TabNote({
      positions: [{ str: guitar.string, fret: guitar.fret }],
      duration: "w",
      alignCenter: true,
    });
    Formatter.FormatAndDraw(context, stave, [note]);
  } else {
    const stave = new Stave(14, -2, 244);
    stave
      .addClef("treble", "default", guitar ? "8vb" : undefined)
      .addKeySignature(key)
      .setBegBarType(BarlineType.NONE)
      .setEndBarType(BarlineType.NONE)
      .setContext(context)
      .draw();
    const note = new StaveNote({
      keys: [`${card.letter.toLowerCase()}/${card.octave + (guitar ? 1 : 0)}`],
      duration: "w",
      clef: "treble",
      alignCenter: true,
    });
    Formatter.FormatAndDraw(context, stave, [note]);
  }
  finishNotation(element, tab);
  if (!guitar && !tab) {
    const svg = element.querySelector("svg")!;
    const box = svg.querySelector("g")!.getBBox();
    const top = Math.min(-25, box.y * 2.2 - 16);
    const bottom = Math.max(300, (box.y + box.height) * 2.2 + 16);
    svg.setAttribute("viewBox", `0 ${top} 600 ${bottom - top}`);
  }
}
function finishNotation(element: HTMLDivElement, tab = false) {
  const svg = element.querySelector("svg")!;
  // Leave headroom for high guitar pitches spelled above E (for example F♭6).
  svg.setAttribute("viewBox", tab ? "0 0 600 300" : "0 -25 600 325");
  svg.setAttribute("aria-hidden", "true");
  const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
  group.setAttribute("transform", "scale(2.2)");
  while (svg.firstChild) group.append(svg.firstChild);
  svg.append(group);
}

export function drawKeySignature(element: HTMLDivElement, key: string) {
  element.replaceChildren();
  const renderer = new Renderer(element, Renderer.Backends.SVG);
  renderer.resize(600, 325);
  const context = renderer.getContext();
  context.setFillStyle("#302d55").setStrokeStyle("#302d55");
  new Stave(14, -2, 244)
    .addClef("treble")
    .addKeySignature(key)
    .setBegBarType(BarlineType.NONE)
    .setEndBarType(BarlineType.NONE)
    .setContext(context)
    .draw();
  finishNotation(element);
}
