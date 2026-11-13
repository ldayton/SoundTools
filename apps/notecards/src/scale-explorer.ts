import { createElement } from "react";
import {
  ScaleOptions,
  scaleOptionsState,
  type ScaleOptionsState,
} from "./scale-options";
import {
  patternBounds,
  patternShift,
  patternPositions,
  type ScalePattern,
} from "./guitar-scale-patterns";
import { registerPracticeOptions } from "./practice-options";
import {
  SCALE_TONICS,
  scaleLabel,
  scaleNotes,
  scalePositions,
  relativeScale,
  type ScaleQuality,
} from "./guitar-scales";
import { persistence } from "./persistence";
import type { LivePractice } from "./live-practice";
import type { PracticeRoute } from "./navigation";
import {
  mergeGuitarScaleSettings,
  guitarScaleFromQuery,
  type GuitarScaleSettings,
} from "./guitar-scale-settings";
import "./scale-explorer.css";

export class ScaleExplorer implements LivePractice {
  readonly inputPolicy = "none" as const;
  private active = false;
  enter() {
    this.active = true;
    this.render();
    this.publishRoute();
  }
  leave() {
    this.active = false;
  }
  interrupt() {}
  answer() {}
  applyRoute(route: PracticeRoute) {
    const settings = guitarScaleFromQuery(route.query, {
      tonic: this.tonic,
      quality: this.quality,
      pattern: this.pattern,
      shift: this.shift,
      ...(this.spelling ? { spelling: this.spelling } : {}),
    });
    if (
      settings.tonic !== this.tonic ||
      settings.quality !== this.quality ||
      settings.spelling !== this.spelling ||
      settings.pattern !== this.pattern ||
      settings.shift !== this.shift
    ) {
      this.returnPosition = undefined;
      this.tonic = settings.tonic;
      this.quality = settings.quality;
      this.spelling = settings.spelling;
      this.pattern = settings.pattern || "map";
      this.shift = settings.shift || 0;
      this.update();
    }
    return true;
  }
  private options!: ScaleOptionsState;
  private pattern: ScalePattern = "1";
  private shift = 0;
  private returnPosition?: GuitarScaleSettings["returnPosition"];
  private labels: "fingers" | "notes" = "fingers";
  private tonic = 4;
  private spelling?: string;
  private quality: ScaleQuality = "major";
  constructor(
    private element: HTMLElement,
    _changed: () => void,
  ) {
    const saved = persistence.read<{ version: number; settings: unknown }>(
      "guitar-scales",
    );
    const settings = mergeGuitarScaleSettings(
      saved?.version === 1 ? saved.settings : undefined,
    );
    this.tonic = settings.tonic;
    this.quality = settings.quality;
    this.spelling = settings.spelling;
    this.pattern = settings.pattern || (saved ? "map" : "1");
    this.shift = settings.shift || 0;
    this.labels = settings.labels || "fingers";
    this.returnPosition = settings.returnPosition;
    element.innerHTML = `<section class="scale-card sequence-practice" aria-labelledby="scale-title"><div class="scale-heading"><h2 id="scale-title"></h2><div class="scale-relative"><button type="button" class="scale-relative-switch"></button></div></div>
      <div class="scale-key-navigation"><button type="button" class="scale-prev" aria-label="Previous key"></button><p class="scale-pattern-caption" role="status"></p><button type="button" class="scale-next" aria-label="Next key"></button></div>
      <div class="scale-diagram"></div><p class="scale-legend"><span class="scale-root-swatch" aria-hidden="true"></span> Root</p>
      <details class="scale-note-list"><summary>Details</summary><p class="scale-notes"></p><p class="scale-help">Standard tuning · high E at the top, low E at the bottom.</p><p class="scale-footnote">1 index · 2 middle · 3 ring · 4 little finger</p><p class="scale-optional-legend">Gray notes can also be played on the next open string.</p><p class="scale-relative-explanation"></p><div></div><p class="scale-source">Shapes and fingerings: <a href="https://guitarscale.org/c-major.html" target="_blank" rel="noopener noreferrer">GuitarScale.org</a></p></details></section>`;
    this.options = scaleOptionsState(this.optionsSnapshot());
    registerPracticeOptions(
      element.id,
      createElement(ScaleOptions, {
        model: this.options,
        change: (patch) => {
          const next = mergeGuitarScaleSettings(patch, this.optionsSnapshot());
          this.tonic = next.tonic;
          this.quality = next.quality;
          this.pattern = next.pattern!;
          this.labels = next.labels!;
          if (patch.labels === undefined) {
            this.returnPosition = undefined;
            this.shift = NaN;
            this.spelling = undefined;
          }
          this.update();
        },
      }),
    );
    for (const direction of [-1, 1]) {
      this.element.querySelector<HTMLButtonElement>(
        direction < 0 ? ".scale-prev" : ".scale-next",
      )!.onclick = () => {
        if (this.pattern === "map") return;
        const [low, high] = patternBounds(this.pattern, this.quality);
        const shift = this.shift + direction;
        if (low + shift < 1 || high + shift > 22) return;
        this.returnPosition = undefined;
        this.shift = shift;
        this.tonic = (this.tonic + direction + 12) % 12;
        this.spelling = undefined;
        this.update();
      };
    }
    this.element.querySelector<HTMLButtonElement>(
      ".scale-relative-switch",
    )!.onclick = () => {
      if (this.returnPosition) {
        this.pattern = this.returnPosition.pattern;
        this.shift = this.returnPosition.shift;
        this.returnPosition = undefined;
      } else {
        this.returnPosition = { pattern: this.pattern, shift: this.shift };
        this.pattern = this.quality === "major" ? "5" : "2";
        this.shift = patternShift(this.tonic, this.quality, this.pattern);
      }
      this.update();
    };
  }
  private publishRoute() {
    if (!this.active) return;
    const url = new URL(location.href);
    url.searchParams.set(
      "key",
      this.spelling || SCALE_TONICS[this.quality][this.tonic],
    );
    url.searchParams.set("scale", this.quality);
    url.searchParams.set("pattern", this.pattern);
    if (this.pattern !== "map")
      url.searchParams.set("position", String(this.shift));
    else url.searchParams.delete("position");
    history.replaceState(history.state, "", url);
  }
  private optionsSnapshot() {
    return {
      tonic: this.tonic,
      quality: this.quality,
      spelling: this.spelling,
      pattern: this.pattern,
      labels: this.labels,
    };
  }
  private update() {
    this.normalizePosition();
    persistence.write("guitar-scales", {
      version: 1,
      settings: {
        tonic: this.tonic,
        quality: this.quality,
        pattern: this.pattern,
        shift: this.shift,
        ...(this.returnPosition ? { returnPosition: this.returnPosition } : {}),
        ...(this.labels === "notes" ? { labels: this.labels } : {}),
        ...(this.spelling ? { spelling: this.spelling } : {}),
      },
    });
    this.render();
    this.publishRoute();
  }
  private normalizePosition() {
    if (this.pattern !== "map")
      this.shift = patternShift(
        this.tonic,
        this.quality,
        this.pattern,
        this.shift,
      );
    else this.shift = 0;
  }
  private render() {
    this.normalizePosition();
    this.options.set(this.optionsSnapshot());
    const title = `${scaleLabel(this.spelling || SCALE_TONICS[this.quality][this.tonic])} ${this.quality === "major" ? "major" : "natural minor"}`;
    this.element.querySelector("#scale-title")!.textContent = title;
    this.element.querySelector(".scale-notes")!.textContent = scaleNotes(
      this.tonic,
      this.quality,
      this.spelling,
    )
      .map((n) => scaleLabel(n.name))
      .join(" · ");
    const relative = relativeScale(this.tonic, this.quality, this.spelling);
    const relativeName = scaleLabel(
      relative.spelling || SCALE_TONICS[relative.quality][relative.tonic],
    );
    const button = this.element.querySelector<HTMLButtonElement>(
      ".scale-relative-switch",
    )!;
    const relativeTarget = this.quality === "major" ? "5" : "2";
    const label = this.returnPosition
      ? "Return to previous shape"
      : `Show ${relativeName} ${relative.quality} starting position`;
    button.textContent = label;
    button.setAttribute("aria-label", label);
    button.setAttribute("aria-pressed", String(!!this.returnPosition));
    this.element.querySelector<HTMLElement>(
      ".scale-relative-explanation",
    )!.textContent =
      `${relativeName} ${relative.quality} Shape 1 · ${scaleLabel(this.spelling || SCALE_TONICS[this.quality][this.tonic])} ${this.quality} Shape ${relativeTarget}`;
    const movable = this.pattern !== "map";
    const positions =
      this.pattern === "map"
        ? scalePositions(this.tonic, this.quality, this.spelling)
        : patternPositions(
            this.tonic,
            this.quality,
            this.pattern,
            this.shift,
            this.spelling,
          );
    const firstFret = movable ? Math.min(...positions.map((n) => n.fret)) : 0;
    const lastFret = movable ? Math.max(...positions.map((n) => n.fret)) : 5;
    const fullStart = Math.max(1, firstFret);
    const fullEnd = lastFret;
    const step = 65;
    const x = (fret: number) => (fret === 0 ? -32 : (fret - 0.5) * step);
    const y = (string: number) => 42 + (string - 1) * 43;
    const fullLeft = firstFret === 0 ? -100 : (fullStart - 1) * step - 36;
    const fullRight = fullEnd * step + 1;
    this.element.querySelector<HTMLElement>(".scale-key-navigation")!.hidden =
      !movable;
    this.element.querySelector<HTMLElement>(".scale-optional-legend")!.hidden =
      movable;
    this.element.querySelector<HTMLElement>(
      ".scale-pattern-caption",
    )!.textContent = movable
      ? `Shape ${this.pattern} · ${firstFret}${firstFret % 100 >= 11 && firstFret % 100 <= 13 ? "th" : firstFret % 10 === 1 ? "st" : firstFret % 10 === 2 ? "nd" : firstFret % 10 === 3 ? "rd" : "th"} position`
      : "Open-position map";
    const labels = this.labels;
    this.element.querySelector<HTMLElement>(".scale-footnote")!.textContent =
      movable && labels === "fingers"
        ? "1 index · 2 middle · 3 ring · 4 little finger"
        : "Darker dots mark the root notes.";
    this.element.querySelector<HTMLAnchorElement>(".scale-source a")!.href =
      `https://guitarscale.org/${this.quality === "major" ? "c-major" : "a-minor"}.html`;
    for (const direction of [-1, 1]) {
      const control = this.element.querySelector<HTMLButtonElement>(
        direction < 0 ? ".scale-prev" : ".scale-next",
      )!;
      const target = scaleLabel(
        SCALE_TONICS[this.quality][(this.tonic + direction + 12) % 12],
      );
      control.textContent = direction < 0 ? `← ${target}` : `${target} →`;
      control.title = `${direction < 0 ? "Down" : "Up"} one fret · ${target}`;
      if (this.pattern !== "map") {
        const [low, high] = patternBounds(this.pattern, this.quality);
        control.disabled =
          low + this.shift + direction < 1 ||
          high + this.shift + direction > 22;
      }
    }
    const notes = positions
      .map((n) => {
        const label =
          labels === "fingers" && "finger" in n ? n.finger : scaleLabel(n.name);
        return `<g class="scale-tone${n.root ? " scale-root" : ""}${n.openAlternative ? " scale-optional" : ""}" data-string="${n.string}" data-fret="${n.fret}" data-midi="${n.midi}"><title>String ${n.string}, fret ${n.fret}: ${scaleLabel(n.name)}${n.octave}${n.root ? ", root" : ""}</title><circle cx="${x(n.fret)}" cy="${y(n.string)}" r="16"/><text x="${x(n.fret)}" y="${y(n.string)}" dy=".35em">${label}</text></g>`;
      })
      .join("");
    this.element.querySelector(".scale-diagram")!.innerHTML =
      `<svg viewBox="${fullLeft} 0 ${fullRight - fullLeft} 290" role="img" aria-labelledby="scale-svg-title scale-svg-desc"><title id="scale-svg-title">${title} guitar scale, ${movable ? `Shape ${this.pattern}, frets ${firstFret}–${lastFret}` : "open strings through fret 5"}</title><desc id="scale-svg-desc">Six horizontal strings, high E at the top, low E at the bottom. Dark blue dots mark roots; lighter blue dots mark other scale notes. ${movable && labels === "fingers" ? "Numbers show fingers, 1 index through 4 little finger." : "Dots show note names."} Full note positions are listed below.</desc>
      ${Array.from(
        { length: fullEnd - fullStart + 2 },
        (_, i) => fullStart - 1 + i,
      )
        .map(
          (f) =>
            `<line class="scale-fret" x1="${f * step}" x2="${f * step}" y1="42" y2="257"/>`,
        )
        .join("")}
      ${[1, 2, 3, 4, 5, 6].map((s) => `<line class="scale-string" x1="${(fullStart - 1) * step}" x2="${fullRight}" y1="${y(s)}" y2="${y(s)}"/>`).join("")}
      ${Array.from({ length: fullEnd - fullStart + 1 }, (_, i) => fullStart + i)
        .map(
          (f) =>
            `<text class="scale-fret-number" x="${x(f)}" y="18">${f}</text>${[3, 5, 7, 9, 12, 15, 17, 19, 21].includes(f) ? `<text class="scale-fret-marker" x="${x(f)}" y="286">${f === 12 ? "••" : "•"}</text>` : ""}`,
        )
        .join(
          "",
        )}${notes}${[1, 2, 3, 4, 5, 6].map((string, i) => `<text class="scale-tuning" x="${firstFret === 0 ? -80 : (fullStart - 1) * step - 20}" y="${y(string)}" dy=".35em">${["E", "B", "G", "D", "A", "E"][i]}</text>`).join("")}</svg>`;
    this.element.querySelector(".scale-note-list div")!.innerHTML =
      `<table><caption>${title} · sounding pitches</caption><thead><tr><th scope="col">String</th><th scope="col">Fret: note</th></tr></thead><tbody>${[
        6, 5, 4, 3, 2, 1,
      ]
        .map(
          (s) =>
            `<tr><th scope="row">${s}${s === 6 ? " · low E" : s === 1 ? " · high E" : ""}</th><td>${positions
              .filter((n) => n.string === s)
              .map(
                (n) =>
                  `${n.fret === 0 ? "Open" : n.fret}: ${scaleLabel(n.name)}${n.octave}${n.root ? " (root)" : ""}${n.openAlternative ? ` (optional: open string ${n.openAlternative})` : ""}`,
              )
              .join("; ")}</td></tr>`,
        )
        .join("")}</tbody></table>`;
  }
}
