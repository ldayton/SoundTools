import { shiftRoutes, positionKey, type ShiftDirection } from "./scale-shift";
import { ScaleFrame, scaleBodyState } from "./scale-frame";
import { mountPracticeSurface } from "./practice-surfaces";
import {
  ScaleRelative,
  ScaleNavigation,
  scaleControlsState,
} from "./scale-controls";
import { createElement } from "react";
import {
  ScaleOptions,
  scaleOptionsState,
  type ScaleOptionsState,
} from "./scale-options";
import {
  linkedPatternPositions,
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
import { BackingTrackPlayer } from "./backing-track-audio";
import { MetronomeSettings } from "./metronome-settings";
import { BackingTrackSettings } from "./backing-track-settings";

export class ScaleExplorer implements LivePractice {
  get syncIdle() {
    return !["playing", "loading"].includes(this.backing.model.getSnapshot().status);
  }
  private disposeView: () => void;
  private body = scaleBodyState();
  private backing = new BackingTrackPlayer();
  readonly inputPolicy = "none" as const;
  private active = false;
  private shiftDirection: ShiftDirection = "ascending";
  private selectedShift?: string;
  private shiftContext = "";
  enter() {
    this.active = true;
    document.addEventListener("keydown", this.onKeyDown);
    this.render();
    this.publishRoute();
  }
  leave() {
    this.active = false;
    document.removeEventListener("keydown", this.onKeyDown);
    this.body.patch({ shortcutsOpen: false });
    this.backing.pauseAll();
  }
  dispose() {
    this.leave();
    this.backing.dispose();
    this.disposeView();
  }
  private onKeyDown = (event: KeyboardEvent) => {
    if (!this.active || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return;
    const target = event.target;
    if (target instanceof Element && target.closest('input, select, textarea, [contenteditable]:not([contenteditable="false"]), [role="slider"], [role="combobox"], [role="listbox"], [role="menu"], [role="tablist"], [role="spinbutton"]')) return;
    if (event.key === "?") {
      event.preventDefault();
      if (!event.repeat) this.body.patch({ shortcutsOpen: !this.body.getSnapshot().shortcutsOpen });
      return;
    }
    if (event.shiftKey || this.body.getSnapshot().shortcutsOpen) return;
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "[", "]"].includes(event.key)) return;
    event.preventDefault();
    if (event.key === "[" || event.key === "]")
      this.moveOctave(event.key === "[" ? -1 : 1);
    else if (event.key === "ArrowUp" || event.key === "ArrowDown")
      this.moveShape(event.key === "ArrowUp" ? 1 : -1);
    else this.moveTonic(event.key === "ArrowLeft" ? -1 : 1);
  };
  private moveOctave(direction: number) {
    if (this.pattern === "map") return;
    const [low, high] = patternBounds(this.pattern, this.quality);
    const shift = this.shift + direction * 12;
    if (low + shift < 1 || high + shift > 22) return;
    this.shift = shift;
    this.returnPosition = undefined;
    this.update();
  }
  private moveShape(direction: number) {
    if (this.pattern === "map") return;
    const next = String((Number(this.pattern) - 1 + direction + 5) % 5 + 1) as Exclude<ScalePattern, "map">;
    const [currentLow] = patternBounds(this.pattern, this.quality);
    const [low, high] = patternBounds(next, this.quality);
    const current = currentLow + this.shift;
    const delta = this.tonic - (this.quality === "major" ? 0 : 9);
    const shift = [delta - 24, delta - 12, delta, delta + 12, delta + 24]
      .filter(s => low + s >= 1 && high + s <= 22 && (low + s - current) * direction > 0)
      .sort((a, b) => Math.abs(low + a - current) - Math.abs(low + b - current))[0];
    if (shift === undefined) return;
    this.pattern = next;
    this.shift = shift;
    if (this.linked !== "none" && this.linked !== "map")
      this.linked = String((Number(this.linked) - 1 + direction + 5) % 5 + 1) as Exclude<ScalePattern, "map">;
    this.returnPosition = undefined;
    this.update();
  }
  private moveTonic(direction: number) {
    if (this.pattern !== "map") {
      const [low, high] = patternBounds(this.pattern, this.quality);
      const shift = this.shift + direction;
      if (low + shift < 1 || high + shift > 22) return;
      this.shift = shift;
    }
    this.returnPosition = undefined;
    this.tonic = (this.tonic + direction + 12) % 12;
    this.spelling = undefined;
    this.update();
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
  private controls = scaleControlsState({
    relative: "",
    returning: false,
    movable: true,
    caption: "",
    keys: [],
  });
  private options!: ScaleOptionsState;
  private pattern: ScalePattern = "1";
  private shift = 0;
  private linked: ScalePattern | "none" = (() => {
    const value = new URLSearchParams(location.search).get("link");
    return ["1", "2", "3", "4", "5"].includes(value || "") ? value as ScalePattern : "none";
  })();
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
    this.disposeView = mountPracticeSurface(
      element,
      createElement(ScaleFrame, {
        body: this.body,
        changeDirection: () => { this.shiftDirection = this.shiftDirection === "ascending" ? "descending" : "ascending"; this.selectedShift = undefined; this.render(); },
        clearShift: () => { this.selectedShift = undefined; this.render(); },
        relative: createElement(ScaleRelative, {
          model: this.controls,
          toggle: () => {
            if (this.returnPosition) {
              this.pattern = this.returnPosition.pattern;
              this.shift = this.returnPosition.shift;
              this.returnPosition = undefined;
            } else {
              this.returnPosition = {
                pattern: this.pattern,
                shift: this.shift,
              };
              this.pattern = this.quality === "major" ? "5" : "2";
              this.shift = patternShift(this.tonic, this.quality, this.pattern);
            }
            this.update();
          },
        }),
        navigation: createElement(ScaleNavigation, {
          model: this.controls,
          move: (direction) => this.moveTonic(direction),
        }),
      }),
    );
    this.options = scaleOptionsState(this.optionsSnapshot());
    registerPracticeOptions(
      element,
      createElement(
        "div", null,
      createElement(ScaleOptions, {
        model: this.options,
        change: (patch) => {
          if (patch.linked !== undefined) this.linked = patch.linked;
          if (patch.pattern === this.linked) this.linked = "none";
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
        createElement(BackingTrackSettings, { player: this.backing }),
        createElement(MetronomeSettings, { player: this.backing }),
      ),

    );
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
    if (this.linked !== "none") url.searchParams.set("link", this.linked);
    else url.searchParams.delete("link");
    history.replaceState(history.state, "", url);
  }
  private optionsSnapshot() {
    return {
      tonic: this.tonic,
      quality: this.quality,
      spelling: this.spelling,
      pattern: this.pattern,
      labels: this.labels,
      linked: this.linked,
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
    this.backing.setKey(
      this.tonic,
      scaleLabel(this.spelling || SCALE_TONICS[this.quality][this.tonic]),
      this.quality,
    );
    this.options.set(this.optionsSnapshot());
    const title = `${scaleLabel(this.spelling || SCALE_TONICS[this.quality][this.tonic])} ${this.quality === "major" ? "major" : "natural minor"}`;

    const noteList = scaleNotes(this.tonic, this.quality, this.spelling)
      .map((n) => scaleLabel(n.name))
      .join(" · ");
    const relative = relativeScale(this.tonic, this.quality, this.spelling);
    const relativeName = scaleLabel(
      relative.spelling || SCALE_TONICS[relative.quality][relative.tonic],
    );
    const relativeTarget = this.quality === "major" ? "5" : "2";
    const label = this.returnPosition
      ? "Return to previous shape"
      : `Show ${relativeName} ${relative.quality} starting position`;
    const relativeExplanation = `${relativeName} ${relative.quality} Shape 1 · ${scaleLabel(this.spelling || SCALE_TONICS[this.quality][this.tonic])} ${this.quality} Shape ${relativeTarget}`;
    const movable = this.pattern !== "map";
    const basePositions =
      this.pattern === "map"
        ? scalePositions(this.tonic, this.quality, this.spelling)
        : patternPositions(
            this.tonic,
            this.quality,
            this.pattern,
            this.shift,
            this.spelling,
          );
    const linked = movable && this.linked !== "none" && this.linked !== "map" && this.linked !== this.pattern;
    const secondary = linked ? linkedPatternPositions(this.tonic, this.quality, this.pattern as Exclude<ScalePattern, "map">, this.shift, this.linked as Exclude<ScalePattern, "map">, this.spelling) : [];
    const context = `${this.tonic}:${this.quality}:${this.pattern}:${this.shift}:${this.linked}`;
    if (context !== this.shiftContext) { this.selectedShift = undefined; this.shiftContext = context; }
    const routes = shiftRoutes(linked ? basePositions as ReturnType<typeof patternPositions> : [], secondary, this.shiftDirection);
    const route = this.selectedShift ? routes.get(this.selectedShift) : undefined;
    const routeNotes = new Map((route?.notes || []).map((n: ReturnType<typeof patternPositions>[number]) => [positionKey(n), n]));
    const primaryKeys = new Set(basePositions.map(n => `${n.string}:${n.fret}`));
    const secondaryKeys = new Set(secondary.map(n => `${n.string}:${n.fret}`));
    const positions = [...basePositions, ...secondary.filter(n => !primaryKeys.has(`${n.string}:${n.fret}`))];
    const firstFret = movable ? Math.min(...positions.map((n) => n.fret)) : 0;
    const lastFret = movable ? Math.max(...positions.map((n) => n.fret)) : 5;
    const fullStart = Math.max(1, firstFret);
    const fullEnd = lastFret;
    const step = 65;
    const x = (fret: number) => (fret === 0 ? -32 : (fret - 0.5) * step);
    const y = (string: number) => 42 + (string - 1) * 43;
    const fullLeft = firstFret === 0 ? -100 : (fullStart - 1) * step - 36;
    const fullRight = fullEnd * step + 1;

    const caption = movable
      ? `Shape ${this.pattern} · ${firstFret}${firstFret % 100 >= 11 && firstFret % 100 <= 13 ? "th" : firstFret % 10 === 1 ? "st" : firstFret % 10 === 2 ? "nd" : firstFret % 10 === 3 ? "rd" : "th"} position`
      : "Open-position map";
    const labels = this.labels;
    const footnote =
      movable && labels === "fingers"
        ? "1 index · 2 middle · 3 ring · 4 little finger"
        : "Darker dots mark the root notes.";
    const source = `https://guitarscale.org/${this.quality === "major" ? "c-major" : "a-minor"}.html`;
    const keys = [-1, 1].map((direction) => {
      const target = scaleLabel(
        SCALE_TONICS[this.quality][(this.tonic + direction + 12) % 12],
      );
      const [low, high] = patternBounds(
        this.pattern === "map" ? "1" : this.pattern,
        this.quality,
      );
      return {
        label: direction < 0 ? `← ${target}` : `${target} →`,
        title: `${direction < 0 ? "Down" : "Up"} one fret · ${target}`,
        disabled:
          movable &&
          (low + this.shift + direction < 1 ||
            high + this.shift + direction > 22),
      };
    });
    this.controls.set({
      relative: label,
      returning: !!this.returnPosition,
      movable,
      caption: linked ? `Shapes ${this.pattern} + ${this.linked} · frets ${firstFret}–${lastFret}` : caption,
      keys,
    });
    const notes = positions
      .map((n) => {
        // Use the selected shape's fingering at overlaps, and the linked
        // shape's fingering for the notes it adds.
        const routeNote = routeNotes.get(positionKey(n));
        const fingerNote = routeNote || n;
        const label = route && !routeNote ? "" : labels === "fingers" && "finger" in fingerNote ? fingerNote.finger : scaleLabel(n.name);
        const available = routes.has(positionKey(n));
        const chosen = this.selectedShift === positionKey(n);
        const shiftClass = linked ? `${route && !routeNote ? " scale-unused" : ""}${available ? " scale-shift-candidate" : ""}${chosen ? " scale-shift-chosen" : ""}` : "";
        const inPrimary = primaryKeys.has(`${n.string}:${n.fret}`);
        const inSecondary = secondaryKeys.has(`${n.string}:${n.fret}`);
        const membership = routeNote ? ` scale-route ${basePositions.some(p => p === routeNote) ? "scale-primary" : "scale-secondary"}` : route ? "" : linked ? inPrimary && inSecondary ? " scale-shared" : inPrimary ? " scale-primary" : " scale-secondary" : "";
        const alternate = !route && labels === "fingers" && inPrimary && inSecondary
          ? secondary.find(p => positionKey(p) === positionKey(n)) : undefined;
        const dotLabel = alternate
          ? `<text class="scale-finger-main" x="${x(n.fret)}" y="${y(n.string)}" dy=".35em">${label}</text><rect class="scale-alternate-badge" x="${x(n.fret)+6}" y="${y(n.string)+5}" width="20" height="20" rx="7"/><text class="scale-finger-alternate" x="${x(n.fret)+16}" y="${y(n.string)+15}" dy=".35em">${alternate.finger}</text>`
          : `<text x="${x(n.fret)}" y="${y(n.string)}" dy=".35em">${label}</text>`;
        return `<g class="scale-tone${alternate ? " scale-dual" : ""}${shiftClass}${membership}${n.root ? " scale-root" : ""}${n.openAlternative ? " scale-optional" : ""}" ${linked ? `role="button" tabindex="${available ? 0 : -1}" aria-disabled="${!available}" aria-pressed="${chosen}" aria-label="${available ? "Shift into other shape at" : "Shift unavailable at"} string ${n.string}, fret ${n.fret}, ${scaleLabel(n.name)}"` : ""} data-string="${n.string}" data-fret="${n.fret}" data-midi="${n.midi}"><title>String ${n.string}, fret ${n.fret}: ${scaleLabel(n.name)}${n.octave}${n.root ? ", root" : ""}</title><circle cx="${x(n.fret)}" cy="${y(n.string)}" r="16"/>${available && (!route || chosen) ? `<path class="scale-shift-marker" fill-rule="evenodd" d="M ${x(n.fret)} ${y(n.string)-17.5} A 17.5 17.5 0 1 1 ${x(n.fret)-17.5} ${y(n.string)} C ${x(n.fret)-17.5} ${y(n.string)-7} ${x(n.fret)-18} ${y(n.string)-12} ${x(n.fret)-21} ${y(n.string)-21} C ${x(n.fret)-12} ${y(n.string)-18} ${x(n.fret)-7} ${y(n.string)-17.5} ${x(n.fret)} ${y(n.string)-17.5} Z M ${x(n.fret)} ${y(n.string)-14.5} A 14.5 14.5 0 1 0 ${x(n.fret)} ${y(n.string)+14.5} A 14.5 14.5 0 1 0 ${x(n.fret)} ${y(n.string)-14.5} Z"/>` : ""}${dotLabel}</g>`;
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
    this.element.querySelectorAll<SVGGElement>(".scale-shift-candidate").forEach(dot => {
      const select = () => { const key = `${dot.dataset.string}:${dot.dataset.fret}`; this.selectedShift = this.selectedShift === key ? undefined : key; this.render(); };
      dot.addEventListener("click", select);
      dot.addEventListener("keydown", event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); select(); } });
    });
    this.body.patch({
      title,
      shiftMode: linked,
      shiftSelected: !!route,
      direction: this.shiftDirection,
      shiftMessage: route ? `Shift on string ${route.arrival.string}, fret ${route.previous.fret} → ${route.arrival.fret} · finger ${route.previous.finger} → ${route.arrival.finger}` : routes.size ? "" : "No single-shift scale run available for this pair here.",
      linkedLegend: linked ? `Shape ${this.pattern}|Shape ${this.linked}` : "",
      linkHelp: "",
      notes: noteList,
      relativeExplanation,
      movable,
      footnote,
      source,
      rows: [6, 5, 4, 3, 2, 1].map((string) => ({
        string,
        notes: positions
          .filter((n) => n.string === string)
          .map(
            (n) =>
              `${n.fret === 0 ? "Open" : n.fret}: ${scaleLabel(n.name)}${n.octave}${n.root ? " (root)" : ""}${n.openAlternative ? ` (optional: open string ${n.openAlternative})` : ""}`,
          )
          .join("; "),
      })),
    });
  }
}
