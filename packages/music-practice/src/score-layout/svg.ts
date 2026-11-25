import {fitHymnOttava} from "../hymn-ottava";

/** Displayed geometry, independent of an edition or song identity. */
export type ScorePresentation = {
  compact?: boolean;
  octaveNotation?: boolean;
  lyrics?: boolean;
  tablature?: boolean;
  beginner?: boolean;
  view?: "notation" | "tab" | "chords";
};

/** Normalize renderer/instrument geometry before final visible-ink framing. */
export function prepareScoreSvg(svg: SVGSVGElement, presentation: ScorePresentation = {}) {
    if (presentation.octaveNotation) fitHymnOttava(svg);
    if (presentation.compact) {
      const group = svg.querySelector<SVGGraphicsElement>(
        ".abcjs-staff-wrapper",
      );
      if (group) {
        const ink = group.getBBox();
        const box = svg.viewBox.baseVal;
        svg.setAttribute(
          "viewBox",
          `${box.x} ${box.y} ${Math.min(box.width, Math.ceil(ink.x + ink.width + 12))} ${box.height}`,
        );
      }
      svg.style.marginInline = "auto";
    }
    // abcjs's per-system SVG can end exactly at the last lyric's ink bounds.
    // Reserve space inside the viewBox so lower stanzas don't touch its edge.
    const screen = svg.getScreenCTM();
    if (screen && presentation.lyrics) {
      const inverse = screen.inverse();
      const box = svg.viewBox.baseVal;
      let bottom = box.y + box.height;
      for (const lyric of svg.querySelectorAll<SVGGraphicsElement>(
        ".abcjs-lyric",
      )) {
        const transform = lyric.getScreenCTM();
        if (!transform) continue;
        const bounds = lyric.getBBox();
        const matrix = inverse.multiply(transform);
        for (const x of [bounds.x, bounds.x + bounds.width])
          bottom = Math.max(
            bottom,
            new DOMPoint(x, bounds.y + bounds.height).matrixTransform(matrix)
              .y + 12,
          );
      }
      if (bottom > box.y + box.height)
        svg.setAttribute(
          "viewBox",
          `${box.x} ${box.y} ${box.width} ${bottom - box.y}`,
        );
    }
    if (presentation.tablature || presentation.beginner) {
      // abcjs can place chord labels outside a per-system SVG's viewBox.
      const screen = svg.getScreenCTM();
      if (screen) {
        const inverse = screen.inverse(),
          box = svg.viewBox.baseVal;
        let top = presentation.beginner ? Infinity : box.y,
          bottom = presentation.beginner ? -Infinity : box.y + box.height;
        for (const ink of svg.querySelectorAll<SVGGraphicsElement>(
          presentation.view === "chords" ? ".abcjs-lyric,.abcjs-chord,.abcjs-bar-number,.abcjs-part,.abcjs-tempo,.chord-chart-bars,.chord-chart-fermata" : presentation.view === "tab"
            ? ".guitar-fermata,.guitar-position,.abcjs-lyric,.abcjs-staff,.fingerstyle-tab-clef,.fingerstyle-tab-bars,.tab-rhythm-continuation,.abcjs-bar-number,.abcjs-part,.abcjs-tempo,.abcjs-chord,.abcjs-tabNumber,.tab-rhythm,.tab-rhythm-stem,.tab-rhythm-rest,.tab-rhythm-flag,.tab-rhythm-tie,.beginner-fingering,.beginner-picking,.beginner-string"
            : ".abcjs-annotation,.guitar-position,.abcjs-staff,.abcjs-staff-extra,.abcjs-bar,.abcjs-bar-number,.abcjs-part,.abcjs-tempo,.abcjs-clef,.abcjs-chord,.abcjs-tabNumber,.abcjs-note,.abcjs-beam,.abcjs-slur,.beginner-fingering,.beginner-picking,.beginner-string",
        )) {
          if (getComputedStyle(ink).visibility === "hidden") continue;
          const matrix = ink.getScreenCTM();
          if (!matrix) continue;
          const bounds = ink.getBBox(),
            transform = inverse.multiply(matrix);
          if (!bounds.width && !bounds.height) continue;
          top = Math.min(
            top,
            new DOMPoint(bounds.x, bounds.y).matrixTransform(transform).y - 12,
          );
          bottom = Math.max(
            bottom,
            new DOMPoint(
              bounds.x + bounds.width,
              bounds.y + bounds.height,
            ).matrixTransform(transform).y + 12,
          );
        }
        if (Number.isFinite(top) && Number.isFinite(bottom))
          svg.setAttribute(
            "viewBox",
            `${box.x} ${top} ${box.width} ${bottom - top}`,
          );
      }
    }
}
