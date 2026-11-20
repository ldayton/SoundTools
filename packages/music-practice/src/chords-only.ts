/** Keep the score's chord symbols, lyric alignment and bar numbers as a compact chart. */
export function showChordsOnly(paper: HTMLElement) {
  const ns = "http://www.w3.org/2000/svg";
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
