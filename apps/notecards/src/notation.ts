import { FLASHCARD_NOTATION_WIDTH } from "./notation-metrics";
import {
  Renderer,
  Stave,
  StaveNote,
  StaveConnector,
  TabStave,
  TabNote,
  Formatter,
  BarlineType,
  VexFlow,
} from "vexflow/bravura";
import type { Card } from "./model";
import type { GuitarCard } from "./guitar";
import { pianoNotation, type PianoNotation } from "./piano-notation";
import { pianoDeck } from "./piano-model";
import type { Profile } from "./exercise-settings";
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
    // Fixed bounds include C2–B6 ledger lines and every supported key signature.
    // Per-note bounds change SVG scaling and make the staff appear to breathe.
    svg.setAttribute("viewBox", "0 -220 600 765");
    svg.setAttribute("height", "765");
    // VexFlow writes fixed inline pixel dimensions; let CSS preserve this aspect ratio.
    svg.style.width = `${FLASHCARD_NOTATION_WIDTH}px`;
    svg.style.height = "auto";
  }
}
function finishNotation(element: HTMLDivElement, tab = false) {
  const svg = element.querySelector("svg")!;
  // Leave headroom for high guitar pitches spelled above E (for example F♭6).
  svg.setAttribute("viewBox", tab ? "0 0 600 300" : "0 -25 600 325");
  svg.setAttribute("aria-hidden", "true");
  svg.style.width = `${FLASHCARD_NOTATION_WIDTH}px`;
  svg.style.height = "auto";
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

/** A fixed frame per layout, independent of pitch, clef choice and octave marking. */
export function drawPianoNotation(
  element: HTMLDivElement,
  notation: PianoNotation,
  key: string,
  practiceFrame?: readonly [number, number],
) {
  element.replaceChildren();
  const { layout, clef, written, octaveShift } = notation;
  const renderer = new Renderer(element, Renderer.Backends.SVG);
  renderer.resize(600, 765);
  const context = renderer.getContext();
  context.setFillStyle("#302d55").setStrokeStyle("#302d55");
  const makeStaff = (staffClef: "treble" | "bass", y: number) =>
    new Stave(20, y, 244)
      .addClef(staffClef)
      .addKeySignature(key)
      .setBegBarType(BarlineType.NONE)
      .setEndBarType(BarlineType.NONE)
      .setContext(context);
  const top = makeStaff(layout === "bass" ? "bass" : "treble", -2);
  const bottom = layout === "grand" ? makeStaff("bass", 138) : undefined;
  if (bottom) {
    const start = Math.max(top.getNoteStartX(), bottom.getNoteStartX());
    top.setNoteStartX(start);
    bottom.setNoteStartX(start);
  }
  top.draw();
  bottom?.draw();
  if (bottom)
    new StaveConnector(top, bottom).setType("brace").setContext(context).draw();
  const stave = bottom && clef === "bass" ? bottom : top;
  const note = new StaveNote({
    keys: [`${written.letter.toLowerCase()}/${written.octave}`],
    duration: "w",
    clef,
    alignCenter: true,
  });
  Formatter.FormatAndDraw(context, stave, [note]);
  finishNotation(element);
  const svg = element.querySelector("svg")!;
  const group = svg.querySelector("g")!;
  // SVG text bounds include the font's whole em box, not just the musical glyph.
  // Use staff geometry and the notehead/ledger position for the painted envelope.
  let inkTop = Math.min(top.getYForLine(0) - 24, note.getYs()[0] - 8);
  let inkBottom = Math.max(
    (bottom || top).getYForLine(4) + 24,
    note.getYs()[0] + 8,
  );
  if (octaveShift) {
    // A one-note ottava bracket: above for 8va, below for 8vb; hook points toward the staff.
    const up = octaveShift > 0;
    const x = note.getAbsoluteX() - 2;
    const y = up
      ? Math.min(stave.getYForLine(0) - 24, note.getYs()[0] - 24)
      : Math.max(stave.getYForLine(4) + 28, note.getYs()[0] + 28);
    inkTop = Math.min(inkTop, y - 16);
    inkBottom = Math.max(inkBottom, y + 6);
    const label = document.createElementNS(svg.namespaceURI, "text");
    label.setAttribute("x", String(x));
    label.setAttribute("y", String(y));
    label.setAttribute("font-family", "serif");
    label.setAttribute("font-style", "italic");
    label.setAttribute("font-size", "14");
    label.setAttribute("stroke", "none");
    label.setAttribute("class", "octave-sign");
    label.textContent = up ? "8va" : "8vb";
    group.append(label);
    const bracket = document.createElementNS(svg.namespaceURI, "path");
    const lineY = y - 4;
    bracket.setAttribute(
      "d",
      `M ${x + 26} ${lineY} H ${x + 55} v ${up ? 6 : -6}`,
    );
    bracket.setAttribute("stroke-dasharray", "3 2");
    bracket.setAttribute("fill", "none");
    group.append(bracket);
  }
  // Bass-only uses the same frame height/scale as treble, shifted up for its ledger notes.
  const frame =
    practiceFrame ??
    (layout === "grand"
      ? [-240, 1000]
      : layout === "bass"
        ? [-370, 765]
        : [-220, 765]);
  svg.setAttribute("viewBox", `0 ${frame[0]} 600 ${frame[1]}`);
  svg.setAttribute("height", String(frame[1]));
  svg.style.width = `${FLASHCARD_NOTATION_WIDTH}px`;
  svg.style.height = "auto";
  svg.dataset.inkTop = String(inkTop * 2.2);
  svg.dataset.inkBottom = String(inkBottom * 2.2);
  svg.dataset.clef = clef;
  svg.dataset.octaveShift = String(octaveShift);
  svg.dataset.written = `${written.letter}${written.octave}`;
  svg.dataset.noteY = String(note.getYs()[0]);
  svg.dataset.staffTop = String(stave.getYForLine(0));
}

const pianoFrames = new Map<string, readonly [number, number]>();
/** Measure the union of every allowed prompt, once per settings combination.
 * Never use the current question to size the frame: that would move the staff.
 */
export function pianoPracticeFrame(
  profile: Profile,
): readonly [number, number] {
  const signature = JSON.stringify([
    profile.low,
    profile.high,
    profile.key,
    profile.staffLayout || "grand",
    profile.overlapPractice || "standard",
    profile.octavePractice || "off",
  ]);
  const cached = pianoFrames.get(signature);
  if (cached) return cached;
  const probe = document.createElement("div");
  probe.setAttribute("aria-hidden", "true");
  probe.style.cssText =
    "position:fixed;left:-10000px;top:0;width:600px;visibility:hidden;pointer-events:none";
  document.body.append(probe);
  let top = Infinity,
    bottom = -Infinity;
  try {
    for (const card of pianoDeck(profile)) {
      // Eligible overlap and octave ranges are disjoint; the two extremes cover both choices.
      for (const choice of [0, 1]) {
        drawPianoNotation(
          probe,
          pianoNotation(card, profile, () => choice),
          profile.key,
        );
        const svg = probe.querySelector("svg")!;
        top = Math.min(top, Number(svg.dataset.inkTop));
        bottom = Math.max(bottom, Number(svg.dataset.inkBottom));
      }
    }
  } finally {
    probe.remove();
  }
  const frame = [
    Math.floor(top - 20),
    Math.ceil(bottom + 20) - Math.floor(top - 20),
  ] as const;
  // Bound the cache while retaining recently used practice settings.
  if (pianoFrames.size >= 32)
    pianoFrames.delete(pianoFrames.keys().next().value!);
  pianoFrames.set(signature, frame);
  return frame;
}
