import { RendererLifetime } from "./renderer-lifetime";
import { HymnFrame, hymnBodyState } from "./practice-frame";
import { practicePresentation } from "./practice-presentation";
import { shellStatus } from "./shell-status";
import { mountPracticeSurface } from "./practice-surfaces";
import { HymnControls, hymnControlsState } from "./hymn-controls";
import { createElement } from "react";
import { setSidebarSelection } from "./practice-surfaces";
import { HymnOptions, HymnSelector } from "./hymn-options";
import {
  hymnOptionsState,
  type HymnOptionsState,
  type HymnOptionsChange,
  type HymnOptionsSnapshot,
} from "./hymn-options-state";
import { ScorePassage } from "./score-passage";
import type { CountInBars } from "./hymn-count-in";
import { closePitchFields } from "@ldayton/ui/responsive-pitch-field";
import {
  hymnPitchRange,
  hymnRangeKeys,
  hymnRangeLabel,
  type HymnRange,
} from "./hymn-range";
import { preparePianoPlayback } from "./piano-audio";
import { HymnPlayback } from "./hymn-playback";
import { mountPracticePiano, isPianoVisible } from "./practice-piano";
import {
  hymnSettingsFromQuery,
  mergeHymnSettings,
  optionalHymnNote,
  type HymnSettings,
} from "./hymn-settings";
import type { InputPolicy, Interruption } from "./live-practice";
import { registerPracticeOptions } from "./practice-options";
import {
  HYMN_KEYS,
  type HymnKey,
  hymnKeyLabel,
  hymnTransposition,
  isHymnKey,
} from "./hymn-transpose";
import { feedbackForNotes } from "./sight-feedback";
import type { PracticeEvent } from "./practice-score";
import {
  drawPracticeScore,
  eventSteps,
  highlightScore,
  keyboardRange,
} from "./practice-score";
import {
  ARRANGEMENTS,
  arrangeHymn,
  type Arrangement,
  type HymnHands,
} from "./hymn-arrangements";
import hymns from "./hymns.json";
import { WaitForMe } from "./sight-reading-model";
import { Piano } from "./piano";
import { keyLabel } from "./piano-model";
import { diagnostics } from "./diagnostics";
import { persistence } from "./persistence";
import { HymnProgress, hymnProgressKey, type HymnState } from "./hymn-progress";
import { hymnPlaybackScore } from "./hymn-playback-score";
export class SightReading {
  private disposeView: () => void;
  private lifetime = new RendererLifetime();
  private body = hymnBodyState();
  private presentation = practicePresentation({});
  private controls = hymnControlsState({
    disabled: false,
    pauseDisabled: false,
    pause: "Pause",
    restore: "",
    previous: false,
    next: false,
    nextLabel: "Next hymn →",
    selecting: false,
    selected: false,
    loop: false,
    status: "",
  });
  private setControls(
    patch: Partial<ReturnType<typeof this.controls.getSnapshot>>,
  ) {
    this.controls.set({ ...this.controls.getSnapshot(), ...patch });
  }
  private hymn = hymns[0];
  private key: HymnKey = "original";
  private low: number | null = null;
  private high: number | null = null;
  private preferRangeDefault = false;
  private noMatchingKey = false;
  private rangeCache = new Map<string, HymnRange>();
  private arrangement: Arrangement = "melody";
  private hands: HymnHands = "both";
  private viewHands: HymnHands = "both";
  private reattackTies = false;
  private readonly sectionBars = 0;
  private section = 0;
  private sections = 1;
  private position = 0;
  private progress = new HymnProgress(undefined, []);
  private content = "";
  private legacyBookmark?: { key: string; position: number };
  private restoreSection() {
    this.section = 0;
  }
  private restorePending = true;
  private bookmarkKey() {
    return hymnProgressKey(this.settings(), this.hymn.key);
  }

  private mode: "wait" | "playback" = "wait";
  private bpm = 80;
  private countIn: CountInBars = 0;
  private get countInBars(): CountInBars {
    return this.mode === "playback" && /^\d+\/\d+$/.test(this.hymn.meter)
      ? this.countIn
      : 0;
  }
  private playback: HymnPlayback;
  private playbackView = "";
  private playbackFromSection = 0;
  private active = false;
  private routeChanged = false;
  private paused = false;
  private events: PracticeEvent[] = [];
  private passage: ScorePassage;
  private passageIdentity = "";
  private loopPassage = false;
  private sectionDuration = 0;
  private session?: WaitForMe;
  private piano: Piano;
  private pianoPanel: ReturnType<typeof mountPracticePiano>;
  private lastWidth = 0;
  private zoom = 1;
  private options!: HymnOptionsState;
  private searchOpen = false;
  private availableKeys: HymnKey[] = ["original", ...HYMN_KEYS];
  private melodyRangeLabel = "";
  readonly midiSlot: HTMLElement;
  dispose() {
    if (this.lifetime.disposed) return;
    this.active = false;
    this.closeResults();
    this.playback.pause();
    this.lifetime.dispose();
    this.passage.dispose();
    this.piano.dispose();
    this.pianoPanel.dispose();
    this.disposeView();
  }
  constructor(
    private element: HTMLElement,
    private acceptanceChanged: () => void,
  ) {
    try {
      const saved =
        persistence.read<HymnState>("sight") ||
        (persistence.state.legacy.sight as any);
      this.progress = new HymnProgress(
        saved,
        hymns.map((hymn) => hymn.id),
      );
      if (saved?.hands === "left" || saved?.hands === "right")
        this.hands = saved.hands;
      if (["left", "right"].includes(saved?.viewHands || ""))
        this.viewHands = saved!.viewHands!;
      if (this.viewHands !== "both") this.hands = this.viewHands;
      if ([0, 0.5, 1, 2].includes(saved?.countIn as number))
        this.countIn = saved!.countIn!;
      this.reattackTies = saved?.reattackTies === true;
      if (saved?.mode === "playback") this.mode = "playback";
      if (
        Number.isInteger(saved?.bpm) &&
        saved!.bpm! >= 40 &&
        saved!.bpm! <= 200
      )
        this.bpm = saved!.bpm!;
      if ([0.85, 1, 1.2].includes(saved?.zoom)) this.zoom = saved.zoom;
      this.low = optionalHymnNote(saved?.low);
      this.high = optionalHymnNote(saved?.high);
      if (isHymnKey(saved?.key)) this.key = saved.key;
      this.hymn = hymns.find((h) => h.id === saved?.hymn) || hymns[0];
      if (ARRANGEMENTS.some((a) => a.id === saved?.arrangement))
        this.arrangement = saved.arrangement;
      else if (saved) {
        this.arrangement = saved.chords === true ? "original" : "melody";
      }
      if (
        saved &&
        saved.version !== 1 &&
        Number.isSafeInteger(saved.position) &&
        saved.position > 0
      )
        this.legacyBookmark = {
          key: this.bookmarkKey(),
          position: saved.position,
        };
      // Legacy positions had no content identity: preserve preferences and original payload,
      // but start the selected section safely instead of applying an unverifiable index.
      if (saved && saved.version !== 1 && saved.position > 0) {
        shellStatus.set({
          notice:
            "Your hymn preferences were imported; its older unversioned bookmark starts at the section beginning. You can restore its older position if this is the same score.",
        });
      }
    } catch {
      /* Private browsing or an older saved preference. */
    }
    this.disposeView = mountPracticeSurface(
      element,
      createElement(HymnFrame, {
        presentation: this.presentation,
        panelId: `${element.id}-piano-panel`,
        body: this.body,
        transport: createElement(HymnControls, {
          model: this.controls,
          panelId: `${element.id}-piano-panel`,
          previous: () => this.changeSection(this.section - 1),
          pause: () => {
            if (this.mode === "playback") {
              if (
                ["playing", "counting", "loading"].includes(this.playback.state)
              )
                this.playback.pause();
              else void this.playback.play(this.bpm, this.countInBars);
              this.playbackView = "";
              this.update();
              return;
            }
            this.paused = !this.paused;
            this.session?.resetGesture();
            this.update();
            this.save();
          },
          restart: () => {
            if (this.mode === "playback") {
              this.render();
              this.playback.restart();
              this.playbackView = "";
              void this.playback.play(this.bpm, this.countInBars);
              this.update();
              return;
            }
            this.position = 0;
            this.paused = false;
            this.restorePending = false;
            this.render();
            this.save();
          },
          restore: () => {
            const old = this.legacyBookmark;
            if (
              this.mode === "playback" ||
              !persistence.writable ||
              !old ||
              old.key !== this.bookmarkKey() ||
              !this.session ||
              old.position > this.session.steps.length
            )
              return;
            this.position = old.position;
            this.paused = false;
            this.legacyBookmark = undefined;
            this.restorePending = false;
            this.render();
            this.save();
            shellStatus.set({ notice: "" });
          },
          next: () => {
            if (this.section + 1 < this.sections)
              this.changeSection(this.section + 1);
            else
              this.choose(hymns[(hymns.indexOf(this.hymn) + 1) % hymns.length]);
          },
          cancel: () => {
            this.passage.cancel();
            this.update();
          },
          clear: () => {
            this.passage.clear();
            this.loopPassage = false;
            this.restorePending = true;
            this.render();
          },
          loop: (value) => {
            this.loopPassage = value;
            this.syncPassageControls();
          },
        }),
      }),
    );

    this.passage = new ScorePassage(
      this.$(".hymn-paper"),
      () => this.syncPassageControls(),
      () => {
        this.position = 0;
        this.restorePending = false;
        this.content = "";
        this.paused = false;
        this.render();
      },
      () => this.update(),
      () => {
        this.interrupt("controls");
        this.paused = true;
      },
    );
    this.playback = new HymnPlayback(
      () => {
        if (!this.active) return;
        if (this.mode === "playback") this.updatePlayback();
      },
      (error) => {
        diagnostics.capture(error, "hymn_playback.play_failed");
        this.paused = true;
        this.update();
        this.presentation.set({
          feedback: "Audio couldn’t load. Try starting again.",
        });
      },
      preparePianoPlayback,
    );
    this.options = hymnOptionsState(this.optionsSnapshot());
    registerPracticeOptions(
      element,
      createElement(HymnOptions, {
        model: this.options,
        change: (patch) => this.changeOptions(patch),
      }),
    );
    setSidebarSelection(
      element,
      createElement(HymnSelector, {
        model: this.options,
        change: (patch) => this.changeOptions(patch),
        searchOpened: (open) => {
          if (open) this.interrupt("controls");
          this.searchOpen = open;
          this.publishOptions();
          this.acceptanceChanged();
        },
      }),
    );
    this.pianoPanel = mountPracticePiano(this.$(".hymn-piano"), {
      changed: () => this.updateRangeHint(),
    });
    this.midiSlot = this.$(".hymn-midi-slot");
    this.piano = new Piano(
      this.$(".hymn-piano"),
      (note) => {
        if (this.accepting) this.answer(note);
      },
      () => this.updateRangeHint(),
    );

    this.lifetime.observe(this.$(".sequence-score"), () => {
      const width = Math.round(this.$(".sequence-score").clientWidth);
      if (this.active && width > 0 && Math.abs(width - this.lastWidth) > 2)
        this.render(true);
    });
  }
  private $<T extends HTMLElement = HTMLElement>(s: string) {
    return this.element.querySelector<T>(s)!;
  }
  get inputPolicy(): InputPolicy {
    if (
      this.mode === "playback" ||
      !persistence.writable ||
      !this.active ||
      this.searchOpen ||
      !this.session ||
      this.noMatchingKey ||
      this.passage.selecting
    )
      return "none";
    return this.paused || this.session.complete ? "restart" : "answer";
  }
  get accepting() {
    return this.inputPolicy === "answer";
  }
  enter() {
    this.active = true;
    // Returning from Settings redraws engraving without reloading the transport.
    this.render(!this.routeChanged && !!this.session);
    this.routeChanged = false;
    this.acceptanceChanged();
  }
  leave() {
    this.active = false;
    this.closeResults();
    this.interrupt("navigation");
    this.acceptanceChanged();
  }
  interrupt(reason: Interruption) {
    if (this.passage.selecting) this.passage.cancel();
    if (reason === "navigation") closePitchFields();
    this.playback.pause();
    this.playbackView = "";
    if (this.mode === "playback" && this.active) this.updatePlayback();
    this.session?.resetGesture();
    this.clearPianoSelection();
  }
  applyRoute(route: import("./navigation").PracticeRoute) {
    const hymn = route.hymn
      ? hymns.find((h) => h.id === route.hymn)
      : this.hymn;
    if (!hymn) return false;
    const old = this.settings();
    const switching = hymn.id !== this.hymn.id;
    if (switching) this.progress.remember(this.settings(), this.zoom);
    const base = switching ? this.progress.forHymn(hymn.id) : old;
    if (switching) this.zoom = this.progress.forHymn(hymn.id).zoom;
    const next = hymnSettingsFromQuery(base, route.query);
    const changed =
      old.hymn !== next.hymn ||
      old.key !== next.key ||
      old.low !== next.low ||
      old.high !== next.high ||
      old.arrangement !== next.arrangement ||
      old.hands !== next.hands ||
      old.viewHands !== next.viewHands ||
      old.reattackTies !== next.reattackTies ||
      old.sectionBars !== next.sectionBars;
    this.routeChanged = changed || old.mode !== next.mode;
    if (old.mode !== next.mode || old.bpm !== next.bpm)
      this.interrupt("controls");
    this.mode = next.mode || "wait";
    this.bpm = next.bpm || 80;
    if (old.bpm !== this.bpm) this.playback.setTempo(this.bpm);
    if (this.countIn !== (next.countIn || 0)) this.interrupt("controls");
    this.countIn = next.countIn || 0;
    this.preferRangeDefault =
      !route.query.has("key") &&
      (route.query.has("low") || route.query.has("high"));
    this.low = next.low ?? null;
    this.high = next.high ?? null;
    this.hymn = hymn;
    this.key = next.key || "original";
    this.arrangement = next.arrangement;
    this.hands = next.hands || "both";
    this.viewHands = next.viewHands || "both";
    this.reattackTies = next.reattackTies === true;
    if (changed) this.restoreSection();
    if (changed || this.section !== old.section) {
      this.restorePending = true;
      this.position = 0;
      this.paused = false;
    }
    this.publishOptions();
    return true;
  }
  private settings(): HymnSettings {
    return {
      hymn: this.hymn.id,
      mode: this.mode,
      bpm: this.bpm,
      countIn: this.countIn,
      key: this.key,
      low: this.low,
      high: this.high,
      arrangement: this.arrangement,
      hands: this.hands,
      viewHands: this.viewHands,
      reattackTies: this.reattackTies,
      sectionBars: this.sectionBars,
      section: this.section,
      position: this.position,
    };
  }
  private publishRoute() {
    if (!this.active) return;
    const q = new URLSearchParams({
      arrangement: this.arrangement,
      hands: this.hands,
      view: this.viewHands,
    });
    if (this.reattackTies) q.set("ties", "repeat");
    if (this.countIn) q.set("countIn", String(this.countIn));
    if (this.key !== "original") q.set("key", this.key);
    if (this.low !== null) q.set("low", String(this.low));
    if (this.high !== null) q.set("high", String(this.high));
    if (this.mode === "playback") {
      q.set("mode", "playback");
      q.set("tempo", String(this.bpm));
    }
    this.element.dispatchEvent(
      new CustomEvent("hymn-route", {
        detail: `/piano/hymns/${this.hymn.id}?${q}`,
      }),
    );
  }
  private save() {
    this.publishRoute();
    persistence.write(
      "sight",
      this.progress.snapshot(
        this.settings(),
        this.hymn.key,
        this.zoom,
        this.session && this.content && !this.passage.range
          ? {
              content: this.content,
              paused: this.paused,
              length: this.session.steps.length,
            }
          : undefined,
      ),
    );
  }
  private closeResults() {
    this.searchOpen = false;
    this.publishOptions();
    this.acceptanceChanged();
  }
  private choose(hymn: (typeof hymns)[number]) {
    this.save();
    const next = this.progress.forHymn(hymn.id);
    this.hymn = hymn;
    this.key = next.key!;
    this.low = next.low!;
    this.high = next.high!;
    this.mode = next.mode!;
    this.bpm = next.bpm!;
    this.countIn = next.countIn!;
    this.arrangement = next.arrangement;
    this.hands = next.hands!;
    this.viewHands = next.viewHands!;
    this.reattackTies = next.reattackTies!;
    this.zoom = next.zoom;
    this.position = 0;
    this.paused = false;
    this.preferRangeDefault = false;
    this.restoreSection();
    this.restorePending = true;
    this.closeResults();
    this.render();
    this.save();
  }
  private syncPassageControls() {
    const selecting = this.passage.selecting;
    const range = this.passage.range;
    if (selecting) {
      this.piano?.setUnavailable(true);
      this.presentation.set({ feedback: "Practice paused." });
    }
    this.setControls({
      disabled: selecting || this.noMatchingKey,
      selecting: !this.noMatchingKey && selecting,
      selected: !this.noMatchingKey && !!range,
      loop: this.loopPassage,
      status: selecting
        ? "Choose the last note, or drag to it."
        : range
          ? `Notes ${range.start + 1}–${range.end + 1} selected`
          : "",
    });
    this.acceptanceChanged();
  }
  private changeSection(section: number, continuingPlayback = false) {
    this.section = section;
    this.restorePending = true;
    this.render(false, continuingPlayback);
    this.save();
  }
  private render(layoutOnly = false, continuingPlayback = false) {
    const paper = this.$(".hymn-paper");
    this.lastWidth = Math.round(this.$(".sequence-score").clientWidth);
    if (!this.lastWidth) return;
    const previous = this.session;
    const { feedback: previousText, kind: previousKind } =
      this.presentation.getSnapshot();
    if (!layoutOnly) {
      if (!continuingPlayback) {
        this.playback.pause();
      }
      this.playbackView = "";
      this.session = undefined;
      this.acceptanceChanged();
    }
    this.presentation.set({ title: this.hymn.title });
    this.body.patch({
      arrangement: this.arrangement,
      noKey: false,
      scoreLabel:
        this.arrangement !== "melody" && this.viewHands === "left"
          ? "Left-hand hymn score"
          : "Hymn score with aligned lyrics",
    });
    try {
      this.syncRangeKeys();
      const passageIdentity = `${this.hymn.id}:${this.key}:${this.arrangement}:${this.viewHands}:${this.sectionBars}:${this.section}:${this.reattackTies}`;
      if (passageIdentity !== this.passageIdentity || this.noMatchingKey) {
        this.passage.clear();
        this.loopPassage = false;
        this.passageIdentity = passageIdentity;
      }

      if (this.noMatchingKey) {
        this.showNoMatchingKey();
        return;
      }
      this.setControls({ disabled: false });
      const score = arrangeHymn(
        this.hymn,
        this.arrangement,
        this.sectionBars,
        this.section,
        this.viewHands,
      );
      const transposition = hymnTransposition(this.hymn.key, this.key);
      this.section = score.section;
      this.sections = score.sections;
      this.events = drawPracticeScore(paper, score.abc, this.lastWidth, {
        scale: this.zoom,
        reattackTies: this.mode === "wait" && this.reattackTies,
        transpose: transposition.semitones,
        playback: (audio) => {
          this.sectionDuration = audio.totalDuration * 4;
          if (!layoutOnly && !continuingPlayback) {
            this.playbackFromSection = this.section;
            const prepared = hymnPlaybackScore({
              hymn: this.hymn,
              arrangement: this.arrangement,
              sectionBars: this.sectionBars,
              section: this.section,
              hands: this.viewHands,
              totalBars: score.totalBars,
              sections: this.sections,
              abc: score.abc,
              audio,
              transpose: transposition.semitones,
            });
            this.playback.load(
              prepared.audio,
              prepared.starts,
              this.section,
              prepared.timing,
            );
          }
        },
      });
      const visibleEvents = this.events;
      this.passage.bind(visibleEvents);
      const practice =
        this.mode === "wait" &&
        this.arrangement !== "melody" &&
        this.hands !== this.viewHands
          ? arrangeHymn(
              this.hymn,
              this.arrangement,
              this.sectionBars,
              this.section,
              this.hands,
            )
          : score;
      if (practice !== score) {
        // Grade the selected hand's own onsets, including ties and rests. Map
        // those timings back onto the visible grand staff for highlighting.
        const visible = new Map(this.events.map((e) => [e.milliseconds, e]));
        this.events = drawPracticeScore(
          document.createElement("div"),
          practice.abc,
          this.lastWidth,
          {
            transpose: transposition.semitones,
            reattackTies: this.reattackTies,
            playback: () => {},
          },
        ).map((e) => ({
          ...e,
          elements: visible.get(e.milliseconds)?.elements || [],
        }));
      }
      const range = this.passage.range;
      if (range) {
        const from = visibleEvents[range.start].milliseconds / 1000;
        const to =
          visibleEvents[range.end + 1]?.milliseconds / 1000 ||
          this.sectionDuration;
        this.events = this.events.filter(
          (e) => e.milliseconds / 1000 >= from && e.milliseconds / 1000 < to,
        );
        if (!layoutOnly) this.playback.setRange(from, to);
      }
      const steps = eventSteps(this.events, true);
      const content = JSON.stringify({
        matcher: 1,
        abc: practice.abc,
        steps,
        ...(transposition.semitones
          ? { transpose: transposition.semitones }
          : {}),
      });
      if (
        !range &&
        (this.restorePending || (this.content && this.content !== content))
      ) {
        const restored = this.progress.restore(
          this.settings(),
          this.hymn.key,
          content,
          steps.length,
        );
        this.position = restored.position;
        this.paused = restored.paused;
        this.restorePending = false;
      }
      if (!steps.length) {
        this.session = undefined;
        this.presentation.set({
          feedback:
            "No notes for the practising hand in this passage. Select another passage or change hands.",
        });
        this.presentation.set({ count: "" });
        this.setControls({ pauseDisabled: true });
        this.piano.setUnavailable(true);
        this.acceptanceChanged();
        return;
      }
      if (range && this.content !== content) this.position = 0;
      const keepSession = layoutOnly && previous && this.content === content;
      this.content = content;
      this.session = keepSession
        ? previous
        : new WaitForMe(steps, this.position);
      this.position = this.session.index;
      const viewport = this.$(".sequence-score");
      // Two single-staff systems, or one grand-staff system, on a phone.
      const lines = [...paper.querySelectorAll("svg")];
      if (lines.length) {
        const grand = lines.some(
          (line) => line.querySelectorAll(".abcjs-staff").length > 1,
        );
        const height = Math.max(
          ...lines.map((line, i) => {
            const last = grand
              ? line
              : lines[Math.min(i + 1, lines.length - 1)];
            return (
              last.getBoundingClientRect().bottom -
              line.getBoundingClientRect().top
            );
          }),
        );
        viewport.style.setProperty(
          "--phone-score-height",
          `${Math.ceil(height + 8)}px`,
        );
      }
      this.presentation.set({
        scrollHint: viewport.scrollHeight > viewport.clientHeight + 1,
      });
      this.preparePiano(!!keepSession);
      this.update(true, !!keepSession);
      if (keepSession) {
        this.presentation.set({ feedback: previousText, kind: previousKind });
        for (const note of this.session.selected)
          this.element
            .querySelector(`[data-piano="${note}"]`)
            ?.classList.add("sight-key-selected");
      } else this.save();
    } catch (error) {
      this.playback.pause();
      this.session = undefined;
      this.events = [];
      this.presentation.set({
        feedback: "This hymn couldn’t load. Try another hymn or reload.",
      });
      diagnostics.capture(error, "sight_reading.render_failed");
      this.acceptanceChanged();
    }
  }
  private publishOptions() {
    this.options.set(this.optionsSnapshot());
  }
  private optionsSnapshot(): HymnOptionsSnapshot {
    const transposition = hymnTransposition(this.hymn.key, this.key);
    const tabMusic = "source" in this.hymn && this.hymn.source === "tab-music";
    return {
      hymn: this.hymn.id,
      key: this.key,
      mode: this.mode,
      bpm: this.bpm,
      countIn: this.countIn,
      arrangement: this.arrangement,
      hands: this.hands,
      viewHands: this.viewHands,
      reattackTies: this.reattackTies,
      zoom: this.zoom,
      low: this.low,
      high: this.high,
      searchOpen: this.searchOpen,
      unmetered: !/^\d+\/\d+$/.test(this.hymn.meter),
      originalKey: this.hymn.key,
      noMatchingKey: this.noMatchingKey,
      availableKeys: this.availableKeys,
      range: this.melodyRangeLabel,
      source: {
        credits: this.hymn.credits.join(" "),
        url: tabMusic
          ? this.hymn.sourceUrl!
          : "https://github.com/mzealey/openhymnal/blob/d35811b2d5c9b0bbc5887d60a2936454815416e8/Complete/" +
            encodeURIComponent(this.hymn.folder) +
            "/" +
            encodeURIComponent(this.hymn.file),
        label: tabMusic ? "Tab music source" : "Open Hymnal source",
        description: tabMusic
          ? "Keyboard melody with simplified harmony from your tab-music edition."
          : "Public-domain words, melody and setting. First verse and refrain.",
        help:
          ARRANGEMENTS.find((a) => a.id === this.arrangement)!.help +
          " Sing along with the words.",
        transposition: transposition.semitones
          ? `${hymnKeyLabel(transposition.key)}, ${transposition.semitones > 0 ? "up" : "down"} ${Math.abs(transposition.semitones)} semitones from ${hymnKeyLabel(this.hymn.key)}. Each key keeps its own progress. The nearest register is used; no notes are folded into another octave.`
          : `Original ${hymnKeyLabel(this.hymn.key)}. Each key keeps its own progress.`,
      },
    };
  }
  private changeOptions(patch: HymnOptionsChange) {
    const next = mergeHymnSettings(this.settings(), patch);
    if (patch.low !== undefined || patch.high !== undefined) {
      this.save();
      this.interrupt("controls");
      this.low = next.low ?? null;
      this.high = next.high ?? null;
      this.preferRangeDefault = true;
      this.restorePending = true;
      this.render();
      this.save();
      return;
    }
    if (patch.hymn !== undefined) {
      const hymn = hymns.find((h) => h.id === next.hymn);
      if (hymn) {
        if (this.active) this.choose(hymn);
        else {
          this.closeResults();
          this.element.dispatchEvent(
            new CustomEvent("hymn-select", { detail: hymn.id }),
          );
        }
      }
      return;
    }
    if (patch.zoom !== undefined) {
      if (![0.85, 1, 1.2].includes(patch.zoom)) return;
      this.zoom = patch.zoom;
      this.render(true);
    } else if (patch.bpm !== undefined) {
      this.bpm = next.bpm!;
      this.playback.setTempo(this.bpm);
    } else if (patch.key !== undefined) {
      if (!this.availableKeys.includes(next.key!)) return;
      this.save();
      this.interrupt("controls");
      this.key = next.key!;
      this.restoreSection();
      this.restorePending = true;
      this.render();
    } else if (patch.mode !== undefined) {
      this.interrupt("controls");
      this.mode = next.mode!;
      this.preferRangeDefault = this.low !== null || this.high !== null;
      this.playback.restart();
      this.playbackView = "";
      this.render();
    } else if (patch.countIn !== undefined) {
      this.interrupt("controls");
      this.countIn = next.countIn!;
      this.render();
    } else if (patch.reattackTies !== undefined) {
      this.reattackTies = next.reattackTies!;
      this.position = 0;
      this.restorePending = true;
      this.render();
    } else {
      this.arrangement = next.arrangement;
      this.viewHands = next.viewHands!;
      this.hands = next.hands!;
      this.preferRangeDefault = this.low !== null || this.high !== null;
      this.restoreSection();
      this.restorePending = true;
      this.render();
    }
    this.publishOptions();
    this.save();
  }
  private cachedMelodyRange() {
    const identity = this.hymn.id;
    let range = this.rangeCache.get(identity);
    if (!range) {
      range = hymnPitchRange(arrangeHymn(this.hymn, "melody", 0, 0).abc);
      this.rangeCache.set(identity, range);
    }
    return range;
  }
  private syncRangeKeys() {
    // Key limits describe the sung melody, independent of accompaniment or hands.
    const range = this.cachedMelodyRange();
    const { choices, preferred } = hymnRangeKeys(
      this.hymn.key,
      range,
      this.low,
      this.high,
    );
    this.availableKeys = choices
      .filter((choice) => choice.fits)
      .map((choice) => choice.key);
    this.noMatchingKey = preferred === undefined;
    if (
      !this.noMatchingKey &&
      (this.preferRangeDefault ||
        !choices.find((c) => c.key === this.key)?.fits)
    ) {
      if (this.key !== preferred) {
        this.key = preferred!;
        this.restoreSection();
        this.restorePending = true;
      }
    }
    this.preferRangeDefault = false;
    this.melodyRangeLabel = this.noMatchingKey
      ? ""
      : hymnRangeLabel(range, this.hymn.key, this.key);
    this.publishOptions();
  }
  private showNoMatchingKey() {
    this.playback.pause();
    this.presentation.set({
      context: this.mode === "playback" ? "Playback" : "Wait for me",
    });
    this.session = undefined;
    this.events = [];
    this.content = "";
    this.$(".hymn-paper").replaceChildren();
    this.body.patch({ noKey: true });
    this.presentation.set({ feedback: "" });
    this.presentation.set({ count: "" });
    this.presentation.set({ value: 0 });
    this.setControls({ disabled: true });
    this.pianoPanel.setAvailable(false);
    this.presentation.set({ rangeHint: "" });
    this.presentation.set({ scrollHint: false });
    this.$(".sequence-score").style.removeProperty("--phone-score-height");
    this.acceptanceChanged();
    this.save();
  }
  private preparePiano(preserveHint = false) {
    if (!this.session) return;
    this.piano.show(...keyboardRange(this.events), false, false, preserveHint);
    this.clearPianoSelection(!preserveHint);
  }
  private updateRangeHint() {
    if (!this.piano) return;
    if (this.mode === "playback" || !isPianoVisible()) {
      this.presentation.set({ rangeHint: "" });
      return;
    }
    const missing = (this.session?.current?.pitches || []).filter(
      (note) => !this.piano.contains(note),
    );
    this.presentation.set({
      rangeHint: missing.length
        ? `MIDI needed: ${missing.map((note) => keyLabel(note)).join(", ")}`
        : "",
    });
  }
  private clearPianoSelection(clearHint = true) {
    if (clearHint) this.piano?.clearHint();
    this.element
      .querySelectorAll(".sight-key-selected")
      .forEach((e) => e.classList.remove("sight-key-selected"));
  }
  answer(note: number, held?: readonly number[]) {
    if (this.inputPolicy === "none") return;
    const result = this.session!.answer(note, held, !this.paused);
    if (result === "ignored") return;
    if (result === "restarted") {
      this.paused = false;
    }
    if (result === "wrong" || result === "partial") {
      this.presentation.set({ kind: result });
      this.presentation.set({
        feedback: feedbackForNotes(
          note,
          this.session!.current.pitches,
          this.session!.selected,
          result,
          this.events[this.session!.index]?.spellings,
          held,
        ),
      });
      if (result === "wrong") {
        this.piano.hint(
          note,
          this.session!.current.pitches,
          this.events[this.session!.index]?.spellings,
        );
        return;
      }
      if (!held)
        this.element
          .querySelector(`[data-piano="${note}"]`)
          ?.classList.add("sight-key-selected");
      return;
    }
    if (result === "complete" && this.passage.range && this.loopPassage)
      this.session = new WaitForMe(this.session!.steps);
    this.position = this.session!.index;
    this.clearPianoSelection();
    this.save();
    this.update(true);
  }
  private update(scroll = false, preserveAcceptance = false) {
    const session = this.session;
    if (!session) return;
    if (this.passage.selecting) {
      this.piano.setUnavailable(true);
      this.presentation.set({ feedback: "Practice paused." });
      this.acceptanceChanged();
      return;
    }
    this.presentation.set({
      context: this.mode === "playback" ? "Playback" : "Wait for me",
    });
    this.publishOptions();
    this.pianoPanel.setAvailable(this.mode === "wait");
    if (this.mode === "playback") {
      this.playbackView = "";
      this.updatePlayback();
      this.acceptanceChanged();
      return;
    }
    highlightScore(
      this.$(".hymn-paper"),
      this.events[session.index],
      this.$(".sequence-score"),
      scroll,
    );
    const old = this.legacyBookmark;
    this.setControls({
      restore:
        old &&
        old.key === this.bookmarkKey() &&
        old.position <= session.steps.length
          ? `Restore older bookmark (${Math.min(old.position + 1, session.steps.length)} / ${session.steps.length})`
          : "",
    });
    const complete = session.complete;
    this.presentation.set({
      count: complete
        ? "Complete"
        : `${Math.min(session.index + 1, session.steps.length)} / ${session.steps.length}`,
    });

    this.presentation.set({ max: session.steps.length });
    this.presentation.set({ value: session.index });
    this.presentation.set({ kind: "" });
    this.presentation.set({
      feedback: complete
        ? "Lovely. Sing it again, or choose another hymn."
        : this.paused
          ? "Paused. Continue when you’re ready."
          : this.arrangement !== "melody" && this.hands === "left"
            ? session.current.pitches.length > 1
              ? "Play the highlighted notes with your left hand."
              : "Play the highlighted note with your left hand."
            : session.current.pitches.length > 1
              ? "Play the highlighted notes together."
              : "Play the highlighted note.",
    });
    this.setControls({
      pauseDisabled: complete,
      pause: this.paused ? "Resume" : "Pause",
      previous: this.section !== 0,
      next: complete || this.section + 1 !== this.sections,
      nextLabel:
        this.section + 1 < this.sections ? "Next section →" : "Next hymn →",
    });
    this.updateRangeHint();
    this.piano.setUnavailable(!this.accepting);
    this.showCountIn();
    if (!preserveAcceptance) this.acceptanceChanged();
  }
  private showCountIn() {
    const counting = this.playback.counting;
    if (!counting) return;
    const bars =
      counting.bars === 0.5
        ? "½ bar"
        : counting.bars === 1
          ? "1 bar"
          : `bar ${counting.bar} of ${counting.bars}`;
    this.presentation.set({
      feedback: `Count-in · ${bars} · beat ${counting.beat}`,
    });
  }
  private updatePlayback() {
    if (!this.session) return;
    const targetSection = this.playbackFromSection + this.playback.section;
    if (
      !this.passage.range &&
      targetSection !== this.section &&
      this.mode === "playback" &&
      this.active
    ) {
      this.changeSection(targetSection, true);
      return;
    }
    if (
      this.playback.state === "complete" &&
      this.passage.range &&
      this.loopPassage &&
      this.active
    ) {
      this.playback.restart();
      void this.playback.play(this.bpm);
      return;
    }
    const state = this.playback.state;
    const complete = state === "complete";
    let index = this.events.length - 1;
    while (
      index >= 0 &&
      this.events[index].milliseconds > this.playback.sectionPosition * 1000 + 1
    )
      index--;
    if (index < 0) index = 0;
    const sounding = this.playback.sounding;
    const counting = this.playback.counting;
    const view = `${state}:${this.section}:${index}:${sounding}:${counting?.bar}:${counting?.beat}`;
    if (view === this.playbackView) return;
    this.playbackView = view;
    highlightScore(
      this.$(".hymn-paper"),
      complete || state === "counting" || (state === "playing" && !sounding)
        ? undefined
        : this.events[index],
      this.$(".sequence-score"),
      true,
    );
    this.presentation.set({
      count: complete ? "Complete" : `${index + 1} / ${this.events.length}`,
    });

    this.presentation.set({ max: this.events.length });
    this.presentation.set({ value: complete ? this.events.length : index });
    this.presentation.set({
      feedback:
        state === "loading"
          ? "Loading…"
          : state === "playing"
            ? "Sing or play along."
            : complete
              ? "Complete. Play it again, or choose another section."
              : state === "paused"
                ? "Paused."
                : "Press Play to listen.",
    });
    this.setControls({
      pauseDisabled: false,
      pause:
        state === "loading"
          ? "Cancel"
          : state === "playing" || state === "counting"
            ? "Pause"
            : state === "paused"
              ? "Resume"
              : "Play",
      restore: "",
      previous: this.section !== 0,
      next: complete || this.section + 1 !== this.sections,
      nextLabel:
        this.section + 1 < this.sections ? "Next section →" : "Next hymn →",
    });
    this.presentation.set({ rangeHint: "" });
    this.piano.setUnavailable(true);
    this.showCountIn();
  }
}
