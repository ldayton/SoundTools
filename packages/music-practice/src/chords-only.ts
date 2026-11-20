import type { TuneObject, AbsoluteElement } from "abcjs";
/** Keep the score's chord symbols, lyric alignment and bar numbers as a compact chart. */
export function showChordsOnly(paper: HTMLElement, tune?: TuneObject) {
  const ns = "http://www.w3.org/2000/svg";
  // A dash makes tied continuations explicit even when the notation is hidden.
  for (const line of tune?.lines || []) {
    let barStart = true;
    for (const note of line.staff?.[0]?.voices?.[0] || []) {
      if (note.el_type === "bar") {
        barStart = true;
        continue;
      }
      if (note.el_type !== "note") continue;
      const opening = barStart;
      barStart = false;
      if (
        !opening ||
        !note.pitches?.length ||
        !note.pitches.every((p) => p.endTie)
      )
        continue;
      const absolute = note.abselem as AbsoluteElement | undefined,
        node = absolute?.elemset?.[0] as SVGGraphicsElement | undefined;
      const svg = node?.ownerSVGElement;
      if (!svg || absolute?.x === undefined) continue;
      const model =
        svg.querySelector<SVGTextElement>("text.abcjs-chord") ||
        paper.querySelector<SVGTextElement>("text.abcjs-chord");
      const mark =
        (model?.cloneNode(false) as SVGTextElement) ||
        document.createElementNS(ns, "text");
      mark.setAttribute("class", "abcjs-chord chord-hold");
      mark.removeAttribute("transform");
      mark.setAttribute("x", String(absolute.x + 5));
      const local = svg.querySelector<SVGGraphicsElement>(".abcjs-chord");
      const y = local
        ? local.getBBox().y + local.getBBox().height - 3
        : (svg.querySelector<SVGGraphicsElement>(".abcjs-staff")?.getBBox().y ||
            0) - 20;
      mark.setAttribute("y", String(y));
      mark.setAttribute("font-size", "16");
      mark.setAttribute("font-family", "sans-serif");
      mark.setAttribute("aria-label", "Hold previous chord");
      mark.textContent = "—";
      svg.append(mark);
    }
  }
  for (const svg of paper.querySelectorAll("svg")) {
    svg.classList.add("chords-only-score");
    const keep =
      ".abcjs-chord,.abcjs-lyric,.abcjs-bar-number,.abcjs-part,.abcjs-tempo";
    for (const ink of svg.querySelectorAll<SVGElement>(
      "path,text,rect,line,circle,polygon",
    )) {
      if (!ink.closest(keep)) ink.style.visibility = "hidden";
    }
    const chords = [
      ...svg.querySelectorAll<SVGGraphicsElement>(".abcjs-chord"),
    ];
    const lyrics = [
      ...svg.querySelectorAll<SVGGraphicsElement>(".abcjs-lyric"),
    ].filter((n) => n.textContent?.trim());
    if (!chords.length) continue;
    const chordBottom = Math.max(
      ...chords.map((n) => n.getBBox().y + n.getBBox().height),
    );
    const lyricTop = lyrics.length
      ? Math.min(...lyrics.map((n) => n.getBBox().y))
      : chordBottom + 16;
    const shift = chordBottom + 16 - lyricTop;
    for (const lyric of lyrics)
      lyric.setAttribute("transform", `translate(0 ${shift})`);
    const top = Math.min(...chords.map((n) => n.getBBox().y)) - 4;
    for (const fermata of svg.querySelectorAll<SVGGraphicsElement>(
      '[data-name="scripts.ufermata"]',
    )) {
      const box = fermata.getBBox();
      fermata.classList.add("chord-chart-fermata");
      fermata.style.visibility = "visible";
      fermata.setAttribute(
        "transform",
        `translate(0 ${top - 12 - box.y - box.height})`,
      );
    }
    const bottom = lyrics.length
      ? Math.max(...lyrics.map((n) => n.getBBox().y + n.getBBox().height)) +
        shift +
        4
      : chordBottom + 32;
    for (const mark of svg.querySelectorAll<SVGGraphicsElement>(
      ".abcjs-bar-number",
    )) {
      const box = mark.getBBox();
      mark.setAttribute(
        "transform",
        `translate(0 ${top - 8 - box.y - box.height})`,
      );
    }
    const dividers = document.createElementNS(ns, "g");
    dividers.classList.add("chord-chart-bars");
    for (const bar of svg.querySelectorAll<SVGGraphicsElement>(
      '.abcjs-bar.abcjs-v0 [data-name="bar"]',
    )) {
      const box = bar.getBBox(),
        line = document.createElementNS(ns, "line");
      line.setAttribute("x1", String(box.x));
      line.setAttribute("x2", String(box.x));
      line.setAttribute("y1", String(top));
      line.setAttribute("y2", String(bottom));
      line.setAttribute("stroke", "currentColor");
      line.setAttribute("stroke-width", String(box.width));
      dividers.append(line);
    }
    svg.append(dividers);
  }
}

/** Keep chord symbols and position indications above forced melody stems/beams. */
export function spaceGuitarSymbols(paper: HTMLElement) {
  for (const svg of paper.querySelectorAll("svg")) {
    const chords = [
      ...svg.querySelectorAll<SVGGraphicsElement>(".abcjs-chord"),
    ];
    if (!chords.length) continue;
    const music = [
      ...svg.querySelectorAll<SVGGraphicsElement>(
        ".abcjs-note:not(.abcjs-tabNumber) path,.abcjs-beam",
      ),
    ].filter((n) => !n.closest(".abcjs-lyric,.abcjs-chord,.abcjs-annotation"));
    const top = Math.min(...music.map((n) => n.getBBox().y));
    const bottom = Math.min(
      ...chords.map((n) => n.getBBox().y + n.getBBox().height),
      top - 10,
    );
    for (const chord of chords) {
      const box = chord.getBBox();
      chord.setAttribute(
        "transform",
        `translate(0 ${bottom - box.y - box.height})`,
      );
    }
    const rowTop = bottom - Math.max(...chords.map((n) => n.getBBox().height));
    for (const position of svg.querySelectorAll<SVGGraphicsElement>(
      ".abcjs-annotation",
    )) {
      if (!/^(I|III|VII)$/.test(position.textContent?.trim() || "")) continue;
      const box = position.getBBox();
      position.setAttribute(
        "transform",
        `translate(0 ${rowTop - 7 - box.y - box.height})`,
      );
    }
  }
}
