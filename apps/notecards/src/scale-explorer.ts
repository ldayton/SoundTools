import {
  SCALE_SHAPES,
  patternBounds,
  patternShift,
  patternPositions,
  type ScalePattern,
} from "./guitar-scale-patterns";
import { mountPracticeOptions } from "./practice-controls";
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
  private resizeFrame = 0;
  private observer = new ResizeObserver(() => {
    if (!this.resizeFrame)
      this.resizeFrame = requestAnimationFrame(() => {
        this.resizeFrame = 0;
        this.fitDiagram();
      });
  });
  private fitDiagram() {
    const diagram = this.element.querySelector<HTMLElement>(".scale-diagram");
    const svg = diagram?.querySelector("svg");
    if (svg)
      svg.setAttribute(
        "viewBox",
        window.matchMedia("(max-width: 760px)").matches
          ? svg.dataset.focus!
          : svg.dataset.full!,
      );
  }
  enter() {
    this.active = true;
    this.observer.observe(this.element.querySelector(".scale-diagram")!);
    this.render();
    this.publishRoute();
  }
  leave() {
    this.active = false;
    this.observer.disconnect();
    cancelAnimationFrame(this.resizeFrame);
    this.resizeFrame = 0;
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
      this.movement = "";
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
  private pattern: ScalePattern = "1";
  private shift = 0;
  private returnPosition?: GuitarScaleSettings["returnPosition"];
  private labels: "fingers" | "notes" = "fingers";
  private movement = "";
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
    element.innerHTML = `<div class="scale-controls options-row"><label>Key<select id="scale-key" aria-label="Scale key"></select></label><label>Scale<select id="scale-quality" aria-label="Scale type"><option value="major">Major</option><option value="minor">Natural minor</option></select></label><label>Pattern<select id="scale-pattern"><option value="map">Open-position map</option>${SCALE_SHAPES.map((shape) => `<option value="${shape}">Shape ${shape}</option>`).join("")}</select></label><label>Dots<select id="scale-dot-labels"><option value="fingers">Finger numbers</option><option value="notes">Note names</option></select></label></div>
      <section class="scale-card sequence-practice" aria-labelledby="scale-title"><div class="scale-heading"><h2 id="scale-title"></h2><p class="scale-notes" aria-live="polite"></p><div class="scale-relative"><button type="button" class="scale-relative-switch"></button><span>Same notes · different home note</span></div></div>
      <div class="scale-key-navigation"><button type="button" class="scale-prev" aria-label="Previous key"></button><p class="scale-pattern-caption" role="status"></p><button type="button" class="scale-next" aria-label="Next key"></button></div>
      <p class="scale-orientation">Standard tuning · high E at the top, low E at the bottom</p>
      <div class="scale-diagram"></div><p class="scale-legend"><span class="scale-root-swatch" aria-hidden="true"></span> Root <span class="scale-note-swatch" aria-hidden="true"></span> Other scale notes</p>
      <p class="scale-optional-legend"><span class="scale-optional-swatch" aria-hidden="true"></span> Gray = optional: same pitch on the next open string.</p>
      <p class="scale-footnote">Open strings above the nut · frets 1–5 below</p>
      <p class="scale-source">Shapes and fingerings: <a href="https://guitarscale.org/c-major.html" target="_blank" rel="noopener noreferrer">GuitarScale.org</a></p><details class="scale-note-list"><summary>Notes by string and fret</summary><div></div></details></section>`;
    mountPracticeOptions(element, [
      element.querySelector<HTMLElement>(".scale-controls")!,
    ]);
    this.element.querySelector<HTMLSelectElement>("#scale-pattern")!.onchange =
      (event) => {
        this.pattern = (event.target as HTMLSelectElement)
          .value as ScalePattern;
        this.movement = "";
        this.returnPosition = undefined;
        this.shift = NaN;
        this.update();
      };
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
        this.movement = direction > 0 ? "Up one fret" : "Down one fret";
        this.update();
      };
    }
    this.element.querySelector<HTMLSelectElement>(
      "#scale-dot-labels",
    )!.onchange = (event) => {
      this.labels = (event.target as HTMLSelectElement).value as
        "fingers" | "notes";
      this.update();
    };
    this.key.onchange = () => {
      this.returnPosition = undefined;
      this.movement = "";
      this.tonic = Number(this.key.value);
      this.shift = NaN;
      this.spelling = undefined;
      this.update();
    };
    this.type.onchange = () => {
      this.returnPosition = undefined;
      this.movement = "";
      this.quality = this.type.value as ScaleQuality;
      this.shift = NaN;
      this.spelling = undefined;
      this.update();
    };
    this.element.querySelector<HTMLButtonElement>(
      ".scale-relative-switch",
    )!.onclick = () => {
      this.movement = "";
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
  private get key() {
    return this.element.querySelector<HTMLSelectElement>("#scale-key")!;
  }
  private get type() {
    return this.element.querySelector<HTMLSelectElement>("#scale-quality")!;
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
    this.element.querySelector<HTMLSelectElement>("#scale-pattern")!.value =
      this.pattern;
    this.key.innerHTML = SCALE_TONICS[this.quality]
      .map(
        (name, i) =>
          `<option value="${i}">${scaleLabel(i === this.tonic && this.spelling ? this.spelling : name)}</option>`,
      )
      .join("");
    this.key.value = String(this.tonic);
    this.type.value = this.quality;
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
      ".scale-relative span",
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
    const fullStart = Math.max(1, lastFret - 11);
    const fullEnd = Math.max(12, lastFret);
    const step = 65;
    const x = (fret: number) => (fret === 0 ? -32 : (fret - 0.5) * step);
    const y = (string: number) => 42 + (string - 1) * 43;
    const focusStart = Math.max(1, firstFret);
    const focusLeft = firstFret === 0 ? -58 : (focusStart - 1) * step - 1;
    const focusRight = lastFret * step + 1;
    const fullLeft = firstFret === 0 ? -58 : (fullStart - 1) * step - 1;
    const fullRight = fullEnd * step + 1;
    this.element.querySelector<HTMLElement>(".scale-key-navigation")!.hidden =
      !movable;
    this.element.querySelector<HTMLElement>(".scale-optional-legend")!.hidden =
      movable;
    const anchor = positions.find((n) => n.root)!;
    this.element.querySelector<HTMLElement>(
      ".scale-pattern-caption",
    )!.textContent = movable
      ? `Shape ${this.pattern} · ${firstFret}${firstFret % 100 >= 11 && firstFret % 100 <= 13 ? "th" : firstFret % 10 === 1 ? "st" : firstFret % 10 === 2 ? "nd" : firstFret % 10 === 3 ? "rd" : "th"} position\n${this.movement || `Root: string ${anchor.string}, fret ${anchor.fret}`}`
      : "Open-position map";
    const labels = this.labels;
    this.element.querySelector<HTMLSelectElement>("#scale-dot-labels")!.value =
      labels;
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
      `<svg data-full="${fullLeft} 0 ${fullRight - fullLeft} 290" data-focus="${focusLeft} 0 ${focusRight - focusLeft} 290" role="img" aria-labelledby="scale-svg-title scale-svg-desc"><title id="scale-svg-title">${title} guitar scale, ${movable ? `Shape ${this.pattern}, frets ${firstFret}–${lastFret}` : "open strings through fret 5"}</title><desc id="scale-svg-desc">Six horizontal strings, high E at the top, low E at the bottom. Dark blue dots mark roots; lighter blue dots mark other scale notes. ${movable && labels === "fingers" ? "Numbers show fingers, 1 index through 4 little finger." : "Dots show note names."} Full note positions are listed below.</desc>
      ${Array.from(
        { length: fullEnd - fullStart + 2 },
        (_, i) => fullStart - 1 + i,
      )
        .map(
          (f) =>
            `<line class="scale-fret" x1="${f * step}" x2="${f * step}" y1="42" y2="257"/>`,
        )
        .join("")}
      ${[1, 2, 3, 4, 5, 6].map((s) => `<line class="scale-string" x1="${Math.max(0, fullLeft)}" x2="${fullRight}" y1="${y(s)}" y2="${y(s)}"/>`).join("")}
      ${Array.from({ length: fullEnd - fullStart + 1 }, (_, i) => fullStart + i)
        .map(
          (f) =>
            `<text class="scale-fret-number" x="${x(f)}" y="18">${f}</text>${[3, 5, 7, 9, 12, 15, 17, 19, 21].includes(f) ? `<text class="scale-fret-marker" x="${x(f)}" y="286">${f === 12 ? "••" : "•"}</text>` : ""}`,
        )
        .join("")}${notes}</svg>`;
    this.fitDiagram();
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
