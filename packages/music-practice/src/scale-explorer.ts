import {isMaqam,MAQAMAT,maqamSource} from "./maqamat";
import {maqamPositions} from "./maqam-guitar";
import {
  hilaBounds,
  hilaPositions,
  hilaShift,
  type HilaShape,
} from "./hila-scale-shapes";
import { diagnostics } from "./diagnostics";
import { shiftRoutes, positionKey } from "./scale-shift";
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
  scaleShapeLabel,
  cagedChordPositions,
  cagedReferenceChord,
  patternBounds,
  patternShift,
  patternPositions,
  type ScalePattern,
} from "./guitar-scale-patterns";
import { registerPracticeOptions } from "./practice-options";
import {
  SCALE_TONICS,
  isMajorScale,
  scaleQualityLabel,
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
    return !["playing", "loading"].includes(
      this.backing.model.getSnapshot().status,
    );
  }
  private disposeView: () => void;
  private body = scaleBodyState();
  private backing = new BackingTrackPlayer(
    true,
    true,
    true,
    true,
    (error, code) => diagnostics.capture(error, code),
  );
  readonly inputPolicy = "none" as const;
  private active = false;
  private selectedShift?: string;
  private shiftContext = "";
  private linkedShift?: number;
  private reversedColors = false;
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
    if (
      !this.active ||
      event.defaultPrevented ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.isComposing
    )
      return;
    const target = event.target;
    if (
      target instanceof Element &&
      target.closest(
        'input, select, textarea, [contenteditable]:not([contenteditable="false"]), [role="slider"], [role="combobox"], [role="listbox"], [role="menu"], [role="tablist"], [role="spinbutton"]',
      )
    )
      return;
    if (event.key === "?") {
      event.preventDefault();
      if (!event.repeat)
        this.body.patch({
          shortcutsOpen: !this.body.getSnapshot().shortcutsOpen,
        });
      return;
    }
    if (event.shiftKey || this.body.getSnapshot().shortcutsOpen) return;
    if (
      !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "[", "]"].includes(
        event.key,
      )
    )
      return;
    event.preventDefault();
    if (event.key === "[" || event.key === "]")
      this.moveOctave(event.key === "[" ? -1 : 1);
    else if (event.key === "ArrowUp" || event.key === "ArrowDown")
      this.moveShape(event.key === "ArrowUp" ? 1 : -1);
    else this.moveTonic(event.key === "ArrowLeft" ? -1 : 1);
  };
  private moveOctave(direction: number) {
    if(isMaqam(this.quality)){this.moveMaqamPosition(direction*12);return;}
    if (this.shapeSet === "hila") {
      const next = this.shift + direction * 12;
      if (hilaShift(this.tonic, this.hilaShape, next) === next) {
        this.shift = next;
        this.update();
      }
      return;
    }
    if (this.pattern === "map") return;
    const [low, high] = patternBounds(this.pattern, this.quality);
    const shift = this.shift + direction * 12;
    if (low + shift < 1 || high + shift > 22) return;
    this.shift = shift;
    this.returnPosition = undefined;
    this.update();
  }
  private moveMaqamPosition(direction:number){
    const next=this.firstFret+direction;if(next<1||next>14)return;
    this.firstFret=next;this.lastFret=next+4;this.update();
  }
  private moveShape(direction: number) {
    if(isMaqam(this.quality)){this.moveMaqamPosition(direction);return;}
    if (this.shapeSet === "hila") {
      this.hilaShape = (((this.hilaShape - 1 + direction + 7) % 7) +
        1) as HilaShape;
      this.shift = NaN;
      this.update();
      return;
    }
    if (this.pattern === "map") return;
    const next = String(
      ((Number(this.pattern) - 1 + direction + 5) % 5) + 1,
    ) as Exclude<ScalePattern, "map">;
    const [currentLow] = patternBounds(this.pattern, this.quality);
    const [low, high] = patternBounds(next, this.quality);
    const current = currentLow + this.shift;
    const delta = this.tonic - (isMajorScale(this.quality) ? 0 : 9);
    const shift = [delta - 24, delta - 12, delta, delta + 12, delta + 24]
      .filter(
        (s) =>
          low + s >= 1 && high + s <= 22 && (low + s - current) * direction > 0,
      )
      .sort(
        (a, b) => Math.abs(low + a - current) - Math.abs(low + b - current),
      )[0];
    if (shift === undefined) return;
    this.pattern = next;
    this.shift = shift;
    if (this.linked !== "none" && this.linked !== "map")
      this.linked = String(
        ((Number(this.linked) - 1 + direction + 5) % 5) + 1,
      ) as Exclude<ScalePattern, "map">;
    this.returnPosition = undefined;
    this.update();
  }
  private moveTonic(direction: number) {
    if(isMaqam(this.quality)){
      const next=this.firstFret+direction;if(next<1||next>14)return;
      this.firstFret=next;this.lastFret=next+4;
    } else if (this.shapeSet === "hila") {
      const tonic = (this.tonic + direction + 12) % 12;
      const next = this.shift + direction;
      if (hilaShift(tonic, this.hilaShape, next) !== next) return;
      this.shift = next;
    } else if (this.pattern !== "map") {
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
      shapeSet: this.shapeSet,
      hilaShape: this.hilaShape,
      pattern: this.pattern,
      shift: this.shift,
      firstFret: this.firstFret,
      lastFret: this.lastFret,
      labels: this.labels,
      ...(this.spelling ? { spelling: this.spelling } : {}),
    });
    if (
      settings.shapeSet !== this.shapeSet ||
      settings.hilaShape !== this.hilaShape ||
      settings.tonic !== this.tonic ||
      settings.quality !== this.quality ||
      settings.spelling !== this.spelling ||
      settings.pattern !== this.pattern ||
      settings.shift !== this.shift ||
      settings.firstFret !== this.firstFret ||
      settings.lastFret !== this.lastFret ||
      settings.labels !== this.labels
    ) {
      this.returnPosition = undefined;
      this.firstFret = settings.firstFret ?? 0;
      this.lastFret = settings.lastFret ?? 5;
      this.labels = settings.labels || this.labels;
      this.shapeSet = settings.shapeSet || "standard";
      this.hilaShape = settings.hilaShape || 1;
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
  private shapeSet: "standard" | "hila" = "standard";
  private hilaShape: HilaShape = 1;
  private pattern: ScalePattern = "1";
  private shift = 0;
  private linked: ScalePattern | "none" = (() => {
    const value = new URLSearchParams(location.search).get("link");
    return ["1", "2", "3", "4", "5"].includes(value || "")
      ? (value as ScalePattern)
      : "none";
  })();
  private returnPosition?: GuitarScaleSettings["returnPosition"];
  private labels: "fingers" | "notes" | "none" = "fingers";
  private firstFret = 0;
  private lastFret = 5;
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
    this.shapeSet = settings.shapeSet || "standard";
    this.hilaShape = settings.hilaShape || 1;
    this.tonic = settings.tonic;
    this.quality = settings.quality;
    this.spelling = settings.spelling;
    this.pattern = settings.pattern || (saved ? "map" : "1");
    this.shift = settings.shift || 0;
    this.labels = settings.labels || "fingers";
    this.firstFret = settings.firstFret ?? 0;
    this.lastFret = settings.lastFret ?? 5;
    this.returnPosition = settings.returnPosition;
    this.disposeView = mountPracticeSurface(
      element,
      createElement(ScaleFrame, {
        body: this.body,
        clearShift: () => {
          this.selectedShift = undefined;
          this.render();
        },
        reverseLink: () => {
          if (
            this.pattern === "map" ||
            this.linked === "none" ||
            this.linked === "map" ||
            this.pattern === this.linked
          )
            return;
          const secondary = linkedPatternPositions(
            this.tonic,
            this.quality,
            this.pattern,
            this.shift,
            this.linked,
            this.spelling,
            this.linkedShift,
          );
          const primary = patternPositions(
            this.tonic,
            this.quality,
            this.pattern,
            this.shift,
            this.spelling,
          );
          const reverseRoutes = shiftRoutes(
            secondary,
            primary,
            "ascending",
            true,
            true,
          );
          if (
            this.selectedShift
              ? !reverseRoutes.has(this.selectedShift)
              : !reverseRoutes.size
          )
            return;
          const previousPattern = this.pattern;
          const previousShift = this.shift;
          this.pattern = this.linked;
          this.shift =
            Math.min(...secondary.map((n) => n.fret)) -
            patternBounds(this.pattern, this.quality)[0];
          this.linked = previousPattern;
          this.linkedShift = previousShift;
          this.reversedColors = !this.reversedColors;
          this.returnPosition = undefined;
          this.shiftContext = `${this.tonic}:${this.quality}:${this.pattern}:${this.shift}:${this.linked}`;
          this.update();
        },
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
              this.pattern = isMajorScale(this.quality) ? "5" : "2";
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
        "div",
        null,
        createElement(ScaleOptions, {
          model: this.options,
          change: (patch) => {
            if (patch.linked !== undefined) this.linked = patch.linked;
            if (patch.pattern === this.linked) this.linked = "none";
            const next = mergeGuitarScaleSettings(
              patch,
              this.optionsSnapshot(),
            );
            this.shapeSet = next.shapeSet || "standard";
            this.hilaShape = next.hilaShape || 1;
            this.tonic = next.tonic;
            this.quality = next.quality;
            this.pattern = next.pattern!;
            this.labels = next.labels!;
            this.firstFret = next.firstFret ?? 0;
            this.lastFret = next.lastFret ?? 5;
            if (
              patch.labels === undefined &&
              patch.firstFret === undefined &&
              patch.lastFret === undefined
            ) {
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
    if (this.shapeSet === "hila") {
      url.searchParams.set("set", "hila");
      url.searchParams.set("shape", String(this.hilaShape));
    } else {
      url.searchParams.delete("set");
      url.searchParams.delete("shape");
    }
    if (this.shapeSet === "hila" || this.pattern !== "map")
      url.searchParams.set("position", String(this.shift));
    else url.searchParams.delete("position");
    if (this.linked !== "none") url.searchParams.set("link", this.linked);
    else url.searchParams.delete("link");
    if (this.pattern === "map") {
      url.searchParams.set("from", String(this.firstFret));
      url.searchParams.set("to", String(this.lastFret));
    } else {
      url.searchParams.delete("from");
      url.searchParams.delete("to");
    }
    if (this.labels !== "fingers") url.searchParams.set("labels", this.labels);
    else url.searchParams.delete("labels");
    history.replaceState(history.state, "", url);
  }
  private optionsSnapshot() {
    return {
      tonic: this.tonic,
      quality: this.quality,
      spelling: this.spelling,
      shapeSet: this.shapeSet,
      hilaShape: this.hilaShape,
      pattern: this.pattern,
      labels: this.labels,
      firstFret: this.firstFret,
      lastFret: this.lastFret,
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
        shapeSet: this.shapeSet,
        hilaShape: this.hilaShape,
        pattern: this.pattern,
        shift: this.shift,
        ...(this.returnPosition ? { returnPosition: this.returnPosition } : {}),
        firstFret: this.firstFret,
        lastFret: this.lastFret,
        ...(this.labels !== "fingers" ? { labels: this.labels } : {}),
        ...(this.spelling ? { spelling: this.spelling } : {}),
      },
    });
    this.render();
    this.publishRoute();
  }
  private normalizePosition() {
    if(isMaqam(this.quality)){
      this.pattern='map';this.shapeSet='standard';this.linked='none';this.returnPosition=undefined;this.shift=0;
      this.firstFret=Math.max(1,Math.min(14,this.firstFret));this.lastFret=this.firstFret+4;
      return;
    }
    if (this.shapeSet === "hila")
      this.shift = hilaShift(this.tonic, this.hilaShape, this.shift);
    else if (this.pattern !== "map")
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
      isMajorScale(this.quality) ? "major" : "minor",
      this.quality,
    );
    this.options.set(this.optionsSnapshot());
    const title = `${scaleLabel(this.spelling || SCALE_TONICS[this.quality][this.tonic])} ${scaleQualityLabel(this.quality)}`;

    const noteList = scaleNotes(this.tonic, this.quality, this.spelling)
      .map((n) => scaleLabel(n.name))
      .join(" · ");
    const maqam=isMaqam(this.quality);
    const relative = maqam ? {tonic:this.tonic,quality:this.quality,spelling:this.spelling} : relativeScale(this.tonic, this.quality, this.spelling);
    const relativeName = scaleLabel(
      relative.spelling || SCALE_TONICS[relative.quality][relative.tonic],
    );
    const relativeTarget = isMajorScale(this.quality) ? "5" : "2";
    const label = this.returnPosition
      ? "Return to previous shape"
      : `Show ${relativeName} ${scaleQualityLabel(relative.quality).replace("natural minor", "minor")} starting position`;
    const relativeExplanation = `${relativeName} ${scaleQualityLabel(relative.quality).replace("natural minor", "minor")} ${scaleShapeLabel("1", relative.quality)} · ${scaleLabel(this.spelling || SCALE_TONICS[this.quality][this.tonic])} ${scaleQualityLabel(this.quality)} ${scaleShapeLabel(relativeTarget, this.quality)}`;
    const hila = this.shapeSet === "hila";
    const movable = maqam || hila || this.pattern !== "map";
    const basePositions = isMaqam(this.quality) ? maqamPositions(this.tonic,this.quality,this.firstFret,this.spelling) : hila
      ? hilaPositions(this.tonic, this.hilaShape, this.shift, this.spelling)
      : this.pattern === "map"
        ? scalePositions(
            this.tonic,
            this.quality,
            this.spelling,
            this.firstFret,
            this.lastFret,
          )
        : patternPositions(
            this.tonic,
            this.quality,
            this.pattern,
            this.shift,
            this.spelling,
          );
    const linked =
      !maqam && !hila &&
      movable &&
      this.linked !== "none" &&
      this.linked !== "map" &&
      this.linked !== this.pattern;
    const context = `${this.tonic}:${this.quality}:${this.pattern}:${this.shift}:${this.linked}`;
    if (context !== this.shiftContext) {
      this.selectedShift = undefined;
      this.linkedShift = undefined;
      this.reversedColors = false;
      this.shiftContext = context;
    }
    const secondary = linked
      ? linkedPatternPositions(
          this.tonic,
          this.quality,
          this.pattern as Exclude<ScalePattern, "map">,
          this.shift,
          this.linked as Exclude<ScalePattern, "map">,
          this.spelling,
          this.linkedShift,
        )
      : [];
    const routes = shiftRoutes(
      linked ? (basePositions as ReturnType<typeof patternPositions>) : [],
      secondary,
      "ascending",
      true,
      true,
    );
    const route = this.selectedShift
      ? routes.get(this.selectedShift)
      : undefined;
    const reverseRoutes = shiftRoutes(
      secondary,
      basePositions as ReturnType<typeof patternPositions>,
      "ascending",
      true,
      true,
    );
    const canReverse =
      linked &&
      (this.selectedShift
        ? reverseRoutes.has(this.selectedShift)
        : reverseRoutes.size > 0);
    const primaryKeys = new Set(
      basePositions.map((n) => `${n.string}:${n.fret}`),
    );
    const secondaryKeys = new Set(
      secondary.map((n) => `${n.string}:${n.fret}`),
    );
    const positions = [
      ...basePositions,
      ...secondary.filter((n) => !primaryKeys.has(`${n.string}:${n.fret}`)),
    ];
    const chordKeys = new Set<string>();
    const chordDiagrams: {name:string; frets:(number|null)[]}[] = [];
    const addChord = (shape: Exclude<ScalePattern,"map">, shift: number) => {
      const positions=cagedChordPositions(shape,this.quality,shift);
      for(const n of positions)chordKeys.add(positionKey(n));
      chordDiagrams.push({
        ...cagedReferenceChord(shape,this.quality),
      });
    };
    if (!hila && this.pattern !== "map") {
      addChord(this.pattern,this.shift);
      if (secondary.length && this.linked !== "none" && this.linked !== "map") {
        const reference = patternPositions(isMajorScale(this.quality) ? 0 : 9, this.quality, this.linked, 0);
        const linkedShift = secondary[0].fret - reference[0].fret;
        addChord(this.linked,linkedShift);
      }
    }
    const firstFret = maqam ? this.firstFret : movable
      ? Math.min(...positions.map((n) => n.fret))
      : this.firstFret;
    const lastFret = maqam ? this.lastFret : movable
      ? Math.max(...positions.map((n) => n.fret))
      : this.lastFret;
    const fullStart = Math.max(1, firstFret);
    const fullEnd = lastFret;
    const step = 65;
    const x = (fret: number) => (fret === 0 ? -32 : (fret - 0.5) * step);
    const y = (string: number) => 42 + (string - 1) * 43;
    const fullLeft = firstFret === 0 ? -100 : (fullStart - 1) * step - 36;
    const fullRight = fullEnd * step + 1;

    const caption = maqam ? `Frets ${firstFret}–${lastFret}` : hila
      ? `Seven-position major · Shape ${this.hilaShape}`
      : movable
        ? `${scaleShapeLabel(this.pattern, this.quality)} · ${firstFret}${firstFret % 100 >= 11 && firstFret % 100 <= 13 ? "th" : firstFret % 10 === 1 ? "st" : firstFret % 10 === 2 ? "nd" : firstFret % 10 === 3 ? "rd" : "th"} position`
        : "Fret range";
    const labels = hila && this.labels === "fingers" ? "notes" : this.labels;
    const footnote =
      movable && labels === "fingers"
        ? "1 index · 2 middle · 3 ring · 4 little finger" + (maqam ? ". Some rows use a one-fret extension." : "") + (this.quality.endsWith("blues") ? ". Same finger on adjacent frets: slide one fret." : "")
        : "Darker dots mark the root notes.";
    const source = isMaqam(this.quality) ? maqamSource(this.quality) :
      this.quality === "major-blues"
        ? "https://pulse.berklee.edu/scales/c-major-blues-scale.html"
        : `https://guitarscale.org/${this.quality === "minor-blues" ? "a-blues" : isMajorScale(this.quality) ? "c-major" : "a-minor"}.html`;
    const keys = [-1, 1].map((direction) => {
      const target = scaleLabel(
        SCALE_TONICS[this.quality][(this.tonic + direction + 12) % 12],
      );
      const [low, high] = maqam ? [this.firstFret,this.lastFret] : hila
        ? hilaBounds(this.hilaShape)
        : patternBounds(
            this.pattern === "map" ? "1" : this.pattern,
            this.quality,
          );
      return {
        label: direction < 0 ? `← ${target}` : `${target} →`,
        title: `${direction < 0 ? "Down" : "Up"} one fret · ${target}`,
        disabled:
          movable &&
          (low + this.shift + direction < 1 ||
            high + this.shift + direction > (hila || maqam ? 18 : 22)),
      };
    });
    this.controls.set({
      relative: hila || maqam ? "" : label,
      returning: !!this.returnPosition,
      movable,
      caption: linked ? "" : caption,
      keys,
    });
    const renderBoard = () => {
      const routeNotes = new Map(
        (route?.notes || []).map((n) => [positionKey(n), n]),
      );
      const notes = positions
        .map((n) => {
          // Use the selected shape's fingering at overlaps, and the linked
          // shape's fingering for the notes it adds.
          const routeNote = routeNotes.get(positionKey(n));
          const fingerNote = routeNote || n;
          const label =
            labels === "none" || (route && !routeNote)
              ? ""
              : labels === "fingers" && "finger" in fingerNote
                ? fingerNote.finger
                : scaleLabel(n.name);
          const available = routes.has(positionKey(n));
          const chosen =
            !!route && positionKey(route.arrival) === positionKey(n);
          const clickable = linked && available && (!route || chosen);
          const shiftClass = linked
            ? `${route && !routeNote ? " scale-unused" : ""}${clickable ? " scale-shift-candidate" : ""}${chosen ? " scale-shift-chosen" : ""}`
            : "";
          const inPrimary = primaryKeys.has(`${n.string}:${n.fret}`);
          const inSecondary = secondaryKeys.has(`${n.string}:${n.fret}`);
          const primaryColor = this.reversedColors
            ? "scale-secondary"
            : "scale-primary";
          const secondaryColor = this.reversedColors
            ? "scale-primary"
            : "scale-secondary";
          const membership = routeNote
            ? ` scale-route ${basePositions.some((p) => p === routeNote) ? primaryColor : secondaryColor}`
            : route
              ? ""
              : linked
                ? inPrimary && inSecondary
                  ? " scale-shared"
                  : inPrimary
                    ? ` ${primaryColor}`
                    : ` ${secondaryColor}`
                : "";
          const alternate =
            !route && labels === "fingers" && inPrimary && inSecondary
              ? secondary.find((p) => positionKey(p) === positionKey(n))
              : undefined;
          const dotLabel = alternate
            ? `<text class="scale-finger-main" x="${x(n.fret)}" y="${y(n.string)}" dy=".35em">${label}</text><rect class="scale-alternate-badge" x="${x(n.fret) + 6}" y="${y(n.string) + 5}" width="20" height="20" rx="7"/><text class="scale-finger-alternate" x="${x(n.fret) + 16}" y="${y(n.string) + 15}" dy=".35em">${alternate.finger}</text>`
            : `<text x="${x(n.fret)}" y="${y(n.string)}" dy=".35em">${label}</text>`;
          return `<g class="scale-tone${alternate ? " scale-dual" : ""}${shiftClass}${membership}${chordKeys.has(positionKey(n)) ? " scale-chord-tone" : ""}${n.root ? " scale-root" : ""}${n.openAlternative ? " scale-optional" : ""}" ${clickable ? `role="button" tabindex="0" aria-pressed="${chosen}" aria-label="Shift between shapes at string ${n.string}, fret ${n.fret}, ${scaleLabel(n.name)}"` : ""} data-string="${n.string}" data-fret="${n.fret}" data-midi="${n.midi}"><title>String ${n.string}, fret ${n.fret}: ${scaleLabel(n.name)}${n.octave}${n.root ? ", root" : ""}${chordKeys.has(positionKey(n)) ? ", CAGED chord note" : ""}</title><circle cx="${x(n.fret)}" cy="${y(n.string)}" r="16"/>${clickable ? `<path class="scale-shift-marker" fill-rule="evenodd" d="M ${x(n.fret)} ${y(n.string) - 17.5} A 17.5 17.5 0 1 1 ${x(n.fret) - 17.5} ${y(n.string)} C ${x(n.fret) - 17.5} ${y(n.string) - 7} ${x(n.fret) - 18} ${y(n.string) - 12} ${x(n.fret) - 21} ${y(n.string) - 21} C ${x(n.fret) - 12} ${y(n.string) - 18} ${x(n.fret) - 7} ${y(n.string) - 17.5} ${x(n.fret)} ${y(n.string) - 17.5} Z M ${x(n.fret)} ${y(n.string) - 14.5} A 14.5 14.5 0 1 0 ${x(n.fret)} ${y(n.string) + 14.5} A 14.5 14.5 0 1 0 ${x(n.fret)} ${y(n.string) - 14.5} Z"/>` : ""}${dotLabel}</g>`;
        })
        .join("");
      const turn = route;
      const transition = turn
        ? (() => {
            const from = x(turn.previous.fret),
              to = x(turn.arrival.fret);
            const sameString = turn.previous.string === turn.arrival.string;
            const yFrom =
              turn.previous.string === 1
                ? -12
                : turn.previous.string === 6
                  ? 310
                  : y(turn.previous.string) + 21;
            const yTo = sameString
              ? yFrom
              : turn.arrival.string === 1
                ? -12
                : turn.arrival.string === 6
                  ? 310
                  : y(turn.arrival.string) + 21;
            const description = `Bidirectional shift between string ${turn.previous.string}, fret ${turn.previous.fret}, finger ${turn.previous.finger} and string ${turn.arrival.string}, fret ${turn.arrival.fret}, finger ${turn.arrival.finger}`;
            return `<g class="scale-link-transition" role="img" aria-label="${description}"><title>${description}</title><path d="M ${from} ${yFrom} L ${to} ${yTo}" marker-start="url(#scale-link-arrow)" marker-end="url(#scale-link-arrow)"/></g>`;
          })()
        : "";
      const boardTop =
        route && (route.previous.string === 1 || route.arrival.string === 1)
          ? -35
          : 0;
      const boardBottom =
        route && (route.previous.string === 6 || route.arrival.string === 6)
          ? 335
          : 290;
      return `<svg style="--scale-board-units:${fullRight - fullLeft}" viewBox="${fullLeft} ${boardTop} ${fullRight - fullLeft} ${boardBottom - boardTop}" role="${linked ? "group" : "img"}" aria-labelledby="scale-svg-title-board scale-svg-desc-board"><title id="scale-svg-title-board">${title} guitar scale, ${movable ? `${maqam ? "hand position" : hila ? "Seven-position major, Shape " + this.hilaShape : scaleShapeLabel(this.pattern, this.quality)}, frets ${firstFret}–${lastFret}` : `frets ${firstFret}–${lastFret}`}</title><desc id="scale-svg-desc-board">Six horizontal strings, high E at the top, low E at the bottom. Dark blue dots mark roots; lighter blue dots mark other scale notes. ${movable && labels === "fingers" ? "Numbers show fingers, 1 index through 4 little finger." : labels === "none" ? "Dots are unlabelled." : "Dots show note names."} Full note positions are listed below.</desc>
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
        )}${notes}<defs><marker id="scale-link-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 Z" fill="#c36a16"/></marker></defs>${transition}${[1, 2, 3, 4, 5, 6].map((string, i) => `<text class="scale-tuning" x="${firstFret === 0 ? -80 : (fullStart - 1) * step - 20}" y="${y(string)}" dy=".35em">${["E", "B", "G", "D", "A", "E"][i]}</text>`).join("")}</svg>`;
    };
    const diagram = this.element.querySelector<HTMLElement>(".scale-diagram")!;
    const scrollLeft = diagram.scrollLeft;
    diagram.innerHTML = renderBoard();
    diagram.scrollLeft = scrollLeft;
    this.element
      .querySelectorAll<SVGGElement>(".scale-shift-candidate")
      .forEach((dot) => {
        const select = () => {
          const key = `${dot.dataset.string}:${dot.dataset.fret}`;
          this.selectedShift = this.selectedShift === key ? undefined : key;
          this.render();
        };
        dot.addEventListener("click", select);
        dot.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            select();
          }
        });
      });
    this.body.patch({
      title,
      shiftMode: linked,
      shiftSelected: !!route,
      canReverse,
      shiftMessage:
        route || routes.size
          ? ""
          : "No linked route available for this pair here.",
      reversedColors: this.reversedColors,
      chordOutline: chordKeys.size > 0,
      chordDiagrams,
      linkedLegend: linked ? `${scaleShapeLabel(this.pattern, this.quality)}|${scaleShapeLabel(this.linked, this.quality)}` : "",
      linkHelp: "",
      notes: noteList,
      maqamReference: isMaqam(this.quality) ? `${MAQAMAT[this.quality].form} Fretted reference; traditional intonation and melodic development vary.` : "",
      sourceLabel: maqam ? "MaqamWorld" : "GuitarScale.org",
      relativeExplanation: maqam ? "Backing uses tonic and fifth, without a Western major/minor progression." : hila
        ? "17 consecutive scale notes across all six strings."
        : relativeExplanation,
      movable,
      footnote,
      source: hila ? "" : source,
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
