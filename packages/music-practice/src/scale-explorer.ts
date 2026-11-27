import { bindMediaSession } from "@ldayton/ui/media-session";
import {isMaqam,MAQAMAT,maqamSource} from "./maqamat";
import {maqamPositions} from "./maqam-guitar";
import {
  BERKLEE_7PS_REFERENCE,
  BERKLEE_SHAPES,
  berkleeOmissions,
  berkleeBounds,
  berkleePositions,
  berkleeShift,
  linkedBerkleePosition,
  berkleeChordDiagram,
  type LinkedScaleShape,
  type BerkleeShape,
} from "./berklee-scale-shapes";
import { diagnostics } from "./diagnostics";
import { shiftRoutes, positionKey } from "./scale-shift";
import {cagedRoutes, reverseCagedRoute, type CagedRouteDirection} from "./caged-route";
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
  CAGED_SHAPES,
  linkedPatternPositions,
  scaleShapeLabel,
  cagedChordDiagram,
  cagedScaleSource,
  pentatonicOmissions,
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
  toggleRelativeScale,
  guitarScaleFromQuery,
  type GuitarScaleSettings,
} from "./guitar-scale-settings";
import "./scale-explorer.css";
import { BackingTrackPlayer } from "./backing-track-audio";
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
  private systemMedia = bindMediaSession(
    navigator.mediaSession,
    (title) => new MediaMetadata({ title, artist: "NoteWise" }),
    {
      play: () => {
        if (this.active) void this.backing.play();
      },
      pause: () => {
        if (this.active) this.backing.pauseAll();
      },
    },
  );
  private publishMedia = () => {
    const state = this.backing.model.getSnapshot();
    this.systemMedia(
      this.active ? `Backing track · ${state.keyLabel}` : "",
      state.status,
    );
  };
  private unlistenMedia = this.backing.model.subscribe(this.publishMedia);

  private selectedShift?: string;
  private shiftContext = "";
  private linkedShift?: number;
  private reversedColors = false;
  private chordOpen = false;
  private wholeRoute = false;
  private routeDirection:CagedRouteDirection = 'both';
  private routeVariant=0;
  private catalog?:{key:string;routes:ReturnType<typeof cagedRoutes>};
  private routeCatalog(){
    const key=`${this.tonic}:${this.quality}:${this.spelling||''}`;
    if(this.catalog?.key!==key)this.catalog={key,routes:cagedRoutes(this.tonic,this.quality,this.spelling)};
    return this.catalog.routes;
  }
  enter() {
    this.active = true;
    this.publishMedia();
    document.addEventListener("keydown", this.onKeyDown);
    this.render();
    this.publishRoute();
  }
  leave() {
    this.active = false;
    document.removeEventListener("keydown", this.onKeyDown);
    this.chordOpen = false;
    this.body.patch({ shortcutsOpen: false, chordOpen: false });
    this.backing.pauseAll();
    this.publishMedia();
  }
  dispose() {
    this.leave();
    this.unlistenMedia();
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
    else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      // Numbered shapes follow the selector order: Down advances, Up reverses.
      const forward = isMaqam(this.quality) ? "ArrowUp" : "ArrowDown";
      this.moveShape(event.key === forward ? 1 : -1);
    }
    else this.moveTonic(event.key === "ArrowLeft" ? -1 : 1);
  };
  private regionId() { return this.shapeSet === "hila" ? String(this.hilaShape) : this.pattern; }
  private regionLabel(id:string) { return this.shapeSet === "hila" ? `Shape ${id}` : scaleShapeLabel(id as ScalePattern,this.quality); }
  private linkContext() { return `${this.shapeSet}:${this.tonic}:${this.quality}:${this.regionId()}:${this.shift}:${this.linked}`; }
  private linkedPosition() {
    if(this.linked === "none")throw Error("No linked region selected");
    if(this.shapeSet === "hila")return linkedBerkleePosition(this.tonic,this.quality,this.hilaShape,this.shift,Number(this.linked) as BerkleeShape,this.spelling,this.linkedShift);
    const shape=this.linked as Exclude<ScalePattern,"map">;
    const notes=linkedPatternPositions(this.tonic,this.quality,this.pattern as Exclude<ScalePattern,"map">,this.shift,shape,this.spelling,this.linkedShift);
    const reference=patternPositions(isMajorScale(this.quality)?0:9,this.quality,shape,0);
    return {notes,shift:notes[0].fret-reference[0].fret};
  }
  private moveOctave(direction: number) {
    if(this.wholeRoute)return;
    if(isMaqam(this.quality)){this.moveMaqamPosition(direction*12);return;}
    if (this.shapeSet === "hila") {
      const next = this.shift + direction * 12;
      if (berkleeShift(this.tonic, this.quality, this.hilaShape, next) === next) {
        this.shift = next;
        this.returnPosition = undefined;
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
    if(this.wholeRoute)return;
    if(isMaqam(this.quality)){this.moveMaqamPosition(direction);return;}
    if(this.shapeSet === "standard" && this.pattern === "map")return;
    // Use the selectors' order, including CAGED's stable legacy IDs. A linked
    // pair moves as a unit, so either endpoint reaching an edge stops the move.
    const shapes: readonly string[] = this.shapeSet === "hila"
      ? BERKLEE_SHAPES.map(String) : CAGED_SHAPES;
    const next = shapes[shapes.indexOf(this.regionId()) + direction];
    const nextLinked = this.linked === "none" ? "none"
      : shapes[shapes.indexOf(this.linked) + direction];
    if(!next || !nextLinked)return;
    if (this.shapeSet === "hila") {
      const shape=Number(next) as BerkleeShape;
      const [low,high]=berkleeBounds(shape);
      const current=berkleeBounds(this.hilaShape)[0]+this.shift;
      const delta=this.tonic-(isMajorScale(this.quality)?0:9);
      const shift=[delta-12,delta,delta+12]
        .filter(s=>low+s>=1&&high+s<=18&&(low+s-current)*direction>0)
        .sort((a,b)=>Math.abs(low+a-current)-Math.abs(low+b-current))[0];
      if(shift===undefined)return;
      this.hilaShape=shape;
      this.linked=nextLinked as LinkedScaleShape;
      this.shift=shift;
      this.returnPosition = undefined;
      this.update();
      return;
    }
    if (this.pattern === "map") return;
    const shape = next as Exclude<ScalePattern, "map">;
    const [currentLow] = patternBounds(this.pattern, this.quality);
    const [low, high] = patternBounds(shape, this.quality);
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
    this.pattern = shape;
    this.shift = shift;
    this.linked = nextLinked as LinkedScaleShape;
    this.returnPosition = undefined;
    this.update();
  }
  private moveTonic(direction: number) {
    if(isMaqam(this.quality)){
      const next=this.firstFret+direction;if(next<1||next>14)return;
      this.firstFret=next;this.lastFret=next+4;
    } else if (this.wholeRoute) {
      this.shift=NaN;
    } else if (this.shapeSet === "hila") {
      const tonic = (this.tonic + direction + 12) % 12;
      const next = this.shift + direction;
      if (berkleeShift(tonic, this.quality, this.hilaShape, next) !== next) return;
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
      wholeRoute:this.wholeRoute,
      routeDirection:this.routeDirection,
      routeVariant:this.routeVariant,
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
      settings.labels !== this.labels || !!settings.wholeRoute !== this.wholeRoute || (settings.routeDirection||"both") !== this.routeDirection || (settings.routeVariant||0)!==this.routeVariant
    ) {
      this.returnPosition = undefined;
      this.wholeRoute=!!settings.wholeRoute;
      this.routeDirection=settings.routeDirection||"both";
    this.routeVariant=settings.routeVariant||0;
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
    keys: [],
  });
  private options!: ScaleOptionsState;
  private shapeSet: "standard" | "hila" = "standard";
  private hilaShape: BerkleeShape = 1;
  private pattern: ScalePattern = "1";
  private shift = 0;
  private linked: LinkedScaleShape = (() => {
    const value = new URLSearchParams(location.search).get("link");
    return ["1", "2", "3", "4", "5", "6", "7"].includes(value || "")
      ? (value as LinkedScaleShape)
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
    this.wholeRoute=!!settings.wholeRoute;
    this.routeDirection=settings.routeDirection||"both";
    this.routeVariant=settings.routeVariant||0;
    this.disposeView = mountPracticeSurface(
      element,
      createElement(ScaleFrame, {
        body: this.body,
        setRouteVariant:(variant:number)=>{this.routeVariant=variant;this.update();},
        setRouteDirection:(direction:CagedRouteDirection)=>{this.routeDirection=direction;this.update();},
        focusRouteShift:(key:string)=>{
          const node=this.element.querySelector<SVGGraphicsElement>(`[data-route-shift="${key}"]`);
          if(node){node.scrollIntoView({block:'nearest',inline:'center',behavior:'smooth'});node.focus({preventScroll:true});}
        },
        navigate: (axis: "tonic" | "shape", direction: number) => {
          if (!this.active) return;
          if (axis === "tonic") this.moveTonic(direction);
          else this.moveShape(isMaqam(this.quality) ? direction : -direction);
        },
        setChordOpen: (open: boolean) => { this.chordOpen = open; this.render(); },
        clearShift: () => {
          this.selectedShift = undefined;
          this.render();
        },
        reverseLink: () => {
          if ((this.shapeSet === "standard" && this.pattern === "map") || this.linked === "none" || this.regionId() === this.linked) return;
          const {notes:secondary,shift:secondaryShift}=this.linkedPosition();
          const primary=this.shapeSet === "hila"
            ? berkleePositions(this.tonic,this.quality,this.hilaShape,this.shift,this.spelling)
            : patternPositions(this.tonic,this.quality,this.pattern as Exclude<ScalePattern,"map">,this.shift,this.spelling);
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
          const previousPattern = this.regionId() as LinkedScaleShape;
          const previousShift = this.shift;
          if(this.shapeSet === "hila")this.hilaShape=Number(this.linked) as BerkleeShape;
          else this.pattern=this.linked as Exclude<ScalePattern,"map">;
          this.shift=secondaryShift;
          this.linked = previousPattern;
          this.linkedShift = previousShift;
          this.reversedColors = !this.reversedColors;
          this.returnPosition = undefined;
          this.shiftContext = this.linkContext();
          this.update();
        },
        relative: createElement(ScaleRelative, {
          model: this.controls,
          toggle: () => {
            const next=toggleRelativeScale({...this.optionsSnapshot(),shift:this.shift,returnPosition:this.returnPosition});
            this.tonic=next.tonic;this.quality=next.quality;this.spelling=next.spelling;
            this.pattern=next.pattern!;this.shift=next.shift!;this.returnPosition=next.returnPosition;
            this.linked='none';
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
            if (patch.shapeSet !== undefined && patch.shapeSet !== this.shapeSet) this.linked = "none";
            const next = mergeGuitarScaleSettings(
              patch,
              this.optionsSnapshot(),
            );
            this.shapeSet = next.shapeSet || "standard";
            this.wholeRoute=!!next.wholeRoute;
            this.routeDirection=next.routeDirection||"both";
            this.routeVariant=next.routeVariant||0;
            if(this.wholeRoute)this.linked="none";
            this.hilaShape = next.hilaShape || 1;
            this.tonic = next.tonic;
            this.quality = next.quality;
            this.pattern = next.pattern!;
            this.labels = next.labels!;
            this.firstFret = next.firstFret ?? 0;
            this.lastFret = next.lastFret ?? 5;
            if (
              patch.linked === undefined &&
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
      url.searchParams.set("set", "berklee");
      url.searchParams.set("shape", String(this.hilaShape));
    } else {
      url.searchParams.delete("set");
      url.searchParams.delete("shape");
    }
    if (this.shapeSet === "hila" || this.pattern !== "map")
      url.searchParams.set("position", String(this.shift));
    else url.searchParams.delete("position");
    if(this.wholeRoute && this.routeVariant)url.searchParams.set("route",String(this.routeVariant+1));
    else url.searchParams.delete("route");
    if(this.wholeRoute && this.routeDirection!=="both")url.searchParams.set("direction",this.routeDirection);
    else url.searchParams.delete("direction");
    if(this.wholeRoute)url.searchParams.set("link","all");
    else if (this.linked !== "none") url.searchParams.set("link", this.linked);
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
      wholeRoute:this.wholeRoute,
      routeDirection:this.routeDirection,
      routeVariant:this.routeVariant,
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
        ...(this.wholeRoute?{wholeRoute:true}:{}),
        ...(this.routeDirection!=="both"?{routeDirection:this.routeDirection}:{}),
        ...(this.routeVariant?{routeVariant:this.routeVariant}:{}),
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
    if(this.shapeSet!=="standard"||isMaqam(this.quality))this.wholeRoute=false;
    if(this.wholeRoute)this.routeVariant=Math.min(this.routeVariant,Math.max(0,this.routeCatalog().length-1));
    if(isMaqam(this.quality)){
      this.pattern='map';this.shapeSet='standard';this.linked='none';this.returnPosition=undefined;this.shift=0;
      this.firstFret=Math.max(1,Math.min(14,this.firstFret));this.lastFret=this.firstFret+4;
      return;
    }
    if(this.linked === this.regionId() || (this.shapeSet === "standard" && (Number(this.linked)>5 || this.pattern === "map")))this.linked="none";
    if (this.shapeSet === "hila")
      this.shift = berkleeShift(this.tonic, this.quality, this.hilaShape, this.shift);
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

    const label = this.returnPosition
      ? "Return to previous scale"
      : `Show ${relativeName} ${scaleQualityLabel(relative.quality).replace("natural minor", "minor")}`;
    const relativeExplanation = `Shares its notes with ${relativeName} ${scaleQualityLabel(relative.quality)}. Root markers and accompaniment follow the selected scale.`;
    const hila = this.shapeSet === "hila";
    const movable = this.wholeRoute || maqam || hila || this.pattern !== "map";
    const routeChoices=this.wholeRoute?this.routeCatalog():[];
    const ascendingRoute=routeChoices[this.routeVariant];
    const fullRoute=ascendingRoute&&(this.routeDirection==="down"?reverseCagedRoute(ascendingRoute):ascendingRoute);
    const basePositions = isMaqam(this.quality) ? maqamPositions(this.tonic,this.quality,this.firstFret,this.spelling) : hila
      ? berkleePositions(this.tonic, this.quality, this.hilaShape, this.shift, this.spelling)
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
      !maqam &&
      movable &&
      this.linked !== "none" &&
      this.linked !== this.regionId();
    const context = this.linkContext();
    if (context !== this.shiftContext) {
      this.selectedShift = undefined;
      this.linkedShift = undefined;
      this.reversedColors = false;
      this.shiftContext = context;
    }
    const linkedPosition=linked ? this.linkedPosition() : undefined;
    const secondary=linkedPosition?.notes || [];
    const routes = shiftRoutes(
      linked ? (basePositions as ReturnType<typeof patternPositions>) : [],
      secondary,
      "ascending",
      true,
      true,
    );
    const route = fullRoute ? {notes:fullRoute.notes,...fullRoute.shifts[0]} : this.selectedShift
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
    const positions = fullRoute ? [...new Map(fullRoute.regions.flatMap(region=>region.notes).map(n=>[positionKey(n),n])).values()] : [
      ...basePositions,
      ...secondary.filter((n) => !primaryKeys.has(`${n.string}:${n.fret}`)),
    ];
    const omittedByPosition=new Map((fullRoute ? fullRoute.regions.flatMap(region=>pentatonicOmissions(this.tonic,this.quality,region.shape,region.shift,this.spelling)) : hila ? berkleeOmissions(this.tonic,this.quality,this.hilaShape,this.shift,this.spelling) : pentatonicOmissions(this.tonic,this.quality,this.pattern,this.shift,this.spelling,this.firstFret,this.lastFret)).map(n=>[positionKey(n),n]));
    if(linkedPosition && this.linked!=="none"){
      const omitted=hila
        ? berkleeOmissions(this.tonic,this.quality,Number(this.linked) as BerkleeShape,linkedPosition.shift,this.spelling)
        : pentatonicOmissions(this.tonic,this.quality,this.linked as Exclude<ScalePattern,"map">,linkedPosition.shift,this.spelling);
      for(const n of omitted)omittedByPosition.set(positionKey(n),n);
    }
    const omittedPositions=[...omittedByPosition.values()];
    const boardPositions=[...positions,...omittedPositions];
    const chordKeys = new Set<string>();
    const chordDiagrams: ReturnType<typeof cagedChordDiagram>[] = [];
    const addChord = (id:string, shift:number) => {
      const diagram=hila
        ? berkleeChordDiagram(this.tonic,this.quality,Number(id) as BerkleeShape,shift,this.spelling)
        : cagedChordDiagram(this.tonic,this.quality,id as Exclude<ScalePattern,"map">,shift,this.spelling);
      if(this.chordOpen)diagram.frets.forEach((fret,row)=>{if(fret!==null)chordKeys.add(positionKey({string:6-row,fret}));});
      chordDiagrams.push(diagram);
    };
    if (!fullRoute && !maqam && movable) {
      addChord(this.regionId(),this.shift);
      if(linkedPosition)addChord(this.linked,linkedPosition.shift);
    }
    if(!chordDiagrams.length)this.chordOpen = false;
    const firstFret = maqam ? this.firstFret : movable
      ? Math.min(...boardPositions.map((n) => n.fret))
      : this.firstFret;
    const lastFret = maqam ? this.lastFret : movable
      ? Math.max(...boardPositions.map((n) => n.fret))
      : this.lastFret;
    const fullStart = Math.max(1, firstFret);
    const fullEnd = lastFret;
    const step = 65;
    const x = (fret: number) => (fret === 0 ? -32 : (fret - 0.5) * step);
    const y = (string: number) => 42 + (string - 1) * 43;
    const fullLeft = firstFret === 0 ? -100 : (fullStart - 1) * step - 36;
    const fullRight = fullEnd * step + 1;

    const caption = fullRoute ? `CAGED · All five shapes · Frets ${firstFret}–${lastFret}` : maqam ? `Frets ${firstFret}–${lastFret}` : hila
      ? `Berklee 7PS · Shape ${this.hilaShape}`
      : movable
        ? `CAGED · ${scaleShapeLabel(this.pattern, this.quality).replace(/ shape$/, " Shape")}`
        : "Fret range";
    const labels = this.labels;
    const footnote =
      movable && labels === "fingers"
        ? "1 index · 2 middle · 3 ring · 4 little finger" + (maqam ? ". Some rows use a one-fret extension." : "") + (this.quality.endsWith("blues") ? ". Same finger on adjacent frets: slide one fret." : "")
        : "Darker dots mark the root notes.";
    const reference = isMaqam(this.quality)
      ? {url:maqamSource(this.quality),label:'MaqamWorld'}
      : cagedScaleSource(this.quality);
    const keys = [-1, 1].map((direction) => {
      const target = scaleLabel(
        SCALE_TONICS[this.quality][(this.tonic + direction + 12) % 12],
      );
      const [low, high] = maqam ? [this.firstFret,this.lastFret] : hila
        ? berkleeBounds(this.hilaShape)
        : patternBounds(
            this.pattern === "map" ? "1" : this.pattern,
            this.quality,
          );
      return {
        label: direction < 0 ? `← ${target}` : `${target} →`,
        title: `${direction < 0 ? "Down" : "Up"} one fret · ${target}`,
        disabled:
          !fullRoute && movable &&
          (low + this.shift + direction < 1 ||
            high + this.shift + direction > (hila || maqam ? 18 : 22)),
      };
    });
    this.controls.set({
      relative: maqam ? "" : label,
      returning: !!this.returnPosition,
      movable,
      keys,
    });
    const renderBoard = () => {
      // Keep linked chord contours separate; each follows its own sounding grip.
      const chordConnections = this.chordOpen ? chordDiagrams.map(chord => `<polyline class="scale-chord-connection" aria-hidden="true" points="${chord.frets.flatMap((fret,i)=>fret===null?[]:[`${x(fret)},${y(6-i)}`]).join(' ')}"/>`).join('') : '';
      const routeNotes = new Map(
        (route?.notes || []).map((n) => [positionKey(n), n]),
      );
      const omittedNotes=omittedPositions.map(n=>`<g class="scale-omitted-tone" data-string="${n.string}" data-fret="${n.fret}" data-midi="${n.midi}"><title>${scaleLabel(n.name)}${n.octave}: omitted from ${isMajorScale(this.quality)?'major':'natural minor'}</title><circle cx="${x(n.fret)}" cy="${y(n.string)}" r="16"/></g>`).join('');
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
          const blueNote=this.quality.endsWith('blues') && (n.pitchClass-this.tonic+12)%12===(isMajorScale(this.quality)?3:6);
          const available = routes.has(positionKey(n));
          const chosen =
            !!route && positionKey(route.arrival) === positionKey(n);
          const clickable = linked && available && (!route || chosen);
          const shiftClass = fullRoute ? `${routeNote?" scale-route":" scale-unused"}` : linked
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
          const membership = fullRoute ? "" : routeNote
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
          return `<g class="scale-tone${blueNote ? " scale-blue-note" : ""}${alternate ? " scale-dual" : ""}${shiftClass}${membership}${chordKeys.has(positionKey(n)) ? " scale-chord-tone" : ""}${n.root ? " scale-root" : ""}${n.openAlternative ? " scale-optional" : ""}" ${clickable ? `role="button" tabindex="0" aria-pressed="${chosen}" aria-label="Shift between shapes at string ${n.string}, fret ${n.fret}, ${scaleLabel(n.name)}"` : ""} data-string="${n.string}" data-fret="${n.fret}" data-midi="${n.midi}" ${fullRoute&&routeNote?`data-route-index="${fullRoute.notes.findIndex(p=>positionKey(p)===positionKey(n))}"`:""}><title>String ${n.string}, fret ${n.fret}: ${scaleLabel(n.name)}${n.octave}${blueNote ? ", blue note" : ""}${n.root ? ", root" : ""}${chordKeys.has(positionKey(n)) ? ", chord note" : ""}</title><circle cx="${x(n.fret)}" cy="${y(n.string)}" r="16"/>${clickable ? `<path class="scale-shift-marker" fill-rule="evenodd" d="M ${x(n.fret)} ${y(n.string) - 17.5} A 17.5 17.5 0 1 1 ${x(n.fret) - 17.5} ${y(n.string)} C ${x(n.fret) - 17.5} ${y(n.string) - 7} ${x(n.fret) - 18} ${y(n.string) - 12} ${x(n.fret) - 21} ${y(n.string) - 21} C ${x(n.fret) - 12} ${y(n.string) - 18} ${x(n.fret) - 7} ${y(n.string) - 17.5} ${x(n.fret)} ${y(n.string) - 17.5} Z M ${x(n.fret)} ${y(n.string) - 14.5} A 14.5 14.5 0 1 0 ${x(n.fret)} ${y(n.string) + 14.5} A 14.5 14.5 0 1 0 ${x(n.fret)} ${y(n.string) - 14.5} Z"/>` : ""}${dotLabel}</g>`;
        })
        .join("");
      const turns=fullRoute?.shifts || (route?[route]:[]);
      const transition = turns.map((turn,index) => {
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
            const description = `${fullRoute?"Shift "+(index+1):"Bidirectional shift"} between string ${turn.previous.string}, fret ${turn.previous.fret}, finger ${turn.previous.finger} and string ${turn.arrival.string}, fret ${turn.arrival.fret}, finger ${turn.arrival.finger}`;
            return `<g class="scale-link-transition" ${fullRoute?`data-route-shift="${positionKey(turn.arrival)}" tabindex="-1"`:""} role="img" aria-label="${description}"><title>${description}</title><path d="M ${from} ${yFrom} L ${to} ${yTo}" ${fullRoute&&this.routeDirection!=="both"?"":'marker-start="url(#scale-link-arrow)"'} marker-end="url(#scale-link-arrow)"/>${fullRoute?`<text class="scale-route-shift-number" x="${(from+to)/2}" y="${yFrom-8}">${index+1}</text>`:""}</g>`;
          }).join("");
      const boardTop =
        turns.some(turn=>turn.previous.string===1||turn.arrival.string===1)
          ? -35
          : 0;
      const boardBottom =
        turns.some(turn=>turn.previous.string===6||turn.arrival.string===6)
          ? 335
          : 290;
      return `<svg ${fullRoute?'class="scale-whole-route-board"':""} style="--scale-board-units:${fullRight - fullLeft}" viewBox="${fullLeft} ${boardTop} ${fullRight - fullLeft} ${boardBottom - boardTop}" role="${linked || fullRoute ? "group" : "img"}" aria-labelledby="scale-svg-title-board scale-svg-desc-board"><title id="scale-svg-title-board">${title} guitar scale, ${movable ? `${fullRoute ? "All five CAGED shapes" : maqam ? "hand position" : hila ? "Berklee 7PS, Shape " + this.hilaShape : scaleShapeLabel(this.pattern, this.quality)}, frets ${firstFret}–${lastFret}` : `frets ${firstFret}–${lastFret}`}</title><desc id="scale-svg-desc-board">Six horizontal strings, high E at the top, low E at the bottom. Dark blue dots mark roots; lighter blue dots mark other scale notes. ${this.quality.endsWith("blues") ? "Purple dots mark the blue note. " : ""}${this.quality.endsWith("pentatonic") ? "Hollow dashed circles mark omitted full-scale notes, which are not played. " : ""}${movable && labels === "fingers" ? "Numbers show fingers, 1 index through 4 little finger." : labels === "none" ? "Dots are unlabelled." : "Dots show note names."} Full note positions are listed below.</desc>
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
        )}${omittedNotes}${chordConnections}${notes}<defs><marker id="scale-link-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 Z" fill="#c36a16"/></marker></defs>${transition}${[1, 2, 3, 4, 5, 6].map((string, i) => `<text class="scale-tuning" x="${firstFret === 0 ? -80 : (fullStart - 1) * step - 20}" y="${y(string)}" dy=".35em">${["E", "B", "G", "D", "A", "E"][i]}</text>`).join("")}</svg>`;
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
      wholeRoute:!!fullRoute,
      routeDirection:this.routeDirection,
      routeVariant:this.routeVariant,
      routeChoices:routeChoices.map((_,i)=>({value:String(i),label:`Route ${i+1}`})),
      routeShapes:fullRoute?[...new Set(fullRoute.notes.map(n=>n.region))].map(i=>scaleShapeLabel(fullRoute.regions[i].shape,this.quality).replace(' shape','')).join(this.routeDirection==='both'?' ↔ ':' → '):'',
      routeSteps:fullRoute?fullRoute.shifts.map(({previous,arrival})=>({key:positionKey(arrival),label:`${scaleShapeLabel(fullRoute.regions[previous.region].shape,this.quality).replace(' shape','')} ${this.routeDirection==='both'?'↔':'→'} ${scaleShapeLabel(fullRoute.regions[arrival.region].shape,this.quality).replace(' shape','')}`})):[],
      caption: linked || !movable ? "" : caption,
      shiftMode: linked,
      shiftSelected: !!route,
      canReverse,
      shiftMessage:
        route || routes.size
          ? ""
          : "No linked route available for this pair here.",
      reversedColors: this.reversedColors,
      blueNoteLabel: this.quality.endsWith('blues') ? `Blue note (${isMajorScale(this.quality)?'♭3':'♭5'})` : '',
      omittedNoteLabel: this.quality.endsWith('pentatonic') ? `Omitted (${isMajorScale(this.quality)?'4, 7':'2, ♭6'})` : '',
      chordAvailable: chordDiagrams.length > 0,
      chordOpen: this.chordOpen,
      chordDiagrams,
      linkedLegend: linked ? `${this.regionLabel(this.regionId())}|${this.regionLabel(this.linked)}` : "",
      linkHelp: "",
      notes: noteList,
      maqamReference: isMaqam(this.quality) ? `${MAQAMAT[this.quality].form} Fretted reference; traditional intonation and melodic development vary.` : "",
      sourceLabel: hila ? BERKLEE_7PS_REFERENCE.label + (this.quality === "major" ? "" : " (adapted)") : reference.label,
      relativeExplanation: maqam ? "Backing uses tonic and fifth, without a Western major/minor progression." : relativeExplanation,
      movable,
      footnote,
      source: hila ? BERKLEE_7PS_REFERENCE.url : reference.url,
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
